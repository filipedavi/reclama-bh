@echo off
rem Abre o Reclama BH no navegador. Precisa do Python instalado (python.org ou: winget install Python.Python.3.12).
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Python nao encontrado. Instale com:  winget install Python.Python.3.12
  pause
  exit /b 1
)
echo Servindo o site em http://localhost:8000  (feche esta janela para parar)
start "" http://localhost:8000
python -m http.server 8000 --directory web
