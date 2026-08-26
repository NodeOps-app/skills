---
name: createos-deploy
description: Deploy projects to CreateOS infrastructure via the MPP Gateway. Use when the user wants to deploy code, ship an app, or deploy to CreateOS. No auth session or OAuth required — uses HTTP 402 payment flow only.
argument-hint: "[service] [plan]"
---

# Deploy to CreateOS

**No auth session, no OAuth, no browser login required.** This skill uses the HTTP 402 payment flow — the on-chain payment itself is the access control. Call the API, pay with USDC/USDT, deploy.

Base URL: `https://mpp-createos.nodeops.network`

## Prerequisites

An EVM wallet with gas (ETH) and USDC on **Arbitrum or Base mainnet**. Testnets are not accepted. Generate a wallet if needed:

```ts
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);
// Save privateKey securely, outside the project directory
```

Only dependency: `npm install viem`

## Quick start

A runnable script ships with this skill. Prefer it over hand-written code.

```bash
cd path/to/this/skill && npm install

# 1. Quote only. Nothing leaves the wallet without --yes.
node deploy.mjs --dir /path/to/project --name my-app --port 8080

# 2. Pay and deploy.
node deploy.mjs --dir /path/to/project --name my-app --port 8080 --yes
```

The script collects the files, blocks secrets, pays, polls, and checks that the
endpoint answers. Read [example.md](example.md) to build the flow by hand.

| Flag | Meaning |
| ---- | ------- |
| `--dir` | Directory to deploy. Must be a git repository. Default `.` |
| `--name` | `uniqueName`, 4–32 chars, globally unique on CreateOS |
| `--port` | Required. The port the app listens on |
| `--yes` | Send the payment. Without it the script stops after the quote |
| `--display-name` | Defaults to `--name` |

`PRIVATE_KEY` comes from the environment, then `.env` in `--dir`, then `.env`
beside the script.

## Show the price before you pay

The price floor is $0.50, but the quote moves. A real deploy was quoted $1.81.

Quote first, show the user the amount, and wait for approval. Skip the approval
only when the user has already approved payment for this deploy.

## Find the port before you deploy

`port` is the one setting worth getting right, and a wrong value is expensive.
The deploy still reports `ready`, and the endpoint answers nothing, after payment.

Read the source to find the real value:

- Go: `ListenAndServe` in `main.go`, often behind a `PORT` fallback
- Node: `app.listen(...)` or `server.listen(...)`
- Python: the `--bind` or `--port` flag for gunicorn or uvicorn
- Docker: the `EXPOSE` line

If the app reads `PORT` from the environment, pass the fallback in the code.
Environment variables do not reach the container, so that fallback is what runs.

## Ignore `createos.json`

Some repositories carry a `createos.json` from another tool. This gateway never
reads it. Its `runtime`, `framework`, and `port` fields can contradict the real
project. One Go project declared `node:20`, `reactjs-spa`, and port 80 for a
server that listens on 8080. Trust the source code instead.

## Validate before you pay

The gateway accepts the body loosely and CreateOS rejects it strictly. A bad name is only caught **after** payment. Check these first:

| Field        | Rule                                                   |
| ------------ | ------------------------------------------------------ |
| `uniqueName` | 4–32 chars, must be globally unique on CreateOS         |
| `displayName`| 4–100 chars, letters/digits/space/`_ \| , & - ' " / \\` |
| `description`| omit, or 4–2048 chars                                   |

## Flow

0. `GET /agent/projects` — list what the wallet already runs. Use it to spot a
   name collision before you pay, and to name the active projects that a
   credit-sharing warning puts at risk.
1. `POST /agent/deploy` (no payment headers) — the gateway checks credits AND active projects, then returns one of:
   - **200** — has credits, no active projects → already deploying. Skip to step 5.
   - **402 with `warning`** — has credits, but active projects share them. Either **pay** (recommended, extends total runtime) or retry with `X-Use-Existing-Credits: true`.
   - **402 without `warning`** — no credits. Body carries `pay_to`, `amount_token`, `payment_chain`, `token`, `supported_chains`.
2. `GET /agent/balance/{address}?chain=...` — confirm the wallet can pay on the quoted chain.
3. If no chain has enough balance, **stop and tell the user**:
   > "Your wallet `0x...` doesn't have enough funds to deploy. Please add **{amount_usd} {token}** on **{chain}** to address `0x...`."
   >
   > List every chain from `GET /agent/chains` so the user can pick one to fund.
4. Send the ERC20 transfer to `pay_to` with viem, wait for the receipt, then `POST /agent/deploy` again with `X-Payment-Tx: {txHash}`. The gateway verifies on-chain, tops up credits, and deploys.
5. `GET /agent/deploy/{projectId}/{deploymentId}/status` → poll every 5s until `ready` or `failed`.
6. Fetch the `endpoint` and confirm the response. `ready` is the gateway's
   opinion, not proof that the app serves traffic. A wrong `port` reaches
   `ready` and answers nothing. One request catches it.

