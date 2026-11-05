"""Vetores semânticos dos serviços, para a busca por similaridade no site (camada opcional).

Uso:
    python pipeline/vetores.py                     # gera web/data/vetores.bin e vetores.json
    python pipeline/vetores.py --testar "pergunta" # mostra os serviços mais próximos de uma pergunta

A busca principal do site é por vocabulário controlado (tesauro) e é explicável. Esta camada
entra só quando o tesauro não reconhece a pergunta: um modelo de linguagem pequeno
(multilingual-e5-small, 118 MB quantizado) transforma textos em vetores de 384 dimensões, e a
pergunta do cidadão é comparada com o vetor de cada serviço (similaridade de cosseno).

Os vetores dos serviços são calculados aqui, uma vez, com o MESMO arquivo ONNX que o navegador
usa (Transformers.js, dtype q8), para que os resultados sejam idênticos. No navegador só a
pergunta é vetorizada, no aparelho do usuário: nada é enviado a servidor algum.

Dependências extras (não fazem parte do pipeline básico): onnxruntime, tokenizers, numpy.
    pip install -r pipeline/requisitos-vetores.txt
"""
import argparse
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

from comum import DIR_WEB, RAIZ, baixar, ler_json, salvar_json

MODELO = "Xenova/multilingual-e5-small"
ARQUIVOS = {"model_quantized.onnx": "onnx/model_quantized.onnx", "tokenizer.json": "tokenizer.json"}
DIR_MODELO = RAIZ / "data" / "modelo"
DADOS = DIR_WEB / "data"
ESCALA = 127          # vetores unitários guardados como int8 (valor * 127)
MAX_TOKENS = 128


def obter_modelo():
    for local, remoto in ARQUIVOS.items():
        destino = DIR_MODELO / local
        if not destino.exists():
            print(f"  baixando {remoto} de huggingface.co/{MODELO}...", flush=True)
            baixar(f"https://huggingface.co/{MODELO}/resolve/main/{remoto}", destino)
    tok = Tokenizer.from_file(str(DIR_MODELO / "tokenizer.json"))
    tok.enable_truncation(MAX_TOKENS)
    tok.enable_padding()
    sessao = ort.InferenceSession(str(DIR_MODELO / "model_quantized.onnx"), providers=["CPUExecutionProvider"])
    return tok, sessao


def vetorizar(tok, sessao, textos, lote=64):
    """Média dos vetores de saída ponderada pela máscara de atenção, normalizada (como o Transformers.js
    com pooling='mean', normalize=True)."""
    nomes = {e.name for e in sessao.get_inputs()}
    saida = []
    for i in range(0, len(textos), lote):
        enc = tok.encode_batch(textos[i:i + lote])
        ids = np.array([e.ids for e in enc], dtype=np.int64)
        mascara = np.array([e.attention_mask for e in enc], dtype=np.int64)
        entradas = {"input_ids": ids, "attention_mask": mascara}
        if "token_type_ids" in nomes:
            entradas["token_type_ids"] = np.zeros_like(ids)
        (h,) = sessao.run(None, entradas)                       # (lote, tokens, 384)
        m = mascara[..., None].astype(np.float32)
        v = (h * m).sum(1) / np.maximum(m.sum(1), 1e-9)
        v /= np.linalg.norm(v, axis=1, keepdims=True)
        saida.append(v.astype(np.float32))
    return np.vstack(saida)


def texto_do_servico(s, termos):
    """O 'documento' vetorizado: nome oficial, sinônimos do tesauro, subtema e tema."""
    t = termos.get(f"servico:{s['id']}", {})
    sub = termos.get(f"subtema:{s['subtema']}", {})
    tema = termos.get(f"tema:{s['tema']}", {})
    partes = [s["nome"]]
    if t.get("UP"):
        partes.append(", ".join(t["UP"]))
    partes.append(f"{sub.get('termo', '')} ({tema.get('termo', '')})")
    if sub.get("UP"):          # a linguagem do cidadão registrada no tesauro para o subtema
        partes.append(", ".join(sub["UP"][:15]))
    return "passage: " + ". ".join(p for p in partes if p.strip())


