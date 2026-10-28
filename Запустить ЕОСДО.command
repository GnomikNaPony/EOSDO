#!/bin/sh
cd "$(dirname "$0")"
exec "$HOME/.bun/bin/bun" scripts/start.ts --open
