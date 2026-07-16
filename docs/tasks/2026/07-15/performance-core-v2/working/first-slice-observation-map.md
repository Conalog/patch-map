# First-slice actual observation map

Status: implementation analysis only. This note maps the immutable approved records
for `LIF-001`, `LIF-002`, `DAT-001`, `DAT-002`, `CSM-001`, and `CSM-003` to facts the
current actual-only executor can observe. It does not revise the contract, copy an
expected value into an actual result, or authorize a passing status.

Implementation update (2026-07-16): the gap tables below are the pre-implementation
audit that drove the runner work. The committed executor now has the six-event journal,
request-qualified `drawComplete`, two distinct DAT-002 engine generations, public
semantic probes/exports, CSM-003 handlers, and detached post-use observations for every
pending LIF-002 input. The external real-product comparison currently records LIF-001
11/11, LIF-002 18/20, DAT-001 7/10, and DAT-002 13/13. CSM-001 and CSM-003 remain
non-promotable without packed-host evidence. The diagnostic conflicts, hidden-render
proof, visible-bounds proof, and undefined DAT-001 order-hash rule remain open exactly
as described; superseded `G/B` rows are retained as the audit trail rather than current
status.

## Trust boundary and notation

The fold must be written without importing `catalog-normalized-expected.v1.json` or
`compare.mjs`. This document can name assertion paths for implementation planning, but
runtime projection rules must be based on action semantics and observed product/host/
browser facts, never on the expected operand.

| Mark | Meaning |
| --- | --- |
| `A` | An existing action delta, engine snapshot, binding, checkpoint, or cleanup record directly contains the fact. |
| `D` | A deterministic calculation over two or more actual facts can produce the value without consulting expected. |
| `G` | A product, browser, event, resource, or semantic probe is missing; the fold must leave the asserted leaf unresolved and fail comparison. |
| `M` | The actual fact is observable, but the immutable expected value conflicts with the closed product contract. Preserve the mismatch. |
| `B` | The case/action topology is not currently executable with the promised semantics. |
| `W` | A value can be made to look right from a mock or fixture literal, but that is not promotion-grade actual evidence. |

Source shorthand:

- `aN` means `execution.actionResults[N].delta.actual`.
- `terminal` means the pre-cleanup `execution.terminalSnapshot`.
- `release` means one or more `execution.cleanup.releases[*]` records.
- `binding(name)` means `execution.bindings[name]`.
- `checkpoint(name)` means the matching `execution.captures[]` entry flattened to its
  `values` object.
- `semantic probe`, `event journal`, `browser probe`, and `host probe` mean new actual
  sources. They are not fixture or expected projections.

The executor deliberately records `terminal` before cleanup. Scene and mounted-resource
facts use that checkpoint; retained-resource facts use `release`. Destroyed snapshots
must not replace the terminal scene in the observation.

## Fold into all 14 domains

The current `createSemanticObservation` validator requires every domain but does not
perform the fold. The proposed fold owns these source boundaries:

