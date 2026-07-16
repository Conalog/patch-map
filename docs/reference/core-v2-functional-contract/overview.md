# Core v2 Functional Contract

## Purpose

This contract is the implementation and Lab checklist for the production Core v2 map
engine. It defines what users and host applications must be able to accomplish without
prescribing an API shape or internal design.

Core v2 must accept the existing PATCH MAP dataset schema and render through PixiJS.
It may redesign every method, event surface, state abstraction, handle, and module.

## Normative Result

The following are normative across supported browsers:

- materialized element and component hierarchy;
- world and local geometry, placement, bounds, and hit targets;
- visible text content, line layout, overflow result, and readable orientation;
- resolved color, opacity, visibility, texture intent, and relation styling;
- selection, editing, viewport, history, and lifecycle state transitions;
- callback/event meaning, ordering, coalescing, and error visibility;
- input immutability, deterministic repeated execution, and resource cleanup.

Exact raster pixels are environment-qualified. Font rasterization, antialiasing, GPU
backend details, and subpixel blending may differ when the normative geometry, content,
color intent, and interaction result remain equivalent.

## Scenario Record

The catalog intentionally permits concise family-specific records instead of requiring
empty boilerplate fields in every scenario:

| Record | Required fields | Optional fields |
| --- | --- | --- |
| functional | ID, goal/user goal, action/when, result/then, Lab | setup/given, priority, edges, automation, performance |
| rendering/data specimen | ID, user goal, given, when, then, Lab | priority, edges, automation, performance |
| performance | ID, workload/measure, pass or protocol, Lab | goal, environment, edges, gate |
| invariant/rule | ID, rule, gate/result, Lab | workload, automation |

Priority is canonical in `coverage.md` and `consumer-journeys.md`; a missing local
priority does not mean optional. Automation defaults to normalized semantic assertions
plus the browser rules in `lab.md`; a scenario lists a custom automation field only
when it needs additional behavior. Setup and edges may be omitted only when the action
has no special precondition or boundary beyond shared contracts.

Every record always owns a stable ID and exactly one focused Lab route. The catalog
generator validates IDs, Lab uniqueness, family record shape, and coverage status.

## Capability Families

| Prefix | Capability |
| --- | --- |
| `LIF` | Initialization, resize, redraw, destroy, and re-initialization |
| `DAT` | Dataset validation, defaults, identity, immutability, and legacy input |
| `REN` | Element and component rendering |
| `LAY` | Size, spacing, placement, hierarchy, orientation, and bounds |
| `AST` | Theme, assets, textures, images, fonts, and loading |
| `UPD` | Targeted, bulk, structural, relative, refresh, and animated changes |
| `EVT` | Canvas, object, pointer, keyboard, and host notifications |
| `QRY` | Current-scene lookup and stable result lifetime |
| `SEL` | Click, drill-down, box, paint, filtered, and programmatic selection |
| `VIE` | Pan, zoom, focus, fit, rotation, flip, resize, and coordinate conversion |
| `TRN` | Wireframes, resize, rotate, handles, constraints, and gesture completion |
| `HIS` | Undo, redo, grouping, limits, invalidation, and event ordering |
| `ERR` | Rejection, no-target, partial failure, recovery, and user-visible diagnostics |
| `DET` | Fresh-session determinism, repeated actions, cleanup, and retained resources |
| `PRF` | Object-count, animation, bulk update, interaction, teardown, and memory budgets |
| `ANI` | Animated values, deterministic time, interruption, and lifecycle |
| `PIX` | Actual PixiJS renderer, stage, backend, diagnostics, and extraction |
| `PKG` | Packed consumer, redesigned host adapter, and multi-instance isolation |
| `SEC` | Asset/extraction safety, diagnostic redaction, and package provenance |
| `ACC` | Lab accessibility, host keyboard parity, and reduced motion |
| `OPS` | Bounded runtime diagnostics and callback/telemetry isolation |
| `MIG` | Persisted-schema cutover, canary isolation, and rollback |

## Required Artifacts

- `dataset.md` defines the accepted input language and normalization outcomes.
- `dataset-schema-reference.md` closes allowed keys, field types, defaults, extension
  points, updates, and export treatment.
- `dataset-fixtures.md` freezes executable valid/invalid examples and normalizations.
- `semantic-observation.md` freezes normalized expected output, geometry, text,
  participation, equality, and diagnostics.
- `mutation-operation-schema.md` freezes the versioned transaction envelope, path
  grammar, merge/unset/reconcile behavior, conflicts, and results.
- `engine-boundary.md` freezes lifecycle, revisions, transactions, cancellation,
  event/reentrancy, animation/gesture, and host seams without prescribing an API.
- `scenarios/` contains the executable functional contracts.
- `consumer-journeys.md` maps real Dashboard, Editor, and Report flows to P0 cases.
- `lab.md` maps every scenario to one direct browser case.
- `coverage.md` tracks priority, automated evidence, Lab status, and implementation status.
- `open-questions.md` is the resolved product-decision and remaining-evidence registry.
- `evidence/decision-evidence-manifest.v1.json` and
  `evidence/catalog-evidence-manifest.v1.json` freeze all 38 decisions and all 173
  scenario/journey fixture-action-expected pairs with digest provenance.
- `evidence/catalog-fixture-profiles.v1.json`, `evidence/catalog-typed-cases.v1.json`,
  and `evidence/catalog-review-registry.v1.json` separate concrete inputs/actions from
  independent semantic approval so catalog generation cannot approve itself.
- `production-readiness.md` defines evidence promotion, CI, security, support,
  actual-host integration, migration, canary, rollback, and release approval.

Core v2 completion requires every included scenario to pass automated verification and
its Lab case. A scenario may remain open only with an explicit product-owner exclusion;
an implementation limitation is not an exclusion.

## Honest Readiness Statement

The replacement specification is frozen for implementation start: all 38 owner
decisions and all 173 scenario/journey fixture/action/expected records are approved and
digest-bound. No automated, Lab, integration, performance, accessibility, or release
execution is implied. “All code written,” a successful demo, or a broad Lab smoke
cannot override the readiness levels and release gate in `production-readiness.md`.
