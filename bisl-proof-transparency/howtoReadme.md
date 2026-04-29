# How To Run and Deploy (JavaScript Chaincode + REST API)

This uses your current repo:
- `/Users/mapmac/Documents/Github/Blockchain/fabric-samples`

## Paths
- Chaincode (JS): `bisl-proof-transparency/chaincode-javascript`
- REST API (JS): `bisl-proof-transparency/rest-api-javascript`

## Names used
- Channel: `mychannel`
- Chaincode: `bislcc`

---

## 1. Start Fabric Network

```bash
cd /Users/mapmac/Documents/Github/Blockchain/fabric-samples/test-network
./network.sh down
./network.sh up createChannel -ca
```

---

## 2. Deploy JavaScript Chaincode

```bash
cd /Users/mapmac/Documents/Github/Blockchain/fabric-samples/test-network
./network.sh deployCC \
  -ccn bislcc \
  -ccp ../bisl-proof-transparency/chaincode-javascript \
  -ccl javascript
```

---

## 3. Install REST API dependencies

```bash
cd /Users/mapmac/Documents/Github/Blockchain/fabric-samples/bisl-proof-transparency/rest-api-javascript
npm install
```

---

## 4. Import Org identities into wallet

This script imports test-network admin users as API identities:
- `appUserOrg1` (Org1MSP = Admin role)
- `appUserOrg2` (Org2MSP = Agent role)

```bash
cd /Users/mapmac/Documents/Github/Blockchain/fabric-samples/bisl-proof-transparency/rest-api-javascript
npm run setup:wallet
```

---

## 5. Start REST API

```bash
cd /Users/mapmac/Documents/Github/Blockchain/fabric-samples/bisl-proof-transparency/rest-api-javascript
npm start
```

API URL:
- `http://localhost:4000`

Health check:

```bash
curl http://localhost:4000/health
```

---

## 6. Initialize RBAC (must run first)

Admin = Org1MSP, Agent = Org2MSP

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

---

## 7. Full Flow Examples

### 7.1 Agent submits stock data

```bash
curl -X POST http://localhost:4000/invoke \
  -H 'Content-Type: application/json' \
  -d '{
    "org":"org2",
    "identity":"appUserOrg2",
    "fcn":"SubmitStockData",
    "args":[
      "sub-001",
      "AAPL",
      "Apple Inc",
      "037833100",
      "1000000",
      "900000",
      "850000",
      "2025-10-01",
      "TRANSFER_AGENT",
      "PAY-REF-001"
    ]
  }'
```

### 7.2 Admin approves and anchors

```bash
curl -X POST http://localhost:4000/invoke \
  -H 'Content-Type: application/json' \
  -d '{
    "org":"org1",
    "identity":"appUserOrg1",
    "fcn":"ReviewSubmission",
    "args":["sub-001","true","Verified by BISL admin"]
  }'
```

### 7.3 Query published by ticker

```bash
curl -X POST http://localhost:4000/query \
  -H 'Content-Type: application/json' \
  -d '{
    "org":"org1",
    "identity":"appUserOrg1",
    "fcn":"ListPublishedByTicker",
    "args":["AAPL"]
  }'
```

---

## 8. Stock Request API examples

Create request:

```bash
curl -X POST http://localhost:4000/invoke \
  -H 'Content-Type: application/json' \
  -d '{
    "org":"org1",
    "identity":"appUserOrg1",
    "fcn":"CreateStockRequest",
    "args":["req-aapl","AAPL","Apple Inc","user-101","Please list"]
  }'
```

Update status (admin only):

```bash
curl -X POST http://localhost:4000/invoke \
  -H 'Content-Type: application/json' \
  -d '{
    "org":"org1",
    "identity":"appUserOrg1",
    "fcn":"UpdateStockRequestStatus",
    "args":["req-aapl","REVIEWED"]
  }'
```

List requests:

```bash
curl -X POST http://localhost:4000/query \
  -H 'Content-Type: application/json' \
  -d '{
    "org":"org1",
    "identity":"appUserOrg1",
    "fcn":"ListStockRequests",
    "args":[]
  }'
```

---

## 9. Chatboard API examples

Upsert verified + subscribed user (admin):

```bash
curl -X POST http://localhost:4000/invoke \
  -H 'Content-Type: application/json' \
  -d '{
    "org":"org1",
    "identity":"appUserOrg1",
    "fcn":"UpsertUserProfile",
    "args":[
      "user-101",
      "investor@example.com",
      "GOOGLE",
      "ADVANCED",
      "VERIFIED",
      "MONTHLY",
      "ACTIVE",
      "2026-12-31T23:59:59Z"
    ]
  }'
```

Post chat message:

```bash
curl -X POST http://localhost:4000/invoke \
  -H 'Content-Type: application/json' \
  -d '{
    "org":"org1",
    "identity":"appUserOrg1",
    "fcn":"PostChatMessage",
    "args":["msg-001","AAPL","user-101","Strong fundamentals.",""]
  }'
```

List ticker messages:

```bash
curl -X POST http://localhost:4000/query \
  -H 'Content-Type: application/json' \
  -d '{
    "org":"org1",
    "identity":"appUserOrg1",
    "fcn":"ListChatMessagesByTicker",
    "args":["AAPL"]
  }'
```

---

## 10. Generic API contract

### POST `/invoke`
Body:
- `org`: `org1` or `org2`
- `identity`: wallet identity label (example `appUserOrg1`)
- `fcn`: chaincode function name
- `args`: string array

### POST `/query`
Same as above, but calls `evaluateTransaction`.

---

## 11. Troubleshooting

- `Identity ... not found in wallet`
  - Run `npm run setup:wallet` in REST API folder.

- `RBAC is not initialized`
  - Run `InitRBAC` first.

- `access denied: admin MSP required`
  - Use `org1` + `appUserOrg1`.

- `access denied: agent MSP required`
  - Use `org2` + `appUserOrg2`.

- Deploy errors:
  - Ensure Node/npm is available and rerun deploy command.

---

## 12. Stop Network

```bash
cd /Users/mapmac/Documents/Github/Blockchain/fabric-samples/test-network
./network.sh down
```
