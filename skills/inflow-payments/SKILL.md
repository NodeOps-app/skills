---
name: inflow-payments
description: "Integrate InFlow stablecoin payments into any project. Use this skill when the user wants to: accept payments, add a checkout, request a payment, build a payment flow, integrate InFlow, accept USDC/USDT/EURC/PYUSD, set up consumer login via InFlow, register users with InFlow, handle payment webhooks, create spending policies for autonomous agents, build a 0-click headless payment flow, or add InFlow checkout to a marketplace app (note: native multi-recipient splits are not supported by the InFlow API). Also trigger on: 'add inflow', 'inflow payment', 'inflow checkout', 'stablecoin payment', 'crypto payment', 'accept stablecoins', 'pay with usdc', 'inflow webhook', 'inflow login', 'inflow policy'."
---

# InFlow Payments Integration

InFlow is a stablecoin payment platform. Sellers (merchants, agents) request payments from consumers; consumers approve via mobile/email/SMS; settlements happen on-chain. Consumers can pre-configure **policies** that auto-approve requests within budget — enabling 0-click flows for autonomous agents.

This skill integrates InFlow into any project — backend service, full-stack web app, CLI, autonomous agent, or worker — without forcing a specific framework or language. **Important:** the integration itself is always backend work. Browser code is only ever the optional `inflow.js` popup (UX only); every REST call to InFlow and the `INFLOW_API_KEY` live exclusively on the server. See the Hard Backend Gate section for the rule and how to handle projects without a backend yet.

## What InFlow Supports

| Capability | Endpoint(s) | Use case |
|---|---|---|
| **User search** | `POST /v1/users/search` | Find a consumer by email, mobile, or username |
| **User registration** | `POST /v1/requests/register` | Onboard a new consumer (out-of-band approval) |
| **Login** | `POST /v1/requests/login` | Authenticate a consumer (out-of-band approval) |
| **Payment** | `POST /v1/requests/payment` | Request a stablecoin payment from a consumer |
| **Policies** | `POST /v1/policies`, `POST /v1/requests/policy` | Pre-approved spending rules for headless / 0-click flows |
| **Webhooks** | Inbound `POST` to your endpoint | Receive transaction/approval status changes |
| **Polling fallback** | `GET /v1/requests/{requestId}` | Check status without webhooks |
| **Wallet read** | `GET /v1/balances`, `GET /v1/transactions` | Read balances and transaction history |
| **Crypto wallets** | `GET/POST /v1/deposit-addresses`, `/v1/withdrawal-addresses` | Manage on-chain wallet addresses |
| **Agentic users** | `POST /v1/users/agentic` | Create a programmatic account, get an API key |

**Currencies:** `USDC`, `USDT`, `EURC`, `PYUSD` (stablecoins only — no fiat)
**Blockchains:** `APTOS`, `BASE`, `SOLANA`, `WORLD`

## What This Skill Does NOT Do

These features are **not exposed by the InFlow public API**. If the user asks for any of them, stop and tell them they're not supported — do not attempt workarounds:

- **Marketplace splits** — No `splits[]` field on `PaymentRequest`. Multi-recipient payments would need separate sequential requests with no atomic guarantee.
- **Refund creation** — Transactions can have status `REFUNDED`, but there's no API to initiate one. Refunds are dashboard-only or out-of-band.
- **Webhook URL registration via API** — Webhook URLs are configured via the InFlow dashboard. There's no `POST /v1/webhooks` to register them programmatically.
- **OAuth flow for sellers** — Despite some legacy documentation referencing "OAuth", consumer authentication is entirely SDK-mediated. There's no OAuth dance for the integrating seller.

---

## Defaults & Decision Tree

When the user doesn't specify, use these defaults:

| Question | Default | Why |
|---|---|---|
| Currency | `USDC` | Most widely-held stablecoin |
| `userDetails` field | `["EMAIL"]` | Required field; email is the minimum useful identifier |
| Display mode | See decision below | Depends on whether a browser is involved |
| Production vs sandbox | Sandbox SDK URL until user confirms | Production SDK URL is not yet documented |

