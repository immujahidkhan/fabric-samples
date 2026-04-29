curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh
chmod +x install-fabric.sh
./install-fabric.sh docker binary


# Learning REST API with JavaScript

This guide is a step-by-step way to learn REST APIs using the `asset-transfer-basic/rest-api-typescript` sample.

The sample is a good teaching project because it shows:

- Real CRUD-style endpoints
- JavaScript-friendly HTTP patterns
- Good API design for long-running operations
- Authentication with an API key
- Clear separation between routing, business logic, and Fabric network access

## 1. What you are learning

REST APIs usually follow these ideas:

- `GET` reads data
- `POST` creates data
- `PUT` replaces data
- `PATCH` partially updates data
- `DELETE` removes data

In this sample, the API manages assets on a Fabric network.

Important detail: not every write happens immediately. Create, update, transfer, and delete requests return `202 Accepted` because the transaction is processed asynchronously. The API gives you a `jobId`, and you use that to check progress.

## 2. The endpoints

Here is the CRUD map for this sample:

- `GET /api/assets` lists all assets
- `GET /api/assets/:assetId` reads one asset
- `OPTIONS /api/assets/:assetId` checks whether an asset exists
- `POST /api/assets` creates an asset
- `PUT /api/assets/:assetId` updates an asset
- `PATCH /api/assets/:assetId` transfers the owner
- `DELETE /api/assets/:assetId` deletes an asset
- `GET /api/jobs/:jobId` checks async write job status
- `GET /api/transactions/:transactionId` checks transaction commit status

## 3. How the sample is organized

If you want to learn best practice, start from the code structure:

- [`src/index.ts`](src/index.ts) starts the app and connects to Fabric
- [`src/server.ts`](src/server.ts) wires the Express server and routes
- [`src/auth.ts`](src/auth.ts) handles API key authentication
- [`src/assets.router.ts`](src/assets.router.ts) contains the asset CRUD endpoints
- [`src/jobs.router.ts`](src/jobs.router.ts) exposes job status
- [`src/fabric.ts`](src/fabric.ts) talks to the Fabric network
- [`src/jobs.ts`](src/jobs.ts) manages the async submit queue

This is a good pattern to remember:

1. Router receives the HTTP request
2. Validation checks the input
3. Authentication identifies the caller
4. Service or helper code talks to the network
5. Response returns the right HTTP status and JSON

## 4. Setup

Use the sample from the repo root:

```bash
cd asset-transfer-basic/rest-api-typescript
npm install
npm run build
```

Generate the environment file for the test network:

```bash
TEST_NETWORK_HOME=$HOME/fabric-samples/test-network npm run generateEnv
```

Start Redis:

```bash
export REDIS_PASSWORD=$(uuidgen)
npm run start:redis
```

Start the API server:

```bash
npm run start:dev
```

## 5. Learn the CRUD flow in order

### Step 1: Read all assets

This is the easiest request because it does not change state.

```bash
curl --header "X-Api-Key: D97C66C1-96D1-4FA2-AE15-7B0BB33B7617" http://localhost:3000/api/assets
```

Use this to understand the shape of the data before you create or update anything.

### Step 2: Read one asset

```bash
curl --header "X-Api-Key: YOUR_KEY" http://localhost:3000/api/assets/asset1
```

This teaches you how path parameters work, like `:assetId`.

### Step 3: Check whether an asset exists

```bash
curl --include --header "X-Api-Key: YOUR_KEY" --request OPTIONS http://localhost:3000/api/assets/asset1
```

This is useful when your client needs to know whether to show "Create" or "Update".

### Step 4: Create an asset

```bash
curl --include \
  --header "Content-Type: application/json" \
  --header "X-Api-Key: YOUR_KEY" \
  --request POST \
  --data '{
    "ID":"asset7",
    "Color":"red",
    "Size":42,
    "Owner":"Jean",
    "AppraisedValue":101
  }' \
  http://localhost:3000/api/assets
```

This returns `202 Accepted` and a `jobId`.

### Step 5: Check the job

```bash
curl --header "X-Api-Key: YOUR_KEY" http://localhost:3000/api/jobs/JOB_ID
```

The job response gives transaction IDs.

### Step 6: Check the transaction

```bash
curl --header "X-Api-Key: YOUR_KEY" http://localhost:3000/api/transactions/TRANSACTION_ID
```

