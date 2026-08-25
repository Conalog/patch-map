# History, Errors, Determinism, and Performance

## HIS-001 — Record a Reversible State Change

- **Goal:** Undo any accepted edit without losing unrelated data.
- **Action:** Change text, color, asset, style, geometry, placement, metadata, grid,
  relation, components, or group children with history enabled.
- **Result:** Undo restores the exact prior dataset meaning, hierarchy, geometry,
  selection, and visible result; redo restores the accepted new state. Unchanged
  sibling fields and prior absence/defaults are preserved.
- **Lab:** Every mutation case exposes **Undo** and **Redo**; `history/state-change`
  additionally compares semantic snapshots.

## HIS-002 — Stack, Branch, and Capacity

- **Goal:** Keep a predictable bounded undo/redo stack across repeated editing.
- **Action:** Record changes, undo, redo, undo and create a new branch, exceed capacity,
  and invoke undo/redo when unavailable.
- **Result:** Availability flags are exact; a new post-undo change discards the redo
  branch; unavailable actions are no-ops without false events. Default retained
  capacity is 50 user actions per instance. Configuration is a nonnegative safe integer;
  `0` disables recording while keeping calls observable no-ops. Reducing capacity evicts
  oldest entries immediately, increasing it preserves entries, and invalid changes fail
  without altering the stack.
- **Lab:** `history/stack-branch` shows depth, index, and discarded count.

## HIS-003 — Group One User Action

- **Goal:** Avoid one history step per pointer frame or target.
- **Action:** Give adjacent multi-target updates and gesture frames the same non-empty
  action identity, with different or unrecorded work between control cases.
- **Result:** Only contiguous work from the same action groups. Undo runs the group in
  reverse logical order; redo runs it forward. Separate actions remain separate.
- **Lab:** `history/grouping` shows operation count versus stack steps.

## HIS-004 — Keyboard and Host Controls

- **Goal:** Use history from keyboard and host controls without stealing text editing.
- **Action:** Use Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y, and explicit host buttons.
- **Result:** Owned shortcuts act once and prevent browser default. Inputs, textareas,
  selects, contenteditable surfaces, editable targets in open shadow-root composed
  paths, and unrelated host/browser shortcuts keep normal behavior; iframe documents
  own their events. Buttons and shortcuts expose the same availability/result.
- **Lab:** `history/keyboard-focus` embeds editable host controls beside the canvas.

## HIS-005 — History Event Ordering

- **Goal:** Observe history transitions only after their semantic state changes.
- **Action:** Execute, undo, redo, clear, redraw, and destroy.
- **Result:** Semantic state changes precede executed/undone/redone semantic events,
  whose envelopes report `publication: pending`. The corresponding history-visible
  completion follows the frame that publishes the restored tuple. Clear reports after
  stack removal. Redraw clears history so a previous scene cannot be restored. Destroy
  clears first, then reports final destruction once.
- **Lab:** `history/events` records action, revision, depth, semantic/publication class,
  and exact event order.

## HIS-006 — Selection, Mode, and Host Staging

- **Goal:** Reverse a complete editor action rather than only pixels.
- **Action:** Create, move, transform, edit relation/grid/text, group, ungroup, reorder,
  duplicate, or delete while the host stages related metadata.
- **Result:** One undo/redo transaction can restore dataset, stable selection IDs,
  active edit mode, transformer targets, and host-provided staged state. PatchMap owns
  the engine transaction; the host supplies its reversible companion state.
- **Lab:** `history/editor-atomicity` demonstrates a compound mock editor action.

## ERR-001 — Validate Before Publishing

- **Goal:** Reject invalid input without losing the last valid scene.
- **Action:** Load or update malformed roots, fields, kinds, nested shapes, colors,
  sizes, placements, links, styles, options, and cross-field combinations.
- **Result:** Validation reports a stable path and reason. Strict operations are
  atomic: the last valid scene, view, selection, history, and pending valid event stay
  intact. Expected evidence is never relaxed to accept implementation output.
- **Lab:** `errors/schema` provides one representative exact error per dataset kind and
  component plus root/cross-field cases.

## ERR-002 — Empty, Missing, and Stale Inputs

- **Goal:** Handle empty, missing, and stale targets without corrupting other state.
- **Action:** Load an empty scene; query, update, select, focus, fit, or transform
  missing IDs; reuse stale results.
- **Result:** Each action has a declared empty result or strict error. No action mutates
  an unrelated target, moves the viewport unexpectedly, or creates history/events for
  work that did not occur.
- **Lab:** `errors/empty-missing-stale` runs all actions against one empty/replaced scene.

