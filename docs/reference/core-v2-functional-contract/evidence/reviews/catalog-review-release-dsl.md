Verdict: PASS

# Core v2 release, DSL, catalog generation, and CI review

## Scope and frozen snapshot

Reviewed only the sanitized Core v2 functional contract and its verification surface:

- `docs/reference/core-v2-functional-contract/evidence/catalog-typed-cases.v1.json`
- `docs/reference/core-v2-functional-contract/evidence/catalog-fixture-profiles.v1.json`
- `docs/reference/core-v2-functional-contract/evidence/catalog-action-schema.v1.json`
- `docs/reference/core-v2-functional-contract/evidence/catalog-observation-schema.v1.json`
- `docs/reference/core-v2-functional-contract/evidence/catalog-fixtures.v1.json`
- `docs/reference/core-v2-functional-contract/evidence/catalog-normalized-expected.v1.json`
- `docs/reference/core-v2-functional-contract/evidence/catalog-evidence-manifest.v1.json`
- `scripts/verification/core-v2-catalog-lib.mjs`
- `scripts/verification/generate-core-v2-catalog-evidence.mjs`
- `scripts/verification/approve-core-v2-catalog-review.mjs`
- `scripts/verification/verify-core-v2-catalog-static-gates.mjs`
- `scripts/verification/verify-core-v2-catalog.mjs`
- `.github/workflows/core-v2-contract.yml`
- `package.json`

The frozen catalog contains 381 action definitions, 381 used action types, 646 action instances, 1,388 typed assertions, 30 capture checkpoints with 47 declared paths, 145 target-bearing opcodes with 191 consumed/produced/removed paths, and 10 dataset-transition opcodes. The independent observation schema contains 14 domains and 10 closed operators.

## Exact catalog and generated drift

- The canonical builder succeeds.
- Stored fixtures, normalized expected, and manifest each serialize exactly equal to a fresh in-memory build; generated drift is zero.
- Typed cases, fixtures, expected, and manifest each contain the same exact 173 unique IDs. Fixtures, expected, and manifest use the same paired order.
- The source split is exact: 135 capability scenarios plus 38 consumer journeys.
- Every action type has one independent definition, one unique `contract/<opcode>` handler ID, reviewed operand shapes, binding metadata, lifecycle effect, and semantic-observation output metadata. No definition is unused and no typed opcode lacks a definition.
- Fixture, typed-case, action-schema, observation-schema, source, profile, expected-record, and fixture-record digests are bound into the generated evidence and manifest.

## Independent schemas and reference closure

- The action schema is analysis-owner input and is not generated from implementation results. It independently closes action shapes, binding producer/consumer fields, capture paths, lifecycle effects, output metadata, fixture references, target paths, and dataset transitions.
- Dataset aliases include the canonical scalar aliases, including `legacyDatasetRef` and `relationDatasetRef`; dataset collections and generator scalar/collection references resolve against the profile registry.
- Target validation is opcode-specific rather than a globally ambiguous key list. Nested arrays and target descriptors are supported, including entity IDs, component owner/ID pairs, relation endpoints, hierarchy parents, selection collections, expected hit targets, and host companion target lists.
- Consumed targets must exist at that action index. Produced paths enter the symbol table and removed paths leave it. Dataset replacement resets the generation-local entity/component table to the selected dataset before subsequent actions.
- Independent mutations reject fabricated dataset aliases, generator collections, flat and nested target collections, hierarchy parents, relation sources, expected hit/hover targets, component IDs, use-after-remove, future-dataset use, displaced-dataset use, and use-before-production.
- A heuristic audit of all operand strings matching known canonical entity/component IDs found no uncovered opcode/path pair. The only declared target path without a canonical value is an intentionally empty optional reject-ID array; the only unused dataset-transition alternative is an optional `datasetId` branch where canonical actions use `datasetRef`.

## Capture provenance and workload contract

- Capture checkpoint IDs are unique and bind exact phase, action index, and declared semantic paths.
- All 30 checkpoints are used. Explicit checkpoint expected maps have exact key/path parity and exact assertion operator/value parity; dynamic `/captures/**` references resolve only to declared checkpoint or binding capture paths.
- References to fixture/case parameters, captures, and semantic namespaces are checked before generation. Missing, fabricated, stale, forward, duplicate, or unacknowledged binding references are rejected.
- PRF-002 retains the exact six-row workload matrix in params and action operands: 100, 500, 1,000, 2,000, and 5,000 use `synthetic-scene`; `production-shaped-workload-v1` uses `production-shaped`. Seed 319, two warmups, seven measured samples, phase list, and expected semantic hash are preserved.

## Non-circular generation and approval

- Catalog generation writes only fixtures, normalized expected, and manifest. It does not write typed cases, fixture profiles, action schema, observation schema, source contract, review reports, or implementation output.
- Generation records execution as `not-run` and readiness as `spec-ready`; it cannot promote review or execution status from implementation results.
- Approval is a separate explicit command. It refuses to run without the acknowledgement flag and `analysis-owner` role, requires exactly one report for each of `data-rendering`, `interaction-history`, and `release-dsl`, and rejects any report without an exact `Verdict: PASS` line.
- Approval also refuses generated fixture/expected drift before writing. On success it copies the three reviewed reports into stable repo-relative evidence paths and writes their exact digests into the review registry. Catalog loading re-reads those durable files, verifies each digest and PASS verdict, and requires the exact three domains.
- A direct approval attempt using BLOCKER reports was rejected before any durable write.

## Negative gates and CI

- `npm run verify:core-v2-contract-gates` passes the canonical contract plus 32 negative drift probes.
- `npm run verify:core-v2-contract` passes the 38 decision records and all static gates, then currently stops at the first independent analysis-owner approval assertion. This is the intended preapproval state: 0 approved, 173 pending, execution `not-run`, readiness `spec-ready`.
- `.github/workflows/core-v2-contract.yml` runs the combined verification command for changes to the contract, Core v2 verification scripts, package scripts, or the workflow itself. After the three PASS reports are durably approved, the same command is the CI drift gate for the exact approved digests.

No release/DSL/catalog-generator/CI blocker remains in the frozen preapproval inputs. This PASS authorizes analysis-owner review recording; it does not claim runner execution, implementation completion, or release approval.
