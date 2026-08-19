# Complete Example

Deploy to CreateOS with plain `fetch` + `viem`. No extra dependency beyond `viem`.

This handles all four gateway responses: free deploy on credits, pay-first,
credit-sharing warning, and post-payment recovery.

```ts
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, createPublicClient, http } from "viem";
import { arbitrum, base } from "viem/chains";
import { randomUUID } from "node:crypto";

const GATEWAY = "https://mpp-createos.nodeops.network";
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

// Only these chains are accepted. Testnets are NOT supported.
const CHAINS = { arbitrum, base } as const;
const TOKENS: Record<string, Record<string, `0x${string}`>> = {
  arbitrum: {
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    usdt: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
  },
  base: {
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    usdt: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
  },
};

const ERC20_ABI = [
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
] as const;

// Fresh nonce + timestamp on EVERY request, including each poll.
const auth = async () => {
  const nonce = randomUUID();
  const timestamp = String(Date.now());
  const signature = await account.signMessage({
    message: `${account.address}:${timestamp}:${nonce}`,
  });
  return {
    "X-Wallet-Address": account.address,
    "X-Signature": signature,
    "X-Timestamp": timestamp,
    "X-Nonce": nonce,
  };
};

// uniqueName: 4-32 chars. displayName: 4-100 chars. Validate BEFORE paying —
// the backend rejects bad names only after the payment step.
const body = {
  uniqueName: `app-${Date.now()}`.slice(0, 32),
  displayName: "My App",
  settings: { port: 3000 }, // must match the port your app listens on
  upload: {
    type: "files",
    files: [
      {
        path: "index.js",
        content: btoa(
          'require("http").createServer((q,s)=>s.end("ok")).listen(3000)',
        ),
      },
      { path: "package.json", content: btoa('{"name":"app"}') },
    ],
  },
};

if (body.uniqueName.length < 4 || body.displayName.length < 4) {
  throw new Error("uniqueName and displayName must be at least 4 characters");
}

const post = (headers: Record<string, string>) =>
  fetch(`${GATEWAY}/agent/deploy`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

// 1. First call, no payment. The gateway decides free-deploy vs 402.
const first = await post(await auth());
const quote = await first.json();

let projectId: string, deploymentId: string;

if (first.status === 200) {
  // Case A/B: wallet has credits, deployed for free.
  ({ projectId, deploymentId } = quote);
  if (quote.message?.includes("reduce runtime")) console.warn(quote.message);
} else if (first.status !== 402) {
  throw new Error(`Unexpected ${first.status}: ${JSON.stringify(quote)}`);
} else {
  // Case C/D: payment required. quote.warning is set when credits exist but
  // active projects would have their runtime cut short.
  if (quote.warning) console.warn(quote.warning);

  const chainName: string = quote.payment_chain;
  const tokenName: string = quote.token;
  const chain = CHAINS[chainName as keyof typeof CHAINS];
  if (!chain) throw new Error(`Unsupported chain from gateway: ${chainName}`);

  // 2. Confirm the wallet can actually pay before sending anything.
  const bal = await (
    await fetch(`${GATEWAY}/agent/balance/${account.address}?chain=${chainName}`)
  ).json();
  const token = bal.balances.find((b: any) => b.token === tokenName);
  if (!token || BigInt(token.balance_raw) < BigInt(quote.amount_token)) {
    // Show the user every funding option before stopping.
    const chains = await (await fetch(`${GATEWAY}/agent/chains`)).json();
    throw new Error(
      `Wallet ${account.address} needs $${quote.amount_usd} ${token?.symbol ?? "USDC"} ` +
        `on one of: ${chains.chains.map((c: any) => c.chain).join(", ")}`,
    );
  }

  // 3. Pay. Do this promptly — the quote is re-derived on the next call and
  //    the price can move, which would fail verification after funds moved.
  const walletClient = createWalletClient({ account, chain, transport: http() });
  const publicClient = createPublicClient({ chain, transport: http() });

  const txHash = await walletClient.writeContract({
    address: TOKENS[chainName][tokenName],
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [quote.pay_to as `0x${string}`, BigInt(quote.amount_token)],
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  // 4. Submit the proof. Never re-send the payment if this step fails.
  const paid = await post({
    ...(await auth()),
    "X-Payment-Tx": txHash,
    "X-Payment-Chain": chainName,
    "X-Payment-Token": tokenName,
  });

  if (paid.status === 200) {
    ({ projectId, deploymentId } = await paid.json());
  } else if (paid.status === 500 || paid.status === 409) {
    // Credits are already on CreateOS. Retry WITHOUT the payment headers.
    const retry = await post({
      ...(await auth()),
      "X-Use-Existing-Credits": "true",
    });
    if (retry.status !== 200) {
      throw new Error(
        `Paid in ${txHash} but deploy failed. Keep this tx hash — do not pay again. ` +
          `${retry.status}: ${await retry.text()}`,
      );
    }
    ({ projectId, deploymentId } = await retry.json());
  } else {
    throw new Error(
      `Paid in ${txHash} but gateway returned ${paid.status}: ${await paid.text()}. ` +
        `Do not pay again — report this tx hash.`,
    );
  }
}

// 5. Poll. 5s interval stays well inside the 30 req/min limit.
const deadline = Date.now() + 10 * 60_000;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 5000));
  const s = await fetch(
    `${GATEWAY}/agent/deploy/${projectId}/${deploymentId}/status`,
    { headers: await auth() },
  );
  const d = await s.json();
  if (d.status === "ready") {
    console.log(`Live: ${d.endpoint}`);
    break;
  }
  if (d.status === "failed") throw new Error(d.reason);
}
```

## With zip

Replace `upload` in the body. The whole JSON request must stay under 50 MB, and
base64 grows the payload by ~33%.

```ts
import { readFileSync } from "node:fs";

upload: {
  type: "zip",
  data: readFileSync("code.zip").toString("base64"),
  filename: "code.zip",
}
```

## Generate a wallet

```ts
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const privateKey = generatePrivateKey();
console.log(privateKey, privateKeyToAccount(privateKey).address);
```

Store the private key outside the project directory and never include it in an
upload.
