#!/usr/bin/env bash
#
# Install BISL on a fresh Ubuntu/Debian VPS.
# Run inside extracted bisl-deploy/:
#   sudo ./scripts/install-vps.sh
#
set -euo pipefail

DEPLOY_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RPC_DIR="${DEPLOY_ROOT}/rpc"
FABRIC_DIR="${DEPLOY_ROOT}/fabric"

echo "==> BISL VPS install"
echo "    Deploy root: ${DEPLOY_ROOT}"

# --- Prerequisites ---
if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker..."
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg rsync
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable docker
  systemctl start docker
fi

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  echo "==> Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi

# --- RPC dependencies ---
echo "==> Installing RPC dependencies"
cd "${RPC_DIR}"
npm install --omit=dev

# --- Environment ---
if [[ ! -f "${RPC_DIR}/.env" ]]; then
  cp "${RPC_DIR}/.env.example" "${RPC_DIR}/.env"
  WRITE_KEY="$(openssl rand -hex 32)"
  READ_KEY="$(openssl rand -hex 32)"
  sed -i "s/change-me-write-key/${WRITE_KEY}/" "${RPC_DIR}/.env"
  sed -i "s/change-me-read-key/${READ_KEY}/" "${RPC_DIR}/.env"
  echo ""
  echo "==> Generated API keys (saved to rpc/.env):"
  echo "    WRITE_API_KEY=${WRITE_KEY}"
  echo "    READ_API_KEY=${READ_KEY}"
  echo ""
fi

# Load VPS defaults
set -a
source "${RPC_DIR}/.env.vps" 2>/dev/null || true
set +a

export FABRIC_ROOT="${FABRIC_DIR}"

echo "==> Starting Fabric network"
"${DEPLOY_ROOT}/scripts/start-network.sh"

echo "==> Setting up wallet"
cd "${RPC_DIR}"
FABRIC_ROOT="${FABRIC_DIR}" npm run setup:wallet

echo "==> Deploying chaincode"
"${DEPLOY_ROOT}/scripts/deploy-chaincode.sh"

echo "==> Starting RPC for RBAC init"
source "${RPC_DIR}/.env"
FABRIC_ROOT="${FABRIC_DIR}" "${DEPLOY_ROOT}/scripts/start-rpc.sh" &
RPC_PID=$!
sleep 3

echo "==> Initializing RBAC"
curl -sf -X POST "http://localhost:${PORT:-4000}/v1/admin/init-rbac" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${WRITE_API_KEY}" \
  -d '{"adminMSP":"Org1MSP","agentMSP":"Org2MSP"}' && echo "RBAC initialized" || echo "RBAC init failed — run manually after RPC is up"

kill "${RPC_PID}" 2>/dev/null || true

echo ""
echo "==> Install complete"
echo ""
echo "Start RPC manually:"
echo "  ${DEPLOY_ROOT}/scripts/start-rpc.sh"
echo ""
echo "Or install systemd service:"
echo "  cp ${DEPLOY_ROOT}/scripts/bisl-rpc.service /etc/systemd/system/"
echo "  sed -i 's|/opt/bisl-deploy|${DEPLOY_ROOT}|g' /etc/systemd/system/bisl-rpc.service"
echo "  systemctl daemon-reload && systemctl enable --now bisl-rpc"
