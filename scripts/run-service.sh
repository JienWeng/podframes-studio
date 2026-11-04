#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
case "${1:-}" in
  web) exec pnpm --filter @podframes/web exec next start --hostname 127.0.0.1 --port 3000 ;;
  worker) exec pnpm worker ;;
  *) echo 'Usage: bash scripts/run-service.sh web|worker' >&2; exit 1 ;;
esac
