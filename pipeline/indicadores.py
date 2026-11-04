"""Calcula os indicadores e gera os arquivos estáticos do site (web/data).

Entrada: data/processed/manifestacoes.csv (gerado por processar.py).
Saídas:
- data/geral.json         totais, séries mensais, distribuição por canal, tipologia, resultado e prazo
- data/temas.json         árvore tema > subtema com indicadores por ano
- data/servicos.json      índice dos serviços (documentos da busca) com indicadores e pontos de acesso
- data/servicos/<id>.json detalhe de cada serviço (por ano, canal, regional, órgão, motivo, mês)
- data/regionais.json, data/orgaos.json
- data/vocabulario.json   taxonomia, tesauro completo, lista de órgãos, conceitos, plano de classificação
- data/meta.json          versões arquivadas (Dublin Core / PREMIS resumidos) e números da limpeza
- catalogo.jsonld         catálogo DCAT

Definições (vocabulario/conceitos.json): taxas calculadas só sobre manifestações encerradas; mediana de dias
só sobre encerradas; 'no prazo' = até 30 dias.
"""
import csv
import os
import shutil
import statistics
from collections import Counter, defaultdict
from datetime import datetime, timezone

from comum import DIR_ARQUIVO, DIR_PROCESSADO, DIR_VOCAB, DIR_WEB, ler_json, normalizar, salvar_json, slug

URL_SITE = os.environ.get("URL_SITE", "https://SEU-USUARIO.github.io/reclama-bh/")
MIN_REGISTROS = 20   # abaixo disso as taxas não são mostradas (amostra pequena)
NOMES_REG = {"BA": "Barreiro", "CS": "Centro-Sul", "LE": "Leste", "NE": "Nordeste", "NO": "Noroeste", "NT": "Norte",
             "OE": "Oeste", "PA": "Pampulha", "VN": "Venda Nova", "NI": "Não informada"}
RESULTADOS = ("atendida", "orientacao", "arquivada", "outra")

TAX = ler_json(DIR_VOCAB / "taxonomia.json")
ORGAOS = ler_json(DIR_VOCAB / "orgaos.json")["orgaos"]
NOME_TEMA = {t["id"]: t["nome"] for t in TAX["temas"]}
NOME_SUB = {s["id"]: s["nome"] for t in TAX["temas"] for s in t["subtemas"]}


def resumo(rows):
    """Indicadores de um conjunto de manifestações."""
    n = len(rows)
    enc = [r for r in rows if r["encerrada"] == "1"]
    ne = len(enc)
    res = Counter(r["situacao"] if r["situacao"] in RESULTADOS[:3] else "outra" for r in enc)
    prazo = Counter(r["prazo"] for r in enc if r["prazo"])
    dias = sorted(int(r["dias"]) for r in enc if r["dias"] not in ("", "None"))
    out = {"n": n, "encerradas": ne, "em_andamento": n - ne, "suficiente": ne >= MIN_REGISTROS}
    if ne:
        out.update({f"pct_{k}": round(100 * res[k] / ne, 1) for k in RESULTADOS})
        tp = sum(prazo.values())
        if tp:
            out["pct_no_prazo"] = round(100 * prazo["no_prazo"] / tp, 1)
            out["pct_critico"] = round(100 * prazo["critico"] / tp, 1)
    if dias:
        out["mediana_dias"] = statistics.median(dias)
        out["p90_dias"] = dias[min(len(dias) - 1, int(0.9 * len(dias)))]
    return out


def por_chave(rows, chave):
    g = defaultdict(list)
    for r in rows:
        g[chave(r)].append(r)
    return g


def resumo_por(rows, chave, nomes=None, minimo=1):
    saida = {}
    for k, v in por_chave(rows, chave).items():
        if not k or len(v) < minimo:
            continue
        saida[k] = resumo(v)
        if nomes:
            saida[k]["nome"] = nomes.get(k, k)
    return saida


def orgao_nome(sigla):
    if sigla in ORGAOS:
        return f"{sigla} · {ORGAOS[sigla]['nome']}"
    return sigla


def serie_mensal(rows):
    c = Counter(r["mes"] for r in rows)
    return {m: c[m] for m in sorted(c)}


