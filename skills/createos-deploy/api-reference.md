# API Reference

Base URL: `https://mpp-createos.nodeops.network`

Machine-readable spec: `GET /openapi.json`

## Auth Headers

Required on `/agent/deploy`, `/agent/deploy/*/status`, `/agent/projects`, and
`DELETE /agent/projects/:id`. Not required on `/agent/balance`, `/agent/chains`,
`/agent/recipients`, or `/health`.

| Header             | Value                                                        |
| ------------------ | ------------------------------------------------------------ |
| `X-Wallet-Address` | `0x...` wallet address                                        |
| `X-Signature`      | EIP-191 signature of `{wallet}:{timestamp}:{nonce}`           |
| `X-Timestamp`      | Unix **milliseconds**, within 60s of the server clock         |
| `X-Nonce`          | UUID, single-use — a replay returns 401                       |

The `{wallet}` inside the signed message must be byte-identical to
`X-Wallet-Address`, case included. Generate a fresh nonce, timestamp, and
signature per request, including every status poll.

---

## `GET /health`

Response: `{ "status": "ok" }`

---

## `POST /agent/deploy`

The gateway prices the deployment from the CreateOS pricing API, then checks the
wallet's credit balance and active project count to decide whether to deploy for
free or require payment.

### Without `X-Payment-Tx` — credit + active project check

| Case | Credits | Active projects | `X-Use-Existing-Credits` | Result |
| ---- | ------- | --------------- | ------------------------ | ------ |
| A    | enough  | 0               | any                      | `200`, deploys free |
| B    | enough  | ≥1              | `true`                   | `200`, deploys free, `message` warns about shared runtime |
| C    | enough  | ≥1              | unset                    | `402` with `warning` |
| D    | short   | any             | any                      | `402` standard |

If the credit or active-project lookup against CreateOS fails, the gateway fails
closed: balance is treated as 0 and active projects as 0, so you get case D.

402 (no credits):

```json
{
  "error": "Payment required",
  "amount_usd": 0.5,
  "amount_token": "500000",
  "current_credit_balance_usd": 0,
  "active_projects": 0,
  "pay_to": "0x7EA5...",
  "payment_chain": "arbitrum",
  "token": "usdc",
  "decimals": 6,
  "supported_chains": [...]
}
```

402 (has credits + active projects):

```json
{
  "error": "Payment required",
  "warning": "You have 2 active project(s) sharing credits. Paying extends total runtime. To deploy using existing credits (will reduce other projects' runtime), retry with header X-Use-Existing-Credits: true",
  "amount_usd": 0.5,
  "amount_token": "500000",
  "current_credit_balance_usd": 1.20,
  "active_projects": 2,
  "pay_to": "0x7EA5...",
  ...
}
```

`amount_token` is the raw integer amount at 6 decimals. `token` is always
reported as `usdc`, but USDT is accepted at the same raw amount — both are
6-decimal on both chains. Select it with `X-Payment-Token: usdt`.

`pay_to` is the same recipient address on every supported chain.

### With `X-Payment-Tx` — verify, topup, deploy

| Header                   | Required | Default            | Description                              |
| ------------------------ | -------- | ------------------ | ---------------------------------------- |
| `X-Payment-Tx`           | yes      | —                  | ERC20 transfer tx hash, `0x` + 64 hex     |
| `X-Payment-Chain`        | no       | gateway default    | Chain the transfer landed on              |
| `X-Payment-Token`        | no       | `usdc`             | `usdc` or `usdt`                          |
| `X-Use-Existing-Credits` | no       | `false`            | Ignored when `X-Payment-Tx` is present    |

Verification requires a `Transfer` log from the named token contract, to
`pay_to`, for **at least** the quoted amount, in a successful transaction on the
named chain. Overpayment passes. Underpayment, wrong chain, or wrong token
returns `402 Payment verification failed` — and the funds have already moved.

