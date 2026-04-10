# InFlow — Integration Flows

> Concrete integration flows derived from the OpenAPI spec. Every endpoint, schema, and field shown here exists in `inflow-api-reference (1).json`.

## Prerequisites

- An InFlow API key (from the dashboard or `POST /v1/users/agentic`)
- For headed flows: the `inflow.js` SDK loaded on your frontend
- For webhooks: a public HTTPS endpoint and the HMAC secret (configured via the InFlow dashboard)

---

## Flow 1: Find or Create a Consumer

Before initiating any flow, you need a `userId`. There are two paths.

### 1a. Search for an existing user

```http
POST /v1/users/search
X-API-Key: <your-key>
Content-Type: application/json

{
  "email": "alice@example.com"
}
```

Response (200):
```json
{
  "userId": "8a5c2948-9e08-439e-a7a6-9f0ee335f566"
}
```

Search by `email`, `mobile` (E.164 format like `+15551234567`), or `username`. At least one field must be provided.

If no user matches, you'll get a 404.

### 1b. Register a new consumer

If the search returns 404, initiate registration:

```http
POST /v1/requests/register
X-API-Key: <your-key>
Content-Type: application/json

{
  "display": "FULL",
  "userDetails": ["EMAIL", "NAME", "PHYSICAL_ADDRESS"]
}
```

Response (200): an `ApprovalResponse` with a `requestId` and `status: PENDING`. Hand the `requestId` to the `inflow.js` SDK to render the registration popup.

> ⚠️ **API quirk:** Per the OpenAPI spec, only `display` and `userDetails` are required on `RegisterRequest`. `userId` is **optional** but its semantics for true new-user registration are not documented. **Do not invent a UUID.** Try the call without `userId` first; if the API rejects the request, the user must obtain a provisional `userId` from InFlow support or vendor docs. Treat this as vendor-ambiguous and surface it to the user — do not silently work around it.

---

## Flow 2: Login (Headed)

```http
POST /v1/requests/login
X-API-Key: <your-key>
Content-Type: application/json

{
  "userId": "8a5c2948-9e08-439e-a7a6-9f0ee335f566",
  "display": "FULL",
  "userDetails": ["EMAIL", "NAME"]
}
```

Response (200):
```json
{
  "requestId": "uuid",
  "type": "LOGIN",
  "status": "PENDING",
  "userDetails": ["EMAIL", "NAME"]
}
```

Frontend handoff:

```html
<script src="https://sandbox.inflowpay.ai/sdk/inflow.js"></script>
<script>
  const requestId = "<from your backend>";
  const request = new InFlow.Request(requestId);
  request.render({
    statusCallback: (status) => {
      // status.status is one of: PENDING, APPROVED, DECLINED, EXPIRED, CANCELLED
      if (status.status === InFlow.STATUS.APPROVED) {
        // Login successful — redirect or update UI
      }
    }
  });
</script>
```

After approval, fetch the full result:

```http
GET /v1/requests/{requestId}
X-API-Key: <your-key>
```

Returns an `ApprovalResponse` with `status: APPROVED` and `approvedDetails` containing the requested user fields.

---

## Flow 3: Payment (Headed — Browser + SDK)

The classic checkout flow. Consumer is at a browser, you've embedded `inflow.js`.

### Backend: Create the payment request

```http
POST /v1/requests/payment
X-API-Key: <your-key>
Content-Type: application/json

{
  "userId": "8a5c2948-9e08-439e-a7a6-9f0ee335f566",
  "amount": 99.99,
  "currency": "USDC",
  "display": "FULL",
  "userDetails": ["EMAIL", "NAME"]
}
```

Response (200):
```json
{
  "requestId": "uuid",
  "type": "PAYMENT",
  "status": "PENDING"
}
```

### Frontend: Render the popup

```javascript
const requestId = "<from your backend>";
const request = new InFlow.Request(requestId);
request.render({
  statusCallback: (status) => {
    switch (status.status) {
      case InFlow.STATUS.APPROVED:
        // Show "approved, settling..." — DON'T fulfill yet
        break;
      case InFlow.STATUS.DECLINED:
      case InFlow.STATUS.EXPIRED:
      case InFlow.STATUS.CANCELLED:
        // Show error, allow retry
        break;
    }
  }
});
```

