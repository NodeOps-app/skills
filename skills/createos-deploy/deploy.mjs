#!/usr/bin/env node
// Deploy a directory to CreateOS through the MPP Gateway.
//
// Usage:
//   node deploy.mjs --dir . --name my-app --port 8080          # quote only, no payment
//   node deploy.mjs --dir . --name my-app --port 8080 --yes    # quote, pay, deploy
//
// Safe by default: without --yes the script stops after the quote and prints
// the price. Nothing leaves the wallet until --yes is passed.

import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, createPublicClient, http } from "viem";
import { arbitrum, base } from "viem/chains";

const GATEWAY = process.env.CREATEOS_GATEWAY ?? "https://mpp-createos.nodeops.network";

// Only these chains are accepted. Testnets are not supported.
const CHAINS = { arbitrum, base };
const TOKENS = {
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
];

// Never upload these, whatever git reports. The wallet key that pays for the
// deploy often sits in .env inside the very directory being deployed.
const SECRET_PATTERNS = [
  /(^|\/)\.env($|\.)/,
  /\.(pem|key|p12|pfx|keystore|jks)$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)($|\.)/,
  /(^|\/)credentials(\.json)?$/i,
  /(^|\/)\.npmrc$/,
  /(^|\/)\.git-credentials$/,
];

// Agent and editor tooling is tracked in many repos but is never part of the
// running app. Left in, it can quietly add hundreds of files to the upload.
const TOOLING_PATTERNS = [
  /(^|\/)\.(agents|claude|cursor|opencode|windsurf|aider|vscode|idea)(\/|$)/,
  /(^|\/)skills-lock\.json$/,
];

const MAX_UPLOAD_BYTES = 45 * 1024 * 1024; // gateway caps the JSON body at 50 MB