| Domain | Actual source | First-slice requirement |
| --- | --- | --- |
| `case` | verified case plan plus executed action indexes/types and route params | Record ID, case type, fixture identity, seed/size, and the exact completed action trace. |
| `provenance` | runner inputs | Code commit, packed-package digest, opaque expected-record digest, and runner revision. The opaque digest is identity only. |
| `environment` | browser/host bootstrap | Browser/version, OS, backend, DPR, CSS viewport, font revision, and asset-fixture revision. |
| `revisions` | action/terminal engine snapshots and publication events | Lifecycle stamp, scene/view/interaction tuple, renderer frame revision, and finite-value audit. |
| `scene` | immutable engine semantic export/query probe | Ordered logical nodes, roots, hierarchy, component ownership, visibility, normalized hash, and current authoritative dataset reference. |
| `geometry` | engine semantic geometry probe | Local/world/visible bounds and a finite-number audit over geometry only. Dataset numeric fields are not a geometry substitute. |
| `text` | engine semantic text probe | Source, normalized lines/visible text/style/layout, plus unpaired-surrogate audit. |
| `paint` | engine/renderer semantic paint probe | Normalized paint and texture intent, hidden render participation, and unresolved-intent audit. |
| `interaction` | engine interaction snapshot and browser input probe | View state, owner-qualified hit/selection/mode/gesture state, and stale-gesture audit. |
| `events` | subscriptions installed before the first action | Ordered public event trace and classified aggregate counts. Inferring an event from a return value is not event evidence. |
| `history` | engine history snapshot/events | Depth/availability/action identity and corrupt-entry audit. |
| `accessibility` | logical accessibility/Pixi binding probe | These six cases do not exercise accessibility, but the domain still records an explicit not-exercised actual classification rather than a fabricated empty success. |
| `outcome` | exact action returns/diagnostics plus packed host adapter result | Applied/missing/unchanged facts, validation results, input immutability, and host seam return/rollback/final state. |
| `resources` | browser DOM, engine resource ledger, terminal snapshot, and cleanup releases | Canvas/listener/ticker/animation/asset/pending-work counts at named checkpoints and post-cleanup deltas. |

Every source owns disjoint leaves. A collision is a fold error. A missing probe produces
an unresolved expected path later; it must not be normalized to `0`, `true`, `[]`, or
`null` just because that would satisfy an operator.

`fixtures` and `captures` are comparator-side reference roots, not observation domains:

- `fixtures` is a detached clone of `caseRecord.fixture.setup.params`.
- binding captures become `captures[name] = structuredClone(execution.bindings[name])`.
- declared checkpoints become `captures[entry.id] = structuredClone(entry.values)`.
- duplicate capture names or conflicting leaves fail before comparison.

This resolves `/captures/inputBefore/dataset`,
`/captures/afterLatestSuccess/sceneSemanticHash`,
`/captures/session2/semanticHash`, and `/fixtures/minimalDataset` without allowing the
executor to read assertion operands.

## LIF-001 mapping

| Assertion path | Mark | Actual source or gap |
| --- | --- | --- |
| `/resources/dom/canvasCount` | `A` | `a1.snapshot.resources.canvasCount`; browser DOM count should cross-check it in headed evidence. |
| `/resources/renderer/resolution` | `A` | `a1.snapshot.resources.renderer.resolution`. |
| `/resources/renderer/antialias` | `A` | `a1.snapshot.resources.renderer.antialias`. |
| `/resources/renderer/background` | `A` | `a1.snapshot.resources.renderer.background`. |
| `/interaction/viewport/zoomLimits` | `A` | `a1.snapshot.zoomLimits`. |
| `/events/ready/count` | `G` | `CoreV2Engine` has a `ready` event, but the handler installs no event journal. Counting initialize returns would be false event evidence. |
| `/resources/subscriptions/duplicates` | `A` | `a1.snapshot.resources.subscriptions.duplicates`. |
| `/revisions/lifecycle/facilities` | `A` | `a1.result.facilities` cross-checked with `a1.snapshot.facilities`. |
| `/resources/afterRepeatInit` | `D/G` | Diff `a0.snapshot` to `a1.snapshot` for canvas, active subscriptions, and pending work; also prove one engine allocation from cleanup. The current snapshot lacks ticker/asset/observer ownership, so this is not yet a complete no-leak ledger. |
| `/revisions/lifecycle/generation` | `A` | `a1.snapshot.revisions.lifecycleGeneration`. |
| `/scene/revision` | `A` | `a1.snapshot.revisions.sceneRevision`. |

The approved expected record lists only `revisions`, `scene`, `events`, and `resources`
as observation domains although one assertion reads `interaction`. All 14 domains must
therefore be emitted; `expected.observationDomains` cannot be used as a projection
whitelist.

## LIF-002 mapping

