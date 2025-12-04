#!/usr/bin/env bash
set -euo pipefail

BASE=${BASE:-"http://127.0.0.1:8787"}

function check() {
  local path="$1"
  echo "==> GET $BASE$path"
  curl -sS -i "$BASE$path" | awk 'NR==1{print}'
}

check "/"
check "/api"
check "/api/v1"
check "/api/v1/health"
check "/api/v1/manifests"
check "/api/v1/manifests/concert"

# Validate example JSON shape quickly
body=$(curl -sS "$BASE/api/v1/manifests/concert")
if ! echo "$body" | jq -e '.type or .types' >/dev/null; then
  echo "Unexpected JSON shape" >&2
  exit 1
fi

echo "Smoke tests completed."