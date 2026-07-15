# Goal

Deliver a deliberately incompatible, performance-first Core v1 product for large PATCH MAP-style scenes on low-end Windows-class hardware. The product replaces object-oriented scene identity and implicit update/render behavior with a compact data-oriented API, explicit transaction and flush boundaries, aggregate rendering, deterministic queries, lifecycle safety, and reproducible performance evidence. Success is measured against the frozen compatibility implementation as a baseline, not against its public API or Oracle fixture outputs.

# Scope

- Work only on `performance/core-v1` using the inherited self-authored implementation, user production fixture, official dependency APIs, and self-authored measurements.
- Preserve the compatibility branch, v0.10 verification lab, expected outputs, and approved evidence; do not put legacy compatibility into the new hot path.
- Implement and package the selected Core v1 design after measuring at least two competing store/renderer spikes.

# Current Facts

The compatibility implementation is a useful frozen baseline but its ManagedNode graph, live Pixi handles, JSONPath selection, per-object surface obligations, and legacy ABI are no longer product constraints. The production fixture contains 458 top-level records and the Core v1 acceptance adapter expands it deterministically to 37,071 flat entities. The frozen baseline expanded the same input to 19,577 ManagedNodes and measured about 2.04 seconds first render, 3.91 seconds trusted update, and 90.67 MB retained load heap at the quick 4× checkpoint. Competitive quick spikes selected the dense typed-store/Canvas2D path: it materially outperformed the chunked Pixi Graphics path in first render, animation, and teardown, though spike production shapes and sampling differ. Chromium 4× remains the development proxy; retained heap, GPU behavior, headed usability, and Windows-native approval require production-path evidence.

# Current State

The dedicated branch, policy, and renderer-independent API contract are committed. Baseline instrumentation and both competitive spikes preserve raw evidence; the typed Canvas design is selected and the Pixi aggregate experiment is retained as rejected/provisional evidence. Core v1 now implements a dense numeric store, ID index, generation refs, atomic batches, explicit animation and flush boundaries, spatial hit testing, selection, bounded history/events, aggregate Canvas2D and headless renderers, and a package entry. Focused core, renderer, validation, and 37,071-entity workload tests pass. The separate performance lab, selected-path full measurements, package consumer, memory proof, and final browser QA are in progress.

# Next Step

Run the selected production path across the required 100–5,000 and fully expanded production workloads, use the measurements to remove remaining hot-path rebuilds, then complete the independent light-mode performance lab, browser smoke, package consumer, lifecycle memory proof, and headed verification before the final checkpoint.

# Working Boundary

- `src/core-v1/`
- `performance/core-v1/`
- `lab/performance-v1/`
- `tests/core-v1/`
- `docs/tasks/2026/07-15/performance-core-v1/`
