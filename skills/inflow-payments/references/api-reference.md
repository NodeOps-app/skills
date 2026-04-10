# InFlow — API Reference

> Source: `inflow-api-reference (1).json` (OpenAPI 3.1.0 spec, v1.0)

## Base URL

```
https://api.inflowpay.ai/
```

## Authentication

All API requests require an API key passed in the `X-API-Key` header.

```
X-API-Key: <your-private-key>
```

The private key is obtained either from the InFlow dashboard (for sellers/merchants) or from the `POST /v1/users/agentic` response (for agentic users).

## Currencies & Blockchains

InFlow is a **stablecoin payment platform**.

**Supported currencies:** `EURC`, `PYUSD`, `USDC`, `USDT`

**Supported blockchains:** `APTOS`, `BASE`, `SOLANA`, `WORLD`

---

## Endpoints by Tag

### Users

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/users/agentic` | Create an agentic user (returns `privateKey`) |
| `POST` | `/v1/users/search` | Search for a user by `email`, `mobile`, or `username` |
| `GET` | `/v1/users/self` | Get the current authenticated user |

### Requests

The Requests API initiates flows that need consumer approval. All return an `ApprovalResponse` containing a `requestId` and `status`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/requests/login` | Initiate a user login flow |
| `POST` | `/v1/requests/register` | Initiate a user registration flow |
| `POST` | `/v1/requests/payment` | Request a payment transaction |
| `POST` | `/v1/requests/details` | Request user details (email, name, etc.) |
| `POST` | `/v1/requests/policy` | Request policy creation/approval |
| `GET` | `/v1/requests/{requestId}` | Poll a request's current status |

### Approvals

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/approvals` | List approval requests |
| `GET` | `/v1/approvals/{approvalId}` | Get a single approval |

### Policies

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/policies` | List policies |
| `POST` | `/v1/policies` | Create a policy |
| `GET` | `/v1/policies/{policyId}` | Get a policy |
| `PUT` | `/v1/policies/{policyId}` | Update a policy |
| `DELETE` | `/v1/policies/{policyId}/delete` | Delete a policy |

### Transactions

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/transactions` | List transactions |
| `GET` | `/v1/transactions/{transactionId}` | Get a transaction |
| `POST` | `/v1/transactions/send` | Create a send transaction (user-to-user) |
| `POST` | `/v1/transactions/withdraw` | Create a withdrawal transaction |

### Balances

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/balances` | List all currency balances |
| `GET` | `/v1/balances/{currency}` | Get balance for a specific currency |

### Deposit Addresses

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/deposit-addresses` | List deposit addresses |
| `GET` | `/v1/deposit-addresses/{blockchain}` | Get deposit address for a blockchain |
| `POST` | `/v1/deposit-addresses/{blockchain}` | Add a blockchain wallet |
| `POST` | `/v1/deposit-addresses/{blockchain}/currencies/{currency}` | Add a wallet currency |

### Withdrawal Addresses

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/withdrawal-addresses` | List withdrawal addresses |
| `POST` | `/v1/withdrawal-addresses` | Create a withdrawal address |

### Sellers

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/sellers/search` | Search for sellers by name, keywords, address, or email |

### Events (Webhooks)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/events` | List events (webhook delivery log, paginated) |
| `GET` | `/v1/events/{eventId}` | Get a single event |
| `POST` | `/v1/events/{eventId}/resend` | Resend a failed event |

---

## Core Schemas

### PaymentRequest