**Do the payment and step 4 back to back.** The price is re-derived on the second call from a 5-minute cache. If it rises in between, verification fails on an amount that already left the wallet.

## After you have paid

Once the transfer confirms, the money is gone from the wallet. Never send a second payment to recover from an error.

| Response to step 4 | What happened | What to do |
| ------------------ | ------------- | ---------- |
| `200` | Deployed | Poll status |
| `500` | Credits **were** topped up, the deploy itself failed | Retry `POST /agent/deploy` with **no** payment headers, plus `X-Use-Existing-Credits: true` |
| `409` | This tx hash was already processed | Same as 500 — the credits exist, retry without payment headers |
| `402 Payment verification failed` | Tx not found on that chain, wrong recipient, or under the quoted amount | Do **not** re-pay. Confirm `X-Payment-Chain` matches the chain you paid on, then surface the tx hash to the user |

## Credit sharing and active projects

CreateOS credits are pooled across all your active projects and consumed hourly. Multiple active deployments share one balance.

- **0 active projects + credits** → deploys free, no impact on anything.
- **1+ active projects, deploy without paying** → the new project draws from the same pool, **shortening the runtime of the others**.

The gateway blocks that by default: with active projects you must either pay or opt in with `X-Use-Existing-Credits: true`.

**Always tell the user** when a deploy will eat into other projects' runtime, and recommend paying instead.

A project counts as active when its status is `active`, `building`, `deploying`, `pending`, `queued`, or `promoting`.

## Deploy settings

`settings` is optional and merged over these defaults:

```json
{
  "port": 3000,
  "runtime": "build-ai",
  "useBuildAI": true,
  "hasDockerfile": false,
  "framework": null,
  "installCommand": null,
  "buildCommand": null,
  "runCommand": null,
  "buildDir": null,
  "directoryPath": null,
  "runEnvs": null
}
```

- **`port`** — must match the port your app listens on. This is the one field worth setting explicitly.
- **`useBuildAI: true`** infers install/build/run commands from the source. Set `hasDockerfile: true` and keep a `Dockerfile` at the upload root to build that instead.
- **`directoryPath`** — subdirectory to build from, for monorepos.
- Resources are fixed at 1 replica / 512 MiB / 500m CPU and are not configurable through this gateway.

**Known limitation — runtime env vars do not reach the running container.** The gateway creates the production environment with an empty env map, so `settings.runEnvs` does not survive promotion. Bake configuration into the upload, or fix the gateway to forward `environment.settings.runEnvs`.

## Auth headers (all `/agent/*` except `/balance`, `/chains`, `/recipients`)

Sign the message `{wallet}:{timestamp}:{nonce}` with your private key (EIP-191, `viem` `signMessage`).

```
X-Wallet-Address: 0xYourWallet
X-Signature: 0xSignedMessage
X-Timestamp: 1711500000000
X-Nonce: unique-uuid
```

- The wallet string inside the message must match `X-Wallet-Address` byte for byte, including case.
- `X-Timestamp` is Unix **milliseconds** and must be within 60s of the server clock.
- `X-Nonce` is single-use. Generate a fresh nonce, timestamp, and signature for **every** request, including each status poll.

## Utility endpoints (no auth)

**Check balance** — all tokens on a chain:

```
GET /agent/balance/0xYourWallet?chain=arbitrum
```

```json
{
  "address": "0x...",
  "chain": "arbitrum",
  "chain_id": 42161,
  "balances": [
    { "token": "usdc", "symbol": "USDC", "balance": "18.000000", "balance_raw": "18000000", "decimals": 6 }
  ]
}
```

**List supported chains**:

```
GET /agent/chains
```

```json
{
  "chains": [
    { "chain": "base", "chain_id": 8453, "tokens": ["usdc", "usdt"] },
    { "chain": "arbitrum", "chain_id": 42161, "tokens": ["usdc", "usdt"] }
  ]
}
```

Also available: `GET /agent/recipients` (payment address per chain), `GET /health`, `GET /openapi.json`.

## List your projects (auth required)

```
GET /agent/projects
```

Returns every project deployed by the wallet, with the live URL of the latest deployment.

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

`url` is `null` until a deployment succeeds. Status values: `active`, `building`, `deploying`, `pending`, `queued`, `promoting`, `deleting`, `failed`.

## Redeploying the same project

**Open question — not yet verified.** `uniqueName` must be globally unique, and
the gateway offers no documented "update this project" call. Reusing a name for
a second deploy is untested, and names are validated only after payment, so a
rejection costs money.

Until this is settled, do the safe thing:

