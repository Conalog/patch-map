# Tests

Tests are grouped by the boundary they prove.

| Area | Purpose |
| --- | --- |
| `tests/semantic/` | pure state, parsing, geometry, and policy |
| `tests/core/` | committed runtime and publication integration |
| `tests/engine/` | product authorities and coordinators |
| `tests/rendering/` | PixiJS adapters and render publication |
| `tests/integration/` | public and cross-owner behavior |
| `tests/performance/` | benchmark, probe, and artifact policy |
| `tests/tooling/` | production import and repository boundaries |
| `tests/fixtures/`, `tests/support/` | shared deterministic inputs and focused test adapters |

Start with the focused file, then use the gate routing in
[`docs/engineering/verification.md`](../docs/engineering/verification.md).
