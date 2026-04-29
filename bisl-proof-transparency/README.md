# BISL - Minimal Fabric Notarization Layer

This module now follows the correct architecture:
- **Business workflows stay off-chain** (NestJS + DB + Stripe + chat services)
- **Fabric stores only immutable proof records**

Path:
- `bisl-proof-transparency/chaincode-javascript`

## Chaincode purpose

This chaincode is intentionally minimal and only does:
1. Anchor verified dataset proof.
2. Fetch anchored proof by submission ID.
3. Verify candidate hash against anchored hash.
4. List proofs by ticker.

## Implemented functions

- `InitRBAC(adminMSP, agentMSP)`
- `AnchorDataset(submissionID, datasetHash, ticker, anchoredAt)`
- `GetDataset(submissionID)`
- `VerifyHash(submissionID, candidateHash)`
- `ListDatasetsByTicker(ticker)`
- `GetHealth()`

## Expected flow

1. Company/Agent uploads full dataset to backend DB (off-chain).
2. BISL Admin reviews/approves off-chain.
3. Backend computes canonical hash off-chain.
4. Backend calls `AnchorDataset(...)` on Fabric.
5. Public app uses `GetDataset` / `VerifyHash` as proof API.

## What is intentionally NOT on-chain

- chat messages
- user profiles
- subscriptions/payments
- stock request analytics
- moderation logic

These belong in backend/database systems.
