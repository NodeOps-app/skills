# InFlow — Overview

## What InFlow Is

InFlow is a stablecoin payment platform. Sellers (merchants, agents) request payments from consumers. Consumers approve via a separate device (mobile app, email, SMS), and settlements happen on-chain.

Consumers can configure **policies** that auto-approve requests within certain limits — enabling 0-click flows for autonomous agents and recurring use cases.

## Base URL

```
https://api.inflowpay.ai/
```

## Authentication

All API requests require an API key in the `X-API-Key` header.

```
X-API-Key: <your-private-key>
```

API keys come from:
- The InFlow dashboard (for sellers/merchants)
- `POST /v1/users/agentic` response (for agentic users — programmatic accounts)

## Currencies

InFlow only handles **stablecoins**. There is no fiat support in the spec.

| Code | Stablecoin |
|---|---|
| `USDC` | USD Coin |
| `USDT` | Tether USD |
| `EURC` | Euro Coin |
| `PYUSD` | PayPal USD |

## Blockchains

Settlements happen on-chain. Supported networks:

- `APTOS`
- `BASE`
- `SOLANA`
- `WORLD`

## Core Abstraction: Approvals

Every consumer interaction in InFlow is an **approval request**. This is the universal abstraction.

```
Seller calls one of:
  POST /v1/requests/login     — ask consumer to log in
  POST /v1/requests/register  — ask consumer to register
  POST /v1/requests/payment   — ask consumer to pay
  POST /v1/requests/details   — ask consumer for personal info
  POST /v1/requests/policy    — ask consumer to create a policy
                  │
                  ▼
       InFlow returns ApprovalResponse
       { requestId, status: PENDING, type, ... }
                  │
                  ▼
   Consumer notified out-of-band (mobile app + email + SMS)
                  │
                  ▼
         Consumer approves or declines
                  │
                  ▼
   ApprovalResponse.status transitions to one of:
   APPROVED | DECLINED | EXPIRED | CANCELLED
                  │
                  ▼
       Webhook fires (TRANSACTION_CREATED / TRANSACTION_UPDATED)
       OR
       Seller polls GET /v1/requests/{requestId}
```

For payment requests, an approved request also produces a `TransactionResponse` (referenced by `transactionId` on the approval).

## Display Modes

Every request specifies a `display` mode that controls how the consumer is notified:

| Mode | When to use | Notification | Code entry |
|---|---|---|---|
| `FULL` | Browser is open with `inflow.js` SDK | Mobile app + email + SMS | 6-digit code from email/SMS into the popup |
| `HEADLESS` | Server-to-server, agentic, or no browser | Mobile app + email | Email contains a dashboard link, no code |

## Two Integration Shapes

### 1. Headed (Browser + SDK)

The seller embeds `inflow.js` on a checkout page. The seller's backend calls a request endpoint with `display: FULL` and gets a `requestId`. The frontend hands the `requestId` to the SDK, which renders a popup. The consumer enters the 6-digit code from email/SMS into the popup. The SDK reports status via callback, and the seller backend listens for the webhook to confirm settlement.

### 2. Headless (Server-to-Server)

The seller's backend calls a request endpoint with `display: HEADLESS`. If a matching `policyId` auto-approves the request, the transaction settles immediately with no consumer interaction. Otherwise the consumer is notified via mobile/email and approves on the dashboard. Either way, the seller listens for the webhook to know when the transaction completes.

## Policies

Policies are pre-approved spending rules that allow `HEADLESS` requests to auto-approve without consumer interaction. Created via `POST /v1/policies` or via the consumer-facing `POST /v1/requests/policy` flow.

```json
{
  "type": "PAYMENT",
  "action": "APPROVE",
  "currency": "USDC",
  "budget": 1000,        // total allowance
  "threshold": 100,       // per-transaction max
  "period": "MONTHLY",    // DAILY | MONTHLY | YEARLY | ONCE
  "expires": "2026-12-31T00:00:00.000Z"
}
```

When a payment request includes a `policyId` and the request is within budget/threshold, it auto-approves. If exceeded, it falls back to manual approval via mobile.

## What Sellers Build

Minimum integration is two operations:

1. **Initiate** — call the appropriate `POST /v1/requests/*` endpoint for your flow
2. **React** — listen for webhooks (or poll `GET /v1/requests/{requestId}`) to know the outcome

That's it. InFlow handles consumer notification, approval routing, on-chain settlement, and event delivery.

## See Also

- [flows.md](./flows.md) — Concrete integration flows (login, payment, headless, webhooks)
- [api-reference.md](./api-reference.md) — Full endpoint and schema reference
