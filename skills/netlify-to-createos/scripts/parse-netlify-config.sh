#!/usr/bin/env bash
# parse-netlify-config.sh
# Extracts key fields from netlify.toml and outputs JSON.
# Usage: ./parse-netlify-config.sh [path/to/netlify.toml]
#
# Output: JSON with build settings, env vars, redirects, headers, functions config

set -euo pipefail

CONFIG_PATH="${1:-netlify.toml}"

if [ ! -f "$CONFIG_PATH" ]; then
  echo '{"error":"File not found","path":"'"$CONFIG_PATH"'"}' >&2
  exit 1
fi

# Use awk to parse the TOML and extract sections
awk '
BEGIN {
  in_build = 0
  in_build_env = 0
  in_redirect = 0
  in_headers = 0
  in_functions = 0
  redirect_count = 0
  header_count = 0
  plugin_count = 0

  print "{"
}

# [build]
/^\[build\]/ {
  in_build = 1
  in_build_env = 0
  in_redirect = 0
  in_headers = 0
  in_functions = 0
  next
}

# [build.environment]
/^\[build\.environment\]/ {
  in_build = 0
  in_build_env = 1
  in_redirect = 0
  in_headers = 0
  in_functions = 0
  printf "  \"build\": {\n"
  next
}

# [[redirects]]
/^\[\[redirects\]\]/ {
  if (in_build_env) {
    printf "  },\n"
  }
  in_build = 0
  in_build_env = 0
  in_redirect = 1
  in_headers = 0
  in_functions = 0
  redirect_count++
  if (redirect_count == 1) {
    printf "  \"redirects\": [\n"
  }
  next
}

# [[headers]]
/^\[\[headers\]\]/ {
  if (in_build_env) {
    printf "  },\n"
  }
  in_build = 0
  in_build_env = 0
  in_redirect = 0
  in_headers = 1
  in_functions = 0
  header_count++
  if (header_count == 1) {
    printf "  \"headers\": [\n"
  }
  next
}

# [functions]
/^\[functions\]/ {
  if (in_build_env) printf "  },\n"
  if (in_redirect) printf "    }]"
  if (in_headers) printf "    }]"
  in_build = 0
  in_build_env = 0
  in_redirect = 0
  in_headers = 0
  in_functions = 1
  next
}

# Lines within sections
{
  if (in_build && /^[a-z]/) {
    split($0, kv, "=")
    gsub(/^[ \t]+|[ \t]+$/, "", kv[1])
    gsub(/^[ \t"]+|[ \t"]+$/, "", kv[2])
    printf "  \"build_%s\": \"%s\",\n", kv[1], kv[2]
  }
  else if (in_build_env && /=/) {
    split($0, kv, "=")
    gsub(/^[ \t]+|[ \t"]+$/, "", kv[1])
    gsub(/^[ \t"]+|[ \t"]+$/, "", kv[2])
    if (env_count++ == 0) {
      printf "    \"environment\": {\n"
    }
    printf "      \"%s\": \"%s\",\n", kv[1], kv[2]
  }
  else if (in_redirect && /=/) {
    if (index($0, "[[headers") == 0) {
      split($0, kv, "=")
      gsub(/^[ \t]+|[ \t]+$/, "", kv[1])
      gsub(/^[ \t"]+|[ \t"]+$/, "", kv[2])
      printf "    \"%s\": \"%s\",\n", kv[1], kv[2]
    }
  }
  else if (in_headers && /=/) {
    split($0, kv, "=")
    gsub(/^[ \t]+|[ \t]+$/, "", kv[1])
    gsub(/^[ \t"]+|[ \t"]+$/, "", kv[2])
    printf "    \"%s\": \"%s\",\n", kv[1], kv[2]
  }
  else if (in_functions && /=/) {
    split($0, kv, "=")
    gsub(/^[ \t]+|[ \t]+$/, "", kv[1])
    gsub(/^[ \t"]+|[ \t"]+$/, "", kv[2])
    printf "  \"function_%s\": \"%s\",\n", kv[1], kv[2]
  }
}

END {
  if (in_build_env) printf "    },\n  },\n"
  if (in_redirect) printf "    }\n  ],\n"
  if (in_headers) printf "    }\n  ],\n"
  printf "  \"_parsed\": true\n"
  print "}"
}
' "$CONFIG_PATH"