| Assertion path | Mark | Actual source or gap |
| --- | --- | --- |
| `/outcome/input/dataset` | `G` | `binding(inputBefore).dataset` is only the pre-action capture. The input clone actually passed to each submission is not captured after product use. Add before/after fingerprints and a detached post-use graph for the submitted clone. |
| `/outcome/preReady/appliedCount` | `A` | `a2.preReady.diagnostic.appliedCount`. |
| `/revisions/preReady/scene` | `A` | `a2.preReady.diagnostic.revisionStamp.sceneRevision` with the real engine. The current test double omits this stamp and is insufficient for evidence. |
| `/outcome/pending/completionOrder` | `D` | Record the order in which the two result promises settle. Sorting the canonical `completeAtMs` operands alone would be fixture-derived, so add an actual settlement sequence to the delta. |
| `/scene/authoritativeDatasetRef` | `A` | `a2.authoritative.datasetRef`, cross-checked with `terminal.datasetRef`. |
| `/scene/elements/count` | `D` | At minimum `a2`/`terminal.rootIds.length`; the semantic scene probe must supply the full materialized count. |
| `/scene/query/item-a/id` | `G` | No post-race query/export result is recorded. Query the current authoritative product state. |
| `/scene/query/item-a/bar/id` | `G` | Same semantic query gap; owner-local component lookup must be actual. |
| `/scene/query/item-a/hidden-label/logicalCount` | `G` | Same semantic query gap; hidden logical identity must be observed without materializing a render object. |
| `/paint/render/hiddenComponent/objectCount` | `G` | No renderer participation/debug probe exists. Do not infer zero from `show:false` in the fixture. |
| `/events/drawComplete/count` | `G` | The engine exposes `sceneCommitted` and `frame`, but no request-qualified draw-complete publication event. The runner cannot prove this by counting committed returns. |
| `/events/drawComplete/0/requestId` | `G` | A publication event must preserve `draw-b` identity; the current frame event has no request ID. |
| `/events/drawComplete/0/revision` | `G` | Needs the same request-qualified publication event/journal. |
| `/events/staleCompletionCount` | `G` | Needs the same journal to prove `draw-a` produced no success/publication callback. |
| `/outcome/failedLater/code` | `M` | Preserve `a2.failedLater.diagnostic.code`. With the approved `malformed` object-root fixture, current product actual is `INVALID_VALUE`; the expected `INVALID_DATASET` is outside the closed registry. |
| `/scene/afterFailedLater/semanticHash` | `A` | `a2.authoritative.sceneSemanticHash` or terminal semantic hash, compared to `capture(afterLatestSuccess).sceneSemanticHash`. |
| `/revisions/frame/revision` | `A` | `a3.snapshot.frameRevision`. `publishFrame.timeMs` is a renderer timestamp and correctly does not rewind the executor's action clock. |
| `/scene/hierarchy/nodeCount` | `G` | No semantic scene export is recorded after the race. |
| `/geometry/finiteValueCount` | `G` | No semantic geometry probe is recorded. |
| `/resources/retainedDelta` | `D/G` | Convert each `release.remainingResources` into a zero-based post-cleanup ledger. It currently covers canvas/subscriptions/pending work only, not every lifecycle-owned resource named by policy. |

The approved expected record's domain list omits `outcome` and `paint` even though its
assertions read both. Again, emit all 14 domains and never prune by that list.

## DAT-001 mapping