**Display mode:** `FULL` if the consumer is interacting with a browser at the moment of payment (and the page can load `inflow.js`). `HEADLESS` for everything else: server-to-server, autonomous agents, scheduled jobs, AI workers.

**Webhook vs polling:** Webhooks for production. Polling only for local development, scripts, or anything without a public HTTPS endpoint.

**User identification:** A payment must be addressed to a known `userId`. The agent must either:
- Get the `userId` from the user (if they already know it), OR
- Search by email/mobile/username via `POST /v1/users/search`, OR
- Register a new consumer if the search returns 404

Always do user identification BEFORE creating a payment request.

---

## 🛑 Hard Backend Gate (Read Before ANY Code)

InFlow integration is **always backend work**. The `INFLOW_API_KEY` is a merchant key that must never reach a browser. There is no exception, demo mode, or "just for now" carve-out.

### Mandatory gate

Before writing any InFlow HTTP call, you MUST be able to **name the single server-only surface** where `X-API-Key` will be set. Acceptable surfaces:

- An Express / Fastify / Koa / Hono / Hapi route handler
- A Next.js Route Handler (`app/api/.../route.ts`) or Server Action — NOT a Client Component
- A SvelteKit `+server.ts` / `+page.server.ts` — NOT a `+page.svelte` component
- A Nuxt `server/api/*.ts` / `server/routes/*.ts` — NOT a Vue component or composable
- A Remix `loader` / `action` — NOT a route component body
- A serverless function: Vercel Function, Netlify Function, Cloudflare Worker, AWS Lambda, etc.
- A Python / Go / Rust / .NET / Java HTTP service
- A standalone backend script or worker (no browser involved)

If the project does NOT have any such surface — for example, a pure Vite + React SPA, a static site, a Storybook setup, a Chrome extension popup — **STOP**. Tell the user they need a backend surface for the API key, even if it's a single-file serverless function or a 30-line Express server. Offer to scaffold one. Do not proceed until the user agrees and the backend surface exists.

### Framework-specific footguns (key-leak mechanics)

These are real, common ways merchant keys end up in browsers. Refuse them all.

**Next.js:**
- `process.env.INFLOW_API_KEY` referenced inside a `'use client'` component is `undefined` at runtime — Next.js does NOT bundle non-`NEXT_PUBLIC_` env vars into client code. The bug surfaces as a broken request with no auth header.
- The disaster happens when an agent "fixes" this `undefined` by renaming the var to `NEXT_PUBLIC_INFLOW_API_KEY`. That prefix tells the bundler to inline the value into the client bundle → **the key is now shipped to every visitor**.
- **NEVER prefix `INFLOW_API_KEY` with `NEXT_PUBLIC_`.** The correct fix is to move the call to a Server Component, Route Handler (`app/api/.../route.ts`), or Server Action — never to make the key public.

**Vite (React, Vue, Svelte, Solid, etc.):**
- `import.meta.env.INFLOW_API_KEY` is `undefined` unless prefixed with `VITE_`. Some agents "fix" this by renaming to `VITE_INFLOW_API_KEY` → **Vite then inlines the key into the client bundle and ships it to every visitor**.
- **NEVER prefix `INFLOW_API_KEY` with `VITE_`.** Vite has no server runtime by itself. If you need a backend, the user has to add one (Express, Fastify, or pair with a serverless function).

**SvelteKit:**
- Components and `+page.svelte` files run in the browser. Use `+server.ts`, `+page.server.ts`, or `$lib/server/*` (the `server` directory is enforced as server-only by the bundler).

**Nuxt:**
- Vue components and composables run in the browser. Use `server/api/*` route handlers or `server/utils/*`. Never read `INFLOW_API_KEY` from a `<script setup>` block in a `.vue` file.

**Astro / Remix / Qwik / Solid Start:**
- All have a server/client split. The rule is the same: `INFLOW_API_KEY` is read only inside the framework's server boundary (loader, action, server route, etc.), never in component code.

### The "just a demo" trap

If the user says *"this is just a demo"*, *"just for testing"*, *"we'll add the backend later"*, *"just for now"*, or anything similar — **the rule still applies**. Embedded merchant keys leak via:

