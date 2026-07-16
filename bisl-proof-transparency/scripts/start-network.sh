#!/usr/bin/env bash
set -euo pipefail

DEPLOY_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FABRIC_DIR="${DEPLOY_ROOT}/fabric"
TN="${FABRIC_DIR}/test-network"

cd "${TN}"
export PATH="${FABRIC_DIR}/bin:${PATH}"
export FABRIC_CFG_PATH="${FABRIC_DIR}/config"

if docker ps --format '{{.Names}}' | grep -q 'peer0.org1'; then
  echo "Fabric network already running"
  exit 0
fi

./network.sh down 2>/dev/null || true
./network.sh up createChannel -ca

echo "Fabric network is up"