| Assertion path | Mark | Actual source or gap |
| --- | --- | --- |
| `/scene/elementTypes` | `D` | Traverse `a1.entities` in authored element order, including group descendants, and collect first-seen discriminators. |
| `/scene/rootIds` | `A` | `a0.result.rootIds` or `a0.snapshot.rootIds`; cross-check with the roots of `a1.entities`. |
| `/scene/componentTypes` | `D` | Traverse item and grid-template components in `a1.entities`, preserving the contract's canonical discriminator order. |
| `/scene/visibleBoundsFinite` | `G` | The engine delta does not expose bounds. `materializeCoreV2Dataset.visibleBoundsFinite` is currently a constant and is not an independent geometry proof. |
| `/scene/orderHash` | `G` | No contract document defines how the literal `all-kinds-scene/319` is computed from observed order. The product semantic hash is versioned `fnv1a64:*`, so copying datasetRef/seed into this path would fabricate a hash. |
| `/outcome/validation/unsupportedType/code` | `M` | `a2.diagnostic.code` is correctly `INVALID_RECORD_KIND`; immutable expected requires out-of-registry `INVALID_DISCRIMINATOR`. Do not alias it. |
| `/outcome/validation/unsupportedType/path` | `G` | The product error owns the correct `$[7].type` `datasetPath`, but `actualError()` currently serializes only name/code/message unless an error has a nested `diagnostic`; direct `CoreV2DatasetError` therefore loses this leaf. Preserve its public diagnostic fields in the action delta. |
| `/scene/hierarchy/nodeCount` | `D` | A semantic traversal of `a1.entities` can count elements, owner-qualified components, and retained grid cells. Freeze the counting rule before reuse. |
| `/geometry/finiteValueCount` | `G` | Count only actual semantic geometry values, not every number in dataset attrs/style. The required geometry export is missing. |
| `/outcome/recorded` | `D` | `execution.status === 'completed'` and all three exact action results completed. This is execution recording, not an expected-derived boolean. |

`/scene/orderHash` is a contract-definition gap in addition to an implementation gap.
An actual-only implementation cannot reverse-engineer an undocumented algorithm from
the approved operand. A versioned observation rule or contract-owner clarification is
needed before this leaf can be truthfully produced.

## DAT-002 mapping

| Assertion path | Mark | Actual source or gap |
| --- | --- | --- |
| `/outcome/input/minimal` | `G` | `freezeInput` records only deep-freeze and a fingerprint. Capture the exact post-use input graph and prove its fingerprint equals the pre-use graph before projecting it. |
| `/outcome/session1/item/show` | `G/B` | Requires session 1 semantic export. Current `loadDataset`/`snapshot` deltas do not contain normalized records. |
| `/outcome/session1/item/locked` | `G/B` | Same semantic export and fresh-session gap. |
| `/outcome/session1/item/padding` | `G/B` | Same; normalize the edge object to the contract's ordered `[top,right,bottom,left]` observation. |
| `/outcome/session1/item/contentOrientation` | `G/B` | Same semantic export gap. |
| `/outcome/session1/bar/placement` | `G/B` | Same owner-local component export gap. |
| `/outcome/session1/bar/animationDuration` | `G/B` | Same owner-local component export gap. |
| `/outcome/session1/text/split` | `G/B` | Same owner-local component export gap. |
| `/outcome/session1/semanticHash` | `A/B` | `a2.snapshot.semanticHash` compares to `capture(session2).semanticHash`, but both currently come from one engine and therefore do not prove fresh-session determinism. |
| `/scene/revision` | `A` | `terminal.revisions.sceneRevision` is finite, but its value reflects two loads in one generation today. |
| `/scene/hierarchy/nodeCount` | `G` | Requires the semantic session export. |
| `/geometry/finiteValueCount` | `G` | Requires the geometry probe. |
| `/outcome/recorded` | `D` | Exact five-action completion. |

The approved setup says `freshSessions: 2`, while `loadDatasetAction` ignores the
`session` operand for engine ownership and calls `ensureMainEngine()` both times.
`snapshotAction` also reads that same main engine. The current unit test proves two
loads, not two fresh sessions. Session 1 and session 2 need separate engine instances
with independent initialize/load/snapshot/destroy boundaries; only their semantic
hashes may then be compared.

## CSM-001 mapping

