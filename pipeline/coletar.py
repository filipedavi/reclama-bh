"""Coleta e arquivamento dos dados abertos da Ouvidoria de Belo Horizonte.

Uso:
    python pipeline/coletar.py            # descobre no portal da PBH os arquivos de cada ano e baixa o que for novo
    python pipeline/coletar.py --verificar  # confere a integridade (SHA-256) do que está arquivado

O conjunto é publicado como um CSV acumulado por ano (jan, jan-fev, jan-mar...). Para cada ano
guardamos a versão mais completa já publicada; quando a PBH publica um arquivo mais novo, a
versão anterior continua no arquivo (guarda permanente) e passa a ser "substituída".

Cada versão vira um registro no manifesto (data/arquivo/manifesto.json) com metadados
descritivos (Dublin Core), de preservação (PREMIS: fixidez e eventos) e arquivísticos
(código de classificação e temporalidade).
"""
import argparse
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from comum import DIR_ARQUIVO, DIR_BRUTO, USER_AGENT, baixar, ler_json, salvar_json, sha256_arquivo

FONTES = ler_json(Path(__file__).with_name("fontes.json"))
MANIFESTO = DIR_ARQUIVO / "manifesto.json"
DIR_OUV = DIR_BRUTO / "ouvidoria"
AGENTE = "pipeline/coletar.py (Reclama BH)"
MESES = {m: i + 1 for i, m in enumerate(["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"])}


def agora():
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def evento(tipo, resultado, detalhe=""):
    return {"tipo": tipo, "data": agora(), "agente": AGENTE, "resultado": resultado, "detalhe": detalhe}


def carregar_manifesto():
    if MANIFESTO.exists():
        return ler_json(MANIFESTO)
    return {
        "titulo": "Arquivo dos dados abertos da Ouvidoria de Belo Horizonte",
        "descricao": "Cada versão capturada dos arquivos anuais de manifestações, com metadados de descrição e preservação.",
        "custodiador": "Projeto Reclama BH (UFMG - OTI071)",
        "versoes": [],
    }


def interpretar_nome(nome):
    """'2024.jan-dez.dados.abertos.csv' -> (2024, 12); '2025.jan.dados.abertos.csv' -> (2025, 1); '2024.01...' -> (2024, 1)."""
    n = nome.lower().replace(" ", "")
    m = re.match(r"(20\d\d)\.(?:(\w{3})(?:-(\w{3}))?|(\d{2}))\.", n)
    if not m:
        return None
    ano = int(m.group(1))
    if m.group(4):
        return ano, int(m.group(4))
    ultimo = m.group(3) or m.group(2)
    return (ano, MESES[ultimo]) if ultimo in MESES else None


def descobrir():
    """Consulta a API CKAN do portal e devolve, por ano, o recurso mais completo publicado."""
    url = FONTES["ouvidoria"]["api"]
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        pacote = json.load(resp)["result"]
    melhor = {}
    for r in pacote["resources"]:
        if (r.get("format") or "").upper() != "CSV" or not r.get("url"):
            continue
        chave = interpretar_nome(r["name"])
        if not chave:
            continue
        ano, mes = chave
        if ano not in melhor or mes > melhor[ano]["mes"]:
            melhor[ano] = {"ano": ano, "mes": mes, "nome": r["name"], "url": r["url"],
                           "modificado": r.get("last_modified") or r.get("created"), "id_recurso": r["id"]}
    return pacote, melhor


def registro_versao(ident, caminho, rec, pacote):
    return {
        "identificador": ident,
        "codigo_classificacao": "02.01.01",
        "titulo": f"Manifestações da Ouvidoria de Belo Horizonte, {rec['ano']} (janeiro a {rec['mes']:02d})",
        "criador": "Subcontroladoria de Ouvidoria (SUOUVI), Controladoria-Geral do Município de Belo Horizonte",
        "publicador": "Prefeitura de Belo Horizonte, Portal de Dados Abertos",
        "data": (rec.get("modificado") or "")[:10] or None,
        "data_captura": agora(),
        "fonte": rec["url"],
        "pagina": FONTES["ouvidoria"]["pagina"],
        "nome_original": rec["nome"],
        "formato": "text/csv; separador ponto e vírgula; codificação ISO-8859-1",
        "idioma": "pt-BR",
        "cobertura_espacial": "Belo Horizonte, MG, Brasil",
        "cobertura_temporal": {"inicio": f"{rec['ano']}-01-01", "fim": f"{rec['ano']}-{rec['mes']:02d}"},
        "direitos": pacote.get("license_title") or "Creative Commons Attribution",
        "arquivo_local": str(caminho.relative_to(DIR_BRUTO.parent.parent)).replace("\\", "/"),
        "extensao_bytes": caminho.stat().st_size,
        "sha256": sha256_arquivo(caminho),
        "ano": rec["ano"], "mes_final": rec["mes"],
        "estado": "vigente",
        "temporalidade": {"prazo": "permanente", "destinacao": "guarda permanente"},
        "eventos": [evento("captura", "sucesso", f"baixado de {rec['url']}")],
    }