### Backend: Wait for the webhook

The `statusCallback` only tells the frontend the consumer approved. **Do not fulfill the order on `APPROVED`.** Wait for the `TRANSACTION_UPDATED` webhook with the inner `TransactionResponse.status` reaching a settled state (e.g. `PAID`).

See **Flow 6: Webhook Handling** below.

---

## Flow 4: Payment (Headless — Server-to-Server)

For autonomous agents, server-to-server pipelines, or any context with no browser.

### Backend: Create the payment request with `HEADLESS` display

```http
POST /v1/requests/payment
X-API-Key: <your-key>
Content-Type: application/json

{
  "userId": "8a5c2948-9e08-439e-a7a6-9f0ee335f566",
  "amount": 49.50,
  "currency": "USDC",
  "display": "HEADLESS",
  "userDetails": ["EMAIL"],
  "policyId": "optional-policy-uuid"
}
```

If a `policyId` is provided AND the request is within the policy's `budget`, `threshold`, and `period`, the request **auto-approves immediately**. The response will already show `status: APPROVED`.

If no policy applies (or limits are exceeded), `status: PENDING` is returned and the consumer gets a notification on their mobile app + email with a dashboard link.

### Backend: Wait for the webhook

Same as Flow 3 — listen for `TRANSACTION_UPDATED` events.

---

## Flow 5: Create a Policy (Enable 0-Click Headless)

For autonomous agents or recurring payments, the consumer needs to pre-approve a policy.

### Option A: Seller creates the policy directly

```http
POST /v1/policies
X-API-Key: <your-key>
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

Returns a `PolicyResponse` with a `policyId`. The policy starts in `status: PENDING` until activated.

### Option B: Request the consumer to create a policy

```http
POST /v1/requests/policy
X-API-Key: <your-key>
Content-Type: application/json

{
  "userId": "...",
  "display": "FULL",
  "userDetails": ["EMAIL"]
}
```

Returns an `ApprovalResponse` — same flow as login/payment. Consumer approves the policy creation via SDK or mobile, and the policy becomes active.

### Reading policies

```http
GET /v1/policies
GET /v1/policies/{policyId}
```

Returns `PolicyResponse` with `spent` (current usage) so you can check remaining budget before initiating a payment.

### Updating / deleting

```http
PUT    /v1/policies/{policyId}
DELETE /v1/policies/{policyId}/delete
```

---

## Flow 6: Webhook Handling

InFlow delivers webhook events to your registered endpoint. Events represent changes to approvals and transactions.

### Payload structure

```json
{
  "eventId": "uuid",
  "webhookId": "uuid",
  "type": "TRANSACTION_UPDATED",
  "status": "DELIVERED",                   // OUTER: InFlow delivery state. Ignore for fulfillment.
  "data": {
    /* Either an ApprovalResponse OR a TransactionResponse */
    "status": "PAID"                       // INNER: actual business state. Use this.
  },
  "created": "2025-01-01T00:00:00.000Z",
  "delivered": "2025-01-01T00:00:01.000Z"
}
```

> **Two `status` fields, two meanings.** The envelope has an outer `event.status` (`PENDING`/`DELIVERED`/`FAILED`/`DISABLED` — InFlow's webhook delivery state) and an inner `event.data.status` (the actual transaction or approval state, like `PAID`/`PENDING`/`INSUFFICIENT_FUNDS`/`APPROVED`). **Always check `event.data.status` for fulfillment decisions, never `event.status`.**

**Event types:**
- `TRANSACTION_CREATED` — A new transaction was created (after approval)
- `TRANSACTION_UPDATED` — A transaction's status changed

The `data` field is a discriminated union. Inspect its shape:
- If it has `requestId` and `type` (LOGIN/PAYMENT/etc.), it's an `ApprovalResponse`
- If it has `transactionId`, `blockchain`, and `transactionHash`, it's a `TransactionResponse`

**Only fulfill orders when ALL of these are true:** `event.type === "TRANSACTION_UPDATED"`, the `data` field is a `TransactionResponse` (presence of `transactionId` is the simplest discriminator), and `event.data.status === "PAID"`. Do not generalize to "any TRANSACTION_* event with status PAID" — an `ApprovalResponse` payload may also have a `status` field with a different meaning.

### TransactionResponse status values

This is what tells you whether a payment is complete:

- `INITIATED` — created but not started
- `PENDING` — in progress
- `PAID` — completed (this is your "fulfill the order" signal)
- `DEPOSITED` / `WITHDRAWN` / `SENT` / `TRANSFERRED` / `SWAPPED` — other transaction outcomes
- `REFUNDED` — was refunded (note: refund creation is not in the public API)
- `RETURNED` — sent back to origin
- `INSUFFICIENT_FUNDS` — failed due to balance
- `GENERAL_ERROR` — failed for other reasons

### Verifying webhook signatures

Webhook payloads are signed with HMAC-SHA256. The signature is in the `x-inflow-signature` header.

Pseudocode:
```js
import crypto from 'node:crypto';

