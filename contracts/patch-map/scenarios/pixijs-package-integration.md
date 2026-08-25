# PixiJS and Package Integration

These scenarios prove the two fixed implementation constraints that are not merely
visual: PatchMap is a consumable package and its renderer is genuinely PixiJS-based.

## PIX-001 — Use a Real PixiJS Renderer and Stage

- **Goal:** Benefit from PixiJS rendering, lifecycle, and developer tooling.
- **Action:** Initialize PatchMap in a supported browser and inspect its active canvas.
- **Result:** The visible scene is rendered by a live PixiJS Application/renderer and
  stage, not by a parallel native Canvas2D replacement. PixiJS DevTools can discover
  the application and inspect the stage-level scene. PatchMap may aggregate thousands
  of logical objects into few display/render primitives; one display object per dataset
  entity is not required.
- **Lab:** `pixijs/devtools-stage` exposes a development-only inspector handle and
  verifies renderer/stage/canvas ownership.

## PIX-002 — Preserve Logical Diagnostics with Aggregate Rendering

- **Goal:** Debug a target even when it is not one PixiJS DisplayObject.
- **Action:** Select or query a logical ID, inspect normalized geometry/state, and map
  it to the aggregate PixiJS render layer.
- **Result:** Diagnostics reveal stable ID, kind, parent, bounds, visibility, current
  revision, and aggregate render owner without exposing private implementation or
  creating per-entity display objects solely for DevTools.
- **Lab:** `pixijs/logical-inspector` lets the user click an object and view this compact
  diagnostic beside the PixiJS stage selection.

## PIX-003 — Supported Runtime and Backend Equivalence

- **Goal:** Run on supported PixiJS backends without product behavior changes.
- **Action:** Execute the normative scenario subset on Windows 10/11 in the latest two
  stable Chrome and Edge versions recorded by exact version in the release manifest.
- **Result:** Geometry, text layout/content, color intent, hierarchy, hit targets,
  interaction, events, history, and cleanup are equivalent. Backend and raster details
  are recorded but platform-specific pixels are not normative. WebGL2 is mandatory.
  WebGPU is optional and must either preserve the same semantics or fall back to WebGL2;
  WebGL1/Canvas fallback cannot satisfy the production runtime gate.
- **Lab:** `pixijs/backend-equivalence` shows the active backend and normalized diff.

## PIX-004 — Extract the Current PixiJS Scene

- **Goal:** Capture report output using the same authoritative stage.
- **Action:** Extract after load/update/view changes, temporarily swap canvas for image,
  restore, resize, repeat, and destroy.
- **Result:** Extraction uses the current PixiJS scene and declared frame/clear color;
  visual CSS dimensions match; the same canvas resumes; no stale image, black frame, or
  retained extraction resource remains.
- **Lab:** `pixijs/scene-extract` is the functional owner of PRF-008 and CSM-038.

## PIX-005 — Recover from Renderer Context or Device Loss

- **Goal:** Preserve the authoritative map when the PixiJS backend is lost.
- **Action:** Trigger WebGL2 context loss and, when enabled, WebGPU device loss during idle, load, animation,
  gesture, extraction, resize, suspension, and destroy.
- **Result:** PatchMap either recreates renderer resources from the current semantic
  scene and publishes one recovered frame, or emits one classified fatal
  `RENDERER_LOST` result while keeping safe host state. It never duplicates canvas,
  listeners, events, history, or assets; spins indefinitely; or publishes stale work.
- **Lab:** `pixijs/renderer-loss` uses supported deterministic loss fixtures and reports
  backend, recovery/failure category, revision, and resource counts.

## PKG-001 — Consume the Packed Package

- **Goal:** Install PatchMap in a separate host project.
- **Action:** Build and pack the actual package, install it in a fresh offline consumer,
  and import the documented PatchMap entry with strict TypeScript settings.
- **Result:** ESM and the supported Node/bundler interop targets resolve, declarations
  expose only the intentional redesigned API, and a minimal init/load/update/destroy
  flow works. Package output contains no source map, internal evidence, test fixture,
  or repository-only verification material.
- **Lab:** `package/consumer-smoke` displays the packed version/commit and browser smoke
  result; package checks remain automated.

## PKG-002 — Keep the Host Adapter at the Public Boundary

- **Goal:** Make the product journeys achievable through a new API.
- **Action:** Run a small host adapter through load, stable lookup, bulk update,
  selection, transform, history, event disposal, snapshot, extract, and destroy.
- **Result:** Every required capability is reachable through documented public exports
  without importing internal handles or implementation classes. The adapter contains orchestration
  only and does not recreate missing engine behavior.
- **Lab:** `package/host-adapter` runs a compact Dashboard/Editor/Report mock flow.

## PKG-003 — Isolate Multiple Instances

- **Goal:** Mount more than one map safely.
- **Action:** Initialize two instances with different themes, assets, datasets, views,
  events, and animations; destroy and recreate one.
- **Result:** State and callbacks remain instance-local; shared asset leases are not
  prematurely unloaded; destroying one does not alter the other; each host owns exactly
  one canvas and one active lifecycle.
- **Lab:** `package/multiple-instances` renders two small canvases and resource counts.

## PKG-004 — Integrate the Packed Artifact in the Actual Host Boundary

- **Goal:** Prove the redesigned engine can replace the production package rather than
  only pass a mock adapter.
- **Action:** Install the packed artifact in the production host integration harness,
  compile with its strict TypeScript/bundler settings, and run every CSM journey with
  real mount/remount layout, envelopes, disposal, save guard, and report extraction.
- **Result:** All journeys pass against the same package digest; host/Core revisions and
  cleanup are traceable; the adapter remains orchestration and does not recreate missing
  engine behavior or import restricted package internals.
- **Lab:** `package/actual-host-integration` links the digest-bound external result and
  provides a focused smoke without embedding consumer source in the handoff.

## PKG-005 — Publish Tested Compatibility and Support Documentation

- **Goal:** Let consumers adopt and operate a redesigned API without undocumented
  assumptions.
- **Action:** Build the package and compile/run every public example and integration path.
- **Result:** The artifact publishes tested API/dataset docs, minimal and
  Dashboard/Editor/Report examples and host/engine responsibility guides,
  runtime/PixiJS/TypeScript/bundler matrix, semver/deprecation policy, changelog, and
  troubleshooting/support ownership. Documentation identifies its package and evidence
  digest and cannot drift from declarations/runtime.
- **Lab:** `package/documentation-smoke` runs the packaged examples and reports their
  exact version/digest.
