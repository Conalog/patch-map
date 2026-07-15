# Goal

Deliver Core v2 as a PixiJS v8 GPU-backed, performance-first PATCH MAP engine. It must accept the current v0.10 JSON dataset directly, preserve stable ID/component/relation identity and caller input immutability, keep Core v1's dense/flat state discipline, and use aggregate rendering rather than rebuilding an object-per-entity scene graph. WebGL is the production baseline; WebGPU evidence is experimental.

# Scope

- Work only in `performance/core-v2`; keep Core v1, compatibility/engine labs, dependency internals, and existing evidence frozen.
- Build and compare Mesh/custom-batch and Particle/Sprite/GraphicsContext spikes over the same parser/store, then finish the measured winner with interaction, animation, text, assets, extract, package, browser, and lifecycle proof.
- Preserve raw two-warmup/seven-sample results for 100-5,000 records plus production, and report both improvements and regressions against comparable Core v1 workloads.

# Current Facts

- Core v1 supplies the frozen dense-store, transaction, spatial-index, animation, and Canvas2D comparison baseline.
- Core v2 uses async Pixi initialization, manual invalidation, a few aggregate layers, root events, and one central scheduler.
- Short ASCII text uses `BitmapText`; non-ASCII or long text uses guarded `Text`. Advanced styling/wrapping and atlas-frame mapping remain unsupported.
- PixiJS stays a peer dependency; packed ESM/CJS consumers pass. The measured browser exposed WebGL2/SwiftShader but no WebGPU adapter.

# Current State

- The immutable v0.10 parser expands production deterministically to 37,071 entities, preserves component identity, and rejects duplicate identities atomically. Chunked Mesh is selected with separate rect/bar/relation lanes, structural fallback, shared asset leases, transformed CPU hit testing, text fallback, Prepare/Extract, resize, destroy, and re-init.
- The final Chromium 4× 2+7 matrix retains 162 raw trials. Because all 9,365 production bars are source-hidden, it isolates a 135.1 ms visibility transaction before measuring visible animation. Mesh records 40.2 ms first frame, 42.8 ms full-animation p95, and 10.6 ms partial p95. It decisively beats the rounded-bar GraphicsContext path but misses the 33.3 ms target by 9.5 ms; production performance approval is withheld.
- Headed browser proof passes 31 checks with no console/page/network errors; 40 files/269 tests, packed consumers, and repeated lifecycle proof pass. Mesh square-corners radii and omits rect strokes with structured diagnostics. WebGPU is unavailable and native Windows remains pending.

# Next Step

Run the preserved protocol on native low-end Windows before making a production claim. If it confirms the bottleneck, compare a custom batcher/RenderPipe on the same store; measure WebGPU separately only when an adapter is available.

# Working Boundary

- `src/core-v2/`
- `performance/core-v2/`
- `lab/performance-v2/`
- `tests/core-v2/`
- `docs/tasks/2026/07-15/performance-core-v2/`
