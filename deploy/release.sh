#!/usr/bin/env bash
# Build the backend here and ship it to the VPS.
#
#   ./deploy/release.sh
#
# The build happens on this machine on purpose: the server has around 600MB of
# RAM free and eight other things running on it, and tsc is the heaviest thing
# in this project. `pnpm deploy` produces a tree with @pet/shared already
# compiled into node_modules, so the server needs neither pnpm nor the
# workspace — only node. Nothing in the production dependency set is native, so
# a tree built on macOS runs unchanged on Linux.
set -euo pipefail

HOST="${PET_DEPLOY_HOST:-qollanma-server}"
TARGET="${PET_DEPLOY_PATH:-/opt/ai-english-pet}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT

echo "==> building"
pnpm --filter @pet/shared build
pnpm --filter @pet/backend build
pnpm deploy --filter @pet/backend --prod "$staging/app" >/dev/null

# The artifact ships compiled output only.
rm -rf "$staging/app/src" "$staging/app/vitest.config.ts" \
       "$staging/app/tsconfig.json" "$staging/app/tsconfig.build.json"

echo "==> shipping to $HOST:$TARGET"
ssh "$HOST" "mkdir -p '$TARGET'"
rsync -az --delete "$staging/app/" "$HOST:$TARGET/"

echo "==> restarting"
ssh "$HOST" '
  systemctl restart pet-api
  sleep 2
  systemctl is-active --quiet pet-api || { journalctl -u pet-api -n 30 --no-pager; exit 1; }
  curl -fsS http://127.0.0.1:7779/api/v1/health && echo
'
echo "==> done"
