# Engine Boundary, State, and Transaction Contract

## Purpose

PatchMap may choose any API names and internal architecture, but the host must be able to
perform and observe the capabilities below without recreating engine behavior. This
document freezes the boundary semantics while leaving classes, modules, storage,
render primitives, and scheduling design open.

## Required Host-Facing Capability Ports

The redesigned package must expose equivalents for:

1. initialize, resize, load/replace, inspect readiness, and destroy;
2. validate full datasets and apply atomic add/merge/unset/replace/move/remove/refresh
   transactions by stable logical target (`element:id` or `component:ownerId/id`);
3. query and immutable semantic snapshots, including canonical export;
4. bind/dispose lifecycle, mutation, view, selection, interaction, history, asset,
   extraction, diagnostic, and performance observations;
5. programmatic and pointer-driven selection, viewport, transformer, and interaction
   mode control;
6. compound history with host-provided reversible companion state;
7. asset registration/policy, semantic refresh, PixiJS stage diagnostics, and scene
   extraction;
8. logical accessibility tree/focus/action control and the visible PixiJS accessibility
   bridge, while leaving product DOM overlays to the host;
9. bounded production diagnostics and cancellation/supersession controls.

The host adapter may translate product state into these ports. It may not implement
missing relation geometry, selection, transformer, history, asset, or cleanup behavior
outside the engine.

## Lifecycle State Machine

```text
new --initialize--> initializing --ready--> ready-empty --load--> scene-ready
 ^                       |                                     |
 +--------failure--------+                                     +--replace--> scene-ready
                                                               |
                    fresh instance <--- destroyed <---destroying
```

A destroyed instance is terminal; “re-initialize” creates a fresh lifecycle instance
in the same host slot. Failed initialization releases partial PixiJS/canvas/resource
state and returns to `new`, a retryable host boundary with no retained renderer,
canvas, listener, asset lease, or pending callback. Only initialization assets marked
required block readiness; scene assets are target-local and never leave a half-ready
instance.

### Operation/state matrix

| Operation | `new` | `initializing` | `ready-empty` | `scene-ready` | `destroying/destroyed` |
| --- | --- | --- | --- | --- | --- |
| initialize | starts once | same attempt is deduplicated | no duplicate canvas; stable already-ready result | stable already-ready result | `DESTROYED` |
| resize / read surface | `NOT_READY` | queued latest finite size; no renderer read | accepted | accepted | stable no-op/`DESTROYED` as documented |
| load/replace | `NOT_READY` | rejected without side effect | accepted | atomic replacement; prior scene remains authoritative until commit | `DESTROYED` |
| query/snapshot/export | `NOT_READY` | `NOT_READY` | deterministic empty result | current authoritative revision | `DESTROYED` |
| mutation/selection/view/history | `NOT_READY` | `NOT_READY` | declared empty/missing result | accepted by current generation/revision | `DESTROYED` |
| extract | `NOT_READY` | `NOT_READY` | classified empty result | captures the declared publication checkpoint below | `DESTROYED` |
| destroy | idempotent empty cleanup | cancels init and awaits cleanup | cleanup once | cleanup once | idempotent already-destroyed result |

No operation may publish a half-ready or half-replaced scene. During asynchronous
replacement, reads and interaction continue against the prior authoritative scene
unless the host deliberately disables them. Operations carry the lifecycle/scene
generation they target; after replacement commits, results from the prior generation
are stale and cannot mutate the new scene.

## Completion Milestones

Every host action identifies one or more distinct milestones rather than overloading
“done”:

| Milestone | Observable guarantee |
| --- | --- |
| accepted | input and preconditions passed; action has an identity/cancellation scope |
| semantic commit | current public state and snapshots contain one complete revision |
| required assets ready | blocking assets for that action are resolved or action failed |
| frame published | a native frame displays the committed revision |
| settled | animation/deceleration/gesture has reached its terminal semantic outcome |
| released | action-owned resources/listeners/pending work are gone |

