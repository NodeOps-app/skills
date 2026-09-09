---
name: createos-deploy
description: Deploy code to CreateOS through the NodeOps MPP Gateway. Use when a user wants to ship an application, inspect a CreateOS payment quote, pay with USDC through native MPP or x402, or check a deployment created by the gateway.
metadata:
  short-description: Deploy applications through MPP
---

# Deploy to CreateOS

Use the gateway's wallet-authenticated HTTP flow. No browser session or OAuth is required.

Default gateway: `https://mpp-createos.nodeops.network`

Prefer the bundled script because it preserves the exact deployment body across the payment retry, filters secrets from uploads, uses fresh auth nonces, and verifies the final endpoint.

```bash
cd path/to/createos-deploy
bun install

# Inspect the 402 and stop before signing a payment.
bun run deploy -- --dir /path/to/project --name my-app --port 3000

# Pay the selected native MPP offer and deploy.
bun run deploy -- --dir /path/to/project --name my-app --port 3000 --chain arbitrum --yes

# Select x402 instead. It must be advertised by the gateway for that chain.
bun run deploy -- --dir /path/to/project --name my-app --port 3000 --chain bsc --protocol x402 --yes
```

Provide `PRIVATE_KEY` in the process environment or in a `.env` beside this skill. Never place it in the project being uploaded. Set `CREATEOS_GATEWAY` to test another gateway.

## Safety boundaries

- Inspect the application source and determine its actual listening port before deploying. Do not trust stale deployment metadata.
- Unique project names are global across the platform, not per wallet. Always append a random suffix to the name, which the bundled script does for you. `GET /agent/projects` only lists your own projects, so it cannot detect a name another account holds.
- A `5xx` on `POST /agent/deploy` is usually that collision rather than a gateway outage. Treat it as a name conflict first and retry with a fresh suffix; the gateway does not return `409` for names held by other accounts.
- The first `POST /agent/deploy` may immediately deploy when the wallet has enough unused credits. Quote-only mode prevents a new payment, but it cannot prevent this credit-funded behavior because the API has no separate quote endpoint.
- Without `--yes`, stop after presenting the selected protocol, network, recipient, and USDC amount.
- Treat the runtime `402` headers as authoritative. Do not hard-code a default payment chain from discovery metadata.
- Never submit both `Authorization: Payment ...` and `PAYMENT-SIGNATURE`.
- After submitting a payment credential, never create and submit a second credential merely to recover from an error. Surface the receipt or challenge and transaction reference when available. A retry without payment headers is safe when credits may already exist.
- Confirm with the user immediately before deleting a project. Deletion is irreversible.

## Payment behavior

Native MPP is the default protocol:

- Base, Arbitrum, and Arbitrum Sepolia use EIP-3009 USDC authorization. The agent signs an authorization; the gateway's settler broadcasts it and pays gas.
- BSC uses Binance B402 Permit2 Exact. The payment is gasless after the wallet has approved USDC to canonical Permit2. The script uses a bounded approval equal to the current payment amount; approval itself requires BNB gas.

x402 is optional:

- A chain is payable through x402 only when it appears in `PAYMENT-REQUIRED.accepts`.
- Base and Arbitrum-family x402 offers use EIP-3009.
- BSC x402 uses Binance B402 Permit2 Exact.
- x402 `amount` values are atomic token units. The wire schema does not carry `decimals`; use trusted local asset metadata.

The gateway currently models USDC on all supported chains. Always accept only a known chain ID and exact known token contract.

## Deployment workflow

1. Inspect the project, determine `port`, and validate the project name before any deploy request. Append a random suffix to the unique name; keep the clean name as the display name.
2. Use `GET /agent/projects` to detect an existing name and show active projects whose runtime could be affected by shared credits. This check covers your wallet only, so the suffix stays mandatory.
3. Send `POST /agent/deploy` with fresh wallet-auth headers and no payment credential.
4. If it returns `200`, deployment has already started using credits.
5. If it returns `402`, inspect `WWW-Authenticate` for native MPP and `PAYMENT-REQUIRED` for x402. Select only the user-approved protocol and an advertised chain with sufficient USDC.
6. Create one credential and retry the identical body with either `Authorization` or `PAYMENT-SIGNATURE`.
7. Preserve `Payment-Receipt` and `PAYMENT-RESPONSE` values in error reporting.
8. Poll the owned deployment every five seconds until `ready` or `failed`, with a fresh auth nonce each time.
9. Wait before fetching the endpoint. `ready` is the platform's status, not the container's: the app still has to boot and bind the port, so the first probes routinely return `404` or refuse the connection. Probe every ten seconds for up to two minutes and only judge the port after that. A `404` that survives the whole window can be the app's real answer at `/`; no answer at all points at the wrong `--port`.

Read [references/api.md](references/api.md) when implementing the flow without the bundled script or diagnosing a gateway response.
