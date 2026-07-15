# Decisions

**2026-07-15**

- **Background:** The compatibility implementation preserves a broad v0.10 observable contract at measurable data, scene, selector, and lifecycle cost.
- **Decision:** Build Core v1 on a dedicated branch as an intentionally incompatible product, measure two competing data/renderer spikes, and keep any future compatibility adapter outside the core hot path.
- **Why:** Removing live scene-node identity and legacy ABI constraints permits dense storage, batch transactions, explicit frames, aggregate rendering, and lower allocation pressure.
- **Impact:** Core v1 completion is judged by its own deterministic contract, safety, package usability, browser behavior, and performance evidence; Oracle outputs and v0.10 compatibility are not gates.
