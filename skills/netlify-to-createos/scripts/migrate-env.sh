#!/usr/bin/env bash
# migrate-env.sh
# Guides the user through migrating Netlify environment variables to CreateOS.
# Outputs a JSON payload suitable for UpdateProjectEnvironmentEnvironmentVariables.
#
# Usage: ./migrate-env.sh [--interactive | --file env.txt]
#   --interactive    Prompt for each variable (default)
#   --file FILE      Read from a dotenv-style file

set -euo pipefail

MODE="${1:---interactive}"
OUTPUT_FILE="${2:-createos-env.json}"

echo "# Netlify → CreateOS Environment Variable Migration"
echo "# ================================================="
echo ""

# Netlify vars that should be removed (internal vars, not migrated)
NETLIFY_INTERNAL_VARS="NETLIFY CONTEXT DEPLOY_URL DEPLOY_PRIME_URL DEPLOY_PREVIEW_URL NETLIFY_DEV NETLIFY_LOCAL NETLIFY_URL NETLIFY_LFS"

declare -A env_map

if [ "$MODE" = "--interactive" ]; then
  echo "Enter each environment variable as KEY=VALUE"
  echo "Leave empty and press Enter to finish."
  echo "Internal Netlify vars (NETLIFY_*, CONTEXT, etc.) are auto-skipped."
  echo ""

  while true; do
    read -r -p "> " line
    [ -z "$line" ] && break

    key="${line%%=*}"
    value="${line#*=}"

    # Skip internal Netlify vars
    skip=0
    for internal in $NETLIFY_INTERNAL_VARS; do
      if [ "$key" = "$internal" ]; then
        echo "  ⏭ Skipping internal Netlify var: $key"
        skip=1
        break
      fi
    done

    if [ "$skip" -eq 0 ]; then
      env_map["$key"]="$value"
      echo "  ✅ Added: $key"
    fi
  done

elif [ "$MODE" = "--file" ]; then
  ENV_FILE="${2:-.env}"
  if [ ! -f "$ENV_FILE" ]; then
    echo "Error: File not found: $ENV_FILE" >&2
    exit 1
  fi

  while IFS='=' read -r key value; do
    # Skip comments, empty lines, and internal vars
    [[ "$key" =~ ^#.*$ ]] && continue
    [ -z "$key" ] && continue

    skip=0
    for internal in $NETLIFY_INTERNAL_VARS; do
      if [ "$key" = "$internal" ]; then
        echo "  ⏭ Skipping internal Netlify var: $key"
        skip=1
        break
      fi
    done

    if [ "$skip" -eq 0 ]; then
      env_map["$key"]="$value"
    fi
  done < "$ENV_FILE"
fi

# Build JSON output
echo ""
echo "# Variables to migrate:"
first=true
echo "{"
echo '  "variables": {'
for key in "${!env_map[@]}"; do
  if [ "$first" = true ]; then
    first=false
  else
    echo ","
  fi
  echo -n "    \"$key\": \"${env_map[$key]}\""
done
echo ""
echo '  }'
echo "}"

echo ""
echo "# Saved to: $OUTPUT_FILE"
echo "# Use with: UpdateProjectEnvironmentEnvironmentVariables(env_id, $(cat "$OUTPUT_FILE" 2>/dev/null || echo '<above>'))"
