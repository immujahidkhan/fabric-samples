# How To Run and Deploy (Minimal JS Chaincode + REST API)

## Project Paths
- Root: `/Users/mapmac/Documents/Github/Blockchain/fabric-samples`
- Chaincode: `bisl-proof-transparency/chaincode-javascript`
- REST API: `bisl-proof-transparency/rest-api-javascript`

## Names
- Channel: `mychannel`
- Chaincode: `bislcc`

## 1. Start Docker first

If `network.sh` shows docker socket errors, start Docker Desktop and verify:

```bash
docker ps
```

## 2. Start network

```bash
cd /Users/mapmac/Documents/Github/Blockchain/fabric-samples/test-network
./network.sh down
./network.sh up createChannel -ca
```

## 3. Deploy JS chaincode

```bash
cd /Users/mapmac/Documents/Github/Blockchain/fabric-samples/test-network
./network.sh deployCC \
  -ccn bislcc \
  -ccp ../bisl-proof-transparency/chaincode-javascript \
  -ccl javascript
```

## 4. Setup and start REST API

```bash
cd /Users/mapmac/Documents/Github/Blockchain/fabric-samples/bisl-proof-transparency/rest-api-javascript
npm install
npm run setup:wallet

# Required for secured RPC (see README.md)
export WRITE_API_KEY="$(openssl rand -hex 32)"
export READ_API_KEY="$(openssl rand -hex 32)"
export REQUIRE_AUTH=true

npm start
```

Health (no API key):

```bash
curl http://localhost:4000/health
```

For local testing only (insecure):

```bash
export REQUIRE_AUTH=false
npm start
```

## 5. Initialize RBAC (required)

```bash
curl -X POST http://localhost:4000/v1/admin/init-rbac \
  -H 'Content-Type: application/json' \
  -H "X-API-Key: $WRITE_API_KEY" \
  -d '{
    "adminMSP":"Org1MSP",
    "agentMSP":"Org2MSP"
  }'
```

## 6. Anchor dataset proof

Send the full dataset metadata as JSON. `status` is stripped automatically and not stored on-chain.

All write calls require `X-API-Key: $WRITE_API_KEY` when `REQUIRE_AUTH=true`.

### POST /v1/proofs (recommended)

```bash
curl -X POST http://localhost:4000/v1/proofs \
  -H 'Content-Type: application/json' \
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

## 7. Read proof by id

### GET /v1/proofs/:id

```bash
curl http://localhost:4000/v1/proofs/6a57e3073d7defc1b170a9c9 \
  -H "X-API-Key: $READ_API_KEY"
```

## 8. List proofs by agentId

### GET /v1/proofs/agent/:agentId

```bash
curl http://localhost:4000/v1/proofs/agent/6a54ca3ab254a5ef16403aae \
  -H "X-API-Key: $READ_API_KEY"
```

## 9. List proofs by companyId

### GET /v1/proofs/company/:companyId

```bash
curl http://localhost:4000/v1/proofs/company/6a57de973d7defc1b170a9a8 \
  -H "X-API-Key: $READ_API_KEY"
```

## 10. Verify IPFS hash

```bash
curl -X POST http://localhost:4000/v1/proofs/verify \
  -H 'Content-Type: application/json' \
  -H "X-API-Key: $READ_API_KEY" \
  -d '{
    "id": "6a57e3073d7defc1b170a9c9",
    "candidateHash": "bafkreibctxx3wdhon4bgoos43yuq2btt45na3qy45rbzrhekwksozj7bxm"
  }'
```

## 11. Stop network

```bash
cd /Users/mapmac/Documents/Github/Blockchain/fabric-samples/test-network
./network.sh down
```
