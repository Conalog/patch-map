# Decisions

**2026-07-15**

- **Background:** The compatibility implementation preserves a broad v0.10 observable contract at measurable data, scene, selector, and lifecycle cost.
- **Decision:** Build Core v1 on a dedicated branch as an intentionally incompatible product, measure two competing data/renderer spikes, and keep any future compatibility adapter outside the core hot path.
- **Why:** Removing live scene-node identity and legacy ABI constraints permits dense storage, batch transactions, explicit frames, aggregate rendering, and lower allocation pressure.
- **Impact:** Core v1 completion is judged by its own deterministic contract, safety, package usability, browser behavior, and performance evidence; Oracle outputs and v0.10 compatibility are not gates.

**2026-07-15**

- **Background:** Implicit scene-node mutation and renderer-owned state make update cost, failure atomicity, and frame publication difficult to reason about or measure independently.
- **Decision:** Define Core v1 as a flat scene database with immutable caller input, atomic ordered batches, generation-checked references, explicit deterministic animation time, and a separate `flush()` frame boundary.
- **Why:** This contract exposes expensive work, prevents partially applied changes, and lets competing aggregate renderers share the same public state semantics.
- **Impact:** PixiJS nodes and backend handles are private, nested production input is flattened outside the core, and integrations must schedule animation and rendering explicitly.

**2026-07-15**

- **Background:** Quick 4× evidence showed the typed Canvas spike at roughly 1.7 ms production first render and 0.1 ms teardown p95, while the chunked Pixi Graphics spike retained materially higher frame and teardown cost with large run-to-run variance.
- **Decision:** Select a dense typed entity store, spatial index, explicit dirty state, and one aggregate Canvas2D renderer as the Core v1 production path; retain the Pixi aggregate spike only as rejected/provisional comparison evidence.
- **Why:** The selected path best isolates data mutation from frame publication, eliminates per-entity display objects, and measured substantially lower first-render, animation, and lifecycle cost.
- **Impact:** Production work now targets the fully expanded 37,071-entity acceptance document and must still prove retained heap, browser usability, full 100–5,000 measurements, and Windows-native pending status without treating quick spike numbers as final approval.
