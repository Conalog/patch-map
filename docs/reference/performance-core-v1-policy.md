# Performance Core v1 Policy

## Product intent

- Build a new performance-first PATCH MAP product for low-end Windows and large scenes.
- Compatibility with PATCH MAP v0.10 exports, live handles, scene hierarchy, selectors, errors, events, history, fixtures, or observable timing is not required.
- Preserve deterministic Core v1 behavior, input immutability, lifecycle safety, atomic failure, and explicit state-versus-frame boundaries.
- Keep compatibility work outside the Core v1 hot path and defer any adapter to a separate package or future task.

## Clean-room boundary

- Allowed inputs are the inherited self-authored clean-room implementation in this worktree, the user-provided production fixture, official public dependency APIs, and self-authored benchmarks and experiments.
- Do not open or search another worktree, branch, Git ref, Git history, original/reference implementation, reference package, tarball, bundle, source map, or reference internals.
- Every content search excludes `node_modules/**`, `dist/**`, `*.map`, `*.umd.*`, and `*.bundle.*`. Dependency validation uses public imports only.
- Preserve `artifacts/expected/**`, approved evidence, and the existing v0.10 browser lab unchanged. They are baseline evidence, not Core v1 acceptance gates.

## Product contract

- Define a small explicit API around create, load, transaction, commit, flush, query, hit-test, selection, frame, snapshot, and destroy.
- Synchronous transactions update authoritative data only. `flush()` publishes a deterministic render frame and reports changed ranges and timing.
- Invalid transactions are atomic: no partial state, dirty range, event, or render mutation may escape.
- Queries return snapshots or generation-checked lightweight references, never public Pixi scene nodes.
- Events are batch-level immutable records emitted at commit/flush boundaries. Core objects do not own per-entity listeners, tickers, or closures.

## Architecture freedom

- Prefer dense/flat stores, typed buffers where measured, ID-to-slot indexes, adjacency buffers, generation checks, dirty ranges, pooled commands, and aggregate rendering.
- ManagedNode, object-per-entity DisplayObject trees, JSONPath selection, and the v0.10 public facade may be removed.
- Evaluate at least two competing renderer/store spikes before choosing the production path. Web Worker, OffscreenCanvas, WebGPU, or a custom batcher require measured benefit.
- Optimize data layout, CPU work, allocation, GC, GPU upload, and teardown separately. Do not hide costs inside implicit frames.

## Measurement contract

- Measure the frozen compatibility implementation as baseline without changing it.
- Preserve warmups, raw samples, median, p95, min, max, and environment metadata for 100, 500, 1,000, 2,000, and 5,000 objects plus the production fixture.
- Separate init, normalize/load, first render, trusted and random bulk update, bar animation frame p95, hit-test/selection, teardown, and retained heap.
- Use Chromium 4× CPU proxy as the primary development gate. Mark Windows native results pending until measured on actual hardware.
- Run expensive suites only at meaningful checkpoints; use microbenchmarks and profiler traces while selecting architecture.

## Completion gates

- Ship the documented Core v1 API, chosen data store and aggregate renderer, performance lab, deterministic unit/integration/browser tests, package consumer proof, lifecycle memory proof, and reproducible performance report.
- Demonstrate the production fixture and 100–5,000 object workloads in a headed browser.
- Record rejected spikes and the measured reason for the selected architecture.
- Keep intent-scoped commits and a clean worktree. Report open platform limits without promoting proxy measurements to Windows-native approval.

## Delegation

- Parallelize independent spikes, baseline instrumentation, API tests, browser lab, and package/memory review when file ownership is disjoint.
- All agents inherit the same clean-room boundary. The primary agent reviews, integrates, and runs checkpoint gates.