| Assertion path | Mark | Actual source or gap |
| --- | --- | --- |
| `/scene/rootIds` | `A` | `terminal.rootIds`, cross-checked with `a1.result.rootIds`. |
| `/revisions/publishedTuple` | `A` | `a2.published.publishedTuple` or `a2.snapshot.publishedTuple`. |
| `/scene/immutable` | `G` | `a1.inputUnchanged` proves caller input immutability, not that the authoritative semantic scene/export is deeply immutable. Add a semantic export immutability probe. |
| `/resources/canvasCount` | `A` | Pre-cleanup `terminal.resources.canvasCount`; browser DOM count cross-checks headed evidence. |
| `/outcome/hostEngineSeam/engineReturns/lifecycle` | `D` | Aggregate the actual `load-scene` return/terminal snapshot. |
| `/outcome/hostEngineSeam/engineReturns/sceneRevision` | `D` | `a1.result.sceneRevision`. |
| `/outcome/hostEngineSeam/engineReturns/publishedTuple/scene` | `D` | `a2.published.publishedTuple.scene`. |
| `/outcome/hostEngineSeam/engineReturns/publishedTuple/view` | `D` | `a2.published.publishedTuple.view`. |
| `/outcome/hostEngineSeam/engineReturns/publishedTuple/interaction` | `D` | `a2.published.publishedTuple.interaction`. |
| `/outcome/hostEngineSeam/engineReturns/rootIds` | `D` | `a1.result.rootIds`. |
| `/outcome/hostEngineSeam/failureRollback/retainedSceneRevision` | `W` | `a3.rollback.retainedSceneRevision` exists, but the current probe initializes an empty isolated engine and manufactures the declared host failure instead of exercising a packed host failure branch. |
| `/outcome/hostEngineSeam/failureRollback/partialPublicationCount` | `W` | `a3.rollback.partialPublicationCount`; same mock-host limitation. |
| `/outcome/hostEngineSeam/failureRollback/hostRetryRequired` | `W` | Currently hard-coded by the handler. It must be returned/observed from the packed host adapter. |
| `/outcome/hostEngineSeam/finalState/lifecycle` | `D` | `terminal.lifecycle`. |
| `/outcome/hostEngineSeam/finalState/sceneRevision` | `D` | `terminal.revisions.sceneRevision`. |
| `/outcome/hostEngineSeam/finalState/selectedIds` | `A` | `terminal.selectionIds`. |
| `/outcome/hostEngineSeam/finalState/mode` | `G` | Current engine snapshot has no interaction mode. |
| `/outcome/hostEngineSeam/finalState/datasetRef` | `A` | `terminal.datasetRef`. |
| `/geometry/nonFiniteCount` | `G` | Semantic geometry audit missing. |
| `/text/unpairedSurrogates` | `G` | Semantic text audit missing; scanning the input fixture alone is not product output evidence. |
| `/paint/unresolvedIntentCount` | `G` | Semantic paint/texture-intent audit missing. |
| `/interaction/staleGestureCount` | `G` | Gesture ownership/audit missing. |
| `/events/unclassifiedCount` | `G` | Ordered event journal/classifier missing. |
| `/history/corruptEntryCount` | `G` | History semantic audit missing; depth zero alone does not prove entry integrity. |

The journey can use the action executor as a unit-test seam, but promotion requires the
packed consumer adapter. Copying `fixture.hostEngineSeam` into `outcome` would make the
actual equal expected by construction and is forbidden.

## CSM-003 mapping

This case is currently `B`: `set-host-state` and `query-target` are absent from
`FOUNDATION_ACTION_TYPES`, so registry coverage fails before engine creation. The
existing generic `probe-declared-failure` also emits CSM-001-shaped rollback fields
instead of the CSM-003 host outcome. The future mapping is:

