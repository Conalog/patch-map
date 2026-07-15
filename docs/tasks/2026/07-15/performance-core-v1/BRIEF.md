# Goal

Deliver a deliberately incompatible, performance-first Core v1 product for large PATCH MAP-style scenes on low-end Windows-class hardware. The product replaces object-oriented scene identity and implicit update/render behavior with a compact data-oriented API, explicit transaction and flush boundaries, aggregate rendering, deterministic queries, lifecycle safety, and reproducible performance evidence. Success is measured against the frozen compatibility implementation as a baseline, not against its public API or Oracle fixture outputs.

# Scope

- Work only on `performance/core-v1` using the inherited self-authored implementation, user production fixture, official dependency APIs, and self-authored measurements.
- Preserve the compatibility branch, v0.10 verification lab, expected outputs, and approved evidence; do not put legacy compatibility into the new hot path.
- Implement and package the selected Core v1 design after measuring at least two competing store/renderer spikes.

# Current Facts

The compatibility implementation is a useful frozen baseline but its ManagedNode graph, live Pixi handles, JSONPath selection, per-object surface obligations, and legacy ABI are no longer product constraints. Core v1 may expose generation-checked entity references or snapshots, batch transactions, explicit commit/flush semantics, and a completely different renderer. The production fixture contains 458 top-level records and expands into a much larger public scene in the compatibility implementation. Required benchmark sizes are 100, 500, 1,000, 2,000, and 5,000 objects plus that production workload. Chromium 4× is the development proxy; Windows-native approval remains pending.

# Current State

The dedicated branch and worktree exist. This branch-specific policy and resume card establish the incompatible product boundary without modifying the compatibility charter. No Core v1 implementation, benchmark instrumentation, or competitive spike has been written yet. Existing compatibility code and reports remain available inside this worktree only as self-authored baseline material.

# Next Step

Instrument the frozen compatibility baseline by responsibility, then run two minimal competing spikes against identical generated and production workloads: a dense typed-buffer/Canvas command path and a flat-store/Pixi aggregate path. Preserve raw measurements, choose by 4× CPU, allocation, update, render, and teardown evidence, and proceed directly into the selected production implementation.

# Working Boundary

- `src/core-v1/`
- `performance/core-v1/`
- `lab/performance-v1/`
- `tests/core-v1/`
- `docs/tasks/2026/07-15/performance-core-v1/`
