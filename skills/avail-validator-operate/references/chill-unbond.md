# Chill, unbond, exit — Avail validator

Stopping validation cleanly is a staking action, not a server action. Killing the
container alone does **not** chill you — you'd be an offline validator (involuntary
chill, possible slash if many are offline together). Always chill on-chain *first*,
then it's safe to stop the node.

## Chill (stop validating, keep funds bonded)

`staking.chill` removes you from the active/waiting set without unbonding.

- **Where:** staking actions UI (network URL in
  `avail-validator-setup/references/networks.md`) → your account → **Stop**, or submit
  the `staking.chill` extrinsic directly.
- **Signed by:** the **controller** account (not the stash).
- **Effective:** next era (~24 h). Funds remain bonded; you simply stop being
  selectable for new/revised nominations.
- After chill takes effect (confirm you're out of the active set on the dashboard and
  logs no longer show `🎁 Prepared block for proposing`), it is safe to stop/decommission
  the node.

### Voluntary vs involuntary chill
- **Voluntary:** you called `chill`. Clean. No slash.
- **Involuntary:** the network chilled you for being unresponsive a full session. No
  slash by itself — but if ≥10% of validators are offline together in an epoch, that
  whole group is slashed. So "I'll just turn it off" is risky; chill explicitly.

## Unbond (start releasing the stake)

After chilling, to free the bonded funds:

1. `staking.unbond` the amount (controller-signed).
2. **28-day** unbonding lock — funds are non-transferable during this period.
3. After 28 days, `withdrawUnbonded` to make them transferable.

You can chill without unbonding (pause validating, keep stake) or unbond a partial
amount and keep validating with the rest (as long as you stay above the waiting-list
floor — see networks.md economics).

## Full exit checklist

1. `staking.chill` (controller) → wait one era, confirm out of active set via logs +
   dashboard.
2. Stop & decommission the node container.
3. `staking.unbond` the full bonded amount (controller).
4. Wait 28 days.
5. `withdrawUnbonded` (controller). Funds now transferable from the stash.
6. Securely destroy the on-box `keystore/` only after you're certain you won't rejoin
   with the same identity (otherwise keep the encrypted backup).

## Slashing context (why the order matters)

- Equivocation slashes regardless of chill status — it's about duplicate signing, so
  don't run the old node again with live keys after migrating.
- Slash appears immediately on the staking UI slashes page; the **financial deduction
  is delayed several days** and governance can reverse it. Don't assume safety from
  "balance not changed yet."
- Chilling promptly when you know you'll be offline (maintenance, migration) converts a
  potential slash scenario into a clean no-penalty exit. Treat chill as the standard
  pre-maintenance step for anything that risks a full session of downtime.
