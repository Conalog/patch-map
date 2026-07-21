# REN-006 / REN-011 expected-blind automation and focused Lab plan

Status: implementation-ready automation plan. Approved expected and review evidence
remain immutable and inaccessible to product handlers, folds, runtimes, and the Lab.

## Exact promotion accounting

| Measure | Before | After |
| --- | ---: | ---: |
| executable cases | 26 | 28 |
| explicit stubs | 147 | 145 |
| executable actions | 109 | 119 |
| executable action types | 63 | 65 |
| render browser routes | 11 | 13 |
| render browser assertions | 149 | 199 |
| strict browser result | 146 pass / 3 frozen conflicts | 196 pass / 3 frozen conflicts |

`REN-006` contributes six actions and thirty assertions. `REN-011` contributes four
actions and twenty assertions. The only render-checkpoint failures remain the three
declared REN-005 parent-object conflicts.

## Expected-blind trust boundary

Add one browser-safe handler family, one fold family, and one executable runtime for
both cases. They may consume the materialized exact action trace, route provenance,
approved dataset profiles, and public Core v2 product probes. They may not import the
normalized expected catalog, comparator, international-text expected rows, or any
module that does.

The REN-011 `observeItemTextMatrix` action is especially guarded:

1. validate only the action's exact `valueRef` token;
2. never return fixture matrix rows or use their output-shaped fields;
3. create seven runtime-owned supplemental product specimens from an independent
   authored-input schema containing only source, frame, placement, margin, tint,
   split, wrap, overflow, auto-font min/max, item angle, and orientation;
4. load/render those specimens through the same parser, Core, Engine, and Pixi text
   lane;
5. collect all results through `textProbe`; and
6. include poisoned-fixture tests that alter expected-looking matrix values and prove
   actual output and digests do not change.

## Canonical actions

```text
REN-006
0 loadDataset({datasetId:"standalone-text"})
1 snapshot-observation({label:"initial-text"})
2 patch({targetId:"text",changes:{text:"مرحبا world"}})
3 patch({targetId:"rapid-text",changes:{text:"intermediate"}})
4 patch({targetId:"rapid-text",changes:{text:"final中"}})
5 publishFrame({timeMs:16.666667})

REN-011
0 loadDataset({datasetRef:"item-text-corpus"})
1 observeItemTextMatrix({valueRef:"itemTextContractMatrix"})
2 patch({target:{ownerId:"item-a",id:"bidi"},changes:{text:"中😀é\nمرحبا"}})
3 publishFrame({timeMs:16.666667})
```

Handlers validate case/action/index/keys/operands/fixture identity/route/abort before
allocating an Engine. Inputs are cloned and fingerprinted; every mutation uses the
public engine patch path. REN-006 actions 3 and 4 intentionally do not publish. Action
5 proves that only the final signature reached the renderer. Cleanup always runs from
the executor `finally` path.

## Product action snapshots

Each actual delta contains raw product facts rather than expected-shaped leaves:

- engine snapshot and revision tuple;
- exact normalized export and unchanged caller-input fingerprint;
- semantic and geometry probes;
- O(1) text probes for relevant targets;
- renderer debug and text-lane publication facts;
- font/runtime resource counts and sanitized journal; and
- after destroy, independent zero-valued engine/renderer/font ownership facts.

REN-006 action 1 snapshots all five standalone text targets. The final frame action
records the patched primary target, the rapid target's current/attached/published
signatures, and the declared capture source from the public world-bounds probe.

REN-011 action 1 observes the four canonical item components plus seven independently
constructed supplemental specimens. Action 3 records the final bidi component after
one manual frame.

## Fold rules

The fold validates exact trace continuity, target identity, immutable input, finite
geometry, capture shape, renderer publication, cleanup, and internal consistency
before projecting the semantic observation domains.

For `REN-006`, project:

- final primary content/lines/font runs/layout/world/hit bounds and stale count;
- scene revision, visible/z facts, paint command/opacity/style, interaction count;
- initial, empty, long-wrap, missing-font, and rapid-replacement product probes;
- actual position/rotation; and
- a derived style-and-transform-preservation result based on before/after product
  signatures, never the action operand alone.

