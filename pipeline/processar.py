"""Limpeza e indexação das manifestações da Ouvidoria.

Lê as versões vigentes de cada ano (data/raw/ouvidoria), aplica as regras de tratamento e grava
data/processed/manifestacoes.csv (uma linha por manifestação) e data/processed/limpeza.json
(o que foi feito, com números, para o relatório).

Regras de tratamento (item 3.1 do trabalho):
1. Codificação ISO-8859-1 e separador ';'. Cabeçalhos variam entre anos ('Nº do ticket' / 'N.º do ticket',
   espaços nas pontas): são normalizados por uma tabela de equivalência.
2. Uma manifestação aparece em várias linhas (uma por encaminhamento a órgão). A unidade de análise é
   a manifestação: fica uma linha por número de protocolo, guardando todos os órgãos de destino.
3. Datas dd/mm/aaaa viram ISO; 'Dias em tramitação' vira inteiro.
4. 'Assunto' é multivalorado (quebra de linha). Vira a lista 'motivos', separando os valores que
   identificam grupos prioritários (ex.: 'Pessoa Idosa').
5. Situação: só manifestações com Etapa 'Encerrado' têm resultado; as demais são 'em andamento'.
6. Prazo: no prazo (até 30 dias), atenção (31 a 60), crítico (mais de 60), conforme o campo SLA da PBH,
   que segue a Lei nº 13.460/2017.
7. Nome do serviço: controle de autoridade. Variantes de grafia (maiúsculas, '?' no lugar de travessão,
   espaços, sufixo de ano) são reunidas sob uma chave normalizada; a forma autorizada é a grafia mais
   frequente que não esteja toda em maiúsculas. Sinônimos declarados em vocabulario/servicos_sinonimos.json
   também são reunidos.
8. Tema e subtema: indexação automática pela taxonomia (regras de palavras-chave sobre o nome do serviço).
9. Órgão responsável: a primeira sigla do campo 'Responsável pela Resposta', validada na lista de autoridade;
   vazio vira 'não informado'.
"""
import csv
import os
import re
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

from comum import DIR_ARQUIVO, DIR_BRUTO, DIR_PROCESSADO, DIR_VOCAB, ler_json, normalizar, salvar_json

csv.field_size_limit(2**31 - 1)

CABECALHOS = {
    "no do ticket": "ticket", "n o do ticket": "ticket", "data de registro da manifestacao": "data_registro",
    "data de encaminhamento apos triagem": "data_triagem", "assunto": "assunto", "etapa": "etapa",
    "dias em tramitacao com a pbh": "dias", "sla": "sla", "canal de captacao": "canal", "origem da demanda": "origem",
    "responsavel pela resposta": "responsavel", "unidade de destino": "unidade", "data da tramitacao": "data_tramitacao",
    "dias em aberto no orgao": "dias_orgao", "tipo manifestante": "manifestante", "tipologia": "tipologia",
    "regional": "regional", "genero": "genero", "situacao da demanda": "situacao", "cirurgias": "cirurgia",
    "especialidade": "especialidade", "exames e procedimentos": "exame", "insumos e aparelhos": "insumo",
    "medicamentos": "medicamento", "vacinas": "vacina", "servico": "servico",
}
SITUACOES = {
    "Demanda atendida": "atendida", "Gerou orientação": "orientacao", "Demanda arquivada": "arquivada",
    "Denúncia apurada": "apurada", "Demanda agendada": "agendada", "Demanda encaminhada para conhecimento": "conhecimento",
}
SLA = {"No prazo / onTime": "no_prazo", "Atenção / attention": "atencao", "Crítico / critical": "critico"}
REGIONAIS = {"BARREIRO": "BA", "CENTRO-SUL": "CS", "LESTE": "LE", "NORDESTE": "NE", "NOROESTE": "NO", "NORTE": "NT",
             "OESTE": "OE", "PAMPULHA": "PA", "VENDA NOVA": "VN"}

TAXONOMIA = ler_json(DIR_VOCAB / "taxonomia.json")
ORGAOS = ler_json(DIR_VOCAB / "orgaos.json")["orgaos"]
SINONIMOS = ler_json(DIR_VOCAB / "servicos_sinonimos.json") if (DIR_VOCAB / "servicos_sinonimos.json").exists() else {}
PRIORITARIOS = set(TAXONOMIA["motivos"]["grupos_prioritarios"])

