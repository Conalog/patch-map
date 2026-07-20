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

**2026-07-20**
- Background: Partial semantic mutation must preserve stable targets without returning to object-per-entity scene reconstruction or using full dataset load as a hidden update path.
- Decision: `CoreV2Engine` remains the sole externally visible writer. Its candidate authority is parsed and planned into `CoreV2.reconcile`, which applies exactly one dense transaction only when the current operation vocabulary can reproduce the observable change.
- Why: This keeps product authority, revision, history, renderer invalidation, and stable ID/component identity on one auditable path while retaining the aggregate Pixi renderer.
- Impact: Same-ID updates preserve ref/slot/selection and dirty ranges. Unsupported authored reorder/background changes are explicit refusals; structural replacement is remove/add and never mislabeled as identity preservation.

**2026-07-20**
- Background: The focused Lab must grow incrementally without importing expected values or implying that an unexecuted action/case passed.
- Decision: One case-selected executable runtime connects exactly 14 P0 routes; every other approved route remains an explicit `not-implemented` stub. `DAT-008` executes the immutable action trace literally and fails on its missing required binding operand.
- Why: Actual-only execution and independent comparison preserve the evidence firewall and expose contract inconsistencies instead of normalizing them away.
- Impact: Supplemental WebGL cleanup failures remain failures, release counts include every owned engine, and actions after a terminal failure display `not-run`.

**2026-07-20**
- Background: Strict dataset acceptance and renderer projection are different claims; accepting an authored field does not prove its observable semantics.
- Decision: Widen the closed materializer only for fields actually present in approved canonical arrays or production-like input, and maintain a separate projection-gap inventory.
- Why: This preserves unknown-field rejection and input identity while preventing silent claims for scale, stacking, text, asset, or layout behavior the dense renderer does not yet implement.
- Impact: Opacity, overflow, event mode, and radius tuples are supported; every remaining loss/degradation is either implemented in the next tranche or retained as an explicit unsupported result.

**2026-07-20**
- Background: Rendering assertions need independent facts from the aggregate renderer without exposing Pixi objects or mistaking a test surface for browser evidence.
- Decision: Publish active gesture count through the semantic probe and aggregate render-command/visible-primitive counts through `snapshot.resources.rendering`; legacy injected surfaces omit them and are recorded as unavailable.
- Why: The same expected-blind fold can remain honest in Node and consume real WebGL facts in the focused Lab, while keeping product execution independent from normalized expected evidence.
- Impact: `LAY-001` and `REN-001..004` close 49/49 on a real Pixi surface; Node comparison stays 45/49 with exactly four named unavailable leaves instead of synthesized values.

**2026-07-20**
- Background: The remaining rendering work mixes affine bounds, upright content, relation paths, assets, text, animation, and history, which have different lifecycle and verification risks.
- Decision: Implement `LAY-005`, then `LAY-004`, then `REN-007` around one signed-affine geometry truth source before starting asset ownership, deterministic animation, international text, or stacking/history waves.
- Why: Bounds, inverse hit testing, visible centers, upright counter-transforms, and relation endpoints must share one revision-aligned transform model; separate approximations would make later viewport/selection behavior diverge.
- Impact: Preserve aggregate Mesh/Particle layers and numeric sidecars, add no per-entity Containers/listeners, and require product tests plus expected-blind automation and focused routes before the next browser/package checkpoint.

**2026-07-20**
- Background: PATCH MAP world flips are defined in screen axes after authored rotation, while Pixi's default rotation-plus-scale composition would apply the reflection in local axes and relation contract endpoints require `(120,80) -> (170,260)` under rotation 90, flip X, scale 2, and pan `(10,20)`.
- Decision: Use `F × R` for semantic world orientation and `T × S × F × R` for viewport publication. Realize the same order with Pixi public `Matrix`/`setFromMatrix`; upright content applies the inverse world basis around its stable visible center.
- Why: One explicit affine order keeps parser projection, Mesh vertices, Particle/Graphics fallback, leaf transforms, geometry probes, hit inversion, and later relation endpoints in agreement without restoring item-level display objects.
- Impact: `LAY-004` closes 11/11 across four world flip modes and eleven authored rows. Public observation boundaries canonicalize IEEE signed zero; `REN-007` must consume this same affine resolver rather than introduce endpoint-specific transform math.

