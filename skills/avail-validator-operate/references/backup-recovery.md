# Avail validator backup & disaster recovery

## What to back up (and what not to)

| Path (under `<base>/chains/<chainid>/`) | Back up? | Why |
|---|---|---|
| `keystore/` | **Yes, encrypted** | Session keys — irreplaceable, equivocation-critical |
| `network/` | **Yes** | Node key / libp2p identity |
| `db/` | No | Re-syncable from genesis or snapshot; contains no secret |

In Docker the base is `/da/node-data`; discover the chain dir
(`docker exec <CID> ls /da/node-data/chains`) — its name varies by node version.

## Backup procedure

Take a backup right after going active and after **every** key rotation. It must be
**encrypted** and stored **off the validator box**. `scripts/backup-keys.sh` does this:
it `tar`s `keystore/` + `network/` and encrypts with `age` (or `gpg` fallback).

Manual equivalent:

```bash
CID=$(docker ps -lq)
CHAIN_DIR=$(docker exec "$CID" sh -c 'ls -d /da/node-data/chains/*' | head -1)
docker exec "$CID" tar -C "$CHAIN_DIR" -czf - keystore network \
  | age -r <your-age-recipient> > avail-keys-$(date +%F).tar.gz.age
# move the .age file off-box (it is the validator's identity — guard it)
```

Never store the archive unencrypted, and never store it on the same machine only.

## Re-sync the DB (no secrets involved)

If only the DB is bad (corruption, disk), you do **not** need keys back — keep the
keystore in place and rebuild state:

```bash
# stop node, then purge chain data and let it re-sync
avail purge-chain        # binary form; in Docker: stop container, delete db/ in the volume, restart
```

Or restore from a trusted DB snapshot to skip a long genesis sync (warp sync is not
available). Trust the snapshot source.

## Disaster recovery — the rule that prevents self-slashing

> Restoring the keystore onto a new node **while the old node is or might still be
> running** double-signs → equivocation → slash (validator **and** nominators).

Choose the safe path:

### Path A — old node is definitively dead
Use only when you are *certain* the old machine can never produce blocks again
(destroyed/wiped, disk pulled, account access revoked — not merely "I think it's off").

1. Provision a fresh node (setup skill), same `--chain`/`--name`, let it sync.
2. Stop it. Restore `keystore/` + `network/` from the encrypted backup into the
   volume's `chains/<chainid>/`.
3. Start it. It resumes the **same** validator identity. Confirm authoring via logs.

### Path B — old node status uncertain (preferred default)
If there is *any* doubt the old node is gone, do **not** restore the old keystore.
Instead rotate to **new** keys — new keys cannot equivocate against the old:

1. Provision a fresh node, sync it.
2. `author_rotateKeys` on the new node (new session keys).
3. **Set Session Key** to the new hex (controller-signed) via the staking UI.
4. Wait for authoring to move to the new node — confirm by **logs**, not the UI.
5. The old node, even if it later comes back, is signing with keys no longer
   registered on-chain → it cannot equivocate. Decommission it when reachable.

Path B trades nothing meaningful (the validator account/stake is unchanged — only the
session keys rotate) for complete equivocation safety. Default to it.

## Stash / controller recovery

The stash and controller are **wallet** keys, never on the box — recover them from the
operator's seed/hardware wallet, not from server backups. If the controller seed is
compromised, the stash funds are still safe (separation), but rotate the controller and
re-`setKeys`/`validate` from the new controller promptly.
