# Avail validator setup — troubleshooting

Symptom → cause → fix. Check `docker logs -f $(docker ps -lq)` first; the log markers
below are the diagnostic signal.

## Node won't start

- `Error: Input("Please specify which chain you want to run, e.g. --chain mainnet")`
  → `--chain` missing. Add `--chain mainnet` or `--chain turing`. There is no
  `testnet` alias.
- Container exits immediately, restarts in a loop → check `docker logs`; usually a bad
  `-v` mount path or the volume dir not writable by the container uid. Fix host perms,
  recreate.

## Stuck syncing / no peers

- Log stays `💤 Idle (0 peers)` → p2p port **30333 not reachable**. Open it inbound in
  the host/cloud firewall and security group; confirm `-p 30333:30333` is published.
- `⚙️ Syncing` never reaching tip, or `❌ Error while dialing /dns/telemetry…` → the
  telemetry dial error is harmless (telemetry only). Real sync stall = peers/port or
  disk too slow; check `best:` and `finalized:` are advancing.
- Genesis sync is slow (hours), not the "5–10 min" some docs imply. Warp sync is not
  available. A trusted DB snapshot speeds it up (operate skill covers restore).

## Node runs but never becomes a validator

- Log shows `👤 Role: FULL` not `AUTHORITY` → `--validator` flag missing from the
  `docker run` args. Recreate the container with `--validator`.
- `Role: AUTHORITY` but no `🎁 Prepared block for proposing` after election:
  - Session keys never set on-chain, or set against the wrong account → re-run
    `author_rotateKeys`, then **Set Session Key** signed by the **controller**.
  - Not elected yet — you're still in **Waiting**. Election happens at era boundaries
    (~24 h); insufficient stake keeps you waiting. Verify stake ≥ waiting-list floor
    and on the staking dashboard you appear under Waiting/Active.
  - Node not fully synced when keys were set → wait for `💤 Idle` with advancing
    `finalized:`, rotate keys again, resubmit.

## Key / account problems

- `setKeys` / `validate` extrinsic fails or "controller not bonded" → bond from the
  **stash** first, then `setKeys`/`validate` from the **controller**. Stash and
  controller must be distinct accounts.
- Rotated keys but validator stopped producing → `author_rotateKeys` replaced the
  on-box keys; you must submit the **new** hex via `setKeys` (the rotate flow is
  intentional for migrations — see operate skill safe-upgrade).

## Verifying health quickly

- `docker exec <CID> ls /da/node-data/chains` → confirms the chain dir / network.
- Telemetry site (network tab) → node visible by `--name`, block height tracking tip.
- Logs: `✨ Imported #N` rising = following chain; `🎁 Prepared block for proposing` =
  actively authoring (you are an active validator).
