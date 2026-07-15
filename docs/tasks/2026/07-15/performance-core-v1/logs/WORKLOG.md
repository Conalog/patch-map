# Worklog

**2026-07-15**

- **Work:** Created a dedicated performance-first policy, resume card, and branch-specific agent boundary while retaining the inherited compatibility implementation as a frozen baseline.
- **Evidence:** The active policy explicitly permits incompatibility, requires two measured spikes, preserves v0.10 evidence and lab files, and keeps prohibited source boundaries intact.
- **Next:** Instrument baseline costs and execute the typed-buffer/Canvas and flat-store/Pixi aggregate spikes on identical workloads.

**2026-07-15**

- **Work:** Fixed the renderer-independent Core v1 public contract before selecting a spike, including lifecycle, document validation, batch updates, queries, animation, events, and render publication.
- **Evidence:** The contract has no public scene-node identity, per-entity emitter, implicit ticker, JSONPath selector, or compatibility adapter and states atomic failure and state/frame timing explicitly.
- **Next:** Compare the baseline and two spikes, select the measured store/renderer path, and implement this contract against the selected backend.

**2026-07-15**

- **Work:** Instrumented the frozen compatibility baseline, measured dense Canvas and chunked Pixi aggregate spikes, selected Canvas, and implemented the initial Core v1 store, transaction, animation, spatial input, renderer, and workload adapters.
- **Evidence:** Raw quick samples and summaries are preserved; 27 focused Core v1 tests plus the fully expanded 37,071-entity headless acceptance load pass, and the package build emits separate Core v1 ESM, CJS, UMD, and declarations.
- **Next:** Complete selected-path 4× measurements, performance lab/browser smoke, package consumer, memory lifecycle proof, and risk-proportional regression gates.

**2026-07-15**

- **Work:** Completed Core v1 correctness hardening, hot-path optimization, the independent light browser lab, packed consumer proof, lifecycle memory proof, and the final selected-path performance matrix.
- **Evidence:** Thirty-one test files with 225 tests pass; the full 4× matrix preserves two warmups, seven raw samples, median/p95/min/max for six workloads, production direct re-initialization retains one canvas with 64,464 bytes heap growth under the 2 MiB allowance, browser errors are zero, and npm audit reports zero vulnerabilities.
- **Next:** Preserve this development candidate and run the same headed matrix on actual low-end Windows hardware when available; do not promote proxy raster, GPU, or latency results to Windows-native approval.
