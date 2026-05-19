# Avail validator upgrades

Goal: move to a newer `availj/avail` release without (a) corrupting the DB into long
downtime or (b) double-signing. Pick the procedure by your downtime tolerance.

## First: pick and verify the new tag

Never `:latest`. Find the new release and verify before pulling:

```bash
curl -s https://api.github.com/repos/availproject/avail/releases/latest | grep -m1 '"tag_name"'
skopeo inspect docker://docker.io/availj/avail:<NEW_TAG> | grep -E 'Digest|Created'
```

Read the release notes — a node release sometimes pairs with an on-chain runtime
upgrade. Runtime upgrades themselves are forkless and applied by governance; the
operator's only job is running a client new enough to follow them.

## Fast upgrade — single box, brief downtime

Acceptable when a few minutes of missed authoring is tolerable. Safe against
equivocation **because the old node is stopped before the new one starts** — same
keystore is never live twice.

```bash
CID=$(docker ps -lq)
docker stop "$CID"                       # old node definitively down first
docker rename "$CID" avail-prev-$(date +%s) 2>/dev/null || true
docker run --restart=on-failure -d \
  -v /root/avail/node-data:/da/node-data \
  -p 30333:30333 -p 127.0.0.1:9944:9944 -p 127.0.0.1:9615:9615 \
  docker.io/availj/avail:<NEW_TAG> \
  --chain <mainnet|turing> -d /da/node-data --validator --name <SameNodeName>
docker logs -f $(docker ps -lq)
```

Reuse the **same volume and same `--name`**. Confirm recovery: `✨ Imported #N` rising,
then `🎁 Prepared block for proposing` once your next slot comes. If the new version
won't start or the DB is corrupt, roll back: stop the new container, restart the
renamed old one (`docker start avail-prev-…`). Keep the old container until the new one
has authored a block.

`scripts/safe-upgrade.sh` performs exactly this stop-then-start ordering and refuses to
start the new container until the old one is confirmed stopped.

## Slow & safe upgrade — two boxes, zero downtime

Use for mainnet / high-stake where you can't miss slots. The trick: the new machine
gets **brand-new session keys**, so the two machines never share keys and cannot
equivocate against each other.

1. Provision **Node B** on the new version, same `--chain`/config, fully synced.
2. On **Node B**: `author_rotateKeys` (see setup skill / `avail-validator.sh
   rotate-keys`). Save the new hex.
3. On the staking actions UI (network URL in setup skill networks.md), **Set Session
   Key** to Node B's new hex, signed by the **controller**. Both old and new keys are
   shown for an epoch or two, then only the new.
4. Wait for authoring to migrate to B. **Confirm via logs, not the UI** — the UI can
   show the switch an epoch before it is real. You want: `🎁 Prepared block for
   proposing` appearing on **B** and stopping on **A**.
5. **Only then** stop Node A. Upgrade A; optionally repeat to switch back.

At no point are both nodes authoring with the same keys — that is the whole point.

## Anti-patterns

- "Spin up the upgraded node next to the old one with the copied keystore, then kill
  the old one." → both live with identical keys = **equivocation = slash**. Use the
  two-box flow with `rotate-keys` instead, or the fast flow that stops first.
- Trusting the staking UI's switchover timing. Trust block-production logs.
- Fast-upgrading a high-stake mainnet validator during its expected authoring window —
  prefer slow & safe there.
- Bumping the tag but not reading release notes — you may need the new client for a
  scheduled runtime upgrade and not know it.