1. `GET /agent/projects` and look for the name.
2. If the name is free, deploy it.
3. If the name is taken, either deploy under a new name, or `DELETE` the old
   project first and confirm the deletion with the user.

`deploy.mjs` warns when the name already exists on the wallet. It does not
choose for you.

## Delete a project (auth required)

```
DELETE /agent/projects/{projectId}
```

Permanently deletes a project from CreateOS. Only the wallet that deployed it can delete it. **Irreversible — confirm with the user first.**

```json
{ "projectId": "uuid", "status": "deleted" }
```

## Step 1: Get quote

```
POST /agent/deploy
Content-Type: application/json

{
  "uniqueName": "my-app",
  "displayName": "My App",
  "settings": { "port": 3000 },
  "upload": { "type": "files", "files": [{ "path": "index.js", "content": "base64..." }] }
}
```

Response `402` (no credits):

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

Response `402` (has credits but active projects exist):

```json
{
  "error": "Payment required",
  "warning": "You have 2 active project(s) sharing credits. Paying extends total runtime. To deploy using existing credits (will reduce other projects' runtime), retry with header X-Use-Existing-Credits: true",
  "amount_usd": 0.5,
  "current_credit_balance_usd": 1.20,
  "active_projects": 2,
  "pay_to": "0x7EA5...",
  ...
}
```

Pay `amount_token` exactly as given — it is the raw integer amount, already scaled to the token's 6 decimals. Overpaying is accepted; underpaying is not.

## Step 2: Pay

```ts
import { createWalletClient, createPublicClient, http } from "viem";
import { arbitrum } from "viem/chains";

const txHash = await walletClient.writeContract({
  address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC on arbitrum
  abi: [
    {
      name: "transfer",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
      ],
      outputs: [{ name: "", type: "bool" }],
    },
  ],
  functionName: "transfer",
  args: [quote.pay_to, BigInt(quote.amount_token)],
});
await publicClient.waitForTransactionReceipt({ hash: txHash });
```

Send to the chain named in `quote.payment_chain`. Paying on any other chain fails verification.

## Step 3: Deploy

Same request body, add the payment headers:

```
POST /agent/deploy
X-Payment-Tx: 0xTransactionHash
X-Payment-Chain: arbitrum
X-Payment-Token: usdc
```

Response `200`:

```json
{ "projectId": "uuid", "deploymentId": "uuid", "status": "deploying", "message": "..." }
```

## Step 4: Poll

```
GET /agent/deploy/{projectId}/{deploymentId}/status
```

- `{ "status": "deploying", "deployment_status": "building" }` — keep polling every 5s
- `{ "status": "ready", "endpoint": "https://..." }` — done
- `{ "status": "failed", "reason": "..." }` — stop

Typical build takes 2–3 minutes. Give up after 10 minutes.

## Upload types

Files: `{ "type": "files", "files": [{ "path": "...", "content": "base64" }] }`
Zip: `{ "type": "zip", "data": "base64-zip", "filename": "code.zip" }`

The whole JSON request is capped at **50 MB**, and base64 inflates the payload by about a third. Keep the upload to source and config only.

### Collect the files with git, not by hand

Do not write the file list yourself. A hand-written list misses files, and a
plain directory walk sweeps in secrets. Let git produce the set:

```bash
git ls-files -z --cached --others --exclude-standard
```

That honours `.gitignore`, so `node_modules/`, `dist/`, `build/`, `.next/`,
`target/`, `__pycache__/`, `venv/`, and `.git/` drop out with no exclude list.

Then filter the result twice:

1. **Secrets.** `.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`, `id_rsa*`,
   `credentials.json`, `.npmrc`. An untracked `.env` is **not** ignored by git,
   so it reaches the upload unless you filter it. The wallet key that pays for
   the deploy often sits in that exact file.
2. **Agent and editor tooling.** `.agents/`, `.claude/`, `.cursor/`,
   `.opencode/`, `.vscode/`, `.idea/`, `skills-lock.json`. These are tracked in
   many repositories and belong to no running app. In one six-file Go project
   they added 39 files and grew the upload from 8 KB to 649 KB.

`deploy.mjs` applies both filters and prints what it dropped.

## Error codes

| Code | Meaning                                                       |
| ---- | ------------------------------------------------------------- |
| 400  | Invalid body, bad tx hash format, or bad wallet address        |
| 401  | Missing/bad signature, timestamp outside 60s, nonce reused     |
| 402  | Payment required, or on-chain verification failed              |
| 403  | Wallet is not the deployer of this project/deployment          |
| 409  | Tx hash already processed — credits exist, retry without payment |
| 429  | Rate limited (30 req/min per wallet+IP, across all `/agent/*`) |
| 500  | Topup succeeded but deploy failed — retry without payment      |

## Reference

- [api-reference.md](api-reference.md) — full endpoint specs
- [example.md](example.md) — complete working example