```json
{
  "userId": "8a5c2948-9e08-439e-a7a6-9f0ee335f566",
  "amount": 99.99,
  "currency": "USDC",
  "display": "FULL",
  "userDetails": ["EMAIL", "NAME"],
  "policyId": "optional-policy-uuid"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `amount` | number (≥0.01) | Yes | Payment amount |
| `currency` | enum | Yes | `EURC`, `PYUSD`, `USDC`, `USDT` |
| `display` | enum | Yes | `FULL` (browser SDK) or `HEADLESS` (server-to-server) |
| `userDetails` | array | Yes | User details to request alongside payment. Enum: `BIRTHDATE`, `DEPOSIT_ADDRESSES`, `EMAIL`, `MOBILE`, `NAME`, `NATIONAL_ID`, `PHYSICAL_ADDRESS`, `USERNAME` |
| `userId` | UUID | No | Buyer's user ID. Optional for some flows. |
| `policyId` | UUID | No | Existing policy that may auto-approve this request |

**Display modes:**
- **`FULL`** — Approver is present at a browser. `inflow.js` SDK presents the popup. Notification sent via mobile app + email + SMS. Email/SMS contains a 6-digit code to enter into the popup.
- **`HEADLESS`** — Approver is agentic or no browser. Notification sent via mobile app + email. Email contains a dashboard link to view/complete the approval (NOT a 6-digit code).

### LoginRequest / RegisterRequest / DetailsRequest

All three share the same shape:

```json
{
  "userId": "8a5c2948-9e08-439e-a7a6-9f0ee335f566",
  "display": "FULL",
  "userDetails": ["EMAIL", "NAME"]
}
```

Required: `display`, `userDetails`. `userId` is the target consumer.

### ApprovalResponse (returned by all `/v1/requests/*` endpoints)

```json
{
  "requestId": "8a5c2948-9e08-439e-a7a6-9f0ee335f566",
  "type": "PAYMENT",
  "status": "PENDING",
  "transactionId": "uuid-when-approved",
  "policyId": "uuid-if-policy-approved",
  "userDetails": ["EMAIL", "NAME"],
  "approvedDetails": { /* actual user details if approved */ }
}
```

**Status values:** `PENDING`, `APPROVED`, `DECLINED`, `EXPIRED`, `CANCELLED`

**Type values:** `LOGIN`, `REGISTER`, `PAYMENT`, `DETAILS`, `POLICY`, `SEND`, `WITHDRAW`

### UserSearchRequest

```json
{
  "email": "user@example.com",
  "mobile": "+15551234567",
  "username": "johndoe"
}
```

All fields optional but at least one must be provided.

- `email` — RFC email format
- `mobile` — E.164 format (10-15 digits, optional `+`)
- `username` — 3-16 alphanumeric / `_-`

Returns `UserSearchResponse`: `{ userId: "uuid" }`

### PolicyResponse

```json
{
  "policyId": "uuid",
  "requesterId": "uuid",
  "type": "PAYMENT",
  "action": "APPROVE",
  "status": "PENDING",
  "currency": "USDC",
  "budget": 1000,
  "spent": 0,
  "threshold": 100,
  "period": "MONTHLY",
  "expires": "2026-01-01T00:00:00.000Z",
  "created": "2025-01-01T00:00:00.000Z"
}
```

> Newly created policies start with `status: "PENDING"`. They transition to `"ACTIVE"` once the consumer approves them (via `POST /v1/requests/policy` flow) or by other backend activation. Use `GET /v1/policies/{policyId}` to check current status before relying on a policy for auto-approval.

| Field | Description |
|---|---|
| `action` | `APPROVE`, `DECLINE`, `REVIEW` |
| `status` | `ACTIVE`, `DISABLED`, `PENDING` |
| `period` | `DAILY`, `MONTHLY`, `YEARLY`, `ONCE` |
| `budget` | Total spending allowance |
| `spent` | Amount used so far |
| `threshold` | Per-transaction cap |

### TransactionResponse

```json
{
  "transactionId": "uuid",
  "approvalId": "uuid",
  "policyId": "uuid",
  "amount": 100,
  "currency": "USDC",
  "blockchain": "SOLANA",
  "status": "PAID",
  "transactionHash": "0xabc...",
  "errorCode": null,
  "created": "2025-01-01T00:00:00.000Z"
}
```

**Status values:** `INITIATED`, `PENDING`, `PAID`, `DEPOSITED`, `WITHDRAWN`, `SENT`, `TRANSFERRED`, `SWAPPED`, `RETURNED`, `REFUNDED`, `INSUFFICIENT_FUNDS`, `GENERAL_ERROR`

### EventResponse (Webhook Payload)

```json
{
  "eventId": "uuid",
  "webhookId": "uuid",
  "type": "TRANSACTION_UPDATED",
  "status": "DELIVERED",
  "data": { /* ApprovalResponse OR TransactionResponse */ },
  "created": "2025-01-01T00:00:00.000Z",
  "delivered": "2025-01-01T00:00:01.000Z"
}
```

**Event types:** `TRANSACTION_CREATED`, `TRANSACTION_UPDATED`

**Delivery status:** `PENDING`, `DELIVERED`, `FAILED`, `DISABLED`

The `data` field is a union — it contains either an `ApprovalResponse` or a `TransactionResponse` depending on the event.

### ErrorMessage

```json
{
  "id": "uuid",
  "errors": [
    {
      "code": "PARAMETER_REQUIRED",
      "message": "A required parameter was missing.",
      "parameter": "email"
    }
  ]
}
```

**Error codes:** `AMOUNT_INVALID`, `APPROVAL_NOT_FOUND`, `INVALID_FORMAT`, `PARAMETER_INVALID`, `PARAMETER_REQUIRED`, `POLICY_NOT_FOUND`, `SELLER_NOT_FOUND`, `TRANSACTION_NOT_FOUND`, `UNEXPECTED_ERROR`, `USER_NOT_FOUND`

> **Note:** `TransactionResponse.errorCode` examples include `INSUFFICIENT_FUNDS` which is NOT in the official enum. Either the example is incorrect or the enum is incomplete.

---

## Approval Flow

All consumer interactions go through the **Approval** abstraction. Every step in the diagram below maps to a real endpoint, schema, or enum value in this spec:

```
Seller calls POST /v1/requests/{login|register|payment|details|policy}
   │
   ▼
InFlow returns ApprovalResponse with requestId + status="PENDING"
   │
   ▼
[FULL mode]                          [HEADLESS mode]
inflow.js renders popup              Consumer notified via mobile/email
Consumer enters 6-digit code         Consumer approves on dashboard or
from email/SMS into popup            mobile app
   │                                    │
   └────────────┬───────────────────────┘
                ▼
        Status transitions to APPROVED
                │
                ▼
        Webhook fired (TRANSACTION_CREATED/UPDATED)
                │
                ▼
        Seller fulfills order
```

For **payment** requests, an approval also creates a `TransactionResponse` (via `transactionId`). Other request types only produce approvals.

---

## See Also

- [overview.md](./overview.md) — Platform overview, currencies, blockchains, approval model
- [flows.md](./flows.md) — Concrete integration flows with code samples