def coletar(manifesto):
    pacote, melhor = descobrir()
    print(f"Portal: {len(pacote['resources'])} recursos; anos encontrados: {sorted(melhor)}")
    vigentes = {v["ano"]: v for v in manifesto["versoes"] if v["estado"] == "vigente"}
    for ano, rec in sorted(melhor.items()):
        atual = vigentes.get(ano)
        if atual and atual["mes_final"] >= rec["mes"]:
            atual["eventos"].append(evento("verificacao_fonte", "sem_alteracao", f"portal ainda publica {rec['nome']}"))
            print(f"  {ano}: sem novidade (até mês {atual['mes_final']:02d})")
            continue
        ident = f"ouvidoria-bh-{ano}-{rec['mes']:02d}"
        destino = DIR_OUV / f"{ident}.csv"
        provisorio = DIR_OUV / f"_tmp_{ano}.csv"   # cópia já baixada manualmente, se existir
        if provisorio.exists() and not destino.exists():
            provisorio.rename(destino)
        elif not destino.exists():
            print(f"  {ano}: baixando {rec['nome']}...", flush=True)
            baixar(rec["url"], destino)
        novo = registro_versao(ident, destino, rec, pacote)
        if atual:
            atual["estado"] = "substituida"
            atual["eventos"].append(evento("substituicao", "sucesso", f"substituída por {ident}"))
        manifesto["versoes"].append(novo)
        print(f"  {ano}: arquivada versão até mês {rec['mes']:02d} ({ident})")
    # num clone novo o manifesto já existe, mas data/raw não é versionado: baixa de novo o que faltar
    return restaurar(manifesto)


def verificar(manifesto):
    falhas = 0
    for v in manifesto["versoes"]:
        caminho = DIR_BRUTO.parent.parent / v["arquivo_local"]
        ok = caminho.exists() and sha256_arquivo(caminho) == v["sha256"]
        v["eventos"].append(evento("verificacao_fixidez", "sucesso" if ok else "falha",
                                   "SHA-256 confere" if ok else "arquivo ausente ou alterado"))
        print(f"  {v['identificador']}: {'ok' if ok else 'FALHA'}")
        falhas += not ok
    return falhas


def restaurar(manifesto):
    """Baixa de novo os originais vigentes que não estão no disco (ex.: clone novo, em que data/raw não
    é versionado) e confere o SHA-256 registrado no manifesto."""
    falhas = 0
    for v in manifesto["versoes"]:
        if v["estado"] != "vigente":
            continue
        caminho = DIR_BRUTO.parent.parent / v["arquivo_local"]
        if caminho.exists():
            continue
        print(f"  {v['identificador']}: baixando de {v['fonte']}...", flush=True)
        baixar(v["fonte"], caminho)
        ok = sha256_arquivo(caminho) == v["sha256"]
        v["eventos"].append(evento("restauracao", "sucesso" if ok else "falha",
                                   "baixado da fonte; SHA-256 confere" if ok else "baixado da fonte; SHA-256 diferente do registrado"))
        print(f"  {v['identificador']}: {'ok' if ok else 'FALHA (conteúdo diferente do registrado)'}")
        if not ok:
            caminho.unlink()
            falhas += 1
    return falhas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--verificar", action="store_true", help="confere o SHA-256 dos originais arquivados")
    ap.add_argument("--restaurar", action="store_true", help="baixa de novo os originais vigentes ausentes no disco")
    args = ap.parse_args()
    manifesto = carregar_manifesto()
    falhas = 0
    if args.verificar:
        print("Verificação de integridade:")
        falhas = verificar(manifesto)
    elif args.restaurar:
        print("Restauração dos originais ausentes:")
        falhas = restaurar(manifesto)
    else:
        falhas = coletar(manifesto)
    manifesto["versoes"].sort(key=lambda v: v["identificador"])
    salvar_json(MANIFESTO, manifesto)
    sys.exit(1 if falhas else 0)


if __name__ == "__main__":
    main()