## ERR-003 — Asset Failure and Recovery

- **Goal:** Recover failed assets without breaking unrelated scene content.
- **Action:** Fail image resolution, decode, compression, upload, or extraction; later
  provide a valid result or replace/destroy the scene.
- **Result:** Failure is target-scoped and observable; unrelated content remains usable;
  retry can succeed; stale completions do not publish; temporary textures/DOM images
  are released.
- **Lab:** `errors/assets-recovery` uses deterministic mock failures.

## ERR-004 — Interrupted Gesture Recovery

- **Goal:** Return to a clean interaction state after any gesture interruption.
- **Action:** Interrupt every pointer gesture at every lifecycle boundary.
- **Result:** Pointer-up, including outside, commits once. Escape, explicit/pointer
  cancel, lost capture, blur, redraw, or selection/lock change restores the gesture
  start state and records no gesture history. Replacement/destroy cannot publish stale
  completion. Overlay, capture, cursor, auto-pan, modifier, listener, and history state
  are clean for the next gesture.
- **Lab:** `errors/gesture-post-recovery` interrupts the gesture, then performs a fresh
  probe gesture and asserts clean state.

## ERR-005 — Asynchronous Failure and Retry

- **Goal:** Recover an asynchronous load or update failure without stale publication.
- **Action:** Fail a host-fed load/update revision while an older complete scene exists,
  then deliver a newer valid revision.
- **Result:** The host can keep the last complete view, no partial failing revision is
  published, and recovery needs no page remount. Abort/revision outcomes are explicit.
- **Lab:** `errors/async-retry` completes requests in adversarial order.

## ERR-006 — Destroyed State

- **Goal:** Keep lifecycle operations deterministic before initialization and after destroy.
- **Action:** Call public operations before initialization, during initialization, after
  destroy, and after reinitialization.
- **Result:** Each operation has a documented no-op or error. Late work never publishes.
  Destroy is idempotent and a fresh lifecycle works in the same host without duplicated
  listeners, canvas, resources, or callbacks.
- **Lab:** `errors/lifecycle-state` exercises the full matrix.

## DET-001 — Input Immutability

- **Goal:** Keep caller-owned data immutable and isolated from accepted scene state.
- **Action:** Load/update using deeply nested caller-owned data and then mutate caller
  arrays/objects; also inspect the original inputs after engine work.
- **Result:** The engine never mutates caller input and later caller mutations do not
  silently alter the accepted scene. Returned snapshots declare their copy/freeze
  behavior.
- **Lab:** `determinism/input-immutability` shows before/after hashes.

## DET-002 — Fresh-Session Semantic Determinism

- **Goal:** Produce the same semantic result in independent fresh browser sessions.
- **Action:** Run every normative scenario in at least two fresh browser sessions with
  the same seeded dataset and action trace.
- **Result:** Normalized geometry, text, color intent, hierarchy, state, event ordering,
  selection, history, and errors are identical. Declared volatile timing/IDs and
  environment-qualified pixels are excluded explicitly. Renderer-local native frame
  counts/revisions are volatile; the represented scene/view/interaction tuples and
  required publication checkpoint order are exact.
- **Lab:** `determinism/fresh-session-replay` opens two fresh controlled browser
  sessions for the selected seeded case, runs the action trace, and displays the
  normalized semantic diff.

## DET-003 — Seeded Random Scenario Data

- **Goal:** Vary bars and text while keeping failures reproducible.
- **Action:** Choose or copy a seed, then render random bar values/heights/colors and
  random text/content/styles; repeat actions to advance the seed stream.
- **Result:** The same seed and action index reproduce the same dataset and expected
  semantic results across engines/sessions. Different seeds exercise varied cases.
- **Lab:** `determinism/seeded-random` owns the persistent seed control in the minimal Lab header.

## DET-004 — Snapshot and Export

- **Goal:** Export a deterministic schema-valid representation of the current scene.
- **Action:** Export the current accepted dataset after updates, transforms, undo/redo,
  and redraw.
- **Result:** The snapshot follows `dataset-schema-reference.md`: it is deterministic,
  valid under the existing array-root schema, free of transient overlay/renderer state,
  explicit about generated IDs, and sufficient to recreate the same semantic scene.
  Unsupported/non-serializable values fail atomically with a path-aware diagnostic.
- **Lab:** `determinism/export-roundtrip` reloads the export and compares normalized state.

## PRF-001 — Measurement Matrix

- **Workloads:** 100, 500, 1,000, 2,000, and 5,000 materialized objects plus an approved
  production-shaped dataset. Record top-level records, materialized objects, render
  leaves, text leaves, relations, and selected count separately.