This confirms whether the transaction was committed.

### Step 7: Update the asset

```bash
curl --include \
  --header "Content-Type: application/json" \
  --header "X-Api-Key: YOUR_KEY" \
  --request PUT \
  --data '{
    "ID":"asset7",
    "Color":"red",
    "Size":11,
    "Owner":"Jean",
    "AppraisedValue":101
  }' \
  http://localhost:3000/api/assets/asset7
```

### Step 8: Transfer ownership

```bash
curl --include \
  --header "Content-Type: application/json" \
  --header "X-Api-Key: YOUR_KEY" \
  --request PATCH \
  --data '[
    {
      "op":"replace",
      "path":"/Owner",
      "value":"Ashleigh"
    }
  ]' \
  http://localhost:3000/api/assets/asset7
```

### Step 9: Delete the asset

```bash
curl --include \
  --header "X-Api-Key: YOUR_KEY" \
  --request DELETE \
  http://localhost:3000/api/assets/asset7
```

## 6. JavaScript client example

Here is a plain JavaScript example using `fetch`.

If you run this in Node, use Node 18+ or swap `fetch` for a library like `axios` or `node-fetch`.

```js
const BASE_URL = 'http://localhost:3000';
const API_KEY = process.env.API_KEY;

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': API_KEY,
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.message || `Request failed with ${response.status}`);
  }

  return data;
}

async function listAssets() {
  return request('/api/assets');
}

async function readAsset(assetId) {
  return request(`/api/assets/${assetId}`);
}

async function createAsset(asset) {
  return request('/api/assets', {
    method: 'POST',
    body: JSON.stringify(asset)
  });
}

async function updateAsset(assetId, asset) {
  return request(`/api/assets/${assetId}`, {
    method: 'PUT',
    body: JSON.stringify(asset)
  });
}

async function transferAsset(assetId, newOwner) {
  return request(`/api/assets/${assetId}`, {
    method: 'PATCH',
    body: JSON.stringify([
      {
        op: 'replace',
        path: '/Owner',
        value: newOwner
      }
    ])
  });
}

async function deleteAsset(assetId) {
  return request(`/api/assets/${assetId}`, {
    method: 'DELETE'
  });
}
```

## 7. How to handle `202 Accepted`

When you create, update, transfer, or delete an asset, the API does not finish the transaction immediately.

Best practice for your client:

1. Call the write endpoint
2. Store the returned `jobId`
3. Poll `GET /api/jobs/:jobId`
4. Use the returned transaction ID(s)
5. Poll `GET /api/transactions/:transactionId`

That pattern is common for APIs that need to process work in the background.

## 8. Best practices to learn from this sample

- Use the right HTTP method for the right action
- Validate request bodies before sending them to the network
- Return clear status codes like `200`, `201`, `202`, `400`, `401`, and `404`
- Keep authentication separate from routing
- Keep network code separate from HTTP code
- Avoid creating a new Fabric connection for every request
- Use a job queue when a transaction may take too long for a normal HTTP response
- Return consistent JSON errors
- Prefer simple, predictable endpoint names

## 9. Common beginner mistakes

- Putting business logic directly inside route handlers
- Forgetting to send the API key
- Confusing `PUT` and `PATCH`
- Expecting writes to finish instantly when the API is designed to be async
- Skipping validation and sending malformed JSON
- Not checking `jobId` after a write request

## 10. Practice tasks

Try these in order:

1. List all assets
2. Read one asset by ID
3. Create a new asset
4. Check the job and transaction
5. Update the same asset
6. Transfer ownership with `PATCH`
7. Delete the asset
8. Build a small Node.js script that runs all of the above

## 11. What to study next

If you want to go deeper after this sample, study:

- HTTP methods and status codes
- JSON request and response formats
- Express routing and middleware
- Input validation
- Authentication with headers
- Async job processing
- Polling patterns for long-running tasks

## 12. File reference map

- [`src/assets.router.ts`](src/assets.router.ts): CRUD routes
- [`src/jobs.router.ts`](src/jobs.router.ts): job lookup
- [`src/transactions.router.ts`](src/transactions.router.ts): transaction lookup
- [`src/auth.ts`](src/auth.ts): API key auth
- [`demo.http`](demo.http): ready-to-run request examples
