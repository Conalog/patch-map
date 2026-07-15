# Performance Core v2 agent instructions

Before every task, read these documents in order:

1. `docs/reference/performance-core-v2-policy.md`
2. `docs/tasks/2026/07-15/performance-core-v2/BRIEF.md`

Repeat this read after context compaction, session resume, or automatic continuation. The PixiJS GPU product contract, PATCH MAP v0.10 input boundary, and clean-room boundary cannot be changed without explicit user approval.

Work only in the `performance/core-v2` worktree and branch. Do not open or search another worktree, branch, ref, or Git history; the original implementation; a reference package; tarball; dependency source; `node_modules`; `dist`; bundle; source map; or reference internals. Every content search must exclude `node_modules/**`, `dist/**`, `bundle/**`, `*.map`, `*.umd.*`, and `*.bundle.*`. PixiJS knowledge must come from official public documentation/API and the installed PixiJS v8 skills.

The inherited Core v1 implementation is an allowed, read-only architectural baseline inside this worktree. `performance/core-v1`, `cleanroom/implementation-v0.10`, `lab/engine-comparison`, existing evidence, and approved artifacts are frozen. Do not edit them. Core v2 may reuse self-authored Core v1 store/transaction ideas in new Core v2 paths.

Core v2 accepts existing PATCH MAP v0.10 JSON directly while preserving input immutability, stable IDs, component identity, and explicit supported/unsupported reporting. Public API compatibility is not required. Do not restore object-per-entity scene nodes, listeners, tickers, or closures to the hot path.

The production baseline is PixiJS WebGL. WebGPU is experimental and must be reported separately. Preserve warmups, seven raw samples, median, p95, min, max, environment metadata, and honest unfavorable results. Chromium 4x is a development proxy; Windows native stays pending until measured on actual hardware.

The primary agent alone owns the Core v2 `BRIEF.md` and canonical logs. Give each subagent a bounded brief containing its goal, allowed inputs, forbidden boundaries, owned files, validation command, and artifact path.
