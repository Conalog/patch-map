# Lifecycle and Dataset Scenarios

## LIF-001 — Initialize an interactive map surface

- **Priority:** P0
- **User goal:** Open a map that is ready for rendering and interaction inside a host element.
- **Given:** An empty host with positive dimensions and valid application, viewport, theme, asset, and transformer options.
- **When:** The host initializes PatchMap.
- **Then:** Exactly one PixiJS canvas is attached; renderer, viewport, world, state, history, resize, asset, and optional editing facilities are ready before initialization resolves; the host receives one ready notification. Without overrides, the surface uses `#FAFAFA`, antialiasing, resolution `2`, drag/wheel/pinch/deceleration, and zoom limits `0.5–30`.
- **Edges:** Repeating initialization on the same live instance does not attach another
  canvas or duplicate listeners. Zero-sized hosts remain finite and recover after
  resize. Only explicitly required initialization-asset failure rejects initialization;
  scene-target failures use placeholder/retry and do not suppress the usable surface.
- **Automation:** Assert DOM ownership, public readiness, notification count/order, and no leaked listener on repeated initialization.
- **Lab:** `lifecycle/initialize` provides **Initialize** and **Initialize again** controls with canvas count and pass/fail result.

## LIF-002 — Draw the first authoritative dataset

- **Priority:** P0
- **User goal:** See the selected plant map after data becomes available.
- **Given:** A ready instance and valid nested dataset.
- **When:** The host submits the dataset.
- **Then:** Caller data remains unchanged; defaults and generated identities are
  materialized internally; all logical elements/components/relations/hierarchy become
  queryable, while only semantically visible records receive pixels/hits and hidden
  components have no render object. The next native frame reflects the scene; one
  draw-complete notification represents the latest successful draw.
- **Edges:** Submission before readiness has no side effect. A failed later submission does not erase the latest valid scene. Two submissions before deferred completion publish only the latest successful result.
- **Automation:** Compare input before/after, semantic scene snapshot at return and next frame, canvas state, and notification ordering.
- **Lab:** `Render selected dataset` plus a rapid double-render case.

## LIF-003 — Replace an existing scene

- **Priority:** P0
- **User goal:** Navigate to another plant or reload a map without stale visuals or interactions.
- **Given:** A rendered scene with selection, registered events, animation, transformer selection, and undo history.
- **When:** The host submits a replacement dataset.
- **Then:** Previous scene objects and unmanaged overlays owned by the map surface are removed; stale selection, object event bindings, animation jobs, and undo history cannot affect the new scene; the new dataset becomes the only authoritative hierarchy.
- **Edges:** Repeated replacement remains deterministic and does not increase canvas, ticker, listener, or retained object counts.
- **Automation:** Exercise two unrelated datasets and assert old IDs, pixels, hit targets, callbacks, and history are absent.
- **Lab:** `Replace dataset A → B → A` with stale-state assertions.

## LIF-004 — Resize with the host

- **Priority:** P0
- **User goal:** Keep the map usable when its panel or browser changes size.
- **Given:** A rendered and transformed scene.
- **When:** The host dimensions change.
- **Then:** Canvas backing resolution, CSS surface, viewport screen bounds, coordinate conversion, and visible world transform update together; selection and relation geometry remain aligned.
- **Edges:** Rapid resize is coalesced without stale dimensions. Resize after destroy does nothing. Rotation and flip remain centered and finite.
- **Automation:** Resize through several aspect ratios and compare screen/world points, hit tests, bounds, relation endpoints, and canvas count.
- **Lab:** `lifecycle/resize` uses a resizable split panel with current dimensions and coordinate probe.

## LIF-005 — Destroy and re-initialize safely

- **Priority:** P0
- **User goal:** Leave and revisit a map without memory leaks or duplicate behavior.
- **Given:** A live scene with assets, animations, events, selection, transformer, history, viewport gesture, and pending frame work.
- **When:** The host tears down the map.
- **Then:** Canvas, resize observation, pointer/keyboard subscriptions, ticker work, animation, scene objects, selection, history, and retained host references are released; one destroyed notification is emitted; later pending work cannot mutate the page.
- **Edges:** Repeated destroy is safe. Re-initialization creates a fresh default theme, view, state, history, and canvas with no callback multiplication.
- **Automation:** Run repeated full lifecycle cycles with forced GC where available and assert one canvas, bounded retained heap, and exact callback counts.
- **Lab:** `lifecycle/destroy-reinitialize` provides **Teardown**, **Re-initialize**, and **Run 10 lifecycle cycles** controls.

## LIF-006 — Suspend and Resume the Page Safely

- **Priority:** P1
- **User goal:** Return to a backgrounded, frozen, or restored page without a burst of
  stale motion or callbacks.
- **Given:** A live scene during asset load, bar animation, viewport deceleration,
  transform gesture, and extraction.
- **When:** The document becomes hidden, the page freezes/resumes, or a long wall-clock
  gap occurs before the next frame.
- **Then:** PatchMap pauses or cancels work according to the action's deterministic time
  policy, releases pointer capture, and on resume publishes at most one coherent current
  frame. It cannot apply a giant unstable delta, duplicate history/events, complete an
  obsolete asset/extraction, or retain a pre-suspend gesture.
- **Automation:** Use real visibility/page lifecycle hooks where controllable and a
  deterministic clock fallback; assert post-resume revision/event/resource state.
- **Lab:** `lifecycle/suspend-resume` exposes pause/resume controls and one fresh probe.

