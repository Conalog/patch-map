# Decisions

## 2026-07-30 — One shipping product

- Public package: `@conalog/patch-map`
- Primary class: `PatchMap`
- Public subpaths: none
- Version: keep `0.10.0` until the post-merge release bump

## 2026-07-30 — Remove controls, retain substrate

- Delete the unfinished Core v1 Canvas2D product, Lab, tests, build, and
  consumer surface.
- Retain its dense store, transactions, validation, animation table, and
  renderer-view contracts only as neutral PatchMap internals because the
  completed product uses them.
- Delete the old root `Patchmap` implementation and helpers after the new root
  entry is connected.

## 2026-07-30 — Historical identifiers

- Current product code, docs, examples, build names, package exports, and Lab
  routes use PatchMap naming.
- Immutable contract/evidence and retained digest-bound performance results
  may retain `core-v2`; changing their contents would invalidate approved
  observations.
- Active performance and release tooling uses `performance/patch-map` and
  `patch-map-*` paths.

## 2026-07-30 — One consumer API and one Lab

- `/lab/patch-map/` is the sole user-facing Lab and maps all 173 approved
  cases to persistent manual controls.
- The separate aggregate-renderer performance Playground and its WebGPU
  selector, bridge, browser verifier, styles, and entry point are removed.
- `PatchMapRuntime` and `createPatchMapRuntime()` remain implementation
  internals. The root package, packed consumer, examples, and Lab use
  `PatchMap`.
- Internal performance harnesses may import the core module explicitly, but
  that path is not a published package export.

## 2026-07-30 — Prune completed experiments and handoff residue

- User approval permits deleting the obsolete clean-room export, root handoff
  manifests, Core v1 performance control, completed main-parity harness and
  captures, old task working logs, and unreferenced timestamped performance
  outputs.
- Preserve the canonical 173-case functional-contract corpus and the five
  digest-bound performance/extraction artifacts still exercised by tests.
- Keep only current or directly referenced runtime evidence in
  `performance/patch-map/results`.
- Repository CI covers product source, tests, the canonical contract, the
  production package build, and the PatchMap Lab build.

## 2026-07-30 — Keep exact digests off the animation hot path

- Structurally shared semantic candidates retain the canonical exact FNV
  digest, but materialize and memoize it only when a consumer observes
  `semanticHash`. Transaction results expose the same enumerable immutable
  value through a lazy getter.
- The manual Lab must not force a full semantic snapshot while bar
  presentations are active. Live selection, frame, animation, and viewport
  status use lightweight `PatchMap` state seams; a full snapshot is refreshed
  after animation settlement.
- A direct mid-animation bar retarget preserves the existing animated-bar
  broad-phase envelope. Exact hit testing remains the union of the retained
  current-path envelope and the newly committed dense destination, so
  correctness is retained without rebuilding 5,000 spatial entries per
  retarget.
- Performance budgets are not relaxed after measurement. Median improvement
  and unfavorable 1x/4x outliers are both retained in the raw checkpoint;
  external Windows-native qualification remains pending.

**2026-07-30**

- **Background:** Standalone root imagery and item component assets shared one Pixi container, so a site underlay could only render above all aggregate geometry or force every item icon behind its own frame.
- **Decision:** Keep one aggregate scene owner but split standalone images into a dedicated underlay container; retain separate component background, geometry, content, text, and interaction lanes. Preserve the approved default Sprite-center image pivot, while treating v0.10 `attrs.display: "image"` records as the producer's legacy top-left layout profile.
- **Why:** This preserves PATCH MAP root-underlay semantics and component content visibility without reintroducing per-entity display objects, listeners, tickers, or closures.
- **Impact:** Renderer lifecycle and DevTools ownership stay aggregate. Async asset settlement must wake the package-owned frame loop, and Lab external assets remain available only through an explicit allowlisted profile.

## 2026-08-02 — Landing safety boundaries

