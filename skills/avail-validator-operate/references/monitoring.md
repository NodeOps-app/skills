# Avail validator monitoring

Three layers: built-in **telemetry** (free, public, low effort), **Prometheus + Grafana**
(your own metrics + alerts), and the **alert rules that actually prevent slashing**.

## 1. Telemetry (built-in)

The node auto-streams to Avail's public telemetry; pick the network tab at
`http://telemetry.avail.so/` and find your node by its `--name`. It is configured via
the chain spec — no flag needed for the default. To force a telemetry endpoint
explicitly (binary form):

```
./data-avail --validator \
    --port 30333 \
    --base-path `pwd`/data \
    --chain `pwd`/chainspec.raw.json \
    --name AvailNode \
    --telemetry-url 'ws://telemetry.avail.tools:8001/submit/ 0'
```

Telemetry is a convenience dashboard, **not** an alerting system. Use it for a quick
"is my node visible and at tip" check; rely on Prometheus for paging.

## 2. Prometheus + Grafana (own stack)

The node exposes Prometheus metrics on `:9615` (localhost-bound on a validator — scrape
from the same host, or add `--prometheus-external` only if you firewall it).

Install Prometheus + node-exporter:

```
sudo apt-get install -y prometheus prometheus-node-exporter
```

`prometheus.yml` (node metrics on 9615, host metrics on 9100):

```
cat > $HOME/prometheus.yml << EOF
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: "prometheus"
    scrape_interval: 5s
    static_configs:
      - targets: ["localhost:9090"]
  - job_name: "avail_node"
    scrape_interval: 5s
    static_configs:
      - targets: ["localhost:9615"]
  - job_name: node
    static_configs:
      - targets: ['localhost:9100']
EOF
sudo mv $HOME/prometheus.yml /etc/prometheus/prometheus.yml
sudo chmod 644 /etc/prometheus/prometheus.yml
sudo systemctl enable prometheus.service prometheus-node-exporter.service
sudo systemctl restart prometheus.service prometheus-node-exporter.service
sudo systemctl status prometheus.service prometheus-node-exporter.service
```

Install Grafana:

```
wget -q -O - https://packages.grafana.com/gpg.key | sudo apt-key add -
echo "deb https://packages.grafana.com/oss/deb stable main" > grafana.list
sudo mv grafana.list /etc/apt/sources.list.d/grafana.list
sudo apt-get update && sudo apt-get install -y grafana
sudo systemctl enable grafana-server.service
sudo systemctl start grafana-server.service
sudo systemctl status grafana-server.service
sudo ufw allow 3000/tcp
```

Grafana UI on `http://<host-ip>:3000` (default `admin/admin`, forced reset). Add a
Prometheus data source pointing at `http://localhost:9090`. Import Avail's official
validator dashboard JSON:

```
https://raw.githubusercontent.com/availproject/docs/main/static/validator_metrics.json
```

> If the node runs in Docker, scrape works because `9615` is published to `127.0.0.1`
> on the host (the setup skill binds it there). Keep Grafana's `3000` firewalled to
> trusted IPs — don't `ufw allow` it open to the world on a validator host.

## 3. Alerts that prevent slashing / ejection

Page on these, not just CPU/disk:

| Alert | Why it matters |
|---|---|
| Finalized block height not advancing for N min | Node forked/stalled — losing era points, heading for ejection |
| Best block not advancing / `⚙️ Syncing` for long | Falling behind tip; will miss authoring slots |
| Peer count below threshold (e.g. <3) | p2p/network problem; precedes desync |
| Node process down / absent from telemetry | Offline → involuntary chill; if ≥10% of set offline → **slash** |
| Era points / blocks authored dropping vs peers | Underperforming → lower rewards, election risk |
| Running image tag ≠ latest avail release | Missing consensus-relevant fixes; runtime upgrade may require new client |
| Disk < ~20% free | DB growth; node crash → downtime |

Uptime is a **slashing-prevention control**. A full session unresponsive →
involuntary chill (no slash, but you stop earning and must rejoin). ≥10% of validators
offline together in an epoch → everyone in that group slashed. Treat "node down" as a
page-now incident, not a morning-review item.
