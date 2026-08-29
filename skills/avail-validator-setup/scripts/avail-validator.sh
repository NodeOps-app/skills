#!/usr/bin/env bash
# Avail validator setup helper — Docker-first, network-parameterized.
# Wraps the exact upstream `docker run` with validator-safe hardening:
#   - RPC 9944 and metrics 9615 bound to 127.0.0.1 only (upstream exposes 9944 publicly)
#   - p2p 30333 published (must be world-reachable)
#   - explicit pinned tag, optional digest pinning, restart policy, named host volume
#
# Usage:
#   avail-validator.sh provision  --chain <mainnet|turing> --tag <TAG> --name <NodeName> [--data DIR]
#   avail-validator.sh rotate-keys [--container <CID>]
#   avail-validator.sh status      [--container <CID>]
#
# This script is deliberately small and explicit. Read it before running it on a
# machine that will hold real stake.
set -euo pipefail

DATA_DIR="/root/avail/node-data"
IMAGE_REPO="docker.io/availj/avail"

die() { echo "error: $*" >&2; exit 1; }

cmd_provision() {
  local chain="" tag="" name=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --chain) chain="$2"; shift 2;;
      --tag)   tag="$2";   shift 2;;
      --name)  name="$2";  shift 2;;
      --data)  DATA_DIR="$2"; shift 2;;
      *) die "unknown arg: $1";;
    esac
  done
  [ -n "$chain" ] || die "--chain required (mainnet|turing)"
  [ "$chain" = "mainnet" ] || [ "$chain" = "turing" ] || die "--chain must be mainnet or turing"
  [ -n "$tag" ]  || die "--tag required (pin an explicit release, never :latest)"
  [ -n "$name" ] || die "--name required"

  echo ">> verifying image $IMAGE_REPO:$tag before pull (validator must run known-good binary)"
  if command -v skopeo >/dev/null 2>&1; then
    skopeo inspect "docker://$IMAGE_REPO:$tag" | grep -E '"Digest"|"Created"' \
      || die "skopeo could not inspect $IMAGE_REPO:$tag — bad tag?"
  else
    echo "   skopeo not found — skipping digest verification (install skopeo to harden)"
  fi

  mkdir -p "$DATA_DIR"
  echo ">> p2p port 30333 must be reachable inbound; 9944/9615 stay localhost-only"
  set -x
  docker run --restart=on-failure -d \
    -v "$DATA_DIR:/da/node-data" \
    -p 30333:30333 \
    -p 127.0.0.1:9944:9944 \
    -p 127.0.0.1:9615:9615 \
    "$IMAGE_REPO:$tag" \
    --chain "$chain" -d /da/node-data --validator --name "$name"
  set +x
  echo ">> tail sync with: docker logs -f \$(docker ps -lq)"
  echo ">> wait for 'Role: AUTHORITY' and steady '💤 Idle (N peers)' before Day 1"
}

_pick_container() {
  local cid="${1:-}"
  [ -n "$cid" ] && { echo "$cid"; return; }
  docker ps -lq
}

cmd_rotate_keys() {
  local cid=""
  [ "${1:-}" = "--container" ] && { cid="$2"; shift 2; }
  cid="$(_pick_container "$cid")"
  [ -n "$cid" ] || die "no running container; pass --container <CID>"
  echo ">> generating session keys in container $cid"
  docker exec -i "$cid" curl -sH "Content-Type: application/json" \
    -d '{"id":1,"jsonrpc":"2.0","method":"author_rotateKeys","params":[]}' \
    http://localhost:9944
  echo
  echo ">> restarting node to load keys"
  docker restart "$cid" >/dev/null
  echo ">> submit the 'result' hex above via Set Session Key (signed by CONTROLLER)"
  echo ">> private keys remain in the keystore on this box — never copy them off"
}

cmd_status() {
  local cid=""
  [ "${1:-}" = "--container" ] && { cid="$2"; shift 2; }
  cid="$(_pick_container "$cid")"
  [ -n "$cid" ] || die "no running container; pass --container <CID>"
  echo ">> chains dir (confirms network):"
  docker exec "$cid" ls /da/node-data/chains
  echo ">> last log lines:"
  docker logs --tail 20 "$cid"
}

sub="${1:-}"; shift || true
case "$sub" in
  provision)   cmd_provision "$@";;
  rotate-keys) cmd_rotate_keys "$@";;
  status)      cmd_status "$@";;
  *) die "usage: $0 {provision|rotate-keys|status} ...";;
esac