def texto_do_subtema(sub, termos):
    """Documento do subtema: nome, tema e todos os sinônimos (a linguagem do cidadão)."""
    tema = termos.get(sub.get("TG", ""), {})
    return f"passage: {sub['termo']} ({tema.get('termo', '')}). " + ", ".join(sub.get("UP", []))


def gerar():
    """Grava dois conjuntos de vetores no mesmo arquivo binário: primeiro os serviços, depois os subtemas.
    No site a nota de um serviço combina a similaridade do próprio nome com a do seu subtema, cujo texto
    (sinônimos do tesauro) é mais rico e estável que nomes de serviço curtos."""
    servicos = ler_json(DADOS / "servicos.json")
    vocab = ler_json(DADOS / "vocabulario.json")
    termos = {t["id"]: t for t in vocab["tesauro"]["termos"]}
    ids = sorted(servicos, key=lambda k: -servicos[k]["n"])
    subtemas = [t for t in vocab["tesauro"]["termos"] if t["campo"] == "subtema"]
    textos = [texto_do_servico(servicos[k], termos) for k in ids] + [texto_do_subtema(s, termos) for s in subtemas]
    tok, sessao = obter_modelo()
    print(f"  vetorizando {len(ids)} serviços e {len(subtemas)} subtemas...", flush=True)
    v = vetorizar(tok, sessao, textos)
    q = np.clip(np.round(v * ESCALA), -127, 127).astype(np.int8)
    (DADOS / "vetores.bin").write_bytes(q.tobytes())
    salvar_json(DADOS / "vetores.json", {
        "modelo": MODELO, "arquivo_modelo": ARQUIVOS["model_quantized.onnx"], "dimensao": int(v.shape[1]),
        "tipo": "int8", "escala": ESCALA, "pooling": "mean", "normalizado": True,
        "prefixo_consulta": "query: ", "prefixo_documento": "passage: ", "max_tokens": MAX_TOKENS,
        "ids": ids, "subtemas": [s["id"].split(":", 1)[1] for s in subtemas],
    }, compacto=True)
    print(f"  {len(textos)} vetores de {v.shape[1]} dimensões em web/data/vetores.bin ({q.nbytes // 1024} KB)")


def testar(pergunta, k=8):
    """Reproduz em Python a nota usada no site (web/js/semantica.js)."""
    meta = ler_json(DADOS / "vetores.json")
    todos = np.frombuffer((DADOS / "vetores.bin").read_bytes(), dtype=np.int8).reshape(-1, meta["dimensao"]).astype(np.float32) / ESCALA
    ns = len(meta["ids"])
    serv, sub = todos[:ns], todos[ns:]
    servicos = ler_json(DADOS / "servicos.json")
    tok, sessao = obter_modelo()
    v = vetorizar(tok, sessao, [meta["prefixo_consulta"] + pergunta])[0]
    sim_s, sim_sub = serv @ v, sub @ v
    pos_sub = {s: i for i, s in enumerate(meta["subtemas"])}
    print(f'"{pergunta}":')
    print("  subtemas:", " | ".join(f"{meta['subtemas'][i]} {sim_sub[i]:.3f}" for i in np.argsort(-sim_sub)[:3]))
    nota = [0.5 * sim_s[i] + 0.5 * sim_sub[pos_sub[servicos[k_]["subtema"]]] + 0.01 * np.log10(servicos[k_]["n"] + 1)
            for i, k_ in enumerate(meta["ids"])]
    for i in np.argsort(-np.array(nota))[:k]:
        print(f"  {nota[i]:.3f}  {servicos[meta['ids'][i]]['nome']}  [{servicos[meta['ids'][i]]['subtema']}, n={servicos[meta['ids'][i]]['n']}]")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--testar", metavar="PERGUNTA", action="append", help="mostra os serviços mais próximos da pergunta")
    args = ap.parse_args()
    if args.testar:
        for p in args.testar:
            testar(p)
    else:
        gerar()


if __name__ == "__main__":
    main()
