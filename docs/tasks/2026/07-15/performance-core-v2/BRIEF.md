# Goal

Deliver Core v2 as a PixiJS v8 GPU-backed, performance-first PATCH MAP engine. It must accept the current v0.10 JSON dataset directly, preserve stable ID/component/relation identity and caller input immutability, keep Core v1's dense/flat state discipline, and use aggregate rendering rather than rebuilding an object-per-entity scene graph. WebGL is the production baseline; WebGPU evidence is experimental.

# Scope

- Work only in `performance/core-v2`; keep Core v1, compatibility/engine labs, dependency internals, and existing evidence frozen.
- Build and compare Mesh/custom-batch and Particle/Sprite/GraphicsContext spikes over the same parser/store, then finish the measured winner with interaction, animation, text, assets, extract, package, browser, and lifecycle proof.
- Preserve raw two-warmup/seven-sample results for 100-5,000 records plus production, and report both improvements and regressions against comparable Core v1 workloads.

# Current Facts

- Core v1 provides an allowed self-authored dense store, atomic transaction, spatial index, explicit animation, and reproducible Canvas2D benchmark baseline in this worktree.
- PixiJS v8 requires asynchronous `Application.init()`. Manual rendering uses `autoStart: false`; a few render groups can isolate viewport transforms without entity-level scene nodes.
- Stable Graphics geometry is efficient, but clearing/redrawing dynamic Graphics rebuilds tessellation. ParticleContainer restricts particles to one texture source and needs explicit bounds. Dynamic BitmapText is cheap, while CJK/advanced text needs guarded Text fallback.
- The current package declares PixiJS v8 as a peer and has no Core v2 subpath or Core v2 verification surface yet.

# Current State

Core v2 policy and task context are separated from the completed Core v1 task. Official PixiJS API research, exact production-schema inventory, and Core v1 reuse/benchmark seam analysis are in progress; no Core v2 runtime code has been written.

# Next Step

Complete the official PixiJS lifecycle/rendering/resource research and schema inventory, then record the architecture, spike protocol, risks, and selection thresholds before implementing either renderer.

# Working Boundary

- `src/core-v2/`
- `performance/core-v2/`
- `lab/performance-v2/`
- `tests/core-v2/`
- `docs/tasks/2026/07-15/performance-core-v2/`
