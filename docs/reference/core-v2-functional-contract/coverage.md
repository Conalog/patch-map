# Functional Coverage Matrix

## Status Meaning

- `audited`: Original public evidence and/or real consumer usage has been reviewed.
- `draft-complete`: an implementation-neutral scenario, observable assertions, and Lab
  mapping exist.
- `decision-resolved`: product behavior is closed, but canonical expected evidence may
  still be missing or review-pending.
- `contract-approved`: the fixture/action/normalized-expected record is reviewed and
  digest-bound; runtime execution is tracked separately.
- `pending`: no Core v2 implementation or executable Lab evidence exists yet.

This document does not claim Core v2 feature completion. It is the implementation
backlog and review surface.

## Inventory Summary

| Catalog | Count | Evidence review | Scenario contract | Automation | Lab | Core v2 |
| --- | ---: | --- | --- | --- | --- | --- |
| Lifecycle and dataset | 14 | audited | contract-approved | pending | pending | unassessed |
| Rendering, layout, assets | 19 | audited | contract-approved | pending | pending | unassessed |
| Updates and animation | 17 | audited | contract-approved | pending | pending | unassessed |
| Events, query, selection | 20 | audited | contract-approved | pending | pending | unassessed |
| Viewport and transformer | 18 | audited | contract-approved | pending | pending | unassessed |
| History, errors, determinism, performance | 25 | audited | contract-approved | pending | pending | unassessed |
| PixiJS and package integration | 10 | public constraint audited | contract-approved | pending | pending | unassessed |
| Security, accessibility, operations, migration | 12 | production-boundary audited | contract-approved | pending | pending | unassessed |
| patch-service P0 journeys | 38 | audited across Dashboard/Editor/Report | contract-approved | pending | pending | unassessed |
| **Total executable cases** | **173** | **audited** | **173/173 contract-approved** | **pending** | **pending** | **unassessed** |

All 135 capability scenarios contain a unique `Lab` field. All 38 consumer journeys
contain a unique Lab-case value. The catalog check must also require one versioned
fixture/expected observation and digest-bound evidence record per promoted case; prose
or a green Lab screen cannot satisfy it.

## Public Capability Audit

| Observable capability family | Contract owner | Consumer priority | Remaining execution evidence |
| --- | --- | --- | --- |
| initialization, draw, resize, replacement, suspend/resume, destroy | LIF-001–006 | CSM-001–004, 017, 018, 036–038 | required/scene asset failure fixtures and lease proof |
| all seven elements and four item components | DAT-001–008, REN-001–011 | CSM-001, 006, 019, 025–033, 037 | legacy/ID/placement/hidden fixtures |
| size, margin, padding, grid, placement, orientation, bounds, stacking | DAT-003/005, LAY-001–005 | CSM-006, 019, 025, 027–031 | numeric and `placement:none` normalized output |
| themes, colors, images, fonts, asset descriptors and races | DAT-004, AST-001–003, ERR-003 | CSM-001, 006, 029, 032, 035, 038 | ColorSource/export and cross-instance lease evidence |
| stable lookup, merge/replace, relative/center, structural/bulk/live/refresh updates | UPD-001–014 | CSM-002, 004–008, 014, 016, 019, 025–033, 037 | missing/stale strictness is action-declared |
| bar animation and deterministic time | ANI-001–003, REN-009 | CSM-006/007/014 | history boundary explicitly declared by scenario |
| pointer, canvas/target events, interaction state | EVT-001–009 | CSM-011, 013, 015, 017, 020, 024, 032, 036 | click/device/propagation traces |
| current scene query and stable result lifetime | QRY-001/002 | CSM-005, 011–013, 020–033 | owner-local component and stale-result fixtures |
| point/deep/box/paint/programmatic/external/relation selection | SEL-001–009 | CSM-011/012/016, 020/021/026/034 | redraw and relation-tolerance traces |
| pan/zoom/focus/fit/rotate/flip/resize and policies | VIE-001–008 | CSM-009/010/017/018/024/037 | production min/max and preset values are host policy |
| selection outlines, move, eight-way resize, rotation, interruption | TRN-001–010 | CSM-012, 018, 021–024, 034 | rect/image eligibility and interruption traces |
| undo/redo, grouping, shortcuts, events, host companion state | HIS-001–006 | CSM-019, 022/023, 025–035 | default-50/configuration and companion-state traces |
| exact validation, recovery, lifecycle errors | ERR-001–006 | all lifecycle/editor/report failure flows | exact diagnostic fixtures |
| determinism, immutable input, export/roundtrip | DET-001–004 | CSM-001, 016, 019, 031, 035 | roundtrip execution against approved production fixture |
| load/update/text/bar/interaction/memory/extract performance | PRF-001–009 | all P0 journeys | target-Windows raw samples against approved fixture/profile |
| actual PixiJS stage/backend and packed consumer | PIX-001–004, PKG-001–003 | all deployed consumers, CSM-038 | backend/asset ownership and Windows evidence pending |
| renderer recovery and actual-host/package support | PIX-005, PKG-004–005 | all deployed consumers | runtime matrix, package policy, host harness pending |
| asset/extraction/package security | SEC-001–004 | all deployed consumers, CSM-032/035/038 | security ownership and limits pending |
| logical tree, keyboard, PixiJS accessibility, reduced motion | ACC-001–003 | Dashboard/Editor and Lab | tree/action/AT evidence pending |
| bounded diagnostics and callback isolation | OPS-001–002 | support and all host callbacks | telemetry policy pending |
| schema cutover, canary, rollback | MIG-001–003 | all production migration | staged cohort/dwell/owner rehearsal pending |