- **Protocol:** Warm up twice and preserve seven measured samples for proxy/full runs,
  including median, p95, min, max, raw samples, and noise ratio.
- **Environment:** Chromium 4x is a development proxy; final approval is headed
  representative low-end Windows. Environment and exact code/evidence revision are
  recorded.
- **Budget:** The approved `windows-low-end-n100-8g-v1` profile and workload budgets
  require frame-gap p95 at most 33ms, action-to-visible p95 at most 50ms, and no
  required scenario with a main-thread task at or above 100ms. The production fixture
  digest/counts are contract-approved; only raw target-Windows execution and review
  remain `not-run`.
- **Lab:** `performance/measurement-matrix` uses dataset size and seed as the only global workload controls.

## PRF-002 — Load and First Useful Frame

- **Measure:** Input validation/normalization, materialization/indexing, asset work,
  PixiJS upload/prepare, and first useful frame separately.
- **Pass:** Correct semantic scene is interactive without a main-thread task of 100 ms
  or more under the declared workload. Any unavoidable long task is a failed scenario,
  not hidden inside total time.
- **Lab:** `performance/load-first-frame` uses **Load dataset** and reports total and phase boundaries without decorative charts.

## PRF-003 — Animated Bar Update

- **Measure:** Scheduling work, per-frame CPU, frame gaps, dropped frames, interruption,
  final publication, and retained animation work for random bar updates.
- **Pass:** Animation duration itself is not counted as blocking work. No update causes
  a 100 ms main-thread task, final values are exact, and motion remains responsive to
  pan/zoom and a newer bar update.
- **Lab:** `performance/bar-animation` makes **Bar height update** repeatable while animation is active.

## PRF-004 — Text Render and Text Change

- **Measure:** Initial random text creation and later random content/style change,
  separating layout/glyph preparation, upload, and frame publication where observable.
- **Pass:** No 100 ms main-thread task and no stale glyph/layout after the next frame.
  Text geometry and semantic style are normative; raster pixels are platform-qualified.
- **Lab:** `performance/text` makes **Text render** and **Text change** independently repeatable.

## PRF-005 — Bulk State Change

- **Measure:** A representative 10% and trusted full-overlay update, including semantic
  commit, relation/index refresh, render invalidation, and next frame.
- **Pass:** One coherent revision, no 100 ms task, and no allocation/scan pattern that
  grows superlinearly for the declared shape.
- **Lab:** `performance/bulk-update` uses **Bulk update** and reports changed count and max gap.

## PRF-006 — Continuous Interaction

- **Measure:** Pan, cursor zoom, point hit, box/paint selection, move, resize, rotate,
  edge auto-pan, and tooltip hover while large scenes and animations are active.
- **Pass:** No task at or above 100ms; input-to-visible p95 is at most 50ms and
  frame-gap p95 at most 33ms; transformed hit testing
  stays exact.
- **Lab:** `performance/interaction` runs direct gestures with a small FPS/max-gap indicator only.

## PRF-007 — Teardown and Retained Resources

- **Measure:** Repeated init/load/interact/destroy/remount cycles, forced-GC heap where
  available, PixiJS textures/buffers/tickers, DOM/canvas, listeners, observers, workers,
  pending tasks, and active gestures.
- **Pass:** Counts return to the declared baseline and JS/native/GPU proxy growth stays
  within the fixture's approved workload allowance. No callback fires from a prior lifecycle.
- **Lab:** `performance/lifecycle` runs 10 cycles and presents a compact resource diff.

## PRF-008 — Scene Extraction

- **Measure:** Exact target-publication-checkpoint PixiJS scene extraction after
  updates, CSS/image dimensions,
  repeated canvas-to-image-to-canvas switching, resize, and teardown.
- **Pass:** Success reports the requested and captured tuple; supersession, abort,
  timeout, renderer loss, and destroy follow `engine-boundary.md`. Semantic geometry
  and dimensions are correct, the same canvas resumes, and there are no black/stale
  frames or retained temporary images. Pixels are environment-qualified.
- **Lab:** `report/extract` repeats extraction 10 times.

## PRF-009 — Performance Must Not Weaken Semantics

- **Rule:** Optimizations may change batching, object count, cache strategy, update
  ordering internals, and API design. They may not change public identity semantics,
  final values, event timing/order, hit targets, hierarchy, selection/history outcome,
  or cleanup.
- **Gate:** After each material optimization, rerun affected scenario automation and
  fresh-session determinism before accepting new performance evidence.
- **Lab:** `performance/semantic-regression` replays the selected optimized action and
  compares its normalized result to the frozen semantic fixture.
