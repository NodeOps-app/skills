# CreateOS MPP Gateway API

Default base URL: `https://mpp-createos.nodeops.network`

Use `GET /openapi.json` and the runtime `402` response as the authoritative description of a deployed gateway. Enabled chains and x402 facilitators are deployment configuration, so they may differ between environments.

## Wallet authentication

Every protected `/agent/*` request needs a fresh EIP-191 signature over:

```text
{wallet}:{timestamp}:{nonce}
```

```http
X-Wallet-Address: 0x...
X-Signature: 0x...
X-Timestamp: <Unix milliseconds, no more than 60 seconds old>
X-Nonce: <single-use UUID>
```

The wallet text in the signed message must match the header byte for byte. A nonce is consumed atomically, so every retry and status poll needs a new timestamp, nonce, and signature.

## Start a deployment

```http
POST /agent/deploy
Content-Type: application/json
```

```json
{
  "uniqueName": "my-app",
  "displayName": "My App",
  "description": "Optional description",
  "months": 1,
  "settings": {
    "port": 3000,
    "useBuildAI": true,
    "hasDockerfile": false
  },
  "upload": {
    "type": "files",
    "files": [
      { "path": "index.js", "content": "<base64>" }
    ]
  }
}
```

Zip uploads use:

```json
{
  "type": "zip",
  "data": "<base64 zip>",
  "filename": "code.zip"
}
```

The request body is limited to 50 MB. The same serialized body must be used when retrying with a payment credential because the challenge is bound to its digest and to `POST /agent/deploy`.

### Existing-credit outcomes

When no payment credential is present:

| Credits | Active projects | `X-Use-Existing-Credits` | Outcome |
|---|---:|---|---|
| Enough | 0 | Any | `200`; deployment starts immediately |
| Enough | 1 or more | `true` | `200`; shared credits are used |
| Enough | 1 or more | Omitted | `402` plus `X-CreateOS-Credit-Warning` |
| Insufficient | Any | Any | `402` payment challenge |

Using shared credits reduces the runtime available to active projects. Explain that impact before opting in.

## The 402 response

Native MPP offers are carried in one or more `Payment` challenges:

```http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="...", realm="...", method="evm", intent="charge", request="...", expires="...", opaque="..."
```

The decoded EVM request resembles:

```json
{
  "amount": "1813947",
  "currency": "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
  "externalId": "my-app",
  "methodDetails": {
    "chainId": 421614,
    "credentialTypes": ["authorization"],
    "decimals": 6
  },
  "recipient": "0x..."
}
```

Optional x402 offers are encoded in `PAYMENT-REQUIRED`:

```json
{
  "x402Version": 2,
  "resource": { "url": "https://.../agent/deploy" },
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:8453",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "amount": "1813947",
      "payTo": "0x...",
      "maxTimeoutSeconds": 300,
      "extra": {
        "assetTransferMethod": "eip3009",
        "name": "USD Coin",
        "version": "2"
      }
    }
  ]
}
```

`amount` is always an atomic-unit integer string. x402 does not include token decimals in its payment-requirements schema. Resolve decimals from trusted asset metadata, never from an untrusted challenge extension.

## Submit payment

Choose exactly one transport.

Native MPP:

```http
Authorization: Payment <credential>
```

x402 v2:

```http
PAYMENT-SIGNATURE: <encoded payment payload>
```

The gateway extracts network and asset from the credential and routes it to the matching configured gate. Unknown chain/token combinations are rejected.

On success, the response includes an MPP receipt:

```http
Payment-Receipt: <base64url receipt>
```

x402 success also includes:

```http
PAYMENT-RESPONSE: <base64url settlement response>
```

The JSON body is:

```json
{
  "projectId": "uuid",
  "deploymentId": "uuid",
  "status": "deploying",
  "message": "Deployment started. Poll status for updates."
}
```

The gateway stores transaction references uniquely, tops up CreateOS credits, and then starts deployment. A `409` means the transaction reference was already recorded. Never make another payment to recover from an ambiguous response; retry once without payment headers and with `X-Use-Existing-Credits: true`, then surface the original receipt/reference if credits are unavailable.

## Poll status

```http
GET /agent/deploy/{projectId}/{deploymentId}/status
```

Possible bodies:

```json
{ "status": "deploying", "deployment_status": "building" }
{ "status": "ready", "endpoint": "https://..." }
{ "status": "failed", "reason": "..." }
```

Only the wallet recorded as deployer may poll the deployment. Poll every five seconds and stop after ten minutes.

## Other endpoints

- `GET /health` — public health check.
- `GET /openapi.json` — runtime API metadata.
- `GET /agent/chains` — configured chains and token names. Its protocol list is informational; the actual `402` headers determine whether x402 is available.
- `GET /agent/balance/{address}?chain={name}` — public accepted-token balances.
- `GET /agent/projects` — authenticated project list.
- `DELETE /agent/projects/{projectId}` — authenticated, irreversible deletion; confirm first.

## Known payment assets

| Chain | Chain ID | Asset | Decimals | Transfer |
|---|---:|---|---:|---|
| Arbitrum | 42161 | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | 6 | EIP-3009 |
| Arbitrum Sepolia | 421614 | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` | 6 | EIP-3009 |
| Base | 8453 | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | 6 | EIP-3009 |
| BSC | 56 | `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d` | 18 | Permit2 Exact |

Only USDC is currently accepted. Reject an offer whose network and asset do not exactly match this trusted table.

## Error handling

| Status | Meaning |
|---:|---|
| `400` | Invalid body, malformed credential, mixed payment protocols, or unsupported network |
| `401` | Missing/invalid wallet signature, expired timestamp, or reused nonce |
| `402` | Payment required, or verification/settlement was not accepted |
| `403` | Wallet does not own the project/deployment |
| `409` | Payment reference already recorded |
| `429` | Rate limited; current gateway policy is 30 requests/minute per wallet and IP |
| `500` | Top-up or deployment failed |
| `502` | Payment verification or settlement service failed |

Do not infer from a generic `500` that credits were definitely added. Preserve the receipt/reference, attempt only a payment-free credit retry when appropriate, and ask for reconciliation if the result remains ambiguous.