- **Reentrant mutations remain atomic.** A renderer callback may synchronously
  replace, patch, destroy, or restore the same surface. The outer operation
  now verifies its surface, revision, and history generation after reconcile;
  if ownership changed, it restores the authoritative nested state and rejects
  instead of publishing a mixed result. Serializing every callback was rejected
  because it would change the synchronous host contract and add hot-path queueing.
- **External assets earn cache admission.** An allowlisted external URL must be
  fetched and validated by the ingestion policy before its texture can enter
  the engine-owned Pixi session. Borrowing a matching unverified global cache
  entry was rejected because URL equality does not prove that the configured
  origin, MIME, size, and lifecycle policy admitted those bytes.
- **The package ships only verified module formats.** `@conalog/patch-map`
  publishes ESM, CJS, and declarations; the undocumented and unverified UMD
  output was removed. Node 22 is the repository/CI toolchain, the package
  declares Node 20+, public examples are linted in-repo and typechecked from
  the packed artifact, and publish lifecycle hooks rebuild and run contract and
  packed-consumer gates. Versioning remains a post-merge decision.
- **Generated readiness output is transient by default.** Package, memory, and
  release verifiers write environment-specific results outside tracked
  evidence unless an explicit artifact path is supplied. This prevents a
  routine check from silently replacing digest-bound evidence.

**2026-08-02**
- Background: Candidate verification could previously look structurally complete while targeting retained evidence locations or embedding a prior package observation, and native templates could look complete without qualified raw measurements.
- Decision: Embedded packed-consumer evidence is promotion-ineligible, generated output paths must stay inside the dedicated workspace `.perf-results` candidate root while read-only candidate inputs independently exclude repository metadata, dependency/build/bundle/source-map locations, retained results, and approved contract evidence, and native manifests remain pending without qualified raw evidence, validator identity, target authenticity, and commit binding.
- Why: Candidate output must never promote itself or overwrite approved evidence, and structural completeness is not equivalent to Windows-native, NVDA, device, or qualified WebGPU qualification.
- Impact: Fresh candidates can be compared or archived only through a later explicit promotion step, while templates and locally complete-looking synthetic artifacts remain pending rather than being presented as release PASS evidence.

## 2026-08-03 — Separate authored grid templates from cell presentation overlays

- **Background:** PATCH MAP v0.10 stores one `grid.item` template, while some
  existing hosts retained independently addressable materialized cell state.
  Applying a semantic component update to the template correctly fans out to
  every cell but cannot represent different live bar values per cell.
- **Decision:** Keep `updateBarHeights()` as the authored, exported, historical
  template mutation and add `updateInstanceBarHeights()` as runtime-only
  presentation state keyed by the public stable concrete `id`
  `<grid-id>.<row>.<column>` plus template component ID. Resolve targets through
  the load-time component index, patch stable projection records, and publish
  aggregate Mesh dirty ranges through the existing central bar controller.
- **Why:** Independent cell values are restored without expanding the dataset,
  creating per-cell Pixi objects/listeners/tickers/closures, rebuilding a
  generic mutation graph, or making rapid retargets accumulate animations.
- **Impact:** Batches validate atomically; `null` restores authored state;
  overlays survive semantic reconcile while identity remains and clear on
  dataset load or destroy. Export, semantic hash, scene revision, and history
  remain authored-only. Other concrete per-cell component properties are
  explicitly unsupported until they receive an equally bounded package API.

## 2026-08-03 — Make the default package surface task-oriented

- **Background:** The production engine was complete, but normal consumers
  still had to configure the renderer, own publication cadence, translate
  public identities into low-level mutation envelopes, and coordinate resize
  and exact-tuple capture themselves.
- **Decision:** Keep one runtime class, but type the root `PatchMap` entry as an
  async `mount()` plus cohesive task domains. Keep the constructor and explicit
  lifecycle/publication/probe seams under `PatchMapAdvanced`. Accept one or
  many targets directly, use stable `{ id, componentId? }` addresses, and
  compile a small revision-bound semantic selector for repeated batches.
  JSONPath, dense slots, and normalized expected data remain outside the API.
