# Performance

This root owns repeatable workloads, measurement protocols, browser harnesses,
reports, and executable performance runners.

| Area | Purpose |
| --- | --- |
| `contract-*` | retained performance-contract workload and protocol |
| `harness/` | reusable phase measurement implementation |
| `report/` | promoted evidence verification |
| `runners/` | focused executable checkpoints |

Generated results belong under ignored `.artifacts/performance/`. Performance
code must not depend on Lab routes or Lab-owned fixtures.
