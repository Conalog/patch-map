# Verification

This root owns reusable conformance logic and executable non-performance gates.

| Area | Purpose |
| --- | --- |
| `contract/` | contract folds, handlers, comparison, and observation logic |
| `browser/` | browser gates for Lab and rendered contract cases |
| `catalog/` | catalog generation, approval, and static verification |
| `package/` | tarball, installed-consumer, supply-chain, and declaration gates |
| `docs/` | documentation integrity checks |
| `fixtures/` | datasets shared by Lab, performance, and tests |
| `scenarios/` | deterministic scenario builders |

Prefer npm commands from `package.json`; invoke a file directly only when its
arguments are not exposed there.