The price is re-derived on this call from a 5-minute server cache. Submit the
proof promptly after the transfer confirms.

### Body

```json
{
  "uniqueName": "my-app",
  "displayName": "My App",
  "description": "optional",
  "months": 1,
  "settings": { "port": 3000 },
  "upload": {
    "type": "files",
    "files": [{ "path": "index.js", "content": "base64" }]
  }
}
```

Or zip: `"upload": { "type": "zip", "data": "base64", "filename": "code.zip" }`

Whole request capped at 50 MB. Base64 adds ~33% over the raw bytes.

### Field constraints

Enforced by CreateOS, **not** by the gateway — a violation surfaces as a `500`
after payment has already been taken.

| Field         | Constraint |
| ------------- | ---------- |
| `uniqueName`  | 4–32 chars, `[a-zA-Z0-9 _\|,&\-'",/\\:;()\[\]+*]`, globally unique |
| `displayName` | 4–100 chars, `[a-zA-Z0-9 _\|,&\-'",/\\]` |
| `description` | optional; 4–2048 chars if present |
| `months`      | positive integer, default 1 — multiplies the price |

### `settings`

All fields optional. Defaults applied by the gateway:

| Field            | Default      | Notes |
| ---------------- | ------------ | ----- |
| `port`           | `3000`       | 1–65535, must match what the app listens on |
| `runtime`        | `"build-ai"` | |
| `useBuildAI`     | `true`       | Infers install/build/run from the source |
| `hasDockerfile`  | `false`      | `true` builds the `Dockerfile` at the upload root |
| `framework`      | `null`       | |
| `installCommand` | `null`       | max 255 chars |
| `buildCommand`   | `null`       | max 255 chars |
| `runCommand`     | `null`       | max 255 chars |
| `buildDir`       | `null`       | max 255 chars |
| `buildFlag`      | `null`       | max 255 chars |
| `runFlag`        | `null`       | max 255 chars |
| `directoryPath`  | `null`       | Subdirectory to build from |
| `runEnvs`        | `null`       | See limitation below |
| `buildVars`      | `null`       | Typed as a string by the gateway but CreateOS expects an object — leave `null` |

**`runEnvs` does not reach the running container.** The gateway creates the
production environment with an empty env map, and the promoted environment's
env is what the container gets. Bake configuration into the upload instead.

Resources are fixed at 1 replica, 512 MiB memory, 500m CPU. Not configurable via
this gateway, and CreateOS may clamp them to the plan minimum regardless.

### Responses

| Code | Body |
| ---- | ---- |
| `200` | `{ projectId, deploymentId, status: "deploying", message }` |
| `400` | Invalid body, malformed tx hash |
| `401` | Bad signature, expired timestamp, replayed nonce |
| `402` | Payment required, or `{ "error": "Payment verification failed" }` |
| `409` | `{ "error": "Payment already processed" }` — credits exist, retry without payment headers |
| `429` | Rate limited |
| `500` | Topup succeeded, deploy failed — credits are on CreateOS, retry without payment headers |

## Pricing

- Dynamic, fetched from the CreateOS pricing API and converted at $1 = 100 credits
- Cached server-side for 5 minutes; 30s backoff on a failed refresh
- Multiplied by `months` (default 1)
- Floor: **$0.50**

If pricing cannot be fetched and no cache exists, `POST /agent/deploy` fails
before any quote is issued.

## Credit sharing

CreateOS credits are pooled across active projects and consumed hourly. Statuses
counted as active: `active`, `building`, `deploying`, `pending`, `queued`,
`promoting`. Deploying without paying while projects are active shortens their
runtime — the gateway warns in the 402 and requires explicit opt-in.

---

## `GET /agent/deploy/:projectId/:deploymentId/status`

Auth required. Only the wallet recorded as the deployer can read it; anyone else
gets `403`.