def montar_tesauro(base, servicos, autoridade):
    termos = []
    alvo_para_id = {}
    for t in TAX["temas"]:
        termos.append({"id": f"tema:{t['id']}", "termo": t["nome"], "campo": "tema", "TE": [f"subtema:{s['id']}" for s in t["subtemas"]], "UP": []})
        for s in t["subtemas"]:
            termos.append({"id": f"subtema:{s['id']}", "termo": s["nome"], "campo": "subtema", "TG": f"tema:{t['id']}", "UP": [], "TE": [], "NE": f"Serviços oficiais classificados neste subtema: {len([x for x in servicos.values() if x['subtema'] == s['id']])}."})
    por_id = {t["id"]: t for t in termos}
    for e in base["entradas"]:
        alvo = e["alvo"]
        ident = alvo if ":" in alvo else f"subtema:{alvo}"
        if ident in por_id:
            por_id[ident]["UP"] += e["UP"]
        else:
            campo, valor = ident.split(":", 1)
            nome = {"motivo": valor, "tipologia": valor, "regional": NOMES_REG.get(valor, valor),
                    "resultado": {"atendida": "Mais atendida", "arquivada": "Mais arquivada", "lenta": "Mais demorada", "rapida": "Mais rápida"}.get(valor, valor)}[campo]
            termos.append({"id": ident, "termo": nome, "campo": campo, "UP": list(e["UP"])})
            por_id[ident] = termos[-1]
    for ident, s in servicos.items():
        reg = autoridade.get(s["chave"], {})
        variantes = [v for v in reg.get("variantes", []) if v != s["nome"]]
        termos.append({"id": f"servico:{ident}", "termo": s["nome"], "campo": "servico", "TG": f"subtema:{s['subtema']}",
                       "UP": variantes, "NE": f"Órgão que mais responde: {s['orgao']}." if s.get("orgao") else ""})
        por_id[f"subtema:{s['subtema']}"]["TE"].append(f"servico:{ident}")
    return {"titulo": base["titulo"], "descricao": base["descricao"], "palavras_vazias": base["palavras_vazias"], "termos": termos}


def catalogo_dcat(meta, gerado):
    base = URL_SITE + "data/"
    conjuntos = [
        ("geral", "Manifestações da Ouvidoria de BH: visão geral", "Totais, séries mensais e distribuições gerais."),
        ("servicos", "Indicadores por serviço", "Taxa de atendimento, arquivamento, prazo e tempo mediano por serviço público."),
        ("temas", "Indicadores por tema", "Os mesmos indicadores agregados pela taxonomia de temas."),
        ("regionais", "Indicadores por regional", "Indicadores por região administrativa."),
        ("orgaos", "Indicadores por órgão responsável", "Indicadores por órgão da Prefeitura."),
        ("vocabulario", "Vocabulário controlado do Reclama BH", "Taxonomia, tesauro, lista de órgãos e conceitos."),
    ]
    return {
        "@context": {"dcat": "http://www.w3.org/ns/dcat#", "dct": "http://purl.org/dc/terms/", "foaf": "http://xmlns.com/foaf/0.1/"},
        "@id": URL_SITE + "catalogo.jsonld", "@type": "dcat:Catalog",
        "dct:title": "Catálogo de dados do Reclama BH",
        "dct:description": "Indicadores derivados dos dados abertos da Ouvidoria de Belo Horizonte.",
        "dct:language": "pt-BR", "dct:modified": gerado,
        "dct:publisher": {"@type": "foaf:Organization", "foaf:name": "Projeto Reclama BH (UFMG)"},
        "dcat:dataset": [
            {"@type": "dcat:Dataset", "@id": base + nome, "dct:title": titulo, "dct:description": desc,
             "dct:spatial": "Belo Horizonte, MG", "dct:source": [v["fonte"] for v in meta["versoes"] if v["estado"] == "vigente"],
             "dct:temporal": {"dcat:startDate": meta["periodo"]["inicio"], "dcat:endDate": meta["periodo"]["fim"]},
             "dct:license": "https://creativecommons.org/licenses/by/4.0/",
             "dcat:distribution": [{"@type": "dcat:Distribution", "dcat:downloadURL": base + nome + ".json", "dcat:mediaType": "application/json"}]}
            for nome, titulo, desc in conjuntos],
    }


