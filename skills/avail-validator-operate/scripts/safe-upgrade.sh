#!/usr/bin/env bash
# Fast single-box Avail validator upgrade with equivocation-safe ordering:
# the old container is STOPPED and confirmed down BEFORE the new one starts, so the
# same session keystore is never live on two nodes. Same volume + same --name are
# reused, so the validator identity is preserved (no setKeys needed for this path).
#
# For zero-downtime / high-stake mainnet, use the two-box rotate-keys flow in
# references/upgrade.md instead — NOT this script.
#
# Usage:
#   safe-upgrade.sh --chain <mainnet|turing> --tag <NEW_TAG> --name <SameNodeName> \
#                   [--container <CID>] [--data DIR]
set -euo pipefail

CID="" CHAIN="" TAG="" NAME="" DATA_DIR="/root/avail/node-data"
IMAGE_REPO="docker.io/availj/avail"
while [ $# -gt 0 ]; do
  case "$1" in
    --chain) CHAIN="$2"; shift 2;;
    --tag)   TAG="$2";   shift 2;;
    --name)  NAME="$2";  shift 2;;
    --container) CID="$2"; shift 2;;
    --data)  DATA_DIR="$2"; shift 2;;
    *) echo "unknown arg: $1" >&2; exit 1;;
  esac
done
[ "$CHAIN" = "mainnet" ] || [ "$CHAIN" = "turing" ] || { echo "error: --chain mainnet|turing" >&2; exit 1; }
[ -n "$TAG" ]  || { echo "error: --tag required (never :latest)" >&2; exit 1; }
[ -n "$NAME" ] || { echo "error: --name required (reuse the SAME node name)" >&2; exit 1; }
[ -n "$CID" ] || CID="$(docker ps -lq)"
[ -n "$CID" ] || { echo "error: no running container; pass --container <CID>" >&2; exit 1; }

echo ">> verifying $IMAGE_REPO:$TAG before pull"
if command -v skopeo >/dev/null 2>&1; then
  skopeo inspect "docker://$IMAGE_REPO:$TAG" | grep -E '"Digest"|"Created"' \
    || { echo "error: cannot inspect $IMAGE_REPO:$TAG" >&2; exit 1; }
else
  echo "   skopeo not found — skipping digest verification"
fi

echo ">> stopping old container $CID (must be down before new one starts)"
docker stop "$CID" >/dev/null
# hard gate: refuse to continue unless the old node is actually not running
if [ -n "$(docker ps -q --filter id="$CID")" ]; then
  echo "error: old container still running — aborting to avoid double-signing" >&2
  exit 1
fi
docker rename "$CID" "avail-prev-$(date +%s)" 2>/dev/null || true
echo ">> old node confirmed stopped — starting new node on tag $TAG"

docker run --restart=on-failure -d \
  -v "$DATA_DIR:/da/node-data" \
  -p 30333:30333 \
  -p 127.0.0.1:9944:9944 \
  -p 127.0.0.1:9615:9615 \
  "$IMAGE_REPO:$TAG" \
  --chain "$CHAIN" -d /da/node-data --validator --name "$NAME"

NEW_CID="$(docker ps -lq)"
echo ">> new container $NEW_CID started"
echo ">> watch: docker logs -f $NEW_CID"
echo ">> healthy = '✨ Imported #N' rising, then '🎁 Prepared block for proposing'"
echo ">> rollback if DB corrupt: docker stop $NEW_CID; docker start avail-prev-*"
echo ">> keep the renamed old container until the new one has authored a block"