```json
{ "status": "deploying", "deployment_id": "uuid", "deployment_status": "building", "message": "Deployment in progress" }
{ "status": "ready",     "deployment_id": "uuid", "endpoint": "https://app.nodeops.network" }
{ "status": "failed",    "deployment_id": "uuid", "deployment_status": "cancelled", "reason": "build error" }
```

`ready` is returned when the deployment reports `active` or exposes an endpoint;
`endpoint` may be absent in the first case. Anything outside the transitional set
(`promoting`, `building`, `deploying`, `pending`, `queued`, `queue`) is `failed`.

---

## `GET /agent/projects`

Auth required. Lists every project for the wallet with the latest deployment URL.

```json
{
  "wallet": "0x5B6C...",
  "count": 2,
  "projects": [
    {
      "id": "uuid",
      "name": "demo-1234567890",
      "displayName": "Demo App",
      "status": "active",
      "url": "https://demo-1234567890.nodeops.network",
      "createdAt": "2026-04-07T10:00:00.000Z"
    }
  ]
}
```

`url` is `null` when the project has no deployment yet, or the lookup failed.
Status values: `active`, `building`, `deploying`, `pending`, `queued`,
`promoting`, `deleting`, `failed`.

---

## `DELETE /agent/projects/:projectId`

Auth required. Irreversible. CreateOS enforces ownership.

```json
{ "projectId": "uuid", "status": "deleted" }
```

Errors: `403` if the wallet is not the owner; `500` otherwise.

---

## `GET /agent/balance/:address`

No auth. Returns every accepted token's balance for an address on one chain.

Query: `chain` — chain name, defaults to the gateway's configured chain.

```json
{
  "address": "0x5B6C...",
  "chain": "arbitrum",
  "chain_id": 42161,
  "balances": [
    {
      "token": "usdc",
      "symbol": "USDC",
      "address": "0xaf88d065...",
      "balance": "18.000000",
      "balance_raw": "18000000",
      "decimals": 6
    }
  ]
}
```

Compare `balance_raw` against the quote's `amount_token` — both are raw integers.
`400` on a malformed address or an unsupported chain.

---

## `GET /agent/chains`

No auth.

```json
{
  "chains": [
    { "chain": "base", "chain_id": 8453, "tokens": ["usdc", "usdt"] },
    { "chain": "arbitrum", "chain_id": 42161, "tokens": ["usdc", "usdt"] }
  ]
}
```

---

## `GET /agent/recipients`

No auth. Payment address per chain — currently the same address on all of them.

```json
{
  "updated_at": "2026-04-07T10:00:00.000Z",
  "recipients": [
    { "chain": "base", "address": "0x7EA5..." },
    { "chain": "arbitrum", "address": "0x7EA5..." }
  ]
}
```

---

## Supported Chains & Tokens

Mainnet only. Testnets are not accepted.

| Chain      | ID    | Token | Contract |
| ---------- | ----- | ----- | -------- |
| `arbitrum` | 42161 | USDC  | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` |
| `arbitrum` | 42161 | USDT  | `0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9` |
| `base`     | 8453  | USDC  | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| `base`     | 8453  | USDT  | `0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2` |

Always confirm against `GET /agent/chains` before paying.

---

## Rate Limiting

30 requests per minute, keyed on IP + `X-Wallet-Address`, applied to **all**
`/agent/*` routes including the unauthenticated ones. Polling status every 5s
uses 12/min and leaves headroom.

---

## Error Codes

| Code | Meaning |
| ---- | ------- |
| 400  | Invalid body, malformed tx hash or address, unsupported chain |
| 401  | Bad signature, timestamp outside 60s, nonce replayed |
| 402  | Payment required, or on-chain verification failed |
| 403  | Wallet is not the deployer / owner |
| 409  | Tx hash already processed — credits exist, retry without payment |
| 429  | Rate limited (30/min per wallet+IP) |
| 500  | Topup succeeded but deploy failed — retry without payment headers |
