"""Roda o pipeline completo: coleta -> tratamento -> indicadores (site).

    python pipeline/executar.py
"""
import subprocess
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
for script in ("coletar.py", "processar.py", "indicadores.py"):
    print(f"\n== {script}")
    subprocess.run([sys.executable, str(AQUI / script)], check=True)
print("\nPronto. Para ver o site: python -m http.server 8000 --directory web  e abra http://localhost:8000")