- Git history (especially after a `git push --force` "fix")
- Browser devtools (anyone can open them)
- Browser extensions (they read your scripts)
- Error reports / crash dumps shared in tickets
- Screenshots posted in Slack / GitHub / Stack Overflow
- Build artifacts uploaded to CDNs
- Deployed preview URLs that get crawled

A "temporary" key in the browser is a permanent key on the internet. There is no safe short-term embed.

For a quick demo, the right move is **still a backend** — just a small one. A 20-line Express script, a single Vercel Function, or a Cloudflare Worker. All take less time than the apology email after a key leak.

---

## Backend-Only Fast Path (No Browser, No Frontend)

If the user is integrating InFlow into a pure backend, API, agent, worker, or service — **skip the browser/SDK material entirely** and follow this short path. This is the most common backend integration shape.

**Order of operations:**

1. **Set env vars** (Step 1) — `INFLOW_API_KEY`, optionally `INFLOW_WEBHOOK_SECRET`
2. **Identify the consumer** (Step 2) — `POST /v1/users/search` with email/mobile/username → get `userId`
3. **Create the payment with `display: HEADLESS`** (Step 3) — pass `policyId` if you have one for 0-click; otherwise the consumer gets a mobile/email approval prompt
4. **Persist your correlation key** — store `{ yourOrderId, requestId, transactionId? }` so the webhook handler can look up the right order. The webhook payload only carries InFlow's IDs; you must map them back to your business object.
5. **Wait for confirmation** — either:
   - **Webhook handler** (Step 5) — recommended for production. Verify HMAC, idempotency by `eventId`, fulfill on `event.data.status === "PAID"` (with the discriminator check)
   - **OR polling** (Step 6) — for scripts, batch jobs, local dev. Call `GET /v1/requests/{requestId}` until status leaves `PENDING`

**Skip:** Step 4 (frontend SDK), the full-stack happy path diagram below, anything mentioning `inflow.js` or browsers.

**For autonomous agents** that need 0-click headless payments without consumer interaction per transaction, also implement Step 7 (Policies) and attach `policyId` to every payment request.

---

## Order Correlation (Backend Pattern)

A common bug in payment integrations: the webhook arrives but the handler can't figure out which of your orders it belongs to. The InFlow webhook payload contains InFlow's IDs (`requestId`, `transactionId`, `approvalId`) but **none of your business IDs**. You must store the mapping yourself at payment creation time.

**Minimum mapping table** (in your DB / store / cache):

| Your column | Source |
|---|---|
| `your_order_id` | Your business object — the thing being purchased |
| `inflow_request_id` | Returned from `POST /v1/requests/payment` |
| `inflow_transaction_id` | Returned later in webhook payload (`event.data.transactionId`) — start NULL, fill on first event |
| `status` | Your local state machine: `pending` / `paid` / `failed` |
| `created_at` | Audit trail |

**At payment creation:** insert a row with `your_order_id` + `inflow_request_id`, status `pending`.

**At webhook receipt:** look up the row by `inflow_request_id` (use `event.data.approvalId` or correlate via `requestId` if `data` is an `ApprovalResponse`; use `event.data.transactionId` once it appears in a `TransactionResponse`). Update status. Fulfill the order.

**Idempotency:** also store processed `event.eventId`s separately so you don't double-fulfill on retries (InFlow may resend the same event for up to 72 hours).

---

## Happy Path: Add Checkout to a Web App

This is the most common request. End-to-end recipe for "I want to accept InFlow payments at checkout":

