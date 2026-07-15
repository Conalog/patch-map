# Performance Core v1 agent instructions

Before every task, read these documents in order:

1. `docs/reference/performance-core-v1-policy.md`
2. `docs/tasks/2026/07-15/performance-core-v1/BRIEF.md`

Repeat this read after context compaction, session resume, or automatic continuation. The performance-first product contract and clean-room boundary cannot be changed without explicit user approval.

Work only in the `performance/core-v1` worktree and branch. Do not open or search another worktree, branch, ref, or Git history; the original implementation; a reference package; tarball; bundle; source map; or reference internals. Every content search must exclude `node_modules/**`, `dist/**`, `*.map`, `*.umd.*`, and `*.bundle.*`.

The inherited clean-room implementation in this worktree is an allowed baseline and disposable source of self-authored ideas. The user-provided production fixture, official public dependency APIs, and self-authored benchmarks are allowed inputs. Existing `artifacts/expected/**`, reference evidence, and the v0.10 verification lab are immutable preservation targets, not Core v1 completion gates.

Core v1 is intentionally allowed to break the v0.10 API and observable contract. Do not put a legacy adapter, ManagedNode facade, public Pixi Container identity, JSONPath selector, or object-per-listener/ticker model into the core hot path. Any future compatibility adapter belongs outside Core v1.

Every subagent inherits these boundaries. The primary agent alone owns `BRIEF.md` and canonical logs. Give each subagent a bounded brief containing its goal, allowed inputs, owned files, validation command, and artifact path.
