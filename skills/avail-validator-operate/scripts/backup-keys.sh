#!/usr/bin/env bash
# Encrypted off-box backup of an Avail validator's irreplaceable secrets.
# Backs up ONLY keystore/ (session keys) and network/ (node key) — db/ is
# re-syncable and is intentionally excluded.
#
# Usage:
#   backup-keys.sh --recipient <age-recipient> [--container <CID>] [--out DIR]
#   backup-keys.sh --gpg                         [--container <CID>] [--out DIR]
#
# --recipient : encrypt with `age` to this recipient (preferred)
# --gpg       : fall back to symmetric `gpg -c` (you'll be prompted for a passphrase)
#
# The resulting archive IS the validator identity. Move it off this host and guard it
# like a private key. Never keep the only copy on the validator box.
set -euo pipefail

CID="" RECIPIENT="" USE_GPG=0 OUT="."
while [ $# -gt 0 ]; do
  case "$1" in
    --recipient) RECIPIENT="$2"; shift 2;;
    --gpg)       USE_GPG=1; shift;;
    --container) CID="$2"; shift 2;;
    --out)       OUT="$2"; shift 2;;
    *) echo "unknown arg: $1" >&2; exit 1;;
  esac
done

[ -n "$CID" ] || CID="$(docker ps -lq)"
[ -n "$CID" ] || { echo "error: no running container; pass --container <CID>" >&2; exit 1; }

CHAIN_DIR="$(docker exec "$CID" sh -c 'ls -d /da/node-data/chains/* 2>/dev/null | head -1')"
[ -n "$CHAIN_DIR" ] || { echo "error: could not locate chains dir in container" >&2; exit 1; }
echo ">> backing up keystore/ + network/ from $CHAIN_DIR (db/ excluded by design)"

STAMP="$(date +%F-%H%M%S)"
mkdir -p "$OUT"

if [ -n "$RECIPIENT" ]; then
  command -v age >/dev/null 2>&1 || { echo "error: age not installed" >&2; exit 1; }
  DEST="$OUT/avail-keys-$STAMP.tar.gz.age"
  docker exec "$CID" tar -C "$CHAIN_DIR" -czf - keystore network \
    | age -r "$RECIPIENT" > "$DEST"
elif [ "$USE_GPG" = "1" ]; then
  command -v gpg >/dev/null 2>&1 || { echo "error: gpg not installed" >&2; exit 1; }
  DEST="$OUT/avail-keys-$STAMP.tar.gz.gpg"
  docker exec "$CID" tar -C "$CHAIN_DIR" -czf - keystore network \
    | gpg -c --cipher-algo AES256 -o "$DEST"
else
  echo "error: pass --recipient <age-recipient> or --gpg (refusing to write plaintext)" >&2
  exit 1
fi

echo ">> wrote $DEST"
echo ">> MOVE this off the validator host now. It is the validator's identity."
echo ">> verify it restores before you rely on it (see references/backup-recovery.md)."
