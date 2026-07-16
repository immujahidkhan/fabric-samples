#!/usr/bin/env bash
set -euo pipefail

DEPLOY_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FABRIC_DIR="${DEPLOY_ROOT}/fabric"
CHAINCODE_DIR="${DEPLOY_ROOT}/chaincode"
TN="${FABRIC_DIR}/test-network"

cd "${TN}"
export PATH="${FABRIC_DIR}/bin:${PATH}"
export FABRIC_CFG_PATH="${FABRIC_DIR}/config"

./network.sh deployCC \
  -ccn bislcc \
  -ccp "${CHAINCODE_DIR}" \
  -ccl javascript

echo "Chaincode bislcc deployed"