| Assertion path | Mark | Required actual source after action coverage exists |
| --- | --- | --- |
| `/scene/nodes` | `G/B` | Semantic export after `load-scene(empty-scene)`. |
| `/outcome/missingQuery` | `G/B` | Exact return from `query-target` action 3. |
| `/history/depth` | `A/B` | Terminal history snapshot after the empty load. |
| `/resources/pendingWork` | `A/B` | Terminal engine/resource snapshot. |
| `/outcome/hostEngineSeam/engineReturns/loadingCanvasCount` | `G/B` | Host/browser canvas sample after action 0; no engine should be allocated. |
| `/outcome/hostEngineSeam/engineReturns/noBlueprintCanvasCount` | `G/B` | Host/browser canvas sample after action 1; no engine should be allocated. |
| `/outcome/hostEngineSeam/engineReturns/emptySceneNodeCount` | `G/B` | Semantic export count after action 2. |
| `/outcome/hostEngineSeam/engineReturns/missingQuery` | `G/B` | Actual host adapter return from action 3. |
| `/outcome/hostEngineSeam/failureRollback/priorSceneRevision` | `G/B` | CSM-003-specific isolated host failure branch, observed before/after. |
| `/outcome/hostEngineSeam/failureRollback/historyDepth` | `G/B` | Same branch's actual history snapshot. |
| `/outcome/hostEngineSeam/failureRollback/hostOwnsEmptyUi` | `G/B` | Packed host adapter classification, not an executor constant. |
| `/outcome/hostEngineSeam/finalState/lifecycle` | `D/B` | Main terminal lifecycle. |
| `/outcome/hostEngineSeam/finalState/sceneRevision` | `D/B` | Main terminal scene revision. |
| `/outcome/hostEngineSeam/finalState/selectedIds` | `A/B` | Main terminal selection IDs. |
| `/outcome/hostEngineSeam/finalState/mode` | `G/B` | Interaction mode snapshot; currently absent from product. |
| `/revisions/valuesFinite` | `D/B` | Audit every lifecycle/scene/view/interaction/published/frame revision in actual snapshots. |
| `/geometry/nonFiniteCount` | `G/B` | Geometry audit. |
| `/text/unpairedSurrogates` | `G/B` | Text audit. |
| `/paint/unresolvedIntentCount` | `G/B` | Paint audit. |
| `/interaction/staleGestureCount` | `G/B` | Interaction/gesture audit. |
| `/events/unclassifiedCount` | `G/B` | Event journal/classifier. |

`set-host-state` must be a host-only action: it records host/DOM state and canvas count
without calling `ensureMainEngine()`. `load-scene` may then allocate the first engine for
the empty dataset. This preserves the distinction between loading/no-blueprint and a
valid ready-empty Core scene.

## Honest contract mismatches and non-promotable gaps

1. `LIF-002` expects `INVALID_DATASET`, which is not in the closed diagnostic registry.
   The approved `malformed` fixture is an object root, so current product actual is
   `INVALID_VALUE` at `$`. The handler test's replacement malformed array yields
   `INVALID_RECORD_KIND`; that test fixture is not canonical execution evidence.
2. `DAT-001` expects `INVALID_DISCRIMINATOR`, also outside the closed registry. Current
   product actual is `INVALID_RECORD_KIND` with the correct `$[7].type` path.
3. `DAT-001 /scene/orderHash` has no versioned computation rule. The current product
   exposes a genuine `fnv1a64:*` semantic hash, not the expected `datasetRef/seed`
   literal. Do not synthesize the latter.
4. `LIF-001.expected.observationDomains` omits `interaction`; LIF-002 omits `outcome`
   and `paint`. This is harmless only if the runner always emits all 14 domains.
5. DAT-002 currently reuses one lifecycle for both labeled sessions. It cannot be
   promoted as fresh-session determinism.
6. CSM-003 cannot launch because two exact handlers are missing. Its rollback shape is
   also not implemented.
7. CSM-001's failure branch is a self-authored mock delta, not packed-host evidence.
   Host return/rollback/final state must come from the real adapter for journey
   promotion.
8. Current `CoreV2EngineSnapshot` is a lifecycle summary, not the required semantic
   observation surface. Geometry, text, paint, hierarchy, interaction mode/gestures,
   event ordering, history integrity, accessibility, and the complete resource ledger
   need independent product/browser probes.

## Recommended API

Keep the observer expected-blind and return comparator reference roots alongside the
actual document:

```js
foldContractExecution({
  casePlan,             // verified fixture/action metadata, no expected assertions
  execution,            // core-v2-contract-case-execution/1
  provenance,           // runner/package/opaque expected digest identity
  environment,          // browser/OS/backend/DPR/font/asset facts
  semanticProbe,        // public engine semantic snapshot/export
  eventJournal,         // subscriptions installed before action 0
  browserProbe,         // DOM/native-input/errors/resource facts
  hostProbe,            // packed adapter return/rollback/final-state facts
}) -> {
  actual,               // core-v2-semantic-observation/1
  fixtures,             // detached setup.params reference root
  captures,             // validated binding/checkpoint reference root
}
```

Implementation rules:

1. Validate execution schema, case ID/type, exact action indexes/types, successful
   cleanup, and source schemas before projection.
2. Build each domain in an isolated projector; merge only disjoint leaves and reject
   collisions.
3. Preserve actual diagnostic codes and paths verbatim.
4. Represent an unavailable domain with explicit actual status metadata, but do not
   create an asserted leaf. Comparator resolution then fails honestly.
5. Canonicalize/freeze through `createSemanticObservation` only after all projections
   complete.
6. Convert bindings/checkpoints to comparator reference roots independently; never
   embed them as unknown observation top-level fields.
7. Apply expected volatile masks only in `compareObservation`, after the actual file is
   immutable.

## Targeted tests before the six-case checkpoint

1. **Firewall:** source scan proves the fold, handlers, worker, Lab bridge, and probes do
   not import normalized expected or comparator code.
2. **Shape/collision:** all 14 domains exist, unknown top-level fields/collisions fail,
   inputs are detached, and the result is deeply frozen/digest-stable.
3. **Reference roots:** LIF-002 bindings and DAT-002 checkpoint flatten exactly; missing,
   duplicate, forward, or conflicting captures fail.
4. **No fabricated defaults:** omit each semantic/event/browser/host probe in turn and
   prove the asserted leaf remains unresolved instead of becoming zero/true/empty.
5. **LIF-001 event/resource proof:** install a ready journal before initialization,
   prove one callback across repeat init, and compare complete owned-resource ledgers.
6. **LIF-002 real product:** use the approved profile datasets, record actual promise
   settlement and request-qualified publication events, retain the authoritative hash,
   and preserve the `INVALID_VALUE` versus `INVALID_DATASET` comparison failure.
7. **DAT-001 semantic export:** traverse actual normalized output, verify root/type/
   component order and invalid path, and preserve the `INVALID_RECORD_KIND` mismatch.
   Keep orderHash unresolved until its algorithm is versioned.
8. **DAT-002 two processes/lifecycles:** session 1 and 2 each initialize, load, export,
   capture, and destroy independently; compare only their actual semantic hashes and
   normalized defaults.
9. **CSM-001 packed host:** execute engine returns, declared failure, rollback, and final
   state through the packed adapter; a mock host remains non-promotable.
10. **CSM-003 exact actions:** coverage includes `set-host-state` and `query-target`, no
    canvas exists for the two host-only states, empty-scene query is null, CSM-003
    rollback keys are actual, and cleanup has no pending work.
11. **Comparator checkpoint:** verifier-only tests read immutable expected and show the
    two diagnostic mismatches as ordered assertion failures, never aliases or adjusted
    expected data.
12. **Fresh-session evidence:** two fresh runner/browser processes produce equal stable
    actual digests for every otherwise runnable case; differences remain visible.

## Slice readiness

The current deltas are a sound action-execution substrate, not yet a semantic
observation. `LIF-001` is closest, but lacks ready-event and complete resource probes.
`LIF-002` needs semantic/event/render probes and has an immutable diagnostic mismatch.
`DAT-001` needs bounds/order-hash resolution and has the second diagnostic mismatch.
`DAT-002` needs genuinely fresh sessions and semantic exports. `CSM-001` needs the
packed host and cross-domain probes. `CSM-003` is not runnable. Therefore no one of the
six should be marked automated-verified from the present executor output alone.