- **Why:** Common integration should express user work rather than renderer
  bookkeeping, while specialized hosts and evidence runners still need exact
  deterministic control. A runtime-identical advanced alias avoids wrapper
  drift, duplicate canvases, and divergent performance behavior.
- **Impact:** `mount()` owns WebGL2 Mesh defaults, one frame loop, host resize,
  first load/fit/publication, and cleanup. `selection.onChange()` observes all
  selection sources, manual sizing is available through `viewport.resize()`,
  and overlapping `capture.png()` calls serialize so one request cannot
  supersede another request's frame tuple.

**2026-08-03**

- **Decision: unify public mutation intent without flattening hot paths.** Separate `bars.set`, `bars.setBatch`, instance-bar variants, and `texts.set` made simple updates hard to discover and could not naturally combine geometry, color, content, and style changes on one logical owner.
- Expose `update()` for one owner, columnar `updateBatch()` for equal-shaped high-volume changes, and `transaction()` for ordered heterogeneous or structural atomic work. Omit `componentId` only for a unique matching type; reject ambiguous types, unknown fields, accessor-backed envelopes, identity rewrites, and mismatched columns before commit.
- The three methods are separated by user intent rather than by every component property, while keeping a compact columnar form for 5,000/10,000 updates and one explicit atomic workflow operation.
- The facade lowers to the existing authored bar/text planners, concrete grid-cell overlay, or strict semantic transaction. Broad compiled selectors preserve owner-local duplicate component IDs, cache stable address indexes, and do not expose dense slots. Raw `transact()` remains advanced.

## 2026-08-03 — Expose one lifecycle name

- **Background:** `PatchMap` and `PatchMapAdvanced` were runtime-identical names
  for the same engine. The second name exposed constructor, publication, and
  probe seams that normal hosts do not need and made the recommended entry
  ambiguous.
- **Decision:** Export only `PatchMap`, with `PatchMap.mount()` as the consumer
  lifecycle. Keep the implementation class and deterministic low-level seams
  internal. Let `mount()` accept an optional shared asset runtime/policy so
  multi-instance hosts do not need the low-level constructor for legitimate
  resource ownership.
- **Impact:** Public examples, the migration adapter, declarations, and packed
  consumer verification use the high-level lifecycle. Internal Lab and
  expected-blind verification retain direct source access without creating a
  second shipping API or renderer.

## 2026-08-03 — Reserve mutation shortcuts for actual hot paths

- **Background:** `bar.width` and `bar.fill` were convenience aliases over the
  same generic component merge used by `bar.changes`. Their names implied a
  performance distinction that did not exist and duplicated one operation.
- **Decision:** Keep the named `bar.height` field because it selects the
  authored/concrete aggregate bar-height planner. Remove public `bar.width`
  and `bar.fill`; express them through `bar.changes.size.width` and
  `bar.changes.source.fill` in singular, batch, and transaction updates.
- **Impact:** Type declarations and runtime validation now reject the removed
  aliases. The bar animation/GPU dirty-range path is unchanged, so this is a
  public-surface simplification rather than a new performance claim.

## 2026-08-03 — Present reusable targets as a query result

- **Background:** `targets.compile()` accurately described the internal
  one-time selector resolution but forced application developers to understand
  compilation and scene-revision bookkeeping.
- **Decision:** Expose `targets.query()` returning a `PatchMapTargetSet` with
  detached `matches` and `count`. Keep the scene query, revision authority,
  cross-instance protection, and stale rejection in an internal WeakMap.
- **Impact:** Repeated `updateBatch()`, selection, focus, and transform calls
  retain the same cached target identity and complexity. Dataset replacement
  still requires an explicit new query so a stale selector cannot update a
  different scene accidentally.
