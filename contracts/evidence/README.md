# PatchMap contract evidence

This directory holds contract schemas, authored fixture profiles, generated
catalogs, normalized expectations, manifests, and independent review bindings.
It is verification input, not package documentation.

## Ownership

| Files | Owner |
| --- | --- |
| `decision-fixtures.v1.json`, `decision-normalized-expected.v1.json` | closed decision inputs and expected semantics |
| `catalog-fixture-profiles.v1.json`, `catalog-typed-cases.v1.json` | authored catalog inputs and action/assertion DSL |
| `catalog-action-schema.v1.json`, `catalog-observation-schema.v1.json` | independent closed schemas |
| `catalog-fixtures.v1.json`, `catalog-normalized-expected.v1.json` | generated executable pairs |
| `decision-evidence-manifest.v1.json`, `catalog-evidence-manifest.v1.json` | digest and provenance bindings |
| `catalog-review-registry.v1.json`, `reviews/**` | independent domain approval |
| `fonts/**` and observation/workload JSON | sanitized external inputs |
| `qualification/**` | promoted package, lifecycle, and performance evidence |

The current contract identity is `patch-map-contract/1`. Per-record digests use
recursively key-sorted JSON; file digests bind stored bytes.

## Change sequence

1. Change the authored contract or fixture profile.
2. Run `node verification/catalog/generate-evidence.mjs` and
   inspect the candidate output.
3. Obtain independent data/rendering, interaction/history, and release/DSL
   reviews for the exact candidate.
4. Bind the three PASS reports with
   `node verification/catalog/approve-review.mjs` and its
   explicit acknowledgement, reviewer, and report arguments.
5. Promote the generated catalog files and run `npm run verify:contract`.

Generation never approves semantics. Do not edit a digest or normalized
expectation to make a verifier pass. Execution, environment qualification, and
release approval remain separate from contract approval.

Qualification candidates are generated under ignored `.artifacts/performance/`.
Promotion copies only reviewed evidence into `qualification/`: one immutable
timestamped raw performance record, its digest-bound summary, and the current
package and lifecycle records. Do not retain a second mutable `latest` copy.
`npm run verify:performance-contract` validates the promoted raw record through
the summary pointer.
