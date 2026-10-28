#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ ! -x .venv/bin/python ]; then
  echo 'Подготовка локального окружения Python…'
  if command -v uv >/dev/null 2>&1; then
    uv venv .venv
  else
    python3 -m venv .venv
  fi
fi
if ! .venv/bin/python -c 'import pypdf, docx, openpyxl' >/dev/null 2>&1; then
  if command -v uv >/dev/null 2>&1; then
    uv pip install --python .venv/bin/python -r requirements.lock
  else
    .venv/bin/python -m pip install -r requirements.lock
  fi
fi
exec .venv/bin/python server.py "$@"