For `REN-011`, project:

- four canonical component probes after the final frame;
- grapheme integrity from the kernel's cluster/source mapping;
- scene/frame revision and actual text-lane command count;
- seven supplemental product observations in stable authored row order;
- placed tint/local bounds and upright screen angle from actual probes; and
- `allRowsExact=true` only when every product row is complete, current, internally
  consistent, and independently observed. It must not mean comparison against fixture
  outputs.

Negative fold tests remove or corrupt one required probe, alter a renderer signature,
retain a stale glyph, misorder a row, or retain a font/text object and must fail closed.

## Independent comparison and determinism

Product integration runs each case in two fresh sessions through the canonical bridge,
real Core/Engine, and a real Pixi text leaf. Independent `compare.mjs` alone reads
immutable expected evidence.

Required results are `REN-006 30/30` and `REN-011 20/20`, identical stable actual and
comparison digests, exact action/capture order, zero fetch unless an explicitly owned
font preflight is under test, and full runtime/renderer/font cleanup. The test records
BitmapText/Text counts and verifies international specimens use the guarded fallback
lane.

## Focused Lab routes

Add the exact routes:

- `/lab/core-v2?scenario=REN-006&size=<SIZE>&seed=<SEED>`
- `/lab/core-v2?scenario=REN-011&size=<SIZE>&seed=<SEED>`

Both use the existing light shell and exact Run/Repeat/Reset controls. Phase/target
choosers only inspect completed actual snapshots and never mutate the canonical trace.

`REN-006` displays primary/initial/empty/long/missing/rapid targets, exact source versus
layout-normalized text, lines, font runs, layout/world/hit bounds, route, publication
signature, stale count, and style/transform. `REN-011` displays the four canonical
components and seven supplemental product rows, split/grapheme facts, content frame,
placement/margin, wrap/overflow/auto-font/upright facts, route, and publication state.

Focused controls for seeded random text length, Unicode ratio, multiline/long presets,
Render random text, and Change random text are runtime-owned product exercises. They
must be visually and semantically observable but remain separate from the immutable
catalog trace and comparison result.

Both routes retain per-run RAF FPS, maximum frame gap, Long Tasks, semantic layout
duration, text-object creation/update, and next-frame visibility telemetry. These are
development observations, not Windows performance claims.

## Browser checkpoint

Extend the stdout-only render script to thirteen routes and 199 assertions. Drive
REN-005/006/008/010/011 through actual UI controls. First, same-page repeat, and fresh
contexts must each report exactly 196 passes plus the same three REN-005 conflicts.

For both new routes verify:

- exact completed action rows and actual-only inspector inventory;
- all 50 case assertions through independent comparison;
- stable product and comparison digests;
- exact semantic lines/bounds/fallback/split/overflow/upright facts;
- one current Pixi text leaf per visible logical text, no stale signature, and no
  entity listener/ticker growth;
- random text controls visibly update actual text without a 100 ms main-thread task at
  the initial proxy size;
- canvas maximum one and zero after cleanup/destroy;
- font/text runtime counts return to zero; and
- console, page, network, and unexpected external-font requests remain zero.

## Implementation order and validation

1. Product plan commit: this document plus the product plan only.
2. Semantic kernel and corpus tests; typecheck/lint/targeted unit.
3. Parser/projection and atomic reconcile tests.
4. renderer publication plus Core/Surface/Engine O(1) probe tests.
5. expected-blind handlers/fold/runtime and poisoned-fixture integration.
6. exact Lab inspectors and seeded random product controls.
7. headless then headed thirteen-route checkpoint.
8. milestone full unit, typecheck, lint, contract verifier, Core v2/Lab builds,
   packed consumer, memory, and text performance proxy.

Expensive matrices run only after the semantic renderer candidate is stable and again
at final-candidate verification. WebGPU and Windows-native results remain pending
until executed on those targets.