```
┌──────────────────────────────────────────────────────────────────┐
│ Frontend (browser)                                               │
├──────────────────────────────────────────────────────────────────┤
│ 1. Collect consumer email at checkout                            │
│ 2. Click "Pay with InFlow" → POST to YOUR /api/inflow/checkout   │
│ 3. Receive { requestId } from your backend                       │
│ 4. Render popup: new InFlow.Request(requestId).render({...})     │
│ 5. statusCallback fires when consumer approves                   │
│ 6. Show "processing..." (DO NOT fulfill yet)                     │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│ Backend (your /api/inflow/checkout endpoint)                     │
├──────────────────────────────────────────────────────────────────┤
│ 1. Receive { email, amount } from frontend                       │
│ 2. POST /v1/users/search { email } → get userId                  │
│    (if 404 → POST /v1/requests/register first)                   │
│ 3. POST /v1/requests/payment {                                   │
│      userId, amount, currency: "USDC",                           │
│      display: "FULL", userDetails: ["EMAIL"]                     │
│    }                                                             │
│ 4. Return { requestId } to frontend                              │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│ Backend (your /api/webhooks/inflow endpoint)                     │
├──────────────────────────────────────────────────────────────────┤
│ 1. Receive POST from InFlow with x-inflow-signature header       │
│ 2. Verify HMAC-SHA256 signature → 401 if invalid                 │
│ 3. Check eventId against idempotency store → skip if seen        │
│ 4. Fulfill ONLY if ALL three are true:                           │
│    a. event.type === "TRANSACTION_UPDATED"                       │
│    b. event.data.transactionId is present                        │
│       (i.e. data is a TransactionResponse, not Approval)         │
│    c. event.data.status === "PAID"                               │
│    (use INNER data.status, NOT outer event.status)               │
│ 5. Return HTTP 200                                               │
└──────────────────────────────────────────────────────────────────┘
```

> **Two `status` fields, two meanings.** The webhook envelope has an outer `event.status` (`DELIVERED`/`FAILED`/`PENDING`/`DISABLED` — InFlow's delivery state) and the inner `event.data.status` (the actual transaction state like `PAID`/`PENDING`/`INSUFFICIENT_FUNDS`). **Always check `event.data.status` for fulfillment decisions.** See Step 5 for details.

**The three things the user MUST do manually:**

1. Get an `INFLOW_API_KEY` (from InFlow dashboard, or create an agentic user — see "Agentic User Setup" below)
2. Register the webhook URL `https://yourdomain.com/api/webhooks/inflow` in the InFlow dashboard (no API for this)
3. Get the `INFLOW_WEBHOOK_SECRET` from the InFlow dashboard after registering the URL

After implementing the integration, summarize these manual steps prominently.

---

## Reference Material

This skill ships with three reference documents in `references/`. Read them when you need details beyond what's in this file:

- **`references/overview.md`** — Platform concepts, approval model, FULL vs HEADLESS display modes
- **`references/flows.md`** — 8 worked-out integration flows with HTTP examples
- **`references/api-reference.md`** — Every endpoint, every schema, every enum value

When the user asks something specific (e.g. "how do I list policies?", "what does the webhook payload look like?"), look it up in the references rather than guessing.

---

## Implementation Guide

### Prerequisites

Before writing any code:

1. **Read the project** — detect language and framework via `package.json`, `requirements.txt`, `go.mod`, `Cargo.toml`, etc. Use whatever HTTP client and web framework already exists. Do not impose Express, Next.js, React, or any specific framework.
2. **Pass the Hard Backend Gate** (see the "🛑 Hard Backend Gate" section earlier in this file) — name the server-only surface where the API key will live. If there isn't one, scaffold one (with the user's agreement) before continuing.
3. **Confirm the user has an API key** — if not, walk them through the agentic user setup at the bottom of this file.
4. **Confirm the project type** — pure backend / fullstack web app / CLI / agent / worker. Pure-frontend projects are NOT a valid type — see the Hard Backend Gate.
   - Pure backend → Server payment + webhook (or polling)
   - Fullstack / web app → Server payment + frontend SDK + webhook
   - CLI / agent / worker → Headless payment + webhook (or polling) + maybe policies for 0-click

### Step 1: Set Up Environment Variables

Add these to the project's existing env file (`.env`, `.env.local`, etc. — match the project's convention). Add to `.env.example` too.

```
# Required for any InFlow integration
INFLOW_API_KEY=<your-private-key>

# Required if you handle webhooks
INFLOW_WEBHOOK_SECRET=<your-webhook-secret>

# Optional: defaults to https://api.inflowpay.ai
# INFLOW_API_BASE_URL=https://api.inflowpay.ai
```

Make sure `.env` and `.env.local` are in `.gitignore`.