Load readiness is required assets plus first useful frame. Ordinary updates commit
semantic destination state before returning; the next native frame publishes it.
Animated presentation may settle later. Extraction identifies which rendered revision
it captured and cannot silently capture an earlier frame.

## Revision Stamp and Identity

Every result/event/frame carries a stamp containing:

- `lifecycleGeneration`: changes for each fresh instance;
- `sceneRevision`: increments for accepted dataset load/change/undo/redo and semantic
  refresh that changes an observable result;
- `viewRevision`: increments for accepted pan/zoom/focus/fit/rotation/flip/resize view;
- `interactionRevision`: increments for accepted selection/mode/gesture terminal state;
- `frameRevision`: a renderer-local monotonic sequence for each native frame. It is
  scheduler-dependent telemetry, not deterministic semantic identity. Every published
  frame also records the exact scene/view/interaction revision tuple it represents.

Failed, superseded, cancelled, and semantic no-op work does not increment its semantic
domain or create history. Coalescing may skip intermediate frames. Pre-publication
events identify the accepted revision tuple with `publication: pending`; only a frame
event or a settled action result may claim `publication: published`.

Authored IDs persist across revisions and export. Generated IDs are stable for the
materialized object and become explicit on canonical export. Query results are immutable
snapshots bound to lifecycle generation and scene revision. Reuse in the same revision
is valid; later use must explicitly re-resolve by its logical target or yield
`STALE_TARGET`. It can
never target a slot/object reused for another ID.

## Mutation Algebra

The normative operation wire shape, path grammar, merge depth, overlap rules,
reconciliation matching, and result envelope are versioned in
`mutation-operation-schema.md`. The table below is a summary and cannot widen that
schema.

| Operation | Meaning |
| --- | --- |
| add | validate one complete record and insert at an explicit parent/index atomically |
| merge | change only named scalar/object fields; nested objects merge by named field |
| unset | remove named optional fields so defaults/absence reapply; required fields fail |
| replace | validate a complete replacement; omitted optional values become default/absent |
| reconcile components | stable authored component IDs match; unmatched records add/remove; final array order is supplied order |
| move | move existing ID to parent/index; cycles and invalid parents fail atomically |
| group / ungroup | preserve world geometry, hierarchy order, selection, relations, host companion state, and one history action |
| remove | remove target/subtree after host-approved cascade policy and update affected relations |
| refresh | recompute dependent semantics without changing exported dataset meaning |

`null` is never an implicit delete; deletion uses an explicit unset/remove operation.
Arrays replace as ordered values unless an operation explicitly declares component
reconciliation. A discriminator change is replacement, not merge. An existing logical
ID cannot be renamed by merge or replace; identity change is an explicit remove+add in
one transaction.
Within one transaction, operations execute in supplied order against the staged result;
targeting an already removed node or creating a parent/child conflict fails the strict
transaction atomically. A permissive bulk operation may report missing IDs but still
cannot partially accept invalid records.

All mutation results return ordered `applied`, `missing`, and `unchanged` logical target
tuples, the prior and current revision stamps, and one diagnostic on failure. One
transaction can own one history action. Caller inputs remain unchanged.

## Async Authority and Cancellation

The host supplies a monotonic generation or cancellation scope for independently
fetched scene/update payloads. Arrival time alone never defines “latest.” Scope is
explicitly one of instance, scene replacement, target update, asset key/descriptor, or
extraction request.

| Race | Required outcome |
| --- | --- |
| replacement A then B; A resolves last | B alone may commit; A is `SUPERSEDED` |
| source A then B on one target | B owns target; A releases temporary resource |
| unrelated assets A and B | each may publish within current scene scope |
| update/extract during replacement | bound to declared old/new scene revision; no accidental cross-generation use |
| destroy during any async work | terminal cancellation; no later event/frame/callback |
| explicit abort | one `CANCELLED` outcome; prior complete scene remains |

Superseded/cancelled work emits no success/history/change notification and releases all
temporary resources. Retry creates a new action identity; it does not resurrect an old
completion.

## Event and Reentrancy Rules

