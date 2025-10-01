#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
if [[ ! -f logs/onchain-discovery.pid ]]; then
  echo "No PID file; stream not running"
  exit 0
fi
pid=$(cat logs/onchain-discovery.pid)
if kill -0 "$pid" 2>/dev/null; then
  kill "$pid"
  echo "Sent SIGTERM to PID $pid"
else
  echo "Process $pid not running"
fi
rm -f logs/onchain-discovery.pid
