#!/usr/bin/env bash
set -euo pipefail

# Jetson Orin Nano setup for Trenches

if ! command -v node >/dev/null 2>&1; then
  echo "Installing Node.js (20.x)"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs build-essential
fi

echo "Enabling corepack and installing pnpm"
corepack enable || true
corepack prepare pnpm@9.12.3 --activate

echo "Installing dependencies"
pnpm install --frozen-lockfile

echo "Building services"
pnpm --filter "./services/*" run build

echo "Building UI"
pnpm --filter "./apps/*" run build || true

echo "Creating systemd units"
sudo cp -v infra/systemd/trenches-*.service /etc/systemd/system/
sudo systemctl daemon-reload

echo "Enable services (start manually to control order)"
for svc in agent-core social-ingestor onchain-discovery safety-engine policy-engine executor position-manager narrative-miner; do
  sudo systemctl enable trenches-${svc}.service || true
done
sudo systemctl enable trenches-ui-gateway.service || true

echo "Done. Configure .env and start services with systemctl start trenches-agent-core.service ..."
