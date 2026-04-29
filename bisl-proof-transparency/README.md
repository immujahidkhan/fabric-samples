# BISL - Proof of Transparency + Investor Chatboard (Fabric MVP)

This module implements the **Hyperledger Fabric part** of your client requirements inside the current `fabric-samples` project.

Path:
- `bisl-proof-transparency/chaincode-go`

## 1. What is implemented

### A) Proof of Transparency (Company/Agent -> Admin -> Public)
- **Submit verified stock data** by Agent/Company MSP.
- **Admin review workflow**: approve/reject with notes.
- **On approval**:
  - deterministic dataset hash is generated (`SHA-256`) as blockchain proof.
  - tx id and block timestamp are stored as anchor proof.
- **Public query methods** to read approved data by ticker.
- **Full audit trail** for actions.

### B) Admin Stock Request System
- Create stock listing requests.
- Track request count, first/last request time, unique requestors.
- Track request events for chart/trend building in backend/frontend.
- Admin updates request status (`PENDING`, `REVIEWED`, `ACTIONED`).

### C) Investor Chatboard MVP (on-chain business state)
- User profile registry (verification + subscription status).
- Verified and active subscribers can post messages.
- Users can flag messages.
- Admin moderation actions: `DELETE`, `PIN`, `UNPIN`.
- Query ticker-specific message feed.

## 2. RBAC model (important)

Before anything else, initialize MSP-based roles:
- `InitRBAC(adminMSP, agentMSP)`

Example (test-network default):
- Admin MSP: `Org1MSP`
- Agent MSP: `Org2MSP`

## 3. Files added

- `bisl-proof-transparency/chaincode-go/main.go`
- `bisl-proof-transparency/chaincode-go/chaincode/smart_contract.go`
- `bisl-proof-transparency/chaincode-go/go.mod`
- `bisl-proof-transparency/README.md`

## 4. Chaincode functions

### Transparency
- `InitRBAC(adminMSP, agentMSP)`
- `SubmitStockData(id, ticker, companyName, cusip, authorizedShares, issuedOutstandingShares, verifiedFloat, effectiveDate, sourceType, paymentReference)`
- `ReviewSubmission(id, approve, reviewNotes)`
- `ReadSubmission(id)`
- `ListSubmissions()`
- `ListPublishedByTicker(ticker)`

### Stock Requests
- `CreateStockRequest(requestID, ticker, stockName, requestedByUserID, comment)`
- `UpdateStockRequestStatus(requestID, status)`
- `ListStockRequests()`
- `ListStockRequestEvents(requestID)`

### Chatboard
- `UpsertUserProfile(userID, email, oauthProvider, verificationTier, verificationStatus, subscriptionPlan, subscriptionStatus, subscriptionExpiresAt)`
- `ReadUserProfile(userID)`
- `PostChatMessage(messageID, ticker, authorUserID, body, parentID)`
- `FlagChatMessage(messageID, reason)`
- `ModerateChatMessage(messageID, action)`
- `ListChatMessagesByTicker(ticker)`

### Audit + Utility
- `ListAuditLogs()`
- `GetHealth()`

## 5. Build/compile check (already validated)

From root:

```bash
cd bisl-proof-transparency/chaincode-go
go mod tidy
go test ./...
```

Current result: compiles successfully with no errors.

## 6. Deploy in this fabric-samples project (test-network)

From repo root:

```bash
cd test-network
./network.sh up createChannel -ca
./network.sh deployCC \
  -ccn bislcc \
  -ccp ../bisl-proof-transparency/chaincode-go \
  -ccl go
```

## 7. Quick invoke/query examples

Set peer env first (same style as other fabric-samples commands), then:

Initialize RBAC:

```bash
peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com \
  --tls --cafile "$ORDERER_CA" -C mychannel -n bislcc \
  -c '{"function":"InitRBAC","Args":["Org1MSP","Org2MSP"]}'
```

Agent submits stock data (run as Org2 identity):

```bash
peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com \
  --tls --cafile "$ORDERER_CA" -C mychannel -n bislcc \
  -c '{"function":"SubmitStockData","Args":["sub-001","AAPL","Apple Inc","037833100","1000000","900000","850000","2025-10-01","TRANSFER_AGENT","PAY-REF-001"]}'
```

Admin approves (run as Org1 identity):

```bash
peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com \
  --tls --cafile "$ORDERER_CA" -C mychannel -n bislcc \
  -c '{"function":"ReviewSubmission","Args":["sub-001","true","Verified by BISL admin"]}'
```

Public query approved ticker records:

```bash
peer chaincode query -C mychannel -n bislcc \
  -c '{"function":"ListPublishedByTicker","Args":["AAPL"]}'
```

## 8. Notes for your Next.js + NestJS team

- Keep raw/PII data **off-chain** in your DB.
- Write only proof metadata (hash, tx id, timestamps, status) on-chain.
- Use backend service account wallets for Admin/Agent identities.
- Use `ListStockRequestEvents` for request-trend charts.
- Use `ListAuditLogs` for compliance/audit pages.

## 9. Current limitations (intentional MVP)

- No Stripe logic inside chaincode (should stay in backend/payment service).
- No file upload handling in chaincode (done in API layer + DB).
- No AI moderation yet (future phase, as requested).

This is a clean baseline you can safely extend.