def main():
    gerado = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
    with open(DIR_PROCESSADO / "manifestacoes.csv", encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    manifesto = ler_json(DIR_ARQUIVO / "manifesto.json")
    limpeza = ler_json(DIR_PROCESSADO / "limpeza.json")
    autoridade = ler_json(DIR_PROCESSADO / "servicos_autoridade.json")
    anos = sorted({r["ano"] for r in rows})
    meses = sorted({r["mes"] for r in rows})

    dados = DIR_WEB / "data"
    if (dados / "servicos").exists():
        shutil.rmtree(dados / "servicos")

    # ---------------- geral
    geral = {
        "gerado_em": gerado, "anos": anos, "periodo": {"inicio": meses[0], "fim": meses[-1]},
        "total": resumo(rows),
        "por_ano": {a: resumo(v) for a, v in sorted(por_chave(rows, lambda r: r["ano"]).items())},
        "mensal": serie_mensal(rows),
        "canal": resumo_por(rows, lambda r: r["canal"] or "não informado"),
        "tipologia": resumo_por(rows, lambda r: r["tipologia"] or "não informada"),
        "manifestante": Counter(r["manifestante"] for r in rows),
        "genero": Counter(r["genero"] for r in rows),
        "motivos": Counter(m for r in rows for m in r["motivos"].split("|") if m).most_common(15),
        "prioritarios": Counter(m for r in rows for m in r["prioritarios"].split("|") if m).most_common(),
        "limpeza": {k: limpeza[k] for k in ("linhas_lidas", "linhas_repetidas", "manifestacoes", "servicos_distintos_originais",
                                            "servicos_apos_autoridade", "sem_regional", "sem_orgao", "nao_classificados")},
    }
    salvar_json(dados / "geral.json", geral)

    # ---------------- serviços (documentos da busca)
    por_serv = por_chave(rows, lambda r: r["servico_chave"])
    servicos = {}
    for chave, v in por_serv.items():
        ident = slug(chave)[:80] or "sem-servico"
        while ident in servicos:
            ident += "-2"
        org = Counter(r["orgao"] for r in v if r["orgao"] != "não informado").most_common(1)
        s = resumo(v)
        s.update({
            "id": ident, "chave": chave, "nome": v[0]["servico"], "tema": v[0]["tema"], "subtema": v[0]["subtema"],
            "orgao": org[0][0] if org else "", "orgao_nome": orgao_nome(org[0][0]) if org else "não informado",
            "orgaos": [o for o, _ in Counter(r["orgao"] for r in v).most_common(5)],
            "tipologias": [t for t, _ in Counter(r["tipologia"] for r in v if r["tipologia"]).most_common(3)],
            "motivos": [m for m, _ in Counter(m for r in v for m in r["motivos"].split("|") if m).most_common(5)],
            "regionais": [k for k, _ in Counter(r["regional"] for r in v if r["regional"] != "NI").most_common(4)],
            "por_ano": {a: len(x) for a, x in por_chave(v, lambda r: r["ano"]).items()},
            "variantes": [x for x in autoridade.get(chave, {}).get("variantes", []) if x != v[0]["servico"]],
        })
        servicos[ident] = s
        detalhe = {
            **s,
            "por_ano_ind": {a: resumo(x) for a, x in sorted(por_chave(v, lambda r: r["ano"]).items())},
            "canal": resumo_por(v, lambda r: r["canal"] or "não informado"),
            "regional": resumo_por(v, lambda r: r["regional"], NOMES_REG),
            "orgao_ind": resumo_por(v, lambda r: r["orgao"], {k: orgao_nome(k) for k in ORGAOS} | {"não informado": "não informado"}),
            "tipologia": resumo_por(v, lambda r: r["tipologia"] or "não informada"),
            "motivo": {m: c for m, c in Counter(m for r in v for m in r["motivos"].split("|") if m).most_common(10)},
            "mensal": serie_mensal(v),
            "detalhe_saude": [d for d, _ in Counter(r["detalhe_saude"] for r in v if r["detalhe_saude"]).most_common(10)],
        }
        salvar_json(dados / "servicos" / f"{ident}.json", detalhe, compacto=True)
    campos_indice = ("id", "nome", "tema", "subtema", "orgao", "n", "encerradas", "suficiente", "pct_atendida", "pct_orientacao",
                     "pct_arquivada", "pct_no_prazo", "pct_critico", "mediana_dias", "tipologias", "motivos", "regionais", "orgaos")
    indice = {k: {c: s[c] for c in campos_indice if c in s} | {"n_variantes": len(s["variantes"]), "ultimo_ano": max(s["por_ano"])}
              for k, s in servicos.items()}
    salvar_json(dados / "servicos.json", indice, compacto=True)

    # ---------------- temas
    temas = []
    for t in TAX["temas"]:
        rt = [r for r in rows if r["tema"] == t["id"]]
        subs = []
        for s in t["subtemas"]:
            rs = [r for r in rt if r["subtema"] == s["id"]]
            if not rs:
                continue
            subs.append({"id": s["id"], "nome": s["nome"], **resumo(rs),
                         "por_ano": {a: resumo(x) for a, x in sorted(por_chave(rs, lambda r: r["ano"]).items())},
                         "servicos": [k for k, v in sorted(servicos.items(), key=lambda kv: -kv[1]["n"]) if v["subtema"] == s["id"]][:40],
                         "orgaos": [o for o, _ in Counter(r["orgao"] for r in rs if r["orgao"] != "não informado").most_common(3)],
                         "regional": {k: len(x) for k, x in por_chave(rs, lambda r: r["regional"]).items()}})
        temas.append({"id": t["id"], "nome": t["nome"], **resumo(rt), "subtemas": subs,
                      "por_ano": {a: resumo(x) for a, x in sorted(por_chave(rt, lambda r: r["ano"]).items())},
                      "mensal": serie_mensal(rt),
                      "tipologia": {k: len(x) for k, x in por_chave(rt, lambda r: r["tipologia"]).items()},
                      "motivos": Counter(m for r in rt for m in r["motivos"].split("|") if m).most_common(6)})
    salvar_json(dados / "temas.json", temas)

    # ---------------- regionais e órgãos
    regionais = {}
    for sigla, v in por_chave(rows, lambda r: r["regional"]).items():
        regionais[sigla] = {"nome": NOMES_REG.get(sigla, sigla), **resumo(v),
                            "por_ano": {a: resumo(x) for a, x in sorted(por_chave(v, lambda r: r["ano"]).items())},
                            "temas": {k: resumo(x) for k, x in por_chave(v, lambda r: r["tema"]).items()},
                            "servicos": [{"id": next(k for k, s in servicos.items() if s["chave"] == ch), "n": len(x)}
                                         for ch, x in sorted(por_chave(v, lambda r: r["servico_chave"]).items(), key=lambda kv: -len(kv[1]))[:15]]}
    salvar_json(dados / "regionais.json", regionais)

    orgaos = {}
    for sigla, v in por_chave(rows, lambda r: r["orgao"]).items():
        if len(v) < MIN_REGISTROS:
            continue
        orgaos[sigla] = {"sigla": sigla, "nome": ORGAOS.get(sigla, {}).get("nome", "sigla não expandida"),
                         "area": ORGAOS.get(sigla, {}).get("area", ""), "confirmacao": ORGAOS.get(sigla, {}).get("confirmacao", "ok"),
                         **resumo(v),
                         "por_ano": {a: resumo(x) for a, x in sorted(por_chave(v, lambda r: r["ano"]).items())},
                         "temas": {k: resumo(x) for k, x in por_chave(v, lambda r: r["tema"]).items()},
                         "servicos": [{"id": next(k for k, s in servicos.items() if s["chave"] == ch), "n": len(x)}
                                      for ch, x in sorted(por_chave(v, lambda r: r["servico_chave"]).items(), key=lambda kv: -len(kv[1]))[:15]]}
    salvar_json(dados / "orgaos.json", orgaos)

    # ---------------- vocabulário e metadados
    salvar_json(dados / "vocabulario.json", {
        "taxonomia": TAX,
        "tesauro": montar_tesauro(ler_json(DIR_VOCAB / "tesauro_base.json"), servicos, autoridade),
        "orgaos": ler_json(DIR_VOCAB / "orgaos.json"),
        "conceitos": ler_json(DIR_VOCAB / "conceitos.json"),
        "plano": ler_json(DIR_VOCAB / "plano_classificacao.json"),
    }, compacto=True)
    meta = {"gerado_em": gerado, "periodo": geral["periodo"], "versoes": [
        {k: v.get(k) for k in ("identificador", "titulo", "criador", "publicador", "data", "data_captura", "fonte", "nome_original",
                              "formato", "cobertura_temporal", "direitos", "sha256", "extensao_bytes", "estado", "codigo_classificacao", "temporalidade")}
        | {"ultimo_evento": v["eventos"][-1], "n_eventos": len(v["eventos"])} for v in manifesto["versoes"]]}
    salvar_json(dados / "meta.json", meta)
    salvar_json(DIR_WEB / "catalogo.jsonld", catalogo_dcat(meta, gerado))
    print(f"site: {len(rows)} manifestações, {len(servicos)} serviços, {len(orgaos)} órgãos, período {meses[0]} a {meses[-1]}")


if __name__ == "__main__":
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    main()
