#!/usr/bin/env bash
set -euo pipefail

DEPLOY_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RPC_DIR="${DEPLOY_ROOT}/rpc"

cd "${RPC_DIR}"

if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi

if [[ -f .env.vps ]]; then
  set -a
  source .env.vps
  set +a
fi

export FABRIC_ROOT="${FABRIC_ROOT:-${DEPLOY_ROOT}/fabric}"

echo "Starting BISL RPC on port ${PORT:-4000}"
exec node app.js
