**2026-07-15**
- Background: Core v2 must preserve the dense Core v1 control while replacing Canvas2D with an aggregate PixiJS GPU renderer and accepting v0.10 JSON directly.
- Decision: Separate Core v2 policy, task context, code, labs, tests, and evidence; treat every Core v1 and prior-evidence path as read-only.
- Why: Isolation keeps the frozen baseline trustworthy and makes renderer-only differences measurable without reopening compatibility work.
- Impact: New work is confined to Core v2 paths, WebGL is the production baseline, and WebGPU remains experimental.

**2026-07-15**
- PixiJS exposes public aggregate rendering through Mesh, ParticleContainer, Sprite, and retained GraphicsContext, while custom pipes add backend-specific lifecycle risk.
- Compare a fixed-chunk Mesh renderer against a Particle/Sprite/GraphicsContext renderer on the same parser and dense store; select by correctness first, then a documented 15 percent animation threshold with first-frame and heap guardrails.
- This isolates the renderer variable, makes public buffer upload limits explicit, and prevents an unmeasured custom RenderPipe from becoming the architecture.
- WebGL is the production basis, dirty-chunk upload is the strongest supported incremental claim, and WebGPU/custom pipes remain separately labeled experiments.

**2026-07-15**
- The first identical-input Chromium 4x checkpoint completed for Mesh and Particle with zero browser, page, or network errors.
- Select fixed-chunk aggregate Mesh for Core v2 and retain Particle/Sprite/GraphicsContext as the rejected spike.
- At 5,099 dense entities Mesh full-bar p95 was 21.4 ms versus 116.8 ms, first frame was 88.9 ms versus 184.0 ms, and heap was comparable, clearing the documented selection threshold.
- Continue to the full production checkpoint; if the selected Mesh path misses its production animation target, optimize its stable topology and report any remaining miss rather than changing the evidence.

**2026-07-15**
- Both public-API spikes passed the direct v0.10, immutable input, interaction, lifecycle, and headed-browser correctness gates on the same parser and dense store.
- Select chunked aggregate Mesh on the WebGL production baseline; retain Particle/Sprite/GraphicsContext as the rejected comparison and keep WebGPU experimental.
- Independent production trials measured Mesh first frame 44.3 ms, full-bar p95 32.3 ms, and partial-bar p95 8.5 ms versus Particle 370.4 ms, 388.1 ms, and 403.3 ms; retained JS heap was comparable.
- Core v2 ships with explicit square-corner and omitted-stroke Mesh degradation warnings, reports its 98.4 ms full animation schedule regression, and leaves WebGPU and Windows-native performance pending rather than generalizing Chromium 4x results.

**2026-07-15**
- The earlier production checkpoint animated source-hidden bars and therefore could not prove visible GPU work.
- Supersede that checkpoint with the 2026-07-15T13:04:27Z 2+7 matrix and keep Mesh as the winner among tested renderers while marking the 33.3 ms target failed.
- The corrected protocol preserves the original hidden first frame, measures a 9,365-bar visibility transaction, requires non-zero Mesh uploads, and observes real intermediate and final heights.
- Selected Mesh records 39.9 ms first frame, 131.5 ms visibility setup, 43.5 ms full trial-p95 p95, and 14.8 ms partial trial-p95 p95; custom rendering, WebGPU, and Windows-native claims remain future measured work.

**2026-07-15**
- Final audit found hidden unsupported-field, non-target interaction, and stale unresolved-asset debug gaps after the earlier visible-production checkpoint.
- Close those gaps in code and regenerate headed, package, memory, quick, and full 2+7 evidence before finalizing Core v2.
- The final 13:52:05Z matrix passes 18-run/162-trial/522-summary verification; Mesh remains the measured winner, while production rounded bars exercise the rejected GraphicsContext fallback rather than a pure ParticleContainer path.
- Selected Mesh records 40.2 ms first frame, 135.1 ms visibility setup, 42.8 ms full p95, and 10.6 ms partial p95; the 33.3 ms target still fails by 9.5 ms, WebGPU is unavailable, and Windows native remains pending.
