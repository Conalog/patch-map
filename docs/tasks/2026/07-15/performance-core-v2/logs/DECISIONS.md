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

**2026-07-16**
- The complete 173-case approved corpus is now available inside the isolated Core v2 worktree, while the existing aggregate Pixi runtime proves only the earlier prototype surface.
- Treat canonical fixtures/expected/reviews as immutable inputs and promote implementation status only from independent package-bound actual evidence plus the same case's focused Lab route.
- This preserves analysis-owner semantics, prevents self-approving generated output, and makes progress restartable across the contract dependency graph.
- Begin with runner/Lab infrastructure and the LIF-001/LIF-002/DAT-001/DAT-002/CSM-001/CSM-003 slice, then expand through remaining P0 lifecycle/data before rendering/layout/assets.

**2026-07-16**
- The immutable DAT-001 and LIF-002 expected records require INVALID_DISCRIMINATOR and INVALID_DATASET, but the same approved semantic contract closes public input diagnostics around INVALID_RECORD_KIND and excludes both values.
- Keep the product diagnostic registry closed, emit the approved closed code, preserve the two mismatches in actual evidence, and require a versioned contract-owner resolution before either case is promoted.
- Adding aliases would violate the closed registry, while editing expected evidence would break the user-approved immutable corpus and erase a real specification inconsistency.
- Implementation and all unaffected automation continue; DAT-001 and LIF-002 remain honest non-passing rows until the corpus is versioned, and the overall Goal is not marked blocked while meaningful work remains.

**2026-07-16**
- A full immutable-expected audit expands the closed-diagnostic inconsistency from the first two rows to 12 assertions across 10 cases: QRY-001, LIF-002, DAT-001, DAT-004, DAT-006, AST-001, AST-002, UPD-003, UPD-009, and ANI-002.
- Apply one contract-wide rule: Core v2 emits only the version-1 registry codes; automation preserves every out-of-registry expected mismatch and cannot promote those rows without a versioned contract-owner resolution.
- The excluded values are AMBIGUOUS_TARGET, ASSET_ALIAS_CONFLICT, HIERARCHY_CYCLE, INVALID_ASSET_DESCRIPTOR, INVALID_COLOR, INVALID_DATASET, INVALID_DISCRIMINATOR, INVALID_LEGACY_ROOT, INVALID_REPLACEMENT, and NON_MONOTONIC_TIME; treating them as aliases would invent public diagnostics.
- All other implementation/evidence work continues and the immutable corpus remains untouched, but truthful 173/173 exact promotion has a ten-case contract blocker.

**2026-07-16**
- Background: `structuredClone` accepts cycles, maps, sets, and non-finite values that lose meaning in JSON artifacts.
- Decision: Actual evidence accepts only JSON-round-trip-safe primitives, dense arrays, and plain enumerable data records; unsafe event or semantic-probe payloads fail execution while cleanup still runs.
- Why: Evidence must preserve the exact observed value instead of silently omitting or coercing it during artifact serialization.
- Impact: The runner journals all six public events from engine creation through destroy and releases all six subscriptions; listener isolation cannot hide evidence callback failure.

**2026-07-16**
- Background: Source host simulations and the approved `DAT-001` order-hash literal lack independent promotion authority or a versioned computation rule.
- Decision: Only a digest-bound packed-host probe may populate promotable journey host facts, and `DAT-001 /scene/orderHash` remains unresolved.
- Why: A self-authored mock cannot prove consumer integration, while dataset references, seeds, and product semantic hashes are not interchangeable with an undefined hash algorithm.
- Impact: Source host actuals remain in a non-promotion extension, and comparison preserves the unresolved order-hash failure until approved evidence is versioned.
