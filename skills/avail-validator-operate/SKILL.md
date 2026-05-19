---
name: avail-validator-operate
description: >-
  Run, maintain, and protect an already-active Avail DA validator — day-2 operations.
  Use this whenever the user needs to monitor an Avail validator (telemetry, Prometheus,
  Grafana, alerting on missed blocks/peers/sync/era points), upgrade the node to a new
  availj/avail image or release without getting slashed, back up the keystore/node key,
  restore or migrate a validator after a server loss WITHOUT double-signing, chill /
  stop validating cleanly (staking.chill), unbond, or handle equivocation/slashing risk
  and disaster recovery. Triggers on phrases like "monitor my avail validator", "set up
  grafana for avail", "upgrade avail node safely", "avail validator slashed", "back up
  avail keystore", "migrate avail validator to new server", "stop validating avail",
  "chill my avail validator", "avail node equivocation", "restore avail validator".
  For first-time setup, session-key generation, bonding and going active, use the
  avail-validator-setup skill instead.
---

# Avail Validator — Operate (Day 2)

Keep an active Avail validator healthy and **avoid the one class of mistake that gets
you slashed: equivocation (double-signing)**. Equivocation slashes the validator *and*
its nominators, so every procedure here is shaped around the rule:

> **The same session keystore must never be active on two running nodes at once.**

Docker-first. One parameterized path covers Mainnet and Turing. Network-specific URLs
and economics (era ≈ 24 h, 28-day unbond, reward lag) are in
`avail-validator-setup/references/networks.md` — reuse it; don't restate values.

## What day-2 covers

| Task | Read |
|---|---|
| Monitoring & alerting | `references/monitoring.md` |
| Node upgrade (safe vs fast) | `references/upgrade.md` |
| Backup of secrets | `references/backup-recovery.md` |
| Disaster recovery / server migration | `references/backup-recovery.md` |
| Chill / unbond / withdraw | `references/chill-unbond.md` |
| Slashing & equivocation model | this file + `references/chill-unbond.md` |

Always identify the network and the running container first:

```bash
CID=$(docker ps -lq)
docker exec "$CID" ls /da/node-data/chains   # confirms chain dir / network
docker logs --tail 30 "$CID"
```

## Monitoring (do this on day 1 of day-2)

A validator you can't observe is a validator you can't protect. Stand up the metrics
stack and alerts before anything else. Full configs (telemetry flag, `prometheus.yml`,
Grafana install, the official dashboard JSON) and the alert thresholds that actually
matter are in `references/monitoring.md`.

Alert, at minimum, on: node down / not on telemetry, **finalized height not
advancing**, **peer count low**, sync falling behind tip, **missed blocks / era points
dropping**, and version drift from the latest release. A full session unresponsive →
involuntary chill; >10 % of validators offline together in an epoch → all slashed.

## Upgrades — the equivocation trap

`docker pull` + recreate is fine for a **full/RPC node**. For an **active validator**
it risks: (a) DB corruption → prolonged downtime → ejection from the active set, and
(b) — if you "just spin up the new one alongside the old" — **double-signing**.

Two procedures, in `references/upgrade.md`:

- **Fast (acceptable downtime, single box):** stop container → recreate on the new
  pinned tag with the same volume → verify it resumes authoring. Brief downtime, no
  equivocation because the old node is stopped first.
- **Slow & safe (zero downtime, two boxes):** stand up Node B on the new version,
  `author_rotateKeys` on **B**, submit the new keys via **Set Session Key**, wait for
  block production to move to B (confirm by **logs**, not the UI), *then* and only then
  stop Node A. Never have both authoring with the same keys.

`scripts/safe-upgrade.sh` walks the fast path with the stop-before-start ordering
enforced. Read `references/upgrade.md` before using it.

## Backups

`db` is re-syncable and holds no secret — don't fixate on it. The only irreplaceable
on-box material is `keystore/` (session keys) and `network/` (node key). Back them up
**encrypted and off-box**, immediately and after any key rotation.
`scripts/backup-keys.sh` produces an encrypted archive. Procedure + restore in
`references/backup-recovery.md`.

## Disaster recovery — without slashing yourself

Losing the server is survivable; **restoring keys onto a new box while the old one
might still be running is not** — that double-signs. The safe recovery paths
(old-node-definitively-dead vs rotate-to-new-keys) are in
`references/backup-recovery.md`. When in doubt, rotate to **new** session keys via
`setKeys` rather than restoring the old keystore — new keys can't equivocate against
the old.

## Chill / unbond / exit

Stopping cleanly is `staking.chill` (UI or extrinsic), **signed by the controller**,
effective **next era**; funds stay bonded. Unbond → **28-day** lock → withdraw.
Step-by-step, plus the difference between voluntary and involuntary chill and the
slashing conditions, in `references/chill-unbond.md`.

## Slashing facts to act on

- Equivocation (two blocks same slot, or conflicting GRANDPA votes) → slash for
  validator **and** nominators. Usually self-inflicted by running duplicate keys.
- Slash shows immediately on the staking UI's slashes page, but the **financial
  deduction is delayed days** (governance can reverse it). "Not deducted yet" ≠ "safe".
- Involuntary chill (offline, <10 % of set) → no slash; ≥10 % offline together →
  slash. Uptime monitoring is a slashing-prevention control, not a nicety.