def forma_canonica(texto):
    """Normalização usada tanto nos nomes de serviço quanto nas regras da taxonomia."""
    n = texto.replace("?", " ").replace("–", " ").replace("—", " ")
    n = re.sub(r"\s*-\s*20\d\d\b", "", n)          # 'Cadastro Escolar - 2025'
    n = normalizar(n)
    n = re.sub(r"\b(da|de|do|das|dos|e|a|o|as|os|em|para|por|no|na|nos|nas|ao|aos|sobre|com|à|as)\b", " ", n)
    return re.sub(r"\s+", " ", n).strip()


def compilar_regra(regra):
    """Casa no início de palavra; regras cujo último termo tem até 4 letras exigem a palavra inteira."""
    r = forma_canonica(regra)
    fim = r"(?![a-z0-9])" if len(r.split()[-1]) <= 4 else ""
    return re.compile(r"(?<![a-z0-9])" + re.escape(r) + fim)


REGRAS = [(sub["id"], tema["id"], [compilar_regra(r) for r in sub["regras"]])
          for tema in TAXONOMIA["temas"] for sub in tema["subtemas"]]


def chave_servico(nome):
    n = forma_canonica(nome)
    return SINONIMOS.get(n, n)


def classificar(chave):
    for sub_id, tema_id, regras in REGRAS:
        if any(r.search(chave) for r in regras):
            return tema_id, sub_id
    return "OUT", "OUT.GER"


def data_iso(txt):
    m = re.match(r"(\d{2})/(\d{2})/(\d{4})", txt or "")
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None


def sigla_principal(responsavel):
    for parte in re.split(r"[\n|/;,]+", responsavel or ""):
        s = parte.strip().upper()
        if s:
            return s
    return ""


def ler_versoes():
    manifesto = ler_json(DIR_ARQUIVO / "manifesto.json")
    vigentes = sorted((v for v in manifesto["versoes"] if v["estado"] == "vigente"), key=lambda v: v["ano"])
    for v in vigentes:
        caminho = DIR_BRUTO.parent.parent / v["arquivo_local"]
        with open(caminho, encoding="latin1", newline="") as f:
            leitor = csv.reader(f, delimiter=";")
            cab = [CABECALHOS.get(normalizar(c), normalizar(c)) for c in next(leitor)]
            for linha in leitor:
                if any(linha):
                    yield v["ano"], dict(zip(cab, (c.strip() for c in linha)))


