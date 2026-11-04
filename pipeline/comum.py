"""Funções compartilhadas pelo pipeline do Linha do Tempo BH.

Só usa a biblioteca padrão do Python (3.10+), para que qualquer integrante
do grupo consiga rodar sem instalar dependências.
"""
import csv
import hashlib
import io
import json
import math
import re
import unicodedata
import urllib.request
import zipfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DIR_BRUTO = RAIZ / "data" / "raw"
DIR_ARQUIVO = RAIZ / "data" / "arquivo"      # manifesto e metadados de preservação (no git)
DIR_PROCESSADO = RAIZ / "data" / "processed"
DIR_WEB = RAIZ / "web"
DIR_VOCAB = Path(__file__).resolve().parent / "vocabulario"

USER_AGENT = "Mozilla/5.0 (compatible; ReclamaBH/1.0; projeto academico UFMG)"

csv.field_size_limit(2**31 - 1)


# ---------------------------------------------------------------- arquivos

def baixar(url, destino, timeout=300):
    """Baixa `url` para `destino` e devolve os cabeçalhos HTTP."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    destino = Path(destino)
    destino.parent.mkdir(parents=True, exist_ok=True)
    tmp = destino.with_suffix(destino.suffix + ".parcial")
    with urllib.request.urlopen(req, timeout=timeout) as resp, open(tmp, "wb") as f:
        while bloco := resp.read(1 << 20):
            f.write(bloco)
        cabecalhos = dict(resp.headers)
    tmp.replace(destino)
    return cabecalhos


def sha256_arquivo(caminho):
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        while bloco := f.read(1 << 20):
            h.update(bloco)
    return h.hexdigest()


def hash_conteudo_gtfs(caminho_zip):
    """Hash do conteúdo do GTFS ignorando feed_info.txt.

    O feed_info muda a cada publicação (carimbo de versão) mesmo quando
    horários e itinerários são idênticos; sem esta regra o arquivo diário
    guardaria cópias repetidas da mesma programação.
    """
    h = hashlib.sha256()
    with zipfile.ZipFile(caminho_zip) as z:
        for nome in sorted(z.namelist()):
            if nome.endswith("feed_info.txt"):
                continue
            h.update(nome.encode())
            with z.open(nome) as f:
                while bloco := f.read(1 << 20):
                    h.update(bloco)
    return h.hexdigest()


def ler_csv_zip(z, nome):
    """Itera as linhas de um .txt do GTFS como dicionários limpos.

    Regras de limpeza aplicadas a todas as versões:
    - remove BOM e quebras de linha \\r (arquivos gerados no Windows);
    - remove espaços nas pontas dos campos (a versão Bus2 tem trip_id com espaços);
    - nomes de colunas em minúsculas.
    """
    if nome not in z.namelist():
        return
    with z.open(nome) as bruto:
        texto = io.TextIOWrapper(bruto, encoding="utf-8-sig", newline="")
        leitor = csv.reader(texto)
        cab = [c.strip().lower() for c in next(leitor)]
        for linha in leitor:
            if not linha:
                continue
            yield {c: (v.strip() if v else "") for c, v in zip(cab, linha)}


def salvar_json(caminho, dados, compacto=False):
    caminho = Path(caminho)
    caminho.parent.mkdir(parents=True, exist_ok=True)
    with open(caminho, "w", encoding="utf-8") as f:
        if compacto:
            json.dump(dados, f, ensure_ascii=False, separators=(",", ":"))
        else:
            json.dump(dados, f, ensure_ascii=False, indent=2)


def ler_json(caminho):
    with open(caminho, encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------- texto

def sem_acento(texto):
    nfkd = unicodedata.normalize("NFKD", texto)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def normalizar(texto):
    """Forma canônica para indexação: minúsculas, sem acento, espaços simples."""
    texto = sem_acento(texto or "").lower()
    texto = re.sub(r"[^a-z0-9]+", " ", texto)
    return texto.strip()


def slug(texto):
    return normalizar(texto).replace(" ", "-")


def titulo_bairro(nome):
    """'dos Coqueiros' -> 'Dos Coqueiros'; mantém o resto como veio da PBH."""
    nome = nome.strip()
    return nome[:1].upper() + nome[1:] if nome else nome


def hora_para_min(hhmmss):
    """'25:10:00' -> 1510. O GTFS permite horas acima de 24 para viagens após a meia-noite."""
    if not hhmmss:
        return None
    h, m, *_ = hhmmss.split(":")
    return int(h) * 60 + int(m)


def min_para_hora(minutos):
    if minutos is None:
        return None
    h, m = divmod(int(minutos), 60)
    return f"{h:02d}:{m:02d}"


# ---------------------------------------------------------------- geografia

def utm_para_latlon(x, y, zona=23, sul=True):
    """Converte UTM (SIRGAS 2000 / GRS80, compatível com WGS84 no nível de metros) para lat/lon.

    A PBH publica os limites de bairros e regionais em SIRGAS 2000 / UTM 23S (EPSG:31983).
    """
    a = 6378137.0
    f = 1 / 298.257222101
    k0 = 0.9996
    e2 = f * (2 - f)
    ep2 = e2 / (1 - e2)
    x = x - 500000.0
    if sul:
        y = y - 10000000.0
    m = y / k0
    mu = m / (a * (1 - e2 / 4 - 3 * e2**2 / 64 - 5 * e2**3 / 256))
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    phi1 = (mu + (3 * e1 / 2 - 27 * e1**3 / 32) * math.sin(2 * mu)
            + (21 * e1**2 / 16 - 55 * e1**4 / 32) * math.sin(4 * mu)
            + (151 * e1**3 / 96) * math.sin(6 * mu)
            + (1097 * e1**4 / 512) * math.sin(8 * mu))
    n1 = a / math.sqrt(1 - e2 * math.sin(phi1) ** 2)
    t1 = math.tan(phi1) ** 2
    c1 = ep2 * math.cos(phi1) ** 2
    r1 = a * (1 - e2) / (1 - e2 * math.sin(phi1) ** 2) ** 1.5
    d = x / (n1 * k0)
    lat = phi1 - (n1 * math.tan(phi1) / r1) * (
        d**2 / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1**2 - 9 * ep2) * d**4 / 24
        + (61 + 90 * t1 + 298 * c1 + 45 * t1**2 - 252 * ep2 - 3 * c1**2) * d**6 / 720)
    lon = (d - (1 + 2 * t1 + c1) * d**3 / 6
           + (5 - 2 * c1 + 28 * t1 - 3 * c1**2 + 8 * ep2 + 24 * t1**2) * d**5 / 120) / math.cos(phi1)
    lon0 = math.radians((zona - 1) * 6 - 180 + 3)
    return math.degrees(lat), math.degrees(lon0 + lon)


def ler_wkt_poligonos(wkt):
    """Lê POLYGON/MULTIPOLYGON em WKT e devolve lista de polígonos [[anel_externo, buracos...], ...]
    com coordenadas (x, y) ainda em UTM."""
    wkt = wkt.strip()
    tipo = wkt.split("(", 1)[0].strip().upper()
    corpo = wkt[len(tipo):].strip()

    def aneis(texto):
        return [[tuple(map(float, p.split())) for p in anel.split(",")]
                for anel in re.findall(r"\(([^()]+)\)", texto)]

    if tipo == "POLYGON":
        return [aneis(corpo)]
    if tipo == "MULTIPOLYGON":
        partes = re.findall(r"\(\s*(\([^()]+\)(?:\s*,\s*\([^()]+\))*)\s*\)", corpo)
        return [aneis(p) for p in partes]
    raise ValueError(f"geometria não suportada: {tipo}")


def ponto_no_anel(lon, lat, anel):
    dentro = False
    j = len(anel) - 1
    for i in range(len(anel)):
        xi, yi = anel[i]
        xj, yj = anel[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            dentro = not dentro
        j = i
    return dentro


def ponto_no_poligono(lon, lat, poligonos):
    for poligono in poligonos:
        externo, *buracos = poligono
        if ponto_no_anel(lon, lat, externo) and not any(ponto_no_anel(lon, lat, b) for b in buracos):
            return True
    return False


def simplificar(pontos, tolerancia):
    """Douglas-Peucker iterativo; reduz o tamanho das linhas e polígonos enviados ao site."""
    if len(pontos) < 3:
        return list(pontos)
    if pontos[0] == pontos[-1]:
        # Anel fechado: com as pontas iguais toda distância daria zero; divide no ponto mais distante.
        x0, y0 = pontos[0]
        k = max(range(len(pontos)), key=lambda i: (pontos[i][0] - x0) ** 2 + (pontos[i][1] - y0) ** 2)
        if k == 0:
            return list(pontos)
        return simplificar(pontos[:k + 1], tolerancia)[:-1] + simplificar(pontos[k:], tolerancia)
    manter = [False] * len(pontos)
    manter[0] = manter[-1] = True
    pilha = [(0, len(pontos) - 1)]
    while pilha:
        ini, fim = pilha.pop()
        (x1, y1), (x2, y2) = pontos[ini], pontos[fim]
        dx, dy = x2 - x1, y2 - y1
        norma = math.hypot(dx, dy) or 1e-12
        maior, idx = 0.0, None
        for i in range(ini + 1, fim):
            x0, y0 = pontos[i]
            dist = abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / norma
            if dist > maior:
                maior, idx = dist, i
        if idx is not None and maior > tolerancia:
            manter[idx] = True
            pilha += [(ini, idx), (idx, fim)]
    return [p for p, m in zip(pontos, manter) if m]
