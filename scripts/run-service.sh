#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
case "${1:-}" in web|worker|check) ;; *) echo 'Usage: bash scripts/run-service.sh web|worker|check' >&2; exit 1 ;; esac
command -v node >/dev/null && command -v pnpm >/dev/null || {
  echo 'Podframes setup: Node or pnpm is missing from the service PATH. Run bash scripts/setup.sh first.' >&2; exit 1;
}
[[ -d node_modules/tsx ]] || {
  echo 'Podframes setup: dependencies are missing. Run pnpm install --frozen-lockfile.' >&2; exit 1;
}
node --import tsx scripts/check-service.mts
case "${1:-}" in
  web) cd apps/web; exec node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3000 ;;
  worker) exec node --import tsx scripts/worker.mts ;;
  check) echo "Production startup checks passed. Provider readiness still requires pnpm podframes doctor." ;;
  *) echo 'Usage: bash scripts/run-service.sh web|worker' >&2; exit 1 ;;
esac
