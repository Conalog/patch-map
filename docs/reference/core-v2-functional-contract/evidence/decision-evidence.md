# Core v2 Decision Evidence Corpus

This directory is the canonical sanitized evidence surface for the 38 owner-resolved
product decisions in `open-questions.md`. It freezes fixture intent and normalized
semantic expected assertions without prescribing a Core v2 API, PixiJS object graph,
or implementation strategy.

## Files and Revisions

- `decision-fixtures.v1.json` contains one implementation-neutral setup and ordered
  action trace per decision.
- `decision-normalized-expected.v1.json` contains the exact semantic assertions or an
  explicit external-evidence blocker for the matching case.
- `decision-evidence-manifest.v1.json` binds every pair by canonical JSON SHA-256 and
  records review, execution, and readiness states independently.
- `catalog-fixture-profiles.v1.json` freezes named datasets, deterministic generators,
  input traces, environment profiles, and exact profile parameters used by the catalog.
- `catalog-typed-cases.v1.json` defines the concrete fixture parameters, typed action
  sequence, closed-operator assertions, required observation domains, and journey
  host/engine seam for all 173 cases.
- `catalog-fixtures.v1.json` and `catalog-normalized-expected.v1.json` are generated
  from those registries and the sanitized scenario/journey sources.
- `catalog-review-registry.v1.json` records independently reviewed fixture/expected
  digests. Catalog generation cannot create or update this approval registry.
- `catalog-evidence-manifest.v1.json` binds the generated evidence, independent review,
  all 135 capability scenarios, and all 38 consumer journeys.
  `catalog-priorities.v1.json` supplies the closed P0/P1 classification.

The contract revision is `core-v2-functional-contract/2026-07-16.2`; the observation
revision is `core-v2-semantic-observation/1`. Per-case digests hash recursively
key-sorted JSON with no insignificant whitespace. File digests hash the stored bytes.
Changing an approved fixture or expected record requires a new evidence revision and
supersedes the previous digest; an implementation result never rewrites expected data.

## Analysis-Owner Review

Independent data/rendering, interaction, and release reviews checked all 38 records
against the sanitized contract. The integrated disposition is:

| Contract review | Count | Meaning |
| --- | ---: | --- |
| `analysis-owner-contract-approved` | 38 | Fixture, action trace, and normalized semantic assertions are closed and digest-bound. |
| `analysis-owner-pending-external-evidence` | 0 | No product-decision contract row lacks approved semantic evidence. |

The previously pending legacy conversion, production workload, `placement:none`,
negative split, target-Windows budget, and international-text rows now have sanitized,
digest-bound evidence. OQ-024 runtime selectors and OQ-029 device semantics are also
contract-approved. Actual packed-host, browser/device, accessibility, performance, and
Windows runs remain execution prerequisites rather than missing contract semantics.

OQ-034 is contract-approved because the sanitized scene-asset placeholder profile
already closes authored/fallback geometry, query/hit participation, semantic paint,
target-scoped diagnostics, retry, and identity replacement. Exact raster pixels remain
environment-qualified and are not part of that approval.

## Status Isolation

`decisionStatus: resolved` closes only the product choice. `contractReview` approves
only the canonical fixture/expected semantics. `execution.status: passed` will mean a
runner produced an actual artifact, while `executionReview` will separately approve or
reject its digest and provenance. `readinessLevel` remains `spec-ready` for every row;
no record in this corpus claims implemented, automated-, Lab-, integration-, or
release-verified status.

Run `node scripts/verification/generate-core-v2-decision-evidence-manifest.mjs` after
an authorized evidence change, then run
`node scripts/verification/verify-core-v2-decision-evidence.mjs` to validate the
closed evidence envelope, coverage, pair identity, blocker/prerequisite bindings,
selected high-risk semantic guardrails, status invariants, and file/per-case digests.
Full dataset and mutation execution remains the responsibility of the generated
decision harness; this corpus does not claim that execution has occurred.

Run `npm run generate:core-v2-contract-catalog` only after an authorized contract
change. Independent analysis-owner review is recorded separately with
`approve-core-v2-catalog-review.mjs`; that command requires an explicit review
acknowledgement and binds the exact profile, typed-case, fixture, and expected digests.
`npm run verify:core-v2-contract` regenerates in memory, rejects drift, checks 173
unique routes and evidence pairs, verifies all decision/external-file/review digests,
and preserves `execution:not-run`, `Lab:specified-not-implemented`, and Core v2
`unassessed` until implementation evidence exists.
