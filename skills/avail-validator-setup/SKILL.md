---
name: avail-validator-setup
description: >-
  Stand up and activate an Avail DA validator node (Docker-first) from scratch — day-0 provisioning
  through day-1 staking and going active. Use this whenever the user wants to run, deploy, set up,
  bootstrap, spin up, or "become" an Avail validator on Mainnet or Turing testnet; generate/rotate
  session keys (author_rotateKeys); bond stake, set session keys on-chain (setKeys), register as a
  validator (staking.validate) with a commission; pick the right chain/RPC/endpoints per network;
  or securely store validator keys (keystore, node key, stash/controller). Triggers on phrases like
  "run an Avail validator", "set up avail node", "availj/avail docker", "rotate session keys avail",
  "stake my avail validator", "join the avail validator set", "avail turing testnet validator",
  "secure my avail keystore". For ongoing day-2 work (monitoring, upgrades, backups, chill,
  recovery) use the avail-validator-operate skill instead.
---

# Avail Validator — Setup (Day 0 + Day 1)

Bring an Avail Data Availability validator from bare machine to active block producer.
**Docker-first.** One parameterized path covers Mainnet and Turing testnet — only the
`--chain` value and a handful of endpoints differ.

A validator is a specialized full node that produces blocks (BABE) and finalizes them
(GRANDPA) under Nominated Proof of Stake. It must be **bonded and registered on-chain**
and must hold **session keys** in its local keystore, or it stays stuck at block 0.

## The two phases

- **Day 0 — Provision**: run a synced node container, firewalled correctly.
- **Day 1 — Activate**: generate session keys, create accounts, bond, set keys on-chain,
  declare validator intent with a commission, wait for the next era.

Do them in order. Day 1 needs a fully synced Day 0 node.

## Network parameters

Pick the network with the user before any command. Everything network-specific is in
`references/networks.md` — read it now and substitute concretely; never leave
`<chain>` / `<TAG>` placeholders in commands you run.

| Need | Mainnet | Turing testnet |
|---|---|---|
| `--chain` value | `mainnet` | `turing` |
| Test tokens | buy/bridge AVAIL | request from Turing faucet (see networks.md) |

There is **no `--chain testnet`** — the only supported testnet is `turing`. Omitting
`--chain` errors out: `Please specify which chain you want to run, e.g. --chain mainnet`.

## Day 0 — Provision

### 1. Host

Minimum 8 GB RAM / 4 cores / SSD; recommended 16 GB / 8 cores / 200–300 GB SSD (chain
grows). Linux server distro. Open **p2p port 30333** inbound. Do **not** expose RPC
(9944) or metrics (9615) to the public internet on a validator.

### 2. Pick a secure image tag — never `:latest`

The image is `docker.io/availj/avail`. Always pin an explicit released tag and verify
it before pulling (a validator must run a known-good binary):

```bash
# newest releases — cross-check the version announced in Avail's Discord
curl -s https://api.github.com/repos/availproject/avail/releases/latest | grep -m1 '"tag_name"'
# verify the tag resolves and inspect its digest before use
skopeo inspect docker://docker.io/availj/avail:<TAG> | grep -E 'Digest|Created'
```

Pin by digest in production if possible: `docker.io/availj/avail@sha256:<digest>`.

### 3. Run the node

`scripts/avail-validator.sh` wraps the exact upstream `docker run` with secure defaults
(restart policy, named volume, firewalled ports, digest pinning). Prefer it:

```bash
scripts/avail-validator.sh provision --chain <mainnet|turing> --tag <TAG> --name <NodeName>
```

It is the canonical upstream command, parameterized:

```bash
docker run --restart=on-failure -d \
  -v /root/avail/node-data:/da/node-data \
  -p 30333:30333 -p 127.0.0.1:9944:9944 -p 127.0.0.1:9615:9615 \
  docker.io/availj/avail:<TAG> \
  --chain <mainnet|turing> -d /da/node-data --validator --name <NodeName>
```

Note the deliberate hardening vs. the upstream docs: RPC `9944` and metrics `9615` are
bound to `127.0.0.1` only (upstream publishes 9944 on `0.0.0.0`, which is unsafe for a
validator). p2p `30333` is the only port that must be world-reachable.

### 4. Wait for full sync

```bash
docker logs -f $(docker ps -lq)
```

`⚙️ Syncing …` → still catching up. `💤 Idle (N peers) … best: #X, finalized #Y` with X
advancing and N>0 → synced. Role line must read `👤 Role: AUTHORITY` (that confirms
`--validator`). **Do not start Day 1 until fully synced and finalizing.**

## Day 1 — Activate

### 1. Generate session keys (on the node)

`author_rotateKeys` creates the four session keys (babe, gran, imon, audi) inside the
container's keystore and returns their concatenated public hex:

```bash
CID=$(docker ps -lq)
docker exec -i "$CID" curl -sH "Content-Type: application/json" \
  -d '{"id":1,"jsonrpc":"2.0","method":"author_rotateKeys","params":[]}' \
  http://localhost:9944
docker restart "$CID"
```

(`scripts/avail-validator.sh rotate-keys` does exactly this and prints the hex.) Save
the `result` hex — it is submitted on-chain next. The private keys stay on disk in the
keystore and must **never** leave the box. See `references/key-security.md`.

### 2. Create stash + controller accounts

On the explorer wallet (URLs in `references/networks.md`) create **two separate**
accounts: a **stash** (holds bonded funds — keep in cold/hardware storage) and a
**controller** (signs `setKeys`, `validate`, `chill` — used routinely). Separation is a
security control: a compromised controller cannot move bonded funds. Fund the stash;
keep a little in the controller for fees. Detail: `references/key-security.md`.

### 3. Bond, set keys, validate

Via the staking UI (network-specific URL in `references/networks.md`):

1. **Bond** from the stash — at least **50,000 AVAIL** to enter the waiting list. Don't
   bond everything; leave fee headroom. Unbonding later is locked **28 days**.
2. **Set Session Key** — paste the `author_rotateKeys` hex (the `setKeys` extrinsic,
   signed by the controller). The button then changes to **Validate**.
3. **Validate** — set your **commission %** and submit (`staking.validate`). This
   declares validator intent.

### 4. Become active

You enter the **Waiting** set. The active set is re-elected each **era (~24 h)** by
stake. If your stake is high enough you're elected within an era or two. Confirm by
node logs showing `🎁 Prepared block for proposing` — not by the UI, which can show
the change before it is real. No rewards in the era you stake; first payout ~era N+3.

## Key security — non-negotiable

Read `references/key-security.md` and apply it during Day 1. The load-bearing rules:

- The **keystore** (`<base-path>/chains/<chainid>/keystore`) and **network** (node key)
  dirs are the only irreplaceable on-box secrets. `db` is re-syncable.
- **Never run two nodes with the same keystore at once** — double-signing is
  equivocation and is slashed (validator *and* nominators). This dictates how upgrades
  and recovery are done (see avail-validator-operate).
- Stash in cold/hardware storage; stash ≠ controller.

## When stuck

`references/troubleshooting.md` — no peers, sync stalled, stays `FULL` not `AUTHORITY`,
not producing blocks after election, key/account mismatch.

## Handing off to day-2

Once the validator is producing blocks, ongoing monitoring, upgrades, backups, chill,
and disaster recovery are the **avail-validator-operate** skill's job. Point the user
there rather than improvising those here — upgrade/recovery have equivocation traps.
