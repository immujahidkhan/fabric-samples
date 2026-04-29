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
npm start
```

Health:

```bash
curl http://localhost:4000/health
```

## 5. Initialize RBAC (required)

```bash
curl -X POST http://localhost:4000/invoke \
  -H 'Content-Type: application/json' \
  -d '{
    "org":"org1",
    "identity":"appUserOrg1",
    "fcn":"InitRBAC",
    "args":["Org1MSP","Org2MSP"]
  }'
```

## 6. Anchor dataset proof

Example hash is placeholder. In production, compute from canonical JSON in backend.

```bash
curl -X POST http://localhost:4000/invoke \
  -H 'Content-Type: application/json' \
  -d '{
    "org":"org1",
    "identity":"appUserOrg1",
    "fcn":"AnchorDataset",
    "args":[
      "sub-001",
      "6f6cf6408eb6e7f5f4b8de3f6c6bb5b5d067f4f4ea0f540f4f39f8d4704f8c2a",
      "AAPL",
      "2025-10-01T00:00:00Z"
    ]
  }'
```

## 7. Read proof

```bash
curl -X POST http://localhost:4000/query \
  -H 'Content-Type: application/json' \
  -d '{
    "org":"org1",
    "identity":"appUserOrg1",
    "fcn":"GetDataset",
    "args":["sub-001"]
  }'
```

## 8. Verify hash

```bash
curl -X POST http://localhost:4000/query \
  -H 'Content-Type: application/json' \
  -d '{
    "org":"org1",
    "identity":"appUserOrg1",
    "fcn":"VerifyHash",
    "args":[
      "sub-001",
      "6f6cf6408eb6e7f5f4b8de3f6c6bb5b5d067f4f4ea0f540f4f39f8d4704f8c2a"
    ]
  }'
```

## 9. List by ticker

```bash
curl -X POST http://localhost:4000/query \
  -H 'Content-Type: application/json' \
  -d '{
    "org":"org1",
    "identity":"appUserOrg1",
    "fcn":"ListDatasetsByTicker",
    "args":["AAPL"]
  }'
```

## 10. Stop network

```bash
cd /Users/mapmac/Documents/Github/Blockchain/fabric-samples/test-network
./network.sh down
```
