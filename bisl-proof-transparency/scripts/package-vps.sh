#!/usr/bin/env bash
#
# Package a minimal BISL deployment bundle for VPS/cloud.
# Run from fabric-samples root:
#   ./bisl-proof-transparency/scripts/package-vps.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${ROOT}/bisl-deploy"
ARCHIVE="${ROOT}/bisl-deploy.tar.gz"

echo "==> Packaging BISL deploy bundle"
echo "    Source: ${ROOT}"
echo "    Output: ${OUT}"

rm -rf "${OUT}"
mkdir -p "${OUT}"/{fabric,rpc,chaincode,scripts}

# Fabric network essentials
echo "==> Copying Fabric binaries and config"
cp -R "${ROOT}/bin" "${OUT}/fabric/"
cp -R "${ROOT}/config" "${OUT}/fabric/"

echo "==> Copying test-network"
rsync -a \
  --exclude 'system-genesis-block' \
  --exclude 'channel-artifacts' \
  --exclude 'organizations' \
  --exclude 'compose/podman' \
  "${ROOT}/test-network/" "${OUT}/fabric/test-network/"

# Chaincode (JS only)
echo "==> Copying chaincode"
rsync -a \
  --exclude 'node_modules' \
  "${ROOT}/bisl-proof-transparency/chaincode-javascript/" "${OUT}/chaincode/"

# RPC API
echo "==> Copying RPC API"
rsync -a \
  --exclude 'node_modules' \
  --exclude 'wallet' \
  "${ROOT}/bisl-proof-transparency/rest-api-javascript/" "${OUT}/rpc/"
mkdir -p "${OUT}/rpc/wallet"

# Deploy scripts and docs
echo "==> Copying deploy scripts"
cp "${ROOT}/bisl-proof-transparency/scripts/install-vps.sh" "${OUT}/scripts/"
cp "${ROOT}/bisl-proof-transparency/scripts/start-network.sh" "${OUT}/scripts/"
cp "${ROOT}/bisl-proof-transparency/scripts/deploy-chaincode.sh" "${OUT}/scripts/"
cp "${ROOT}/bisl-proof-transparency/scripts/start-rpc.sh" "${OUT}/scripts/"
cp "${ROOT}/bisl-proof-transparency/deploy/README-DEPLOY.md" "${OUT}/README-DEPLOY.md"
cp "${ROOT}/bisl-proof-transparency/deploy/bisl-rpc.service" "${OUT}/scripts/"
cp "${ROOT}/bisl-proof-transparency/deploy/.env.production.example" "${OUT}/rpc/.env.example"

chmod +x "${OUT}/scripts/"*.sh

# VPS-specific env defaults
cat > "${OUT}/rpc/.env.vps" <<'EOF'
PORT=4000
FABRIC_ROOT=../fabric
DISCOVERY_AS_LOCALHOST=true
REQUIRE_AUTH=true
FABRIC_ORG=org1
FABRIC_IDENTITY=appUserOrg1
CHANNEL_NAME=mychannel
CHAINCODE_NAME=bislcc
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120
EOF

echo "==> Creating archive: ${ARCHIVE}"
tar -czf "${ARCHIVE}" -C "${ROOT}" bisl-deploy

echo ""
echo "Done."
echo "  Folder:  ${OUT}"
echo "  Archive: ${ARCHIVE}"
echo ""
echo "Upload to VPS:"
echo "  scp ${ARCHIVE} user@your-vps:/opt/"
echo "  ssh user@your-vps 'cd /opt && tar -xzf bisl-deploy.tar.gz && cd bisl-deploy && sudo ./scripts/install-vps.sh'"
