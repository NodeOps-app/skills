#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  B402_PERMIT2_ADDRESS,
  CURATED_B402_SPENDERS,
  buildPermit2ExactPayment,
} from "@bnb-chain/b402";
import { B402Permit2ApprovalRequiredError } from "@bnb-chain/b402/client";
import { b402 } from "@bnb-chain/mpp-b402/client";
import { Challenge, Receipt, x402 } from "mppx";
import { Mppx, evm } from "mppx/client";
import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  formatEther,
  formatUnits,
  getAddress,
  http,
} from "viem";
import { arbitrum, arbitrumSepolia, base, bsc } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const GATEWAY = (process.env.CREATEOS_GATEWAY ?? "https://mpp-createos.nodeops.network").replace(/\/$/, "");
const NETWORK_PREFIX = "eip155:";
const ACTIVE_STATUSES = new Set(["active", "building", "deploying", "pending", "queued", "promoting"]);
const MAX_UPLOAD_BYTES = 45 * 1024 * 1024;

const CHAINS = {
  arbitrum: {
    chain: arbitrum,
    decimals: 6,
    network: "eip155:42161",
    rpcEnv: "RPC_URL_ARBITRUM",
    token: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    transfer: "eip3009",
  },
  "arbitrum-sepolia": {
    chain: arbitrumSepolia,
    decimals: 6,
    network: "eip155:421614",
    rpcEnv: "RPC_URL_ARBITRUM_SEPOLIA",
    token: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    transfer: "eip3009",
  },
  base: {
    chain: base,
    decimals: 6,
    network: "eip155:8453",
    rpcEnv: "RPC_URL_BASE",
    token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    transfer: "eip3009",
  },
  bsc: {
    chain: bsc,
    decimals: 18,
    network: "eip155:56",
    rpcEnv: "RPC_URL_BSC",
    token: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    transfer: "permit2-exact",
  },
};

const SECRET_PATTERNS = [
  /(^|\/)\.env($|\.)/i,
  /\.(pem|key|p12|pfx|keystore|jks)$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)($|\.)/i,
  /(^|\/)credentials(\.json)?$/i,
  /(^|\/)wallet(\.json)?$/i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)\.git-credentials$/i,
];

const TOOLING_PATTERNS = [
  /(^|\/)\.(agents|claude|codex|cursor|opencode|windsurf|aider|vscode|idea)(\/|$)/i,
  /(^|\/)skills-lock\.json$/i,
];

const HELP = `CreateOS MPP deploy

Usage:
  node scripts/deploy.mjs --dir <project> --name <unique-name> --port <port> [options]

A random suffix is always appended to --name because unique names are global
across the platform. --display-name keeps the name you passed.

Options:
  --chain <name>          arbitrum | arbitrum-sepolia | base | bsc
  --protocol <name>       mpp (default) | x402
  --display-name <name>   Defaults to --name
  --description <text>    Optional project description
  --months <number>       Positive integer, defaults to 1
  --dockerfile            Build the Dockerfile at the upload root
  --use-existing-credits  Opt into sharing credits with active projects
  --yes                   Authorize one payment and any required bounded BSC approval
  --help                   Show this message

Environment:
  PRIVATE_KEY             EVM wallet private key
  CREATEOS_GATEWAY        Gateway URL override
  RPC_URL_ARBITRUM, RPC_URL_ARBITRUM_SEPOLIA, RPC_URL_BASE, RPC_URL_BSC
                          Optional RPC overrides for balances and BSC approval
  B402_TRUSTED_SPENDER_BSC  Optional trusted B402 spender override
`;