## DAT-001 — Accept every element and component discriminator

- **Priority:** P0
- **User goal:** Render every map construct used by existing datasets.
- **Given:** One dataset containing group, grid, item, relations, image, standalone text, and rect elements plus background, bar, icon, and text item components.
- **When:** The scene is materialized.
- **Then:** Each discriminator produces the semantic hierarchy and visual role defined in `dataset.md`; ordering is deterministic and every visible node has finite geometry.
- **Edges:** Empty component arrays and empty groups remain valid. Unsupported discriminators are rejected with their dataset path.
- **Automation:** Assert semantic node counts, hierarchy, type, bounds, visibility, and representative pixel intent.
- **Lab:** `Render all kinds` with a labeled specimen board.

## DAT-002 — Apply defaults without changing caller data

- **Priority:** P0
- **User goal:** Supply concise datasets while receiving consistent visuals.
- **Given:** Minimal valid records that omit optional identity, visibility, lock, styles, spacing, placement, animation, and orientation values.
- **When:** The scene is materialized.
- **Then:** Contract defaults are applied to internal state, generated identities are usable for the life of that scene, and the original records remain byte-equivalent.
- **Edges:** Reusing the same input object across fresh instances yields equivalent semantic output without cross-instance state.
- **Automation:** Deep-freeze inputs, render twice in fresh sessions, and compare normalized semantic snapshots.
- **Lab:** `Render minimal defaults` and show resolved semantic values.

## DAT-003 — Normalize size, spacing, radius, and gap shorthand

- **Priority:** P0
- **User goal:** Use compact dataset notation without changing layout meaning.
- **Given:** Equivalent values expressed as scalar, axis, edge, pixel, percentage, and structured forms.
- **When:** They are used during initial rendering or later change.
- **Then:** Equivalent forms resolve to equal geometry. Explicit edge values override the sides derived from axis values. Mixed pixel/percentage component sizes use the current parent content box.
- **Edges:** Partial fixed-size objects and non-finite numbers are rejected. Zero and negative values follow each field's explicit validation rule rather than being silently clamped.
- **Automation:** Table-driven semantic bounds and validation assertions.
- **Lab:** `data/shorthand` uses a shorthand selector with side-by-side equivalent specimens.

## DAT-004 — Resolve theme and color inputs

- **Priority:** P0
- **User goal:** Reuse service colors and provide direct PixiJS-compatible colors.
- **Given:** Default and custom theme keys plus string, number, array, typed-array, and color-object inputs.
- **When:** Colors are resolved for elements, components, text, strokes, tints, and transformer visuals.
- **Then:** Theme references use the active instance theme; direct colors preserve their intended RGBA result; changing one instance theme does not affect another.
- **Edges:** Missing theme paths and invalid/non-finite colors fail atomically with a
  path-aware diagnostic; they never use an implicit fallback or create non-finite state.
- **Automation:** Compare normalized RGBA intent, isolation between instances, and error/fallback classification.
- **Lab:** `data/colors` uses theme palette and direct-color specimen controls.

## DAT-005 — Materialize a grid from its cell matrix

- **Priority:** P0
- **User goal:** Display repeated equipment cells with predictable identity and spacing.
- **Given:** A multi-row matrix containing `0`, `1`, and string cells plus item size, padding, gap, components, and orientation.
- **When:** The grid is rendered.
- **Then:** Active cells appear at deterministic row/column positions with structural ID `<grid-id>.<row>.<column>`; string cells retain the string as their public label; inactive cells follow the declared remove-or-hide strategy; shared template data is not mutated.
- **Edges:** Ragged rows, an empty matrix, duplicate string identities, and later active/inactive transitions have explicit deterministic outcomes.
- **Automation:** Assert cell count, IDs, positions, visibility, bounds, template immutability, and transition behavior.
- **Lab:** `data/grid-cells` uses an editable cell matrix with destroy/hide strategy toggle.

## DAT-007 — Reject invalid input atomically

- **Priority:** P1
- **User goal:** Diagnose bad map data without losing the last working view.
- **Given:** A valid authoritative scene and a new dataset containing one contract violation.
- **When:** The host attempts to replace the scene.
- **Then:** The replacement fails before publication; the prior scene, selection, view, and interaction state remain usable; the diagnostic identifies the dataset path and violation category.
- **Edges:** Cover unknown keys, missing required fields, invalid discriminator, malformed sizes/spacing/colors/assets, invalid cells, negative split, and cross-field violations separately. Missing relation endpoints are covered as segment omission rather than a draw-wide validation failure.
- **Automation:** One table row per validation category, asserting no partial publication or success notification.
- **Lab:** `data/invalid` uses an invalid-fixture chooser with readable diagnostic and unchanged-scene assertion.

## DAT-008 — Preserve deterministic identity and ordering

- **Priority:** P1
- **User goal:** Receive repeatable selection, stacking, relation, and update results from the same data.
- **Given:** Nested arrays containing explicit and generated identities, equal stacking values, and supported duplicate-identity cases.
- **When:** The dataset is rendered repeatedly in fresh sessions and modified structurally.
- **Then:** Hierarchy and display order remain deterministic; generated identities remain stable for the current materialized objects; addressing and relation behavior for duplicate identities follows one documented rule.
- **Edges:** Removing and recreating an object does not let stale references or selection mutate the replacement.
- **Automation:** Fresh-session normalized snapshots plus stale-target and duplicate-order assertions.
- **Lab:** `Determinism × 5` with semantic hash output.
