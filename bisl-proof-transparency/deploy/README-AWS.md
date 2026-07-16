# Deploy BISL on AWS (EC2)

Recommended first production setup: **one EC2 instance** running Fabric + RPC together.  
Use the same `bisl-deploy.tar.gz` package you already built locally.

---

## Architecture (simple)

```
Internet
   │
   ▼
AWS EC2 (Ubuntu 22.04)
   ├── Docker: Fabric peers + orderer (internal only)
   ├── Node: BISL RPC on :4000
   └── Optional: nginx/Caddy → HTTPS :443
```

| Component | Public? | Port |
|-----------|---------|------|
| RPC API | Yes (via HTTPS) | 443 → 4000 |
| Fabric peers/orderer | **No** | 7050–9051 (localhost only) |

---

## 1. Create EC2 instance

### Instance settings

| Setting | Value |
|---------|-------|
| AMI | Ubuntu Server 22.04 LTS |
| Instance type | `t3.medium` (2 vCPU, 4 GB) minimum; `t3.large` if busy |
| Storage | 30 GB gp3 |
| Key pair | Create/download `.pem` |

### Security Group inbound rules

| Type | Port | Source | Why |
|------|------|--------|-----|
| SSH | 22 | Your IP only | Admin access |
| HTTPS | 443 | `0.0.0.0/0` | Public RPC (after TLS) |
| HTTP | 80 | `0.0.0.0/0` | Let’s Encrypt / redirect |
| Custom TCP | 4000 | Your IP only (optional) | Direct RPC testing |

**Do not** open Fabric ports (7050, 7051, 8051, 9050, 9051) to the internet.

### Allocate Elastic IP

Attach an Elastic IP so the public IP does not change after reboot.

---

## 2. Build package on your Mac

```bash
cd /Users/mapmac/Documents/Github/Blockchain/fabric-samples
./bisl-proof-transparency/scripts/package-vps.sh
```

Creates `bisl-deploy.tar.gz`.

---

## 3. Upload to EC2

```bash
# Replace with your key + Elastic IP
scp -i ~/Downloads/your-key.pem bisl-deploy.tar.gz ubuntu@YOUR_EC2_IP:/home/ubuntu/

ssh -i ~/Downloads/your-key.pem ubuntu@YOUR_EC2_IP
```

---

## 4. Install on EC2

```bash
sudo mkdir -p /opt
sudo mv ~/bisl-deploy.tar.gz /opt/
cd /opt
sudo tar -xzf bisl-deploy.tar.gz
cd bisl-deploy
sudo chmod +x scripts/*.sh
sudo ./scripts/install-vps.sh
```

This installs Docker + Node 20, starts Fabric, deploys `bislcc`, creates wallet, generates API keys.

**Save the printed keys** (`WRITE_API_KEY`, `READ_API_KEY`) from `rpc/.env`.

---

## 5. Start RPC as a service

```bash
cd /opt/bisl-deploy
sudo cp scripts/bisl-rpc.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now bisl-rpc
sudo systemctl status bisl-rpc
```

Test from EC2:

```bash
curl http://localhost:4000/health
```

Test from your laptop (if port 4000 is open to your IP):

```bash
export WRITE_API_KEY="..."   # from rpc/.env on server
export READ_API_KEY="..."

curl http://YOUR_EC2_IP:4000/health

curl -X POST http://YOUR_EC2_IP:4000/v1/proofs \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $WRITE_API_KEY" \
  -d '{
    "id":"aws-test-001",
    "agentId":"agent-1",
    "companyId":"company-1",
    "ipfsHash":"bafkreibctxx3wdhon4bgoos43yuq2btt45na3qy45rbzrhekwksozj7bxm",
    "fileUrl":"https://gateway.pinata.cloud/ipfs/bafkreibctxx3wdhon4bgoos43yuq2btt45na3qy45rbzrhekwksozj7bxm"
  }'
```

---

## 6. Add HTTPS (required for production)

Point a DNS A record to your Elastic IP, e.g. `rpc.yourdomain.com`.

### Install nginx + Certbot

```bash
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx

sudo tee /etc/nginx/sites-available/bisl-rpc <<'EOF'
server {
    listen 80;
    server_name rpc.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/bisl-rpc /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo certbot --nginx -d rpc.yourdomain.com
```

Then call:

```bash
curl https://rpc.yourdomain.com/health
```

Close security group port **4000** to the public after HTTPS works (keep only 22, 80, 443).

---

## 7. Connect NestJS / your backend

```env
BISL_RPC_URL=https://rpc.yourdomain.com
BISL_WRITE_API_KEY=<from rpc/.env on EC2>
BISL_READ_API_KEY=<from rpc/.env on EC2>
```

```typescript
await fetch(`${process.env.BISL_RPC_URL}/v1/proofs`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': process.env.BISL_WRITE_API_KEY!
  },
  body: JSON.stringify(proofData) // no status field
});
```

---

## Useful AWS commands

```bash
# RPC logs
sudo journalctl -u bisl-rpc -f

# Restart RPC
sudo systemctl restart bisl-rpc

# Fabric containers
docker ps

# Redeploy chaincode after code change
cd /opt/bisl-deploy && sudo ./scripts/deploy-chaincode.sh
```

---

## Cost estimate (us-east-1, approx)

| Resource | Monthly |
|----------|---------|
| EC2 `t3.medium` | ~$30 |
| 30 GB gp3 | ~$2.5 |
| Elastic IP (attached) | Free |
| Data transfer | Variable |
| **Total** | **~$35–50** |

---

## Checklist before going live

- [ ] Local test passed (anchor + get + list + verify)
- [ ] EC2 security group: Fabric ports closed
- [ ] HTTPS enabled
- [ ] Strong API keys in `rpc/.env`
- [ ] NestJS uses write key only on server (never in frontend)
- [ ] Elastic IP attached
- [ ] Snapshots / AMI backup of EC2 after healthy deploy

---

## Later (optional)

| Upgrade | When |
|---------|------|
| Separate EC2 for Fabric vs RPC | Higher traffic / isolation |
| Application Load Balancer | Multiple RPC instances |
| AWS Secrets Manager | Store API keys |
| Managed Blockchain / custom Fabric | Production consortium networks |

For now: **one EC2 + this package is enough**.

See also: [README-DEPLOY.md](./README-DEPLOY.md) for package details.