**Critical:** `INFLOW_API_KEY` is server-side only. Never embed it in frontend code, never expose it via a public route, never log it.

### Step 2: Find or Create the Consumer

A payment must be addressed to a `userId`. If the user doesn't know the consumer's `userId`, you must look it up first.

**Search by email (or mobile / username):**

```http
POST https://api.inflowpay.ai/v1/users/search
X-API-Key: <INFLOW_API_KEY>
Content-Type: application/json

{ "email": "alice@example.com" }
```

**On match (200):**
```json
{ "userId": "8a5c2948-9e08-439e-a7a6-9f0ee335f566" }
```

**On no match (404):** initiate registration:

```http
POST https://api.inflowpay.ai/v1/requests/register
X-API-Key: <INFLOW_API_KEY>
Content-Type: application/json

{
  "display": "FULL",
  "userDetails": ["EMAIL", "NAME"]
}
```

> ⚠️ **API quirk:** `RegisterRequest` lists `userId` as **optional** (only `display` and `userDetails` are required per the OpenAPI spec), but its semantics for a true new-user registration flow are not documented. **Do not invent a UUID.** Try the call without `userId` first; if the API rejects it, the user must obtain a provisional `userId` from InFlow support or check vendor docs. Treat this as vendor-ambiguous and surface the ambiguity to the user — do not silently work around it.

This returns an `ApprovalResponse` with a `requestId`. Hand the `requestId` to the frontend SDK to render the registration popup. After approval, the consumer is registered and can be searched again.

**Search field rules:**
- `email` — RFC email format
- `mobile` — E.164 format like `+15551234567`
- `username` — 3-16 chars, alphanumeric + `-_`

**`userDetails` enum values:** `BIRTHDATE`, `DEPOSIT_ADDRESSES`, `EMAIL`, `MOBILE`, `NAME`, `NATIONAL_ID`, `PHYSICAL_ADDRESS`, `USERNAME`. Always include at least `EMAIL`.

### Step 3: Create a Payment Request

```http
POST https://api.inflowpay.ai/v1/requests/payment
X-API-Key: <INFLOW_API_KEY>
Content-Type: application/json

{
  "userId": "<consumer-uuid-from-Step-2>",
  "amount": 99.99,
  "currency": "USDC",
  "display": "FULL",
  "userDetails": ["EMAIL"]
}
```

**Response (200):**
```json
{
  "requestId": "<uuid>",
  "type": "PAYMENT",
  "status": "PENDING"
}
```

**Required fields:** `amount` (≥ 0.01), `currency`, `display`, `userDetails`.
**Optional:** `userId`, `policyId` (for auto-approval via a pre-existing policy).

**Amount format:** Plain decimal in major units of the chosen stablecoin. `99.99` means 99.99 USDC (≈ $99.99). No cents/minor units.

**Adapt the HTTP call to the user's stack** — read the project and use whatever HTTP client is already in use. The exact code shape depends on the language (Node fetch, Python requests, Go net/http, etc.).

**Error handling:**
- 4xx → user error (missing field, invalid format, user not found). Return the error to the caller, don't retry.
- 5xx / network → transient. Retry with exponential backoff (max 3 attempts) before failing the checkout.

After getting `requestId`, the next step depends on the display mode:
- `FULL` → hand `requestId` to the frontend SDK (Step 4)
- `HEADLESS` → wait for the webhook (Step 5) or poll `GET /v1/requests/{requestId}` (Step 6)

### Step 4: Frontend SDK (`inflow.js`) — for `display: FULL`

For browser-based flows. The frontend loads `inflow.js`, gets a `requestId` from the backend, and renders a popup.

**Load the SDK:**

```html
<script src="https://sandbox.inflowpay.ai/sdk/inflow.js"></script>
```

> ⚠️ This is the **sandbox** URL. The production URL is not yet publicly documented. Before deploying to production, the user should confirm the production SDK URL with InFlow.

**Render a request:**

