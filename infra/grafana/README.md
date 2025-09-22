Grafana — Trenches Overview

Prerequisites
- Prometheus scraping per-service /metrics endpoints (e.g., via static targets on localhost:4011..4017).
- Grafana with a Prometheus data source configured.

Steps
1) Configure Prometheus to scrape:
   - job_name: 'trenches'
     static_configs:
       - targets: ['127.0.0.1:4010','127.0.0.1:4011','127.0.0.1:4012','127.0.0.1:4013','127.0.0.1:4014','127.0.0.1:4015','127.0.0.1:4016','127.0.0.1:4017']
2) In Grafana, add a data source named 'Prometheus' pointing to your Prometheus server.
3) Import dashboard infra/grafana/dashboards/trenches-overview.json.
4) Verify panels:
   - Open Positions (position_manager_positions)
   - SOL Exposure (position_manager_total_size_sol)
   - Exits Triggered (sum over position_exits_total by reason)

Notes
- Additional panels can be added for API RPM by importing new metrics or using UI Gateway’s /api/metrics for quick summaries.

