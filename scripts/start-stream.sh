#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
if [[ -f logs/onchain-discovery.pid ]]; then
  if kill -0 "$(cat logs/onchain-discovery.pid)" 2>/dev/null; then
    echo "onchain-discovery already running (PID $(cat logs/onchain-discovery.pid))"
    exit 0
  fi
fi
set -a
source .env
set +a
corepack pnpm --filter @trenches/onchain-discovery dev > logs/onchain-discovery.log 2>&1 &
echo $! > logs/onchain-discovery.pid
echo "Started onchain-discovery (PID $(cat logs/onchain-discovery.pid))"
