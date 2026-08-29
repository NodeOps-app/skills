# Avail networks — concrete values

Substitute these into every command/URL. Avail runs **one** node binary/image; only
these values differ between networks. There is no `testnet` chain alias — the only
supported testnet is **Turing**.

## Parameter table

| Param | **Mainnet** | **Turing testnet** |
|---|---|---|
| `--chain` value | `mainnet` | `turing` |
| Chain spec line in logs | `Avail Mainnet` | `Avail Turing Network` |
| Official WS RPC | `wss://mainnet-rpc.avail.so/ws` | `wss://turing-rpc.avail.so/ws` |
| Light-client API | `https://api.lightclient.mainnet.avail.so/v1` | `https://api.lightclient.turing.avail.so/v1` |
| Block explorer (Subscan) | `https://avail.subscan.io/` | `https://avail-turing.subscan.io/` |
| App / extrinsics explorer | `https://explorer.availproject.org/?rpc=wss://mainnet-rpc.avail.so/ws` | `https://explorer.availproject.org/?rpc=wss://turing-rpc.avail.so/ws` |
| Staking dashboard | `https://staking.availproject.org/#/overview` | same UI — select Turing |
| Staking actions (bond/setKeys/validate/chill) | `https://explorer.availproject.org/#/staking/actions` | same UI — select Turing |
| Telemetry | `http://telemetry.avail.so/` | `http://telemetry.avail.so/` (Turing tab) |
| Token symbol | AVAIL | AVAIL |
| Chain-data dir under `<base>/chains/` | e.g. `avail_mainnet_network` | e.g. `avail_turing_network` / `avail_turing_testnet` (varies by node version) |

> The chain-data subdir name varies across node versions. Never hardcode it — discover
> it: `docker exec <CID> ls /da/node-data/chains`.

## Public RPC endpoints (for queries / explorer, not for the validator itself)

**Mainnet:** OnFinality `https://avail.api.onfinality.io/public` ·
Ankr `https://mainnet.avail-rpc.com/` · AllNodes `https://avail-rpc.publicnode.com/` ·
VitWit `https://avail.rpc.vitwit.com/` · GlobalStake `https://rpc-avail.globalstake.io` ·
RadiumBlock `https://avail.public.curie.radiumblock.co/http`

**Turing:** OnFinality `https://avail-turing.api.onfinality.io/public` ·
Ankr `https://rpc.ankr.com/avail_turing_testnet` ·
AllNodes `https://avail-turing-rpc.publicnode.com` ·
RadiumBlock `https://turing.public.curie.radiumblock.co/http`

WSS variants: replace `https://`→`wss://` and the path per provider (e.g. OnFinality
`wss://avail.api.onfinality.io/public-ws`).

## Test tokens (Turing only)

Turing AVAIL is obtained via the Avail faucet / Discord, not a CLI. Direct the user to
the faucet linked from `https://docs.availproject.org/docs/da/build/interact/faucet`
(or the Avail Discord `#faucet`). Mainnet AVAIL must be bought or bridged
(`https://bridge.availproject.org/`).

## Staking economics (both networks unless noted)

- **Era** ≈ 24 h. Active validator set re-elected each era boundary by stake.
- **Min self-bond to enter the validator waiting list:** ≥ **50,000 AVAIL**.
  (Turing's network "threshold" may currently be 0, but the 50k waiting-list figure is
  the documented practical floor — confirm live before advising the user.)
- **Reward lag:** stake in era N → active N+1 → accrues N+2 → first payout ~N+3.
- **Unbonding lock:** **28 days** after `unbond` before funds are withdrawable.
- **Minimum Nominated** is recalculated every era and rises as total stake grows — a
  validator above threshold today can fall below later. Not a one-time check.

## Chain spec source (only if running outside Docker / custom spec)

The Docker image ships the correct spec; `--chain mainnet|turing` is enough. If a raw
spec is ever needed:
- Mainnet: `https://raw.githubusercontent.com/availproject/avail/main/misc/genesis/mainnet.chain.spec.raw.json`
- Turing: the docs link a GitHub `blob/` URL (a docs bug); use the `raw.githubusercontent.com`
  equivalent: `https://raw.githubusercontent.com/availproject/avail/main/misc/genesis/testnet.turing.chain.spec.raw.json`
