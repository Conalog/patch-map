# Goal

Deliver a deliberately incompatible, performance-first Core v1 product for large PATCH MAP-style scenes on low-end Windows-class hardware. The product replaces object-oriented scene identity and implicit update/render behavior with a compact data-oriented API, explicit transaction and flush boundaries, aggregate rendering, deterministic queries, lifecycle safety, and reproducible performance evidence. Success is measured against the frozen compatibility implementation as responsibility context, not against its public API or Oracle outputs.

# Scope

- Work only on `performance/core-v1` using the inherited self-authored implementation, user production fixture, official dependency APIs, and self-authored measurements.
- Preserve the compatibility branch, v0.10 verification lab, expected outputs, and approved evidence; keep legacy compatibility outside the Core v1 hot path.
- Package and validate the selected Core v1 design after retaining the frozen baseline and two competing store/renderer spikes.

# Current Facts

The production fixture contains 458 top-level records and expands deterministically to 37,071 Core v1 entities. The frozen baseline expanded it differently to 19,577 ManagedNodes, so baseline ratios are directional rather than apples-to-apples. Competitive spikes selected the dense typed-store/aggregate Canvas2D path and retained the flat Pixi experiment as rejected/provisional evidence. The final Chromium 4× full matrix uses two warmups and seven samples at 100, 500, 1,000, 2,000, 5,000, and production scale. Production medians are 600.4 ms load, 27.4 ms first flush, 62.3/52.7 ms trusted/random 10% commit plus flush, 15.5 ms post-update spatial hit, and 25.5 ms animation-frame p95. Native Windows remains pending.

# Current State

Core v1 is complete as a development candidate. It implements a dense numeric store, ID and endpoint-adjacency indexes, generation refs, atomic ordered batches, validated canonical patching, lazy dirty-slot spatial refresh, deterministic explicit animation time, selection, bounded events/history, aggregate Canvas2D and headless renderers, and a packed `./core-v1` entry. The separate light performance lab exercises synthetic and fully expanded production data. Unit/integration, browser, full build, ESM/CJS/NodeNext packed consumer, nine-cycle production memory lifecycle, performance evidence validation, and zero-vulnerability audit gates pass. Raw median/p95/min/max samples and measurement limits are preserved. Existing v0.10 source, lab, expected output, and approved evidence remain unchanged.

# Next Step

When actual low-end Windows hardware is available, run the same headed full matrix and lifecycle workload, append native CPU/memory/raster evidence, and compare it without changing the current proxy result or claiming approval before measurement.

# Working Boundary

- `src/core-v1/`
- `performance/core-v1/`
- `lab/performance-v1/`
- `tests/core-v1/`
- `docs/tasks/2026/07-15/performance-core-v1/`