function fail(message, code = 1) {
  console.error(`ERROR: ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = { dir: ".", months: 1, protocol: "mpp", yes: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help") args.help = true;
    else if (value === "--yes") args.yes = true;
    else if (value === "--dockerfile") args.dockerfile = true;
    else if (value === "--use-existing-credits") args.useExistingCredits = true;
    else if (value === "--dir") args.dir = argv[++index];
    else if (value === "--name") args.name = argv[++index];
    else if (value === "--port") args.port = Number(argv[++index]);
    else if (value === "--chain") args.chain = argv[++index];
    else if (value === "--protocol") args.protocol = argv[++index];
    else if (value === "--display-name") args.displayName = argv[++index];
    else if (value === "--description") args.description = argv[++index];
    else if (value === "--months") args.months = Number(argv[++index]);
    else fail(`Unknown argument: ${value}`);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(HELP);
  process.exit(0);
}

if (!args.name || args.name.length < 4 || args.name.length > 32) {
  fail("--name is required and must contain 4-32 characters");
}
if (!Number.isInteger(args.port) || args.port < 1 || args.port > 65535) {
  fail("--port is required and must be between 1 and 65535");
}
if (!Number.isInteger(args.months) || args.months < 1) {
  fail("--months must be a positive integer");
}
if (!new Set(["mpp", "x402"]).has(args.protocol)) {
  fail("--protocol must be mpp or x402");
}
if (args.chain && !CHAINS[args.chain]) {
  fail(`Unsupported --chain ${args.chain}. Choose: ${Object.keys(CHAINS).join(", ")}`);
}

const displayName = args.displayName ?? args.name;
if (displayName.length < 4 || displayName.length > 100) {
  fail("--display-name must contain 4-100 characters");
}

// Unique names are global across the platform, and a name another account holds
// fails as an opaque 5xx instead of a 409, so never send the bare name.
const suffix = randomBytes(3).toString("hex");
args.name = `${args.name.slice(0, 32 - suffix.length - 1).replace(/-+$/, "")}-${suffix}`;
if (args.description && (args.description.length < 4 || args.description.length > 2048)) {
  fail("--description must contain 4-2048 characters when provided");
}

const projectDir = resolve(args.dir);
const scriptDir = dirname(fileURLToPath(import.meta.url));

function dotenvPrivateKey(path) {
  if (!existsSync(path)) return undefined;
  const line = readFileSync(path, "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith("PRIVATE_KEY="));
  return line?.trim().slice("PRIVATE_KEY=".length).replace(/^['"]|['"]$/g, "");
}

let privateKey = process.env.PRIVATE_KEY ?? dotenvPrivateKey(resolve(scriptDir, "..", ".env"));
if (!privateKey) fail("Set PRIVATE_KEY in the environment or in the skill's .env file");
if (!privateKey.startsWith("0x")) privateKey = `0x${privateKey}`;
if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) fail("PRIVATE_KEY is not a 32-byte EVM private key");

const account = privateKeyToAccount(privateKey);

function collectFiles() {
  let listed;
  try {
    listed = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      cwd: projectDir,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    fail(`${projectDir} must be a git repository`);
  }

  const skippedSecrets = [];
  let skippedTooling = 0;
  let skippedLinks = 0;
  let encodedBytes = 0;
  const files = [];

  for (const path of listed.toString("utf8").split("\0").filter(Boolean)) {
    if (path.startsWith("../") || resolve(projectDir, path).startsWith(`${projectDir}/`) === false) {
      fail(`Refusing upload path outside the project: ${path}`);
    }
    if (SECRET_PATTERNS.some((pattern) => pattern.test(path))) {
      skippedSecrets.push(path);
      continue;
    }
    if (TOOLING_PATTERNS.some((pattern) => pattern.test(path))) {
      skippedTooling += 1;
      continue;
    }
    const fullPath = join(projectDir, path);
    const stat = lstatSync(fullPath);
    if (!stat.isFile()) {
      skippedLinks += 1;
      continue;
    }
    const content = readFileSync(fullPath).toString("base64");
    encodedBytes += Buffer.byteLength(content);
    files.push({ path, content });
  }

  if (skippedSecrets.length) console.log(`Excluded secrets: ${skippedSecrets.join(", ")}`);
  if (skippedTooling) console.log(`Excluded ${skippedTooling} agent/editor tooling files`);
  if (skippedLinks) console.log(`Excluded ${skippedLinks} symlinks or non-files`);
  if (!files.length) fail("No deployable files found");
  if (encodedBytes > MAX_UPLOAD_BYTES) {
    fail(`Base64 upload is ${(encodedBytes / 1024 / 1024).toFixed(1)} MB; keep it below 45 MB`);
  }
  console.log(`Upload: ${files.length} files, ${(encodedBytes / 1024).toFixed(0)} KB base64`);
  return files;
}

const body = {
  uniqueName: args.name,
  displayName,
  ...(args.description ? { description: args.description } : {}),
  months: args.months,
  settings: {
    port: args.port,
    hasDockerfile: Boolean(args.dockerfile),
    useBuildAI: !args.dockerfile,
  },
  upload: { type: "files", files: collectFiles() },
};
const bodyJson = JSON.stringify(body);
if (Buffer.byteLength(bodyJson) >= 50 * 1024 * 1024) fail("Serialized deployment request exceeds 50 MB");

async function auth() {
  const nonce = randomUUID();
  const timestamp = String(Date.now());
  return {
    "X-Wallet-Address": account.address,
    "X-Signature": await account.signMessage({ message: `${account.address}:${timestamp}:${nonce}` }),
    "X-Timestamp": timestamp,
    "X-Nonce": nonce,
  };
}

async function post(extraHeaders = {}) {
  return fetch(`${GATEWAY}/agent/deploy`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await auth()), ...extraHeaders },
    body: bodyJson,
  });
}

async function readBody(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function chainFor(network, asset) {
  const config = Object.entries(CHAINS).find(([, candidate]) =>
    candidate.network === network && candidate.token.toLowerCase() === asset.toLowerCase(),
  );
  return config ? { name: config[0], ...config[1] } : undefined;
}

function nativeOffers(response) {
  return Challenge.fromResponseList(response).flatMap((challenge) => {
    const request = challenge.request;
    const network = challenge.method === "evm"
      ? `${NETWORK_PREFIX}${request.methodDetails?.chainId}`
      : request.methodDetails?.network;
    const chain = typeof network === "string" && typeof request.currency === "string"
      ? chainFor(network, request.currency)
      : undefined;
    if (!chain) return [];
    return [{
      amount: request.amount,
      asset: request.currency,
      challenge,
      chain,
      method: challenge.method,
      protocol: "mpp",
      recipient: request.recipient,
    }];
  });
}

function x402Offers(response) {
  const encoded = response.headers.get("payment-required");
  if (!encoded) return [];
  const paymentRequired = x402.Header.decodePaymentRequired(encoded);
  return paymentRequired.accepts.flatMap((requirements) => {
    const chain = chainFor(requirements.network, requirements.asset);
    return chain ? [{
      amount: requirements.amount,
      asset: requirements.asset,
      chain,
      paymentRequired,
      protocol: "x402",
      recipient: requirements.payTo,
      requirements,
    }] : [];
  });
}

function clientFor(offer, permit2Allowance) {
  if (offer.chain.transfer === "permit2-exact") {
    const trustedSpender = process.env.B402_TRUSTED_SPENDER_BSC
      ?? CURATED_B402_SPENDERS[offer.chain.network]?.exact;
    if (!trustedSpender) fail(`No trusted B402 spender is configured for ${offer.chain.network}`);
    return Mppx.create({
      methods: [b402.charge({
        account,
        allowedCurrencies: [{
          address: offer.chain.token,
          decimals: offer.chain.decimals,
          network: offer.chain.network,
        }],
        allowedNetworks: [offer.chain.network],
        maxAtomicAmount: offer.amount,
        methods: ["permit2-exact"],
        permit2Allowance,
        trustedSpenders: { [offer.chain.network]: [getAddress(trustedSpender)] },
      })],
      polyfill: false,
    });
  }
  return Mppx.create({
    methods: [evm({
      account,
      authorization: { name: "USD Coin", version: "2" },
      currencies: [offer.chain.token],
      decimals: offer.chain.decimals,
      maxAtomicAmount: offer.amount,
      networks: [offer.chain.chain.id],
    })],
    polyfill: false,
  });
}

function publicClientFor(chain) {
  return createPublicClient({
    chain: chain.chain,
    transport: http(process.env[chain.rpcEnv]?.trim() || undefined),
  });
}

async function balanceFor(offer) {
  const client = publicClientFor(offer.chain);
  const balance = await client.readContract({
    abi: erc20Abi,
    address: offer.chain.token,
    args: [account.address],
    functionName: "balanceOf",
  });
  return balance;
}

async function approvePermit2(offer, approval) {
  const client = publicClientFor(offer.chain);
  const wallet = createWalletClient({
    account,
    chain: offer.chain.chain,
    transport: http(process.env[offer.chain.rpcEnv]?.trim() || undefined),
  });
  const requiredAmount = approval?.requiredAmount ?? BigInt(offer.amount);
  const spender = approval?.spender ?? B402_PERMIT2_ADDRESS;
  const currentAllowance = approval?.currentAllowance ?? await client.readContract({
    abi: erc20Abi,
    address: offer.chain.token,
    args: [account.address, spender],
    functionName: "allowance",
  });
  if (currentAllowance >= requiredAmount) return;

  const balance = await balanceFor(offer);
  if (balance < requiredAmount) fail(`Insufficient USDC on ${offer.chain.name}`);
  const gasBalance = await client.getBalance({ address: account.address });
  if (gasBalance === 0n) fail(`BSC Permit2 approval requires BNB gas; wallet balance is ${formatEther(gasBalance)} BNB`);

  const sendApproval = async (amount) => {
    const { request } = await client.simulateContract({
      account,
      abi: erc20Abi,
      address: offer.chain.token,
      args: [spender, amount],
      functionName: "approve",
    });
    const hash = await wallet.writeContract(request);
    console.log(`Permit2 approval transaction: ${hash}`);
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") fail(`Permit2 approval reverted: ${hash}`);
  };

  if (currentAllowance > 0n) await sendApproval(0n);
  await sendApproval(requiredAmount);
}

async function createNativeCredential(response, offer) {
  const allowance = offer.chain.transfer === "permit2-exact"
    ? async ({ owner, spender, token }) => publicClientFor(offer.chain).readContract({
        abi: erc20Abi,
        address: token,
        args: [owner, spender],
        functionName: "allowance",
      })
    : undefined;
  const prepare = async () => clientFor(offer, allowance).preparePayment(response, {
    orderChallenges: (candidates) => candidates.filter(({ challenge }) =>
      challenge.id === offer.challenge.id,
    ),
    request: { body: bodyJson, method: "POST" },
  });
  let prepared = await prepare();
  try {
    return await prepared.createCredential();
  } catch (error) {
    if (!(error instanceof B402Permit2ApprovalRequiredError)) throw error;
    await approvePermit2(offer, error.approval);
    prepared = await prepare();
    return prepared.createCredential();
  }
}

async function createX402Credential(response, offer) {
  if (offer.chain.transfer === "permit2-exact") {
    await approvePermit2(offer);
    const trustedSpender = process.env.B402_TRUSTED_SPENDER_BSC
      ?? CURATED_B402_SPENDERS[offer.chain.network]?.exact;
    if (!trustedSpender) fail(`No trusted B402 spender is configured for ${offer.chain.network}`);
    const payload = await buildPermit2ExactPayment({
      account,
      requirements: offer.requirements,
      resourceUrl: offer.paymentRequired.resource.url,
      trustedSpenders: [getAddress(trustedSpender)],
    });
    return x402.Header.encodePaymentSignature(payload);
  }

  const prepared = await clientFor(offer).preparePayment(response, {
    orderChallenges: (candidates) => candidates.filter(({ challenge }) => {
      const request = challenge.request;
      return challenge.id.startsWith("x402:")
        && request.network === offer.chain.network
        && request.asset?.toLowerCase() === offer.asset.toLowerCase();
    }),
    request: { body: bodyJson, method: "POST" },
  });
  return prepared.createCredential();
}

async function listProjects() {
  const response = await fetch(`${GATEWAY}/agent/projects`, { headers: await auth() });
  if (!response.ok) {
    console.warn(`Could not list existing projects (${response.status}); continuing cautiously.`);
    return [];
  }
  const result = await response.json();
  return Array.isArray(result.projects) ? result.projects : [];
}

console.log(`Wallet: ${account.address}`);
console.log(`Project: ${args.name} (port ${args.port})`);
console.log(`Gateway: ${GATEWAY}`);

const projects = await listProjects();
const active = projects.filter((project) => ACTIVE_STATUSES.has(String(project.status).toLowerCase()));
if (active.length) {
  console.log(`Active projects sharing credits: ${active.length}`);
  for (const project of active) console.log(`  ${project.name} [${project.status}] ${project.url ?? ""}`);
}
if (projects.some((project) => project.name === args.name)) {
  fail(`Project name ${args.name} already exists for this wallet; choose another name`);
}

console.log("Requesting deployment or payment challenge...");
let response = await post(args.useExistingCredits ? { "X-Use-Existing-Credits": "true" } : {});

if (response.ok) {
  const result = await readBody(response);
  console.log("Deployment started using existing credits; no payment was made.");
  await finishDeployment(result);
  process.exit(0);
}
if (response.status !== 402) {
  const hint = response.status >= 500
    ? ` A 5xx here usually means the unique name ${args.name} is taken by another account; re-run to draw a fresh suffix.`
    : "";
  fail(`Gateway returned ${response.status}: ${JSON.stringify(await readBody(response))}.${hint}`);
}

const warning = response.headers.get("x-createos-credit-warning");
if (warning) console.warn(`Credit warning: ${warning}`);

const offers = args.protocol === "mpp" ? nativeOffers(response) : x402Offers(response);
const matching = offers.filter((offer) => !args.chain || offer.chain.name === args.chain);
if (!matching.length) {
  const available = offers.map((offer) => offer.chain.name).join(", ") || "none";
  fail(`No ${args.protocol} offer matches the requested chain. Advertised ${args.protocol} chains: ${available}`);
}

let selected;
for (const offer of matching) {
  try {
    const balance = await balanceFor(offer);
    console.log(
      `${offer.chain.name}: ${formatUnits(balance, offer.chain.decimals)} USDC available; `
      + `${formatUnits(BigInt(offer.amount), offer.chain.decimals)} USDC required`,
    );
    if (!selected && balance >= BigInt(offer.amount)) selected = offer;
  } catch (error) {
    console.warn(`Could not read ${offer.chain.name} balance: ${error instanceof Error ? error.message : error}`);
  }
}
if (!selected) {
  fail(`Wallet lacks the required USDC on the advertised ${args.protocol} chains`, 2);
}

console.log("Selected payment", {
  protocol: selected.protocol,
  chain: selected.chain.name,
  amount: `${formatUnits(BigInt(selected.amount), selected.chain.decimals)} USDC`,
  recipient: selected.recipient,
});

if (!args.yes) {
  console.log(`No payment signed. Re-run with --chain ${selected.chain.name} --protocol ${selected.protocol} --yes to approve this payment.`);
  process.exit(0);
}

const credential = selected.protocol === "mpp"
  ? await createNativeCredential(response, selected)
  : await createX402Credential(response, selected);
const paymentHeader = selected.protocol === "mpp"
  ? { Authorization: credential }
  : { "PAYMENT-SIGNATURE": credential };

response = await post(paymentHeader);
let result = await readBody(response);

if (!response.ok) {
  const receiptHeader = response.headers.get("payment-receipt");
  const receipt = receiptHeader ? Receipt.deserialize(receiptHeader) : undefined;
  console.error("Payment retry failed", {
    status: response.status,
    error: result.error ?? result.raw,
    reference: receipt?.reference,
    paymentResponse: response.headers.get("payment-response") ?? undefined,
  });

  if (receipt || response.status === 409) {
    console.log("Trying one payment-free deployment using any credits that may already exist...");
    const recovery = await post({ "X-Use-Existing-Credits": "true" });
    result = await readBody(recovery);
    if (!recovery.ok) {
      fail(`Payment outcome needs reconciliation. Do not pay again. Recovery returned ${recovery.status}: ${JSON.stringify(result)}`, 3);
    }
    response = recovery;
  } else {
    fail("Do not blindly retry the payment. Inspect the returned challenge and gateway logs.", 3);
  }
}

const receiptHeader = response.headers.get("payment-receipt");
if (receiptHeader) {
  const receipt = Receipt.deserialize(receiptHeader);
  console.log(`Payment settled: ${receipt.reference}`);
}

await finishDeployment(result);

async function finishDeployment(deployment) {
  if (!deployment.projectId || !deployment.deploymentId) {
    fail(`Gateway response has no deployment identifiers: ${JSON.stringify(deployment)}`);
  }
  console.log(`Project: ${deployment.projectId}`);
  console.log(`Deployment: ${deployment.deploymentId}`);

  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 5_000));
    const statusResponse = await fetch(
      `${GATEWAY}/agent/deploy/${deployment.projectId}/${deployment.deploymentId}/status`,
      { headers: await auth() },
    );
    const status = await readBody(statusResponse);
    if (!statusResponse.ok) fail(`Status check failed (${statusResponse.status}): ${JSON.stringify(status)}`, 4);
    console.log(`Status: ${status.status}${status.deployment_status ? ` (${status.deployment_status})` : ""}`);
    if (status.status === "failed") fail(status.reason ?? "Deployment failed", 4);
    if (status.status !== "ready") continue;
    if (!status.endpoint) fail("Deployment is ready but no endpoint was returned", 4);

    // "ready" is the platform's own status; the container still has to boot and
    // bind the port after it, so the first probes routinely 404 or refuse.
    const probeDeadline = Date.now() + 120_000;
    let lastProbe = "no answer";
    let lastStatus = 0;
    while (Date.now() < probeDeadline) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 10_000));
      try {
        const probe = await fetch(status.endpoint, { signal: AbortSignal.timeout(15_000) });
        lastStatus = probe.status;
        lastProbe = `HTTP ${probe.status}`;
        if (probe.status < 400) {
          console.log(`Live: ${status.endpoint} (${lastProbe})`);
          return;
        }
      } catch (error) {
        lastStatus = 0;
        lastProbe = error instanceof Error ? error.message : String(error);
      }
      console.log(`Warming up: ${status.endpoint} (${lastProbe})`);
    }

    if (lastStatus >= 400 && lastStatus < 500) {
      console.log(`Live: ${status.endpoint} (${lastProbe}); the app answered but has no route at /`);
      return;
    }
    fail(`Endpoint did not serve traffic within two minutes (${lastProbe}); verify --port ${args.port}`, 5);
  }
  fail("Timed out after ten minutes waiting for deployment", 4);
}
