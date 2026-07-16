# Restricted Source Audit

## Boundary

The specification owner reviewed Original public documentation, package exports,
source, and tests plus patch-service canonical specifications and active consumption
paths. Dependency `node_modules/**`, generated `dist/**`, bundles, source maps,
archives, secret environment values, and the consumer's untracked `topology.json` were
excluded.

This file records evidence location only. It is not an implementation design and is
not handed to Core v2.

## Analysis Slices

| Slice | Temporary analysis digest | Sanitized output |
| --- | --- | --- |
| render/layout/assets/update | `0bc358a44195e15e52a002931a5539b5f94daecabe141da1cb0afef092c71e8d` | dataset, lifecycle-data, rendering-layout-assets, updates-animation |
| events/selection/viewport/transform/history | `b0a7b468976fe8614c834143e647282ba17338df001335ae2261006952ce2680` | events-selection, viewport-transformer, history-errors-determinism-performance |
| patch-service Dashboard/Editor/Report | `239139d27c8563081c80b82004a12055efbaddfb250f9fb0874440887f55eea6` | consumer-journeys and P0 coverage |

Temporary reports were integration aids, not durable handoff artifacts. Their relevant
findings are represented in the canonical contract and open-question IDs.

## Original Evidence Index

| Capability | Reviewed public/source/test areas | Contract families |
| --- | --- | --- |
| package surface and public usage | `README.md`, `README_KR.md`, `package.json`, `src/index.js`, `src/patch-map.ts`, `src/patchmap.js` | all families |
| lifecycle, draw, resize, view state | `src/init.js`, `src/patchmap.js`, `src/tests/render/patchmap.test.js` | LIF, VIE, ERR, DET |
| dataset schema/defaults | `src/display/data-schema/**` and schema tests | DAT, REN, LAY, ERR |
| hierarchy/components/layout | `src/display/mixins/**`, element/component render tests | REN, LAY, UPD |
| text and readable orientation | text layout code/tests, orientation matrix tests | REN-006/011, LAY-004, PRF-004 |
| assets and async sources | `src/assets/**`, init asset paths, image/icon/background tests | AST, ERR-003 |
| relations | relation render/update tests and public documentation | REN-007, UPD-010 |
| updates and undo snapshots | public update documentation, render update tests, `src/tests/undo-redo/**` | UPD, ANI, HIS |
| event/state/selection/query | `src/events/**`, `src/utils/event/**`, `src/utils/selector/**`, related tests | EVT, QRY, SEL |
| focus, fit, world transform | focus/fit and view-transform code/tests | VIE |
| transformer | `src/transformer/**`, transformer tests | TRN, HIS |
| history manager | `src/command/**` and tests | HIS |

Public export intent was covered for the map lifecycle surface, commands/history,
state propagation, transformer, utilities, legacy conversion, and scene querying. The
contract intentionally does not reproduce export names or internal object models.

## patch-service Evidence Index

The consumer audit followed its canonical boundary specification and active owners:

- `docs/technical-designs/patch-map-plant-map-boundaries.md`;
- `src/lib/components/patch-map/**`;
- `src/lib/dashboard/widgets/plant-map/**`;
- `src/lib/editor/plantmap/**`;
- `src/routes/reports/[reportId]/_components/visualize/panel-performance.svelte`.

The audit found three active runtimes and mapped them to CSM-001–038. Domain wiring,
registry/time-series/latest merge, commands, form validation, save orchestration,
navigation, dialogs, and dashboard persistence remain host responsibilities.

## Coverage Cross-Check

| Evidence family | Scenario mapping | Unexplained gap |
| --- | --- | --- |
| all 7 element and 4 component kinds | DAT-001, REN-001–011 | none; edge decisions in OQ-005–010/021–023 |
| draw/update/events/view/query | LIF, UPD, ANI, EVT, QRY, VIE | no missing family |
| selection/state/transform/history | SEL, EVT-007, TRN, HIS | no missing family; ambiguous edges in OQ-012–020 |
| assets/theme/text/orientation/relations | DAT-004, AST, REN, LAY, UPD-010 | no missing family; legacy/value conflicts remain open |
| consumer Dashboard | CSM-009–017 | complete journey inventory |
| consumer Editor | CSM-018–036 | complete journey inventory; group/ungroup binding open |
| consumer Report | CSM-037–038 | complete journey inventory |
| failure/determinism/performance | ERR, DET, PRF | production fixture and Windows evidence pending |
| actual PixiJS and package constraint | PIX, PKG | implementation and packed-consumer evidence pending |

## Unresolved Evidence Conflicts

- Public typing and runtime validation disagree on `placement: none`.
- Negative text split is accepted too broadly and can create non-terminating work.
- Broad PixiJS color inputs conflict with JSON-oriented clone/export behavior.
- Legacy object-root conversion is publicly reachable but its complete behavior has
  not been safely specified.
- Missing relation endpoints omit individual segments, while consumer host validation
  may reject domain-invalid wiring before engine submission.
- Resize eligibility is narrower in existing evidence than general product wording.
- Touch completion, third click, event-binding overlap, surface bubbling, redraw
  selection, and mid-gesture target changes lack a single unambiguous product rule.
- Consumer canonical docs do not provide representative production materialized counts.

Each conflict is represented by an `OQ-*` row; none was silently resolved from internal
design preference.
