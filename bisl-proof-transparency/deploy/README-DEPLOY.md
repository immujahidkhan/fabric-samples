# BISL VPS / Cloud Deployment

Minimal production package — **not** the full `fabric-samples` repo.

## What is included

```
bisl-deploy/
├── fabric/           # bin, config, test-network (peers + orderer)
├── chaincode/        # bislcc JavaScript chaincode
├── rpc/              # Secured Proof Transparency API
├── scripts/          # install, start, deploy helpers
└── README-DEPLOY.md
```

**Excluded:** all other fabric-samples demos, legacy Go chaincode, node_modules.

## AWS

For Amazon EC2 step-by-step (security group, Elastic IP, HTTPS, NestJS), see **[README-AWS.md](./README-AWS.md)**.

## VPS requirements

| Resource | Minimum |
|----------|---------|
| OS | Ubuntu 22.04+ / Debian 12+ |
| RAM | 4 GB (Fabric Docker) |
| CPU | 2 vCPU |
| Disk | 20 GB |
| Ports | 4000 (RPC), 7050-9051 (Fabric, internal) |

## 1. Build package (on your dev machine)

From `fabric-samples` root:

```bash
chmod +x bisl-proof-transparency/scripts/*.sh
./bisl-proof-transparency/scripts/package-vps.sh
```

Creates:
- `bisl-deploy/` folder
- `bisl-deploy.tar.gz` archive (~15–30 MB without Docker images)

## 2. Upload to VPS

```bash
scp bisl-deploy.tar.gz user@your-vps-ip:/opt/
ssh user@your-vps-ip
```

## 3. Install on VPS

```bash
cd /opt
tar -xzf bisl-deploy.tar.gz
cd bisl-deploy
chmod +x scripts/*.sh
sudo ./scripts/install-vps.sh
```

This will:
1. Install Docker + Node.js 20 (if missing)
2. Start Fabric test-network
3. Deploy `bislcc` chaincode
4. Setup wallet + generate API keys
5. Initialize RBAC

## 4. Start RPC

```bash
./scripts/start-rpc.sh
```

Or with systemd:

```bash
sudo cp scripts/bisl-rpc.service /etc/systemd/system/
sudo sed -i "s|/opt/bisl-deploy|$(pwd)|g" /etc/systemd/system/bisl-rpc.service
sudo systemctl daemon-reload
sudo systemctl enable --now bisl-rpc
```

## 5. Verify

```bash
curl http://localhost:4000/health

# Use keys printed during install (or from rpc/.env)
export WRITE_API_KEY="..."
export READ_API_KEY="..."

curl -X POST http://localhost:4000/v1/proofs \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $WRITE_API_KEY" \
  -d '{"id":"test-001","ipfsHash":"bafkrei...","agentId":"a1","companyId":"c1"}'
```

## 6. HTTPS (production)

Put nginx or Caddy in front:

```nginx
server {
    listen 443 ssl;
    server_name rpc.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/rpc.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/rpc.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | RPC listen port |
| `WRITE_API_KEY` | — | Anchor proofs |
| `READ_API_KEY` | — | Query proofs |
| `FABRIC_ROOT` | `../fabric` | Path to fabric folder |
| `DISCOVERY_AS_LOCALHOST` | `true` | Set `false` if peers use public DNS |
| `REQUIRE_AUTH` | `true` | API key enforcement |

## Manual operations

```bash
# Restart Fabric
./scripts/start-network.sh

# Redeploy chaincode after changes
./scripts/deploy-chaincode.sh

# Rebuild wallet after network reset
cd rpc && FABRIC_ROOT=../fabric npm run setup:wallet
```

## RPC-only deployment (Fabric elsewhere)

If Fabric runs on a different server, package only `rpc/` and set:

```bash
CONNECTION_PROFILE=/path/to/connection-org1.json
DISCOVERY_AS_LOCALHOST=false
WALLET_PATH=/path/to/wallet
```

Copy `connection-org1.json` and wallet identity from the Fabric server after `network.sh up`.

## Security checklist

- [ ] Strong `WRITE_API_KEY` / `READ_API_KEY` in `rpc/.env`
- [ ] HTTPS via reverse proxy
- [ ] Firewall: expose only 443, block Fabric ports from public internet
- [ ] Never commit `rpc/.env` or `wallet/` to git
- [ ] Give write key only to your backend (NestJS)
