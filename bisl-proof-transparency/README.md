# BISL Proof Transparency RPC

Secure HTTP RPC gateway for Hyperledger Fabric dataset proof notarization.

Clients never talk to Fabric peers directly. They call this RPC with an API key. The server holds Fabric wallets and identities; callers only send business payload and receive proof records.

| Layer | Responsibility |
|-------|----------------|
| Your backend (NestJS, etc.) | Upload file to IPFS, own workflow/status, call this RPC |
| This RPC | Authenticate callers, anchor/query immutable proofs |
| Fabric chaincode (`bislcc`) | Store proof metadata on ledger |
| IPFS | Store the actual file binary |

---

## Quick start

### 1. Prerequisites

- Docker Desktop running
- Fabric test-network up with `bislcc` deployed (see [howtoReadme.md](./howtoReadme.md))
- Node.js 20+

### 2. Configure API keys

```bash
cd bisl-proof-transparency/rest-api-javascript
cp .env.example .env
```

Generate strong keys:

```bash
openssl rand -hex 32   # use as WRITE_API_KEY
openssl rand -hex 32   # use as READ_API_KEY
```

Export them (or load from `.env` with your process manager):

```bash
export WRITE_API_KEY="$(openssl rand -hex 32)"
export READ_API_KEY="$(openssl rand -hex 32)"
export REQUIRE_AUTH=true
```

### 3. Start the RPC

```bash
npm install
npm run setup:wallet
npm start
```

Health check (no API key required):

```bash
curl http://localhost:4000/health
```

---

## Security model

This RPC is designed so **anyone with a valid key can use it**, and **nobody without a key can**.

### Authentication

| Header | Description |
|--------|-------------|
| `X-API-Key: <key>` | Preferred |
| `Authorization: Bearer <key>` | Also accepted |

| Key type | Env var | Can write (anchor) | Can read (query) |
|----------|---------|--------------------|------------------|
| Write | `WRITE_API_KEY` or `API_KEY` | Yes | Yes |
| Read | `READ_API_KEY` | No | Yes |

- Auth is **enabled by default** (`REQUIRE_AUTH=true`).
- Missing or invalid key → `401 unauthorized`.
- Keys not configured while auth is on → `503 auth_not_configured`.
- Comparison uses timing-safe equality.

### What clients cannot do

- Cannot choose Fabric `org` / `identity` (locked to server env: `FABRIC_ORG`, `FABRIC_IDENTITY`)
- Cannot call arbitrary chaincode functions (allow-listed only)
- Cannot store `status` on-chain (stripped automatically)
- Cannot bypass rate limits (default 120 requests / 60s per IP)

### Production checklist

- [ ] Set strong `WRITE_API_KEY` and `READ_API_KEY` (never commit them)
- [ ] Terminate TLS (HTTPS) via reverse proxy (nginx, Caddy, AWS ALB, Cloudflare)
- [ ] Do not expose Fabric peers, orderers, or wallet files to the public internet
- [ ] Give NestJS / admin services the **write** key; give public apps the **read** key only
- [ ] Rotate keys periodically; support comma-separated keys for zero-downtime rotation
- [ ] Keep `REQUIRE_AUTH=true` in every non-local environment

Local-only (insecure) disable:

```bash
export REQUIRE_AUTH=false
```

---

## Base URL

```
http://localhost:4000          # local
https://rpc.your-domain.com    # production (HTTPS required)
```

All secured endpoints are under `/v1/...`.

---

## RPC endpoints

### `GET /health`

Public. No API key.

```bash
curl https://rpc.your-domain.com/health
```

---

### `POST /v1/proofs` — Anchor proof (write)

Requires **write** API key. Anchors immutable dataset metadata on Fabric. File binary stays on IPFS.

**Request**

```http
POST /v1/proofs
Content-Type: application/json
X-API-Key: <WRITE_API_KEY>
```

