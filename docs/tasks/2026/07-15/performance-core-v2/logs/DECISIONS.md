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