Events are divided into two publication classes:

- **semantic events** (`change`, selection reconciliation, history executed/undone/
  redone, and semantic action completion) occur after atomic semantic commit. Their
  envelope carries `publication: pending` until the represented tuple has appeared;
- **publication events** (`first-useful-frame`, `frame`, draw-visible completion, and
  extraction completion) occur only after the represented tuple is visible and carry
  `publication: published`.

For a successful non-animated data action the canonical order is:

```text
validate -> semantic commit -> history/selection reconciliation
-> specific semantic event(pending) -> family semantic event(pending)
-> semantic action completion(pending) -> next-frame publication
-> frame event(published) -> optional settled completion(published)
```

The load, animation, and history traces are exact specializations:

```text
initialization:
  validate options/runtime -> create PixiJS application/surface -> required init assets ready
  -> ready-empty state -> ready notification

first useful draw:
  ready-empty -> validate/load -> semantic commit -> required scene assets ready
  -> load semantic events(pending) -> first useful frame(published)
  -> draw-complete notification(published)

animated update:
  validate -> destination semantic commit -> change events(pending)
  -> first presentation frame(published) -> zero or more presentation frames
  -> terminal destination frame(published) -> animation settled(published)

undo/redo:
  validate history action -> semantic restore -> selection/history reconciliation
  -> undone/redone semantic event(pending) -> next frame(published)
  -> history-visible completion(published)
```

No semantic event means that pixels are already visible. No publication event may be
emitted before its represented tuple is on the mounted canvas. `LIF-002`, `UPD-005`,
`UPD-013`, and `HIS-005` use these traces verbatim.

For pointer/gesture actions, raw pointer ordering precedes the semantic action, and a
terminal gesture event occurs only after its final committed/reverted state. Destroy
first stops new input, cancels work, releases scene/history/resources, then emits one
final destroyed event.

- Listeners run in registration order within specific/family phase. Unsubscribing a
  later listener during delivery prevents its later invocation; newly added listeners
  begin with the next event.
- A listener-triggered engine action is queued after the current event family finishes;
  it cannot interleave with the current semantic commit.
- Host callback exceptions are isolated, reported once as `HOST_CALLBACK_FAILURE`, and
  do not roll back the already committed engine action or stop remaining listeners.
- Disposal is idempotent. General observers cannot mutate or replace specific payloads.
- High-frequency events may be coalesced only where the scenario permits it; the latest
  semantic revision and terminal events are never dropped.

Logical interaction delivery uses capture → target → bubble order with deterministic
stop and immediate-stop behavior. Direct and query subscriptions resolving to the same
logical target/action produce exactly one semantic callback regardless of binding
multiplicity.
Mouse/touch/PixiJS click aliases are deduplicated by physical gesture: click count 1
emits only `single`, count 2 only `double`, and count 3+ exactly one `multi-click`
callback containing the actual count. Empty-surface events use the same phases with a
null target.

PatchMap owns a configurable history stack with default capacity 50 and exposes
undo/redo/clear/availability to host controls. Ctrl/Cmd shortcuts invoke it only when
the composed event path is outside input, textarea, select, contenteditable, and an
editable node in an open shadow root; an iframe document owns its own shortcuts.

## Extraction Publication Checkpoint

Extraction captures one exact scene/view/interaction revision tuple, never merely
“whatever is on the canvas when the promise runs.” At request acceptance, the target
is the current authoritative tuple. If that tuple is already the latest published
tuple, capture begins immediately; otherwise extraction waits for its publication.

- a newer accepted tuple before the target is published supersedes the request with
  `SUPERSEDED`; it may not silently capture the newer or older frame;
- an explicit abort returns `CANCELLED`; destroy cancels pending work and no completion
  callback occurs after the destroyed event;
- renderer loss returns `RENDERER_LOST`, while taint/readback failures use the stable
  extraction diagnostics in `semantic-observation.md`; the live scene remains usable;
