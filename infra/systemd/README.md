Systemd Units — Trenches

Overview
The units in this directory are templates for running services under systemd on a Jetson (or any Linux host). Copy them to /etc/systemd/system/ and enable/start as needed.

Units
- trenches-agent-core.service (port 4010)
- trenches-social-ingestor.service (4012)
- trenches-onchain-discovery.service (4013)
- trenches-safety-engine.service (4014)
- trenches-policy-engine.service (4015)
- trenches-executor.service (4011)
- trenches-position-manager.service (4016)
- trenches-narrative-miner.service (4017)

Order & Dependencies
1) agent-core
2) social-ingestor, onchain-discovery, safety-engine
3) policy-engine (requires wallet keystore)
4) executor (requires wallet keystore / RPC)
5) position-manager
6) narrative-miner (optional if upstream feeds are not ready)

Usage
sudo cp infra/systemd/trenches-*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable trenches-agent-core.service
sudo systemctl start trenches-agent-core.service

For each service: sudo systemctl enable/start trenches-<name>.service

Logs
Use journalctl -u trenches-<name>.service -f to follow logs.

Environment
All units load EnvironmentFile=%h/trenches/.env. Ensure .env contains ports and optional tokens. Without credentials, services idle gracefully but still respond on /healthz and /metrics.