function fail(code, message) {
  console.error(`ERROR: ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const out = { dir: ".", yes: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--yes") out.yes = true;
    else if (a === "--dir") out.dir = argv[++i];
    else if (a === "--name") out.name = argv[++i];
    else if (a === "--display-name") out.displayName = argv[++i];
    else if (a === "--port") out.port = Number(argv[++i]);
    else if (a === "--use-existing-credits") out.useExistingCredits = true;
    else fail(1, `unknown argument: ${a}`);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const dir = resolve(args.dir);

// --port is required on purpose. A wrong port is only visible after payment:
// the deploy reports "ready" and the endpoint answers nothing.
if (!args.name) fail(1, "--name is required (4-32 chars, globally unique on CreateOS)");
if (!Number.isInteger(args.port) || args.port < 1 || args.port > 65535) {
  fail(1, "--port is required and must be 1-65535. It must match the port the app listens on.");
}

const displayName = args.displayName ?? args.name;
if (args.name.length < 4 || args.name.length > 32) fail(1, "--name must be 4-32 characters");
if (displayName.length < 4 || displayName.length > 100) {
  fail(1, "--display-name must be 4-100 characters");
}

// Private key: env first, then .env in the deploy directory, then .env beside
// this script. The key is never part of the upload.
function loadPrivateKey() {
  const fromEnv = process.env.PRIVATE_KEY;
  if (fromEnv) return fromEnv;
  for (const candidate of [join(dir, ".env"), join(import.meta.dirname, ".env")]) {
    if (!existsSync(candidate)) continue;
    const line = readFileSync(candidate, "utf8")
      .split("\n")
      .find((l) => l.trim().startsWith("PRIVATE_KEY="));
    if (line)
      return line
        .trim()
        .slice("PRIVATE_KEY=".length)
        .replace(/^["']|["']$/g, "");
  }
  return null;
}

let pk = loadPrivateKey();
if (!pk) fail(1, "no PRIVATE_KEY found in the environment or in a .env file");
if (!pk.startsWith("0x")) pk = `0x${pk}`;

const account = privateKeyToAccount(pk);
console.log(`Wallet:  ${account.address}`);
console.log(`Project: ${args.name} (port ${args.port})`);

// Fresh nonce and timestamp on every request, including each status poll.
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

// git ls-files gives the tracked set: it honours .gitignore and skips .git/,
// node_modules/, and build output without a hand-written exclude list.
function collectFiles() {
  let listed;
  try {
    listed = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      cwd: dir,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    fail(1, `${dir} is not a git repository. Run "git init" there, or deploy a git checkout.`);
  }

  const paths = listed.toString("utf8").split("\0").filter(Boolean);
  const skipped = [];
  const files = [];
  let tooling = 0;
  let bytes = 0;

  for (const path of paths) {
    if (SECRET_PATTERNS.some((re) => re.test(path))) {
      skipped.push(path);
      continue;
    }
    if (TOOLING_PATTERNS.some((re) => re.test(path))) {
      tooling++;
      continue;
    }
    const content = readFileSync(join(dir, path)).toString("base64");
    bytes += content.length;
    files.push({ path, content });
  }

  if (skipped.length) console.log(`Excluded as secrets: ${skipped.join(", ")}`);
  if (tooling) console.log(`Excluded ${tooling} agent or editor tooling files`);
  if (!files.length) fail(1, "no files to upload");
  if (bytes > MAX_UPLOAD_BYTES) {
    fail(1, `upload is ${(bytes / 1024 / 1024).toFixed(1)} MB base64, over the 50 MB request cap`);
  }
  console.log(`Upload:  ${files.length} files, ${(bytes / 1024).toFixed(0)} KB base64`);
  return files;
}

const body = {
  uniqueName: args.name,
  displayName,
  settings: { port: args.port },
  upload: { type: "files", files: collectFiles() },
};

const post = (headers) =>
  fetch(`${GATEWAY}/agent/deploy`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

// Show the wallet's other projects. Deploying on shared credits shortens their
// runtime, so the operator must see what is at stake before choosing.
async function listProjects() {
  const res = await fetch(`${GATEWAY}/agent/projects`, { headers: await auth() });
  if (!res.ok) return null;
  return (await res.json()).projects ?? [];
}

const projects = await listProjects();
if (projects?.length) {
  const active = projects.filter((p) =>
    ["active", "building", "deploying", "pending", "queued", "promoting"].includes(p.status),
  );
  console.log(`Existing projects: ${projects.length} (${active.length} active)`);
  for (const p of active) console.log(`  - ${p.name} [${p.status}] ${p.url ?? ""}`);
  if (projects.some((p) => p.name === args.name)) {
    console.log(`NOTE: a project named "${args.name}" already exists on this wallet.`);
  }
}

console.log("\nStep 1: asking the gateway for a quote...");
const first = await post(await auth());
const quote = await first.json();

let projectId, deploymentId;

if (first.status === 200) {
  ({ projectId, deploymentId } = quote);
  console.log("Deployed on existing credits. No payment was needed.");
  if (quote.message) console.log(`Note: ${quote.message}`);
} else if (first.status !== 402) {
  fail(1, `unexpected ${first.status}: ${JSON.stringify(quote)}`);
} else {
  if (quote.warning) console.log(`WARNING: ${quote.warning}`);

  const chainName = quote.payment_chain;
  const tokenName = quote.token;
  const chain = CHAINS[chainName];
  if (!chain) fail(1, `unsupported chain from gateway: ${chainName}`);

  console.log(
    `\nPrice: ${quote.amount_usd} USD (${quote.amount_token} raw ${tokenName}) on ${chainName}`,
  );

  const bal = await (
    await fetch(`${GATEWAY}/agent/balance/${account.address}?chain=${chainName}`)
  ).json();
  const token = bal.balances.find((b) => b.token === tokenName);

  if (!token || BigInt(token.balance_raw) < BigInt(quote.amount_token)) {
    const chains = await (await fetch(`${GATEWAY}/agent/chains`)).json();
    console.error(
      `\nINSUFFICIENT FUNDS. Wallet ${account.address} needs ` +
        `${quote.amount_usd} ${token?.symbol ?? "USDC"} on ${chainName}.`,
    );
    console.error(`Fundable chains: ${chains.chains.map((c) => c.chain).join(", ")}`);
    process.exit(2);
  }

  console.log(`Balance: ${token.balance} ${token.symbol} on ${chainName}`);

  if (!args.yes) {
    console.log(
      `\nStopping before payment. Re-run with --yes to pay ${quote.amount_usd} USD and deploy.`,
    );
    process.exit(0);
  }

  // Pay and submit back to back. The price is re-derived on the next call from
  // a 5-minute cache. A price rise in between fails verification on money that
  // already left the wallet.
  console.log("\nStep 2: paying...");
  const walletClient = createWalletClient({ account, chain, transport: http() });
  const publicClient = createPublicClient({ chain, transport: http() });

  const txHash = await walletClient.writeContract({
    address: TOKENS[chainName][tokenName],
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [quote.pay_to, BigInt(quote.amount_token)],
  });
  console.log(`Payment tx: ${txHash}`);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log("Payment confirmed on chain.");

  console.log("\nStep 3: submitting the deploy with payment proof...");
  const paid = await post({
    ...(await auth()),
    "X-Payment-Tx": txHash,
    "X-Payment-Chain": chainName,
    "X-Payment-Token": tokenName,
  });

  if (paid.status === 200) {
    ({ projectId, deploymentId } = await paid.json());
  } else if (paid.status === 500 || paid.status === 409) {
    // The credits are on CreateOS. Retry without payment headers. Never pay twice.
    console.log("Credits landed but the deploy failed. Retrying on those credits...");
    const retry = await post({ ...(await auth()), "X-Use-Existing-Credits": "true" });
    if (retry.status !== 200) {
      fail(
        3,
        `paid in ${txHash} but the deploy failed. Do not pay again. ` +
          `${retry.status}: ${await retry.text()}`,
      );
    }
    ({ projectId, deploymentId } = await retry.json());
  } else {
    fail(
      3,
      `paid in ${txHash} but the gateway returned ${paid.status}: ${await paid.text()}. ` +
        `Do not pay again. Report this transaction hash.`,
    );
  }
}

console.log(`\nProject ${projectId}, deployment ${deploymentId}`);
console.log("Step 4: polling the deploy status...");

// 5s interval stays well inside the 30 requests per minute limit.
const deadline = Date.now() + 10 * 60_000;
let endpoint = null;

while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 5000));
  const res = await fetch(`${GATEWAY}/agent/deploy/${projectId}/${deploymentId}/status`, {
    headers: await auth(),
  });
  const d = await res.json();
  console.log(`  ${d.status} ${d.deployment_status ?? ""}`);
  if (d.status === "ready") {
    endpoint = d.endpoint ?? null;
    break;
  }
  if (d.status === "failed") fail(4, `deploy failed: ${d.reason}`);
}

if (!endpoint) {
  if (Date.now() >= deadline) fail(5, "timed out after 10 minutes waiting for the deploy");
  console.log('Status is "ready" but the gateway reported no endpoint.');
  process.exit(0);
}

// "ready" is the gateway's opinion. Confirm the app actually answers. A wrong
// --port reaches this point looking healthy and serves nothing.
console.log(`\nStep 5: checking ${endpoint} ...`);
try {
  const probe = await fetch(endpoint, { signal: AbortSignal.timeout(15000) });
  console.log(`HTTP ${probe.status} from ${endpoint}`);
  if (probe.status >= 500) {
    console.log(`The app returned ${probe.status}. Check that --port ${args.port} is correct.`);
    process.exit(6);
  }
} catch (err) {
  console.error(`No response from ${endpoint}: ${err.message}`);
  console.error(`Check that --port ${args.port} matches the port the app listens on.`);
  process.exit(6);
}

console.log(`\nLIVE: ${endpoint}`);