```js
// Get the requestId from your backend (which calls POST /v1/requests/{login|register|payment|...})
const requestId = await fetchRequestIdFromYourBackend();

const request = new InFlow.Request(requestId);
request.render({
  statusCallback: (status) => {
    // status.status is one of: PENDING, APPROVED, DECLINED, EXPIRED, CANCELLED
    if (status.status === InFlow.STATUS.APPROVED) {
      // SDK indicated user approved. Show "processing..."
      // DO NOT fulfill the order here — wait for the webhook.
    }
  }
});
```

Same pattern works for login, register, payment, and details requests. Only the backend endpoint that produces the `requestId` differs.

**Adapt the surrounding markup to the user's framework** — wrap in a React/Vue/Svelte component if needed. The SDK itself is framework-agnostic.

### Step 5: Webhook Handler

InFlow delivers signed events to your registered webhook URL.

> 🚨 **CRITICAL MANUAL STEP:** The webhook URL **must be registered in the InFlow dashboard** by the user — there is no API for this. After implementing the handler, tell the user explicitly:
>
> *"Go to the InFlow dashboard, navigate to webhooks, register `https://yourdomain.com/api/webhooks/inflow` (or your equivalent URL), and copy the webhook secret into your `INFLOW_WEBHOOK_SECRET` env var. Until you do this, no events will be delivered."*