```json
{
  "id": "6a57e3073d7defc1b170a9c9",
  "agentId": "6a54ca3ab254a5ef16403aae",
  "companyId": "6a57de973d7defc1b170a9a8",
  "fileName": "Q3 Financials 2026",
  "datasetType": "Financial Statements",
  "description": "test description",
  "fileUrl": "https://gateway.pinata.cloud/ipfs/bafkreibctxx3wdhon4bgoos43yuq2btt45na3qy45rbzrhekwksozj7bxm",
  "ipfsHash": "bafkreibctxx3wdhon4bgoos43yuq2btt45na3qy45rbzrhekwksozj7bxm",
  "fileMimeType": "application/octet-stream",
  "fileSizeBytes": 18810,
  "pinSize": 18810,
  "submittedAt": "2026-07-15T19:44:07.217Z",
  "createdAt": "2026-07-15T19:44:07.219Z",
  "updatedAt": "2026-07-15T19:44:07.219Z"
}
```

Required fields: `id`, `ipfsHash`. Extra fields are stored as sent. `status` is ignored if present.

**Response** `201`

```json
{
  "ok": true,
  "result": {
    "id": "6a57e3073d7defc1b170a9c9",
    "agentId": "6a54ca3ab254a5ef16403aae",
    "companyId": "6a57de973d7defc1b170a9a8",
    "fileName": "Q3 Financials 2026",
    "ipfsHash": "bafkreibctxx3wdhon4bgoos43yuq2btt45na3qy45rbzrhekwksozj7bxm",
    "objectType": "DATASET",
    "anchorTxID": "...",
    "anchoredByMSP": "Org1MSP",
    "ledgerTimestamp": "..."
  }
}
```

**curl**

```bash
curl -X POST http://localhost:4000/v1/proofs \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $WRITE_API_KEY" \
  -d '{
    "id": "6a57e3073d7defc1b170a9c9",
    "agentId": "6a54ca3ab254a5ef16403aae",
    "companyId": "6a57de973d7defc1b170a9a8",
    "fileName": "Q3 Financials 2026",
    "datasetType": "Financial Statements",
    "description": "test description",
    "fileUrl": "https://gateway.pinata.cloud/ipfs/bafkreibctxx3wdhon4bgoos43yuq2btt45na3qy45rbzrhekwksozj7bxm",
    "ipfsHash": "bafkreibctxx3wdhon4bgoos43yuq2btt45na3qy45rbzrhekwksozj7bxm",
    "fileMimeType": "application/octet-stream",
    "fileSizeBytes": 18810,
    "pinSize": 18810,
    "submittedAt": "2026-07-15T19:44:07.217Z",
    "createdAt": "2026-07-15T19:44:07.219Z",
    "updatedAt": "2026-07-15T19:44:07.219Z"
  }'
```

---

### `GET /v1/proofs/:id` — Get by id (read)

```bash
curl http://localhost:4000/v1/proofs/6a57e3073d7defc1b170a9c9 \
  -H "X-API-Key: $READ_API_KEY"
```

---

### `GET /v1/proofs/agent/:agentId` — List by agent (read)

```bash
curl http://localhost:4000/v1/proofs/agent/6a54ca3ab254a5ef16403aae \
  -H "X-API-Key: $READ_API_KEY"
```

---

### `GET /v1/proofs/company/:companyId` — List by company (read)

```bash
curl http://localhost:4000/v1/proofs/company/6a57de973d7defc1b170a9a8 \
  -H "X-API-Key: $READ_API_KEY"
```

---

### `POST /v1/proofs/verify` — Verify IPFS hash (read)

```bash
curl -X POST http://localhost:4000/v1/proofs/verify \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $READ_API_KEY" \
  -d '{
    "id": "6a57e3073d7defc1b170a9c9",
    "candidateHash": "bafkreibctxx3wdhon4bgoos43yuq2btt45na3qy45rbzrhekwksozj7bxm"
  }'
```

---

## Integrate from NestJS / any backend

```typescript
const RPC_BASE = process.env.BISL_RPC_URL;      // https://rpc.your-domain.com
const WRITE_KEY = process.env.BISL_WRITE_API_KEY;

async function anchorProof(dataset: Record<string, unknown>) {
  const { status, ...proof } = dataset as { status?: string };

  const res = await fetch(`${RPC_BASE}/v1/proofs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': WRITE_KEY!
    },
    body: JSON.stringify(proof)
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || 'RPC anchor failed');
  }
  return res.json();
}