## Actual Consumer Coverage

The patch-service audit found three active product runtimes:

1. Dashboard consumes draw, live overlay, selection/highlight, tooltip, viewport,
   command-target snapshots, navigation cleanup, and view/column projection.
2. Editor consumes the full interaction surface: creation, selection, move,
   transformer, grid/relation/text editing, style, hierarchy, duplicate, clipboard,
   delete, history, export, and cleanup.
3. Report consumes scene replacement, host-computed color/visibility projection, fit,
   PixiJS scene extraction, canvas restoration, and destroy.

`consumer-journeys.md` maps each of these 38 journeys to lower-level capability IDs.
Host-only plant policy is explicitly excluded from Core v2 rather than accidentally
reimplemented.

## Decision and Evidence Rows

`open-questions.md` is now the authoritative resolved decision-to-contract registry:
all 38 rows are resolved and no product-choice question remains. `Resolved` does not
mean verified. `evidence/decision-evidence-manifest.v1.json` binds all 38 decisions,
and `evidence/catalog-evidence-manifest.v1.json` binds all 173 capability/journey
records. Every contract record is analysis-owner approved and digest-bound. Automation,
Lab, implementation, integration, and release evidence remain separate promotion
states.

CI fails when a token does not resolve, a closed decision conflicts with scenario text,
a row lacks a manifest entry, generated evidence drifts, or a manual status disagrees
with the generated result. An implementation-generated result cannot rewrite or
approve expected evidence.

## Core v2 Handoff Gate

The implementation owner receives only `docs/reference/core-v2-functional-contract/**`
plus explicit product-owner resolutions. The restricted source audit is not part of the
handoff. Before any feature is marked complete, the implementation owner must add:

- an actual observation against the immutable canonical fixture/expected record;
- automated contract evidence and fresh-session determinism result;
- the focused Lab case and stable test IDs;
- affected performance evidence at relevant sizes;
- an implementation status in this matrix;
- an explicit link to any missing evidence or approval that prevents full acceptance.

The handoff is implementation-start-ready, not production replacement approval. Final
promotion additionally requires the actual packed host matrix, supported runtime and
security gates, approved numeric performance/memory budgets, schema-safe canary and
rollback rehearsal, all product decisions resolved, and the evidence state machine in
`production-readiness.md`.