**2026-07-20**
- Background: Relation rendering must preserve authored ordered identity, share endpoint transforms with entity geometry, update incrementally when either endpoint changes, and support transformed hit testing without per-relation Pixi objects or listeners.
- Decision: Resolve relation topology once into stable logical paths, render their segments through aggregate Mesh or the retained Particle/Graphics comparison lane, and use the same F×R affine projection for render, probe, and hit. Index hit candidates with bounded per-segment grid traversal plus an ordered overflow lane; use an equivalent bounded broad phase for entity hits.
- Why: A single resolver prevents renderer/probe/hit drift, adjacency avoids full relation rebuilds, and capped spatial memberships keep common hit and cleanup work proportional to local candidates or touched IDs while preserving exact affine narrow-phase behavior.
- Impact: `REN-007` closes 26/26 and eight real-Pixi routes pass 100/100 first/repeat. Fresh-repeat browser execution transfers the sole canvas-owning engine sequentially; arbitrary positive cross-lane z interleaving remains explicitly deferred to `LAY-003`. Asset lifecycle starts next at `AST-001` before scene-level image behavior.

**2026-07-20**
- Pixi Assets coordinates URL, alias, resolver, texture, and unload state globally; descriptor variants, shared consumers, failed teardown, and alias reuse therefore cross engine boundaries unless Core v2 owns an explicit resource protocol.
- Separate stable logical descriptor identity from a unique physical backend generation. Fetch every Core-owned source into a Blob URL, borrow only exact simple external cache entries, quarantine failed unloads, and retry cleanup only from the session that released that resource identity.
- This prevents Pixi URL-cache option collapse, external resource destruction, stale or partly destroyed resource reuse, handleless leases, and unrelated engine cleanup failure while retaining aggregate Sprite and public Assets APIs.
- AST-001 becomes the renderer-independent asset substrate for REN-005. Default policy permits only the exact package catalog; host transport needs explicit policy, packed FontFace proof and byte/MIME/SVG guards remain later gates, and long reload soak tracks resolver metadata.

**2026-07-20**
- Standalone image inputs require lossless alias, URL, data-URI, and descriptor identity while Pixi texture completion can race semantic source replacement and destroy.
- Keep authored source and exact affine geometry in the immutable projection sidecar, bind only visible targets through the scoped AST session, and gate Sprite attachment by target binding plus generation. Pending/failed pixels use an explicit placeholder role; hidden targets allocate no Sprite and root hit testing remains semantic.
- This preserves stable IDs/component identity, descriptor options, transformed render/hit parity, shared semantic resource reuse, and late-completion cleanup without per-entity listeners, tickers, or authoritative Pixi objects.
- `REN-005` produces all 28 approved leaves. Three parent-object strict-equality assertions conflict structurally with separately required child leaves, so first/repeat/fresh remain an explicit 25/28 rather than changing expected evidence.

**2026-07-20**
- Repeated `Container.setChildIndex` calls make adversarial image z-order permutations quadratic even though the semantic comparator is deterministic.
- Sort image entries by `(zIndex, stable slot, entityId)`, compare once with the public `children` order, and, only when different, use one public `removeChildren()` followed by bounded public `addChild()` batches while keeping `sortableChildren=false`.
- This retains aggregate Sprite semantics and public Pixi APIs while bounding reorder application to linear work after the required sort. Deterministic 5,000-image reverse and seeded-random/tie tests cover the former worst case without a flaky timing threshold.
- A local 2-warmup/7-sample development probe observed 5,000-image median/p95 incremental sync of 6.932/8.313 ms reversed and 7.390/8.429 ms random on Darwin; it is diagnostic, not canonical performance evidence or a Windows claim.
