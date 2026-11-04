#!/usr/bin/env bash
# Abre o Reclama BH no navegador (Linux/macOS). Python 3 ja vem no Ubuntu.
cd "$(dirname "$0")"
echo "Servindo o site em http://localhost:8000  (Ctrl+C para parar)"
(sleep 1; xdg-open http://localhost:8000 2>/dev/null || open http://localhost:8000 2>/dev/null) &
python3 -m http.server 8000 --directory web