def main():
    limpeza = {"linhas_lidas": 0, "linhas_repetidas": 0, "manifestacoes": 0, "por_ano": {},
               "servicos_distintos_originais": 0, "servicos_apos_autoridade": 0, "sem_regional": 0,
               "sem_orgao": 0, "nao_classificados": 0, "siglas_fora_da_lista": Counter()}
    por_ticket = {}
    unidades = defaultdict(set)
    grafias = defaultdict(Counter)

    for ano, d in ler_versoes():
        limpeza["linhas_lidas"] += 1
        t = d["ticket"]
        if t in por_ticket:
            limpeza["linhas_repetidas"] += 1
            unidades[t].add(d.get("unidade", ""))
            # a linha mais recente de tramitação prevalece para os campos de estado
            if (data_iso(d.get("data_tramitacao")) or "") >= (por_ticket[t]["_data_tram"] or ""):
                por_ticket[t].update({"_data_tram": data_iso(d.get("data_tramitacao")), "etapa": d["etapa"],
                                      "situacao": d.get("situacao", ""), "dias": d["dias"], "sla": d["sla"]})
            continue
        d["_ano"] = ano
        d["_data_tram"] = data_iso(d.get("data_tramitacao"))
        por_ticket[t] = d
        unidades[t].add(d.get("unidade", ""))
        grafias[chave_servico(d["servico"])][d["servico"].strip()] += 1

    # forma autorizada de cada serviço
    autorizada = {}
    for chave, cont in grafias.items():
        candidatas = [(n, g) for g, n in cont.most_common() if g]
        preferidas = [c for c in candidatas if not c[1].isupper()] or candidatas
        melhor = preferidas[0][1] if preferidas else "(sem serviço informado)"
        # a PBH grava o travessão como '?' em muitos nomes ('Árvore ? Poda de Árvore')
        autorizada[chave] = re.sub(r"\s*\?\s*", " – ", melhor).strip()
    limpeza["servicos_distintos_originais"] = len({g for c in grafias.values() for g in c})
    limpeza["servicos_apos_autoridade"] = len(autorizada)

    DIR_PROCESSADO.mkdir(parents=True, exist_ok=True)
    campos = ["ticket", "ano", "mes", "data_registro", "dias", "prazo", "encerrada", "situacao", "canal", "origem",
              "orgao", "orgaos", "tipologia", "regional", "genero", "manifestante", "motivos", "prioritarios",
              "servico", "servico_chave", "tema", "subtema", "detalhe_saude"]
    nao_class = Counter()
    with open(DIR_PROCESSADO / "manifestacoes.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=campos)
        w.writeheader()
        for t, d in por_ticket.items():
            data = data_iso(d["data_registro"])
            if not data:
                continue
            chave = chave_servico(d["servico"])
            tema, sub = classificar(chave)
            if sub == "OUT.GER":
                nao_class[autorizada[chave]] += 1
            motivos_brutos = [m.strip() for m in re.split(r"[\n]+", d.get("assunto", "")) if m.strip()]
            motivos = [m for m in motivos_brutos if m not in PRIORITARIOS]
            prior = [m for m in motivos_brutos if m in PRIORITARIOS]
            sigla = sigla_principal(d.get("responsavel"))
            if sigla and sigla not in ORGAOS:
                limpeza["siglas_fora_da_lista"][sigla] += 1
            siglas = sorted({s.strip().upper() for s in re.split(r"[\n|/;,]+", d.get("responsavel") or "") if s.strip()})
            encerrada = d["etapa"].strip() == "Encerrado"
            regional = REGIONAIS.get(d.get("regional", "").strip().upper(), "")
            limpeza["sem_regional"] += not regional
            limpeza["sem_orgao"] += not sigla
            dias = int(d["dias"]) if str(d["dias"]).strip().isdigit() else None
            detalhe = next((d[c] for c in ("cirurgia", "especialidade", "exame", "medicamento", "vacina", "insumo") if d.get(c)), "")
            w.writerow({
                "ticket": t, "ano": data[:4], "mes": data[:7], "data_registro": data, "dias": dias,
                "prazo": SLA.get(d["sla"].strip(), ""), "encerrada": int(encerrada),
                "situacao": SITUACOES.get(d.get("situacao", "").strip(), "outra" if encerrada and d.get("situacao") else "em_andamento") if encerrada else "em_andamento",
                "canal": d.get("canal", "").strip(), "origem": d.get("origem", "").strip(),
                "orgao": sigla or "não informado", "orgaos": "|".join(siglas),
                "tipologia": d.get("tipologia", "").strip(), "regional": regional or "NI",
                "genero": d.get("genero", "").strip(), "manifestante": d.get("manifestante", "").strip(),
                "motivos": "|".join(motivos), "prioritarios": "|".join(prior),
                "servico": autorizada[chave], "servico_chave": chave, "tema": tema, "subtema": sub,
                "detalhe_saude": detalhe,
            })
            limpeza["manifestacoes"] += 1
            limpeza["por_ano"][data[:4]] = limpeza["por_ano"].get(data[:4], 0) + 1

    limpeza["nao_classificados"] = sum(nao_class.values())
    limpeza["nao_classificados_exemplos"] = nao_class.most_common(40)
    limpeza["siglas_fora_da_lista"] = limpeza["siglas_fora_da_lista"].most_common(30)
    salvar_json(DIR_PROCESSADO / "limpeza.json", limpeza)
    salvar_json(DIR_PROCESSADO / "servicos_autoridade.json",
                {chave: {"autorizada": autorizada[chave], "variantes": sorted(grafias[chave]), "n": sum(grafias[chave].values())}
                 for chave in grafias})
    print(f"{limpeza['linhas_lidas']} linhas -> {limpeza['manifestacoes']} manifestações "
          f"({limpeza['linhas_repetidas']} repetidas); serviços {limpeza['servicos_distintos_originais']} -> "
          f"{limpeza['servicos_apos_autoridade']}; não classificados {limpeza['nao_classificados']} "
          f"({100 * limpeza['nao_classificados'] / limpeza['manifestacoes']:.1f}%)")


if __name__ == "__main__":
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    main()