For local testing, suggest [ngrok](https://ngrok.com) or similar to expose `localhost` over HTTPS.

**Webhook payload shape — note the two `status` fields:**

```json
{
  "eventId": "<uuid>",
  "webhookId": "<uuid>",
  "type": "TRANSACTION_UPDATED",
  "status": "DELIVERED",          ← OUTER: InFlow's delivery state. Ignore for fulfillment.
  "data": {
    "transactionId": "<uuid>",
    "approvalId": "<uuid>",
    "amount": 99.99,
    "currency": "USDC",
    "blockchain": "SOLANA",
    "status": "PAID",              ← INNER: actual transaction state. Use this for fulfillment.
    "transactionHash": "0x...",
    "created": "2026-01-01T00:00:00.000Z"
  },
  "created": "2026-01-01T00:00:00.000Z",
  "delivered": "2026-01-01T00:00:01.000Z"
}
```

> **Critical disambiguation:** the envelope has TWO `status` fields:
> - **`event.status`** (outer) — InFlow's webhook delivery state: `PENDING` / `DELIVERED` / `FAILED` / `DISABLED`. This tells you whether InFlow successfully delivered the event. Don't branch on this for business logic.
> - **`event.data.status`** (inner) — the actual transaction or approval state: `PAID`, `INITIATED`, `PENDING`, `INSUFFICIENT_FUNDS`, `APPROVED`, `DECLINED`, etc. **This is what you check for fulfillment.**

**Event types:** `TRANSACTION_CREATED`, `TRANSACTION_UPDATED`

**The `data` field is a discriminated union:**
- If it has `requestId` and `type` (LOGIN/PAYMENT/etc.) → it's an `ApprovalResponse`
- If it has `transactionId`, `blockchain`, and `transactionHash` → it's a `TransactionResponse`

**Only fulfill orders when ALL of these are true:** `event.type === "TRANSACTION_UPDATED"`, the `data` field is shaped as a `TransactionResponse` (presence of `transactionId` is the simplest discriminator), and `event.data.status === "PAID"`. Do not generalize to "any TRANSACTION_* event with status PAID" — an `ApprovalResponse` payload may also have a `status` field (`APPROVED`/`PENDING`/etc.) and using it for fulfillment will crash or misfire.

**`data.status` values that matter (TransactionResponse):**
- `PAID` — payment completed (this is your "fulfill the order" signal)
- `INITIATED`, `PENDING` — in progress, do nothing
- `INSUFFICIENT_FUNDS`, `GENERAL_ERROR` — failed, notify user
- `REFUNDED`, `RETURNED` — money was returned

**Mandatory: HMAC signature verification.** Every webhook is signed with HMAC-SHA256. The signature is in the `x-inflow-signature` header. Verify it before processing.

```js
// Generic — adapt to whatever crypto library the project uses.
// Node.js example using built-in crypto module:
import crypto from 'node:crypto';

function verifyInflowWebhook(rawBody, signatureHeader, secret) {
  // Guard against missing or malformed header — timingSafeEqual throws on length mismatch
  if (typeof signatureHeader !== 'string' || signatureHeader.length === 0) return false;
  if (!rawBody || !secret) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  if (expected.length !== signatureHeader.length) return false;

  // Constant-time compare to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signatureHeader),
  );
}
```

The same logic applies in any language: HMAC-SHA256 the raw request body using the webhook secret, hex-encode it, compare to the `x-inflow-signature` header.

**Critical:** verify against the **raw request body bytes**, NOT a re-serialized JSON object. If the framework parses JSON automatically, you must capture the raw body before parsing. The exact mechanism depends on the framework.

**Webhook handler responsibilities:**

1. Verify the signature → reject with HTTP 401 if invalid
2. Parse the JSON body
3. Check `eventId` against an idempotency store → skip if already processed (InFlow may retry the same event for up to 72 hours)
4. Look up your local order by `event.data.approvalId` or `event.data.transactionId` (see Order Correlation section above)
5. Branch on the FULL three-condition rule (do not skip any of these):
   - **Fulfill** when ALL of: `event.type === "TRANSACTION_UPDATED"` AND `event.data.transactionId` is present (it's a `TransactionResponse`, not an `ApprovalResponse`) AND `event.data.status === "PAID"`
   - **Mark failed** when `event.data.transactionId` present AND `event.data.status` is `INSUFFICIENT_FUNDS` / `GENERAL_ERROR` / `RETURNED`
   - **Log only** for other event types or non-terminal statuses (`INITIATED`, `PENDING`, etc.)
   - **NEVER fulfill on `event.status` (the OUTER delivery status) — that just means InFlow delivered the webhook successfully**
6. Return HTTP 200 to acknowledge

If the handler doesn't return 200, InFlow keeps retrying with exponential backoff for up to 72 hours.

### Step 6: Polling (Webhook Alternative)

If a webhook listener isn't possible (local dev, batch jobs, simple scripts), poll request status:

```http
GET https://api.inflowpay.ai/v1/requests/{requestId}
X-API-Key: <INFLOW_API_KEY>
```

Returns the current `ApprovalResponse`. Poll every few seconds until `status` is no longer `PENDING`.

For full transaction details after approval:

```http
GET https://api.inflowpay.ai/v1/transactions/{transactionId}
```

Where `transactionId` comes from the approved `ApprovalResponse.transactionId`.

### Step 7: Policies (Enable 0-Click Headless Payments)

Policies are pre-approved spending rules. When a `HEADLESS` payment request includes a `policyId` and the request is within the policy's limits, it auto-approves immediately — no consumer interaction needed.

**Use policies for:**
- Autonomous AI agents that need to make purchases without per-transaction approval
- Recurring payments (subscriptions, automated top-ups)
- High-frequency low-value transactions

**Direct creation** (seller-initiated):

```http
POST https://api.inflowpay.ai/v1/policies
X-API-Key: <INFLOW_API_KEY>
Content-Type: application/json

{
  "type": "PAYMENT",
  "action": "APPROVE",
  "currency": "USDC",
  "budget": 1000,
  "threshold": 100,
  "period": "MONTHLY",
  "expires": "2026-12-31T00:00:00.000Z"
}
```

**Consumer-initiated request** (the consumer must approve the policy via their device):

```http
POST https://api.inflowpay.ai/v1/requests/policy
X-API-Key: <INFLOW_API_KEY>
Content-Type: application/json

{
  "userId": "<consumer-uuid>",
  "display": "FULL",
  "userDetails": ["EMAIL"]
}
```

This returns an `ApprovalResponse` — same flow as login/payment. Consumer approves via SDK or mobile, and the policy becomes active.

**Policy fields:**
- `action` — `APPROVE`, `DECLINE`, `REVIEW`
- `period` — `DAILY`, `MONTHLY`, `YEARLY`, `ONCE`
- `budget` — total allowance for the period
- `threshold` — per-transaction maximum
- `spent` — current usage (read-only on `PolicyResponse`)

**CRUD:**
```http
GET    /v1/policies
GET    /v1/policies/{policyId}
POST   /v1/policies
PUT    /v1/policies/{policyId}
DELETE /v1/policies/{policyId}/delete
```

**Attach a policy to a payment:**

```json
{
  "userId": "<consumer-uuid>",
  "amount": 50,
  "currency": "USDC",
  "display": "HEADLESS",
  "userDetails": ["EMAIL"],
  "policyId": "<policy-uuid>"
}
```

If the request is within budget and threshold, the response will already show `status: APPROVED`.

### Step 8: Wallet Read Operations

Read-only access to the seller's wallet state. Useful for dashboards, reconciliation, and balance checks.

```http
GET /v1/balances              — all currency balances
GET /v1/balances/{currency}   — single currency balance
GET /v1/transactions          — paginated transaction history
GET /v1/transactions/{id}     — single transaction
GET /v1/users/self            — current authenticated user
```

All return JSON. See `references/api-reference.md` for full schemas.

---

## Verification

Run a smoke test to confirm everything works. Adapt the commands to whatever the project uses (npm scripts, curl, http file, etc.):

1. **API key auth** — call `GET /v1/users/self` with the configured `X-API-Key`. Should return the authenticated user. If 401, the key is wrong.
2. **User search** — call `POST /v1/users/search` with a known email. Confirm 200 + `userId`, or 404 if the user doesn't exist.
3. **Payment request** — initiate a small test payment to the known `userId`. Confirm the response contains a `requestId` and `status: PENDING`.
4. **Polling** (if implemented) — call `GET /v1/requests/{requestId}` and confirm the status updates as the consumer interacts.
5. **Webhook** (if implemented) — once a real event is delivered, check the handler's logs to confirm: signature verified, payload parsed, handler logic executed, HTTP 200 returned. (You can also use `GET /v1/events` to inspect past events and `POST /v1/events/{eventId}/resend` to replay one.)

If the user is in production, also recommend:
- A persistent idempotency store for `eventId`s (DB or Redis)
- Logging all webhook events for audit
- A dead-letter queue for failed webhook processing

---

## Agentic User Setup (No Existing Account)

If the user does NOT have an existing InFlow account, create an agentic (programmatic) user. This is a one-time setup and does NOT require existing authentication.

```http
POST https://api.inflowpay.ai/v1/users/agentic
Content-Type: application/json

{
  "locale": "EN_US",
  "timezone": "US/Pacific"
}
```

Returns:

```json
{
  "userId": "<uuid>",
  "privateKey": "<your-api-key>",
  "locale": "EN_US",
  "timezone": "US/Pacific",
  "created": "...",
  "updated": "..."
}
```

The `privateKey` is what goes in the `INFLOW_API_KEY` env var. **Store it securely** — it cannot be retrieved again.

---

## Idempotency

Before each step, check if the work is already done. Skip steps that are complete:

- If `INFLOW_API_KEY` is already in `.env` / `.env.example`, skip env setup
- If a webhook handler with HMAC verification already exists for InFlow paths, skip the webhook scenario
- If `inflow.js` is already loaded somewhere in the frontend, skip the SDK script tag
- If there's an existing helper module that wraps `api.inflowpay.ai` calls (look for `INFLOW_API_KEY` usage or `inflowpay.ai` in source), reuse it instead of creating a new one
- If `.env` / `.env.local` is not in `.gitignore`, add it

Always read the project before writing — don't duplicate existing logic.

---

## Final Summary (After Implementation)

After implementing, give the user a clear summary in this format:

1. **Files created or modified** — list each one with its purpose
2. **Env vars to set** — name + what each is for + where to get the values
3. **What flows are now active** — payment / login / register / webhook / polling / policies
4. **Manual steps the user must complete** — be explicit about:
   - Getting the API key (from dashboard or via `POST /v1/users/agentic`)
   - **Registering the webhook URL in the InFlow dashboard** (no API for this — flag prominently if a webhook handler was created)
   - Copying the webhook secret into `INFLOW_WEBHOOK_SECRET`
   - Confirming the production SDK URL with InFlow before going live (sandbox URL is in code by default)
5. **Test commands** — exact commands to verify each flow
6. **Next steps** — what to do after the integration is wired up

Keep the summary terse. The user should be able to complete the integration after reading it.
