# Core v2 Functional Lab

## Product of the Lab

The Lab is a light-theme executable checklist for Core v2 only. The existing engine
comparison Lab remains a separate performance reference; it is not the implementation
surface for this contract.

The page keeps only what browser validation needs:

1. a scenario search/list with priority and pass/open/fail state;
2. dataset size (`100`, `500`, `1,000`, `2,000`, `5,000`, production) and deterministic
   seed;
3. the PixiJS canvas and the focused controls for the selected scenario;
4. one compact result strip: action time, maximum frame gap, long-task count, semantic
   assertion count, and the first failure.

There is no dark mode, decorative dashboard, invariant wall, or unrelated telemetry.
The selected scenario, dataset size, and seed are stored in the URL so a failing case
can be shared and reloaded exactly.

## One Scenario per Route

Every capability heading in `scenarios/*.md` is a distinct case. Its route is
`/lab/core-v2?scenario=<ID>&size=<SIZE>&seed=<SEED>`, its root test ID is
`scenario-<lowercase-ID>`, and its focused control/gesture is the `Lab` field in that
scenario. Every `CSM-*` row in `consumer-journeys.md` is also a distinct case using the
Lab-case column.

No route may pass because a related scenario passed. A case owns:

- minimal seeded dataset setup;
- one primary action or direct gesture;
- normalized semantic assertions;
- environment-qualified screenshot only when visually useful;
- exact cleanup before switching to the next case;
- a repeat button that advances the deterministic random stream without reloading.

The catalog generator must fail CI if a scenario heading or `CSM-*` row lacks a unique
Lab mapping, route, control/gesture, canonical fixture/expected observation, or
automation owner. It also fails when a route reports pass without a digest-bound
evidence record from `production-readiness.md`.

## Required Global Controls

| Control | Behavior |
| --- | --- |
| **Load dataset** | Replaces the current scene with the selected seeded workload and measures validation/materialization/first useful frame. |
| **Reset case** | Tears down case-owned state and recreates the same scenario, size, and seed. |
| **Repeat action** | Runs the same action with the next deterministic random values. |
| **Copy URL** | Copies scenario, size, and seed. |

## Required High-Frequency User Actions

These controls are first-class because they directly expose the known Core v2 risk
areas and must remain pressable while earlier work or animation is active.

| Button | Dataset | Required result |
| --- | --- | --- |
| **Bar height update** | Seeded random bar values, heights, placements, colors, sizes, and durations. | Starts or retargets `easeOutCubic` animation from the current visible state; final semantic value is exact; pan/zoom remains responsive. Maps to ANI-001 and PRF-003. |
| **Text render** | New seeded random text objects using length, Unicode, multiline, style, placement, split, wrap, and overflow variants. | Publishes correct text/layout on the next frame without stale glyphs or a 100 ms task. Maps to REN-006/011 and PRF-004. |
| **Text change** | Existing seeded text targets with new random content/style. | Updates only intended targets, preserves unrelated data, recomputes bounds/hit/relations, and avoids stale text. Maps to UPD-002/007 and PRF-004. |
| **Bulk update** | Representative 10% and host-shaped full overlay. | Publishes one coherent revision and reports changed/missing counts. Maps to UPD-007/013 and PRF-005. |
| **Undo** / **Redo** | Current mutation scenario. | Restores exact semantic state and related selection/mode when declared. Maps to HIS-001–006. |
| **Group** / **Ungroup** | Same-parent selected elements with nested transforms and relations. | Preserves world geometry/order/relations, updates selection, and creates one reversible history action. Maps to CSM-031, UPD-009, and HIS-006. |

## Direct Interaction Cases

Pointer scenarios use real browser input rather than synthetic function calls. The Lab
must support primary click/tap, double/right/multi-click, hover, box/paint drag, pan,
cursor zoom, pinch on real capable devices, move, eight-direction rect/image resize, rotate, modifier
changes during gestures, pointer-up-outside, pointer-cancel, lost capture, leave, and
window blur.

Each case verifies screen/world conversion after pan, zoom, world rotation, and flip.
Input traces are short and hidden by default; on failure they show owner-qualified logical targets,
event order, selection, revision, and history depth.

## Scenario Catalog Mapping

| Source | Scenario IDs | Lab mapping source | Implementation state |
| --- | --- | --- | --- |
| `scenarios/lifecycle-data.md` | LIF-001–006, DAT-001–008 | Each scenario's `Lab` field | pending |
| `scenarios/rendering-layout-assets.md` | REN-001–011, LAY-001–005, AST-001–003 | Each scenario's `Lab` field | pending |
| `scenarios/updates-animation.md` | UPD-001–014, ANI-001–003 | Each scenario's `Lab` field | pending |
| `scenarios/events-selection.md` | EVT-001–009, QRY-001–002, SEL-001–009 | Each scenario's `Lab` field | pending |
| `scenarios/viewport-transformer.md` | VIE-001–008, TRN-001–010 | Each scenario's `Lab` field | pending |
| `scenarios/history-errors-determinism-performance.md` | HIS-001–006, ERR-001–006, DET-001–004, PRF-001–009 | Each scenario's `Lab` field | pending |
| `scenarios/pixijs-package-integration.md` | PIX-001–004, PKG-001–003 | Each scenario's `Lab` field | pending |
| `scenarios/pixijs-package-integration.md` additions | PIX-005, PKG-004–005 | Each scenario's `Lab` field | pending |
| `scenarios/security-accessibility-operations-migration.md` | SEC-001–004, ACC-001–003, OPS-001–002, MIG-001–003 | Each scenario's `Lab` field | pending |
| `consumer-journeys.md` | CSM-001–038 | Each row's Lab-case column | pending |

## Automation and Browser Matrix

- Semantic unit/contract tests run for every case.
- Normative browser cases run twice in fresh Chromium sessions with the same seed.
- Pointer and visual interaction cases run in headed Chromium with console, page, and
  network errors captured.
- Proxy performance uses 4x CPU with raw samples preserved; only workload-relevant
  scenarios run the expensive matrix after implementation/evidence changes.
- Final approval reruns the complete headed matrix on representative low-end Windows.
- Mouse, precision trackpad, and keyboard are mandatory release cells. Touch, pen, and
  multi-pointer cells require real capable Windows hardware; simulation is diagnostic.
- Screenshot differences alone do not fail across platforms; normalized geometry,
  text content/layout, color intent, hierarchy, hit targets, interaction outcome, and
  event/history order do.
- Every run emits the observation/evidence record. A green UI without a
  matching nonzero-safe artifact is `Lab-observed`, not verified.
- Security routes use only local deterministic hostile fixtures and never render raw
  secrets/URLs in failure output. Actual-host and rollback routes link external
  digest-bound results without embedding consumer source.

## Scenario Switching Cleanup

Changing route or case performs a complete case teardown: pointer capture, active
gesture, host and window listeners, PixiJS tickers, scene objects, textures leased only
by the case, pending assets, scheduled animation/frame work, history, DOM overlays,
canvas, and observers. The next case begins with zero callbacks from the previous case.