function verifyWebhook(rawBody, signatureHeader, secret) {
  // Guard against missing/short header — timingSafeEqual throws on length mismatch
  if (typeof signatureHeader !== 'string' || signatureHeader.length === 0) return false;
  if (!rawBody || !secret) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  if (expected.length !== signatureHeader.length) return false;

  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signatureHeader)
  );
}

app.post('/webhooks/inflow', (req, res) => {
  const sig = req.header('x-inflow-signature');
  if (!verifyWebhook(req.rawBody, sig, process.env.INFLOW_WEBHOOK_SECRET)) {
    return res.status(401).end();
  }
  const event = JSON.parse(req.rawBody);
  // ... handle event
  res.status(200).end();
});
```

> Get `rawBody` BEFORE any JSON parsing middleware mutates it. Express needs `app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf } }))`.

### Idempotency

InFlow may deliver the same event more than once during retries (up to 72 hours). Use `eventId` as an idempotency key — store processed event IDs and skip duplicates.

### Manual replay

You can fetch past events:

```http
GET /v1/events?limit=10&descending=true
GET /v1/events/{eventId}
```

Or trigger a redelivery:

```http
POST /v1/events/{eventId}/resend
```

---

## Flow 7: Status Polling (Webhook Alternative)

If you can't run a webhook listener (e.g. local development, batch jobs), you can poll the request status:

```http
GET /v1/requests/{requestId}
X-API-Key: <your-key>
```

Returns the current `ApprovalResponse`. Poll every few seconds until `status` is no longer `PENDING`.

For the actual transaction details after approval:

```http
GET /v1/transactions/{transactionId}
```

Where `transactionId` comes from the approved `ApprovalResponse.transactionId`.

---

## Flow 8: Read Wallet State

Once your account has activity, you can read balances and transaction history:

```http
GET /v1/balances              — all currency balances
GET /v1/balances/{currency}   — single currency balance

GET /v1/transactions          — paginated transaction history
GET /v1/transactions/{transactionId}  — single transaction

GET /v1/users/self            — current authenticated user
```

These are read-only and useful for dashboards, balance checks, and reconciliation.

---

## Error Handling

All endpoints return errors in a consistent shape:

```json
{
  "id": "error-uuid",
  "errors": [
    {
      "code": "PARAMETER_REQUIRED",
      "message": "A required parameter was missing.",
      "parameter": "email"
    }
  ]
}
```

**Documented error codes:**
`AMOUNT_INVALID`, `APPROVAL_NOT_FOUND`, `INVALID_FORMAT`, `PARAMETER_INVALID`, `PARAMETER_REQUIRED`, `POLICY_NOT_FOUND`, `SELLER_NOT_FOUND`, `TRANSACTION_NOT_FOUND`, `UNEXPECTED_ERROR`, `USER_NOT_FOUND`

In practice, transaction failures may include codes not in the official enum (e.g. `INSUFFICIENT_FUNDS`). Your handler should treat the enum as a known subset, not exhaustive.

---

## See Also

- [api-reference.md](./api-reference.md) — Complete endpoint and schema reference
- [overview.md](./overview.md) — Platform overview, currencies, blockchains, approval model