async function getProof(id: string, readKey: string) {
  const res = await fetch(`${RPC_BASE}/v1/proofs/${id}`, {
    headers: { 'X-API-Key': readKey }
  });
  if (!res.ok) throw new Error('RPC read failed');
  return res.json();
}
```

Recommended flow:

1. Upload file to IPFS in your backend.
2. Persist row + `status` in your database.
3. Call `POST /v1/proofs` with metadata (no `status`).
4. Expose read RPC (or your own BFF) to apps that need proof verification.

---

## Error responses

| HTTP | `error` | Meaning |
|------|---------|---------|
| 400 | field message | Missing `id`, `ipfsHash`, etc. |
| 401 | `unauthorized` | Missing/invalid API key |
| 403 | `forbidden_function` | Chaincode function not allow-listed |
| 429 | `rate_limit_exceeded` | Too many requests from this IP |
| 500 | Fabric / chaincode message | Ledger or peer error |
| 503 | `auth_not_configured` | Server started without API keys |

Example:

```json
{
  "ok": false,
  "error": "unauthorized",
  "message": "Valid API key required. Pass X-API-Key or Authorization: Bearer <key>."
}
```

---

## Environment reference

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | HTTP listen port |
| `WRITE_API_KEY` | — | Write key(s), comma-separated for rotation |
| `API_KEY` | — | Alias for write key if `WRITE_API_KEY` unset |
| `READ_API_KEY` | — | Read-only key(s), comma-separated |
| `REQUIRE_AUTH` | `true` | Set `false` only for local insecure testing |
| `FABRIC_ORG` | `org1` | Fabric org used by server wallet |
| `FABRIC_IDENTITY` | `appUserOrg1` | Fabric identity label in wallet |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window |
| `RATE_LIMIT_MAX` | `120` | Max requests per IP per window |

See [rest-api-javascript/.env.example](./rest-api-javascript/.env.example).

---

## Architecture

```
┌─────────────────┐     X-API-Key      ┌──────────────────────┐
│  NestJS / Apps  │ ─────────────────► │  BISL RPC (Express)  │
│  (write/read)   │ ◄───────────────── │  auth + rate limit   │
└─────────────────┘     JSON proof     └──────────┬───────────┘
                                                  │ Fabric SDK
                                                  ▼
                                       ┌──────────────────────┐
                                       │  Hyperledger Fabric  │
                                       │  channel: mychannel  │
                                       │  chaincode: bislcc   │
                                       └──────────────────────┘
```

On-chain = proof metadata only. Off-chain = file (IPFS), workflow `status`, payments, chat.

---

## Deploy Fabric + chaincode

Operational steps (network up, deploy `bislcc`, wallet setup, `InitRBAC`) are documented in [howtoReadme.md](./howtoReadme.md).

After chaincode code changes:

```bash
cd test-network
./network.sh deployCC -ccn bislcc \
  -ccp ../bisl-proof-transparency/chaincode-javascript \
  -ccl javascript
```

Then restart the RPC with your API keys set.

---

## VPS / Cloud deployment

Package only what you need (~15–30 MB, not the full `fabric-samples` repo):

```bash
# From fabric-samples root
chmod +x bisl-proof-transparency/scripts/*.sh
./bisl-proof-transparency/scripts/package-vps.sh
```

Upload `bisl-deploy.tar.gz` to your VPS and run `sudo ./scripts/install-vps.sh`.

Full guide: [deploy/README-DEPLOY.md](./deploy/README-DEPLOY.md)  
**AWS (EC2) guide:** [deploy/README-AWS.md](./deploy/README-AWS.md)

---

## Admin: Initialize RBAC (one-time)

This is typically done once per network/channel after deploying chaincode.

```bash
curl -X POST http://localhost:4000/v1/admin/init-rbac \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $WRITE_API_KEY" \
  -d '{
    "adminMSP": "Org1MSP",
    "agentMSP": "Org2MSP"
  }'
```

---

## Chaincode functions (server-side)

| Function | Access via RPC | Purpose |
|----------|----------------|---------|
| `AnchorDatasetProof` | write | Anchor full metadata JSON |
| `GetDataset` | read | Fetch by `id` |
| `ListDatasetsByAgentId` | read | List by agent |
| `ListDatasetsByCompanyId` | read | List by company |
| `VerifyHash` | read | Compare `ipfsHash` |
| `InitRBAC` | write | One-time MSP setup |
| `GetHealth` | read | Chaincode liveness |

---

## License

Apache-2.0