- a caller may supply a finite positive timeout. Expiry returns `EXTRACTION_TIMEOUT`.
  Without one, the engine adds no hidden wall-clock timeout; abort, supersession,
  renderer loss, or lifecycle termination remains authoritative;
- temporary render textures, images, and leases are released on every outcome.

The success result contains the captured tuple, renderer-local frame revision, CSS and
pixel dimensions, MIME/encoding intent, and resource-release outcome. Repeating an
unchanged request captures the same semantic tuple without requiring the same encoded
bytes across environment-qualified raster backends.

## Animation and Gesture Authority

An animated update commits its exact destination dataset value immediately. The visible
presentation value interpolates from the current visible value to that destination.
Animation scheduling is presentation-only; history records the dataset mutation, not
each frame. Bar presentation uses `easeOutCubic` over the dataset duration, default
`200ms`. A retarget starts from the current visible value. Zero-duration/reduced-motion
mode publishes the destination immediately. The destination is semantically committed
at acceptance, the exact terminal value is visible at `t >= duration`, and one settled
outcome is emitted.

Gesture terminal behavior is fixture-owned and must be explicit for each gesture:

| End reason | Required policy class |
| --- | --- |
| pointer up in/outside after valid owned gesture | commit once, one history action |
| movement below click threshold | click outcome, no transform history |
| explicit cancel / Escape | revert to start, cancel once, no history |
| explicit cancel / Escape / pointer-cancel / lost capture / blur | revert to start, cancel once, no history |
| redraw | revert uncommitted gesture state, cancel once, no history |
| replacement/destroy | terminate old lifecycle ownership; no stale completion or gesture history may reach the new/terminal lifecycle |
| target selection or lock change | revert to start, cancel atomically, require a new gesture |

## Concurrent Action Conflict Matrix

Independent targets and independent fields may commit normally in revision order.
When host data work overlaps an active editor/gesture owner on the same target and
field, the submitting action must declare `reject`, `cancel-active`, or `queue-after`;
there is no implicit last-writer policy. The default is `reject` with `CONFLICT` and no
state/history/event change.

| Active owner | Incoming work | Required outcome |
| --- | --- | --- |
| click/box/paint selection | nonstructural data update | update may commit; next hit/selection uses its revision |
| click/box/paint selection | remove/replace/hide/lock hit candidates | cancel the gesture once, apply transaction, reconcile selection |
| move/resize/rotate | different target or non-owned field | may commit without changing gesture baseline |
| move/resize/rotate | same target geometry field | explicit reject/cancel-active/queue-after; queued work revalidates after terminal revision |
| text edit | same target text/style | explicit reject/cancel-active/queue-after; no silent overwrite of editor buffer |
| text edit | different target or unrelated field | may commit; DOM editor geometry refreshes if its owner frame changed |
| any gesture/edit | undo/redo | cancel active work atomically, then run history on committed state |
| any gesture/edit | scene replacement/destroy | cancel old lifecycle, publish no gesture history/completion afterward |
| animation | new destination for same property | retarget from current visible value; newest committed destination owns |

Queued work preserves its host generation/action identity, is revalidated against the
post-gesture scene, and may still return missing/stale/conflict. `cancel-active` follows
the gesture termination fixture and emits cancellation before the incoming transaction
commits. These rules also govern 30–60Hz live overlay; coalescing cannot bypass field
ownership or history.

## Host/Engine Seam for Editor Journeys

For CSM-019 and CSM-025–036, each Lab/host fixture records:

1. host inputs and domain predicate/cascade/ID policy;
2. engine-owned transaction, view/selection/gesture state, and screen geometry output;
3. host-owned DOM tooltip/menu/text editor/form/file/compression/persistence work;
4. callback/result and classified failure ownership;
5. engine history plus host reversible companion state;
6. final canonical exported dataset and selected/mode state.

DOM overlays remain host-owned unless a future scenario explicitly assigns them to
PixiJS. PatchMap supplies current owner-qualified logical targets, screen/world geometry, revision stamps,
event identity, and atomic companion-history boundaries so the host does not duplicate
engine logic.
