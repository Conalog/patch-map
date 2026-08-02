# PatchMap product agent instructions

Before every task, read these documents in order:

1. `docs/reference/patch-map-product-policy.md`
2. `docs/tasks/2026/07-30/patch-map-package-promotion/BRIEF.md`

Repeat this read after context compaction, session resume, or automatic
continuation. The PixiJS GPU product contract, PATCH MAP v0.10 input boundary,
and clean-room boundary cannot be changed without explicit user approval.

Work only in this dedicated `feat/patch-map-pixi` worktree and branch until
the cleanup PR lands. Do not open or search another worktree, branch, ref, Git
history, original/reference internals, dependency source, `node_modules`,
`dist`, bundles, source maps, or archives. Every content search must exclude
`node_modules/**`, `dist/**`, `bundle/**`, `*.map`, `*.umd.*`, and
`*.bundle.*`. PixiJS knowledge must come from official public documentation/API
and the installed PixiJS v8 skills.

The shipping product is the root `@conalog/patch-map` package and its primary
class is `PatchMap`. Do not restore the deleted legacy root API, Core v1
Canvas2D product, versioned package subpaths, or versioned public Lab routes.
Neutral dense-store internals may remain under `src/patch-map/dense`.

PatchMap accepts existing PATCH MAP v0.10 JSON directly while preserving input
immutability, stable IDs, component identity, deterministic interpretation,
and atomic failure. Keep the aggregate PixiJS renderer, root interaction
authority, central scheduler, and explicit resource ownership; do not add
per-entity display objects, listeners, tickers, or closures to hot paths.

Approved functional-contract fixtures, normalized expected observations, and
review evidence are immutable. Retained digest-bound performance evidence may
keep its historical `core-v2` identifiers and paths. The obsolete clean-room
handoff, Core v1 control, completed parity captures, and unreferenced raw
performance outputs were removed with explicit user approval on 2026-07-30.
Current product code, docs, examples, package exports, builds, operational
tools, and public Lab routes use PatchMap naming.

WebGL is the production baseline. WebGPU remains experimental. Chromium is a
development proxy; Windows native and other qualified external cells stay
pending until measured on their actual targets. Preserve honest unfavorable
results and do not substitute prior evidence for a changed code path.

Run gates by risk: targeted tests plus lint/typecheck for ordinary changes;
full unit/build/contract at tranche completion; headless browser, package,
memory, or performance only when their ownership or hot path changes. Finish
PR work with intent-scoped commits and a clean worktree.
