# PatchMap contract

This directory owns implementation-neutral product semantics and executable
verification inputs. It is not consumer documentation and is not published in
the package.

## Normative scope

The contract fixes the observable result across supported environments:

- accepted dataset meaning, validation, identity, and caller immutability;
- hierarchy, geometry, placement, bounds, hit targets, text, and paint intent;
- selection, transforms, viewport, history, events, and lifecycle ordering;
- deterministic failure, cancellation, cleanup, and resource accounting;
- package, security, accessibility, and performance evidence requirements.

Raster pixels remain environment-qualified. Backend implementation, dense
storage, PixiJS object identity, antialiasing, and subpixel blending are not
portable product identities.

## Authored owners

| Owner | Purpose |
| --- | --- |
| `dataset.md` and `dataset-schema-reference.md` | accepted records, fields, defaults, and normalization |
| `dataset-fixtures.md` | valid, invalid, and expansion examples |
| `semantic-observation.md` | comparable observations, equality, geometry, text, and diagnostics |
| `mutation-operation-schema.md` | atomic operation language and results |
| `engine-boundary.md` | lifecycle, publication, transactions, reentrancy, and host seam |
| `consumer-journeys.md` | dashboard, editor, report, and host outcomes |
| `scenarios/**` | executable capability records |
| `decisions.md` | closed product decisions and evidence obligations |
| `production-readiness.md` | evidence promotion and release approval |

## Generated and reviewed evidence

`evidence/` contains the typed action/observation schemas, fixture profiles,
generated fixture and expected catalogs, decision evidence, manifests, and
independent review registry. Generators may derive evidence from authored
owners but cannot approve their own semantics.

Change authored Markdown or fixture profiles first, regenerate, obtain the
three independent domain reviews, and then run `npm run verify:contract`.
Editing a generated digest to make verification pass is prohibited.

## Capability families

| Prefix | Area | Prefix | Area |
| --- | --- | --- | --- |
| `LIF` | lifecycle | `DAT` | data |
| `REN` | rendering | `LAY` | layout |
| `AST` | assets | `UPD` | updates |
| `ANI` | animation | `EVT` | events |
| `QRY` | queries | `SEL` | selection |
| `VIE` | viewport | `TRN` | transforms |
| `HIS` | history | `ERR` | failures |
| `DET` | determinism | `PRF` | performance |
| `PIX` | PixiJS integration | `PKG` | package integration |
| `SEC` | security | `ACC` | accessibility |
| `OPS` | diagnostics | | |
