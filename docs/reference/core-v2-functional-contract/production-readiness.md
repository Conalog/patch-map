# Production Readiness, Verification, and Migration

## Readiness Levels

The catalog count is not a completion claim. Core v2 advances only through these
machine-auditable levels:

| Level | Gate |
| --- | --- |
| inventory-ready | capability/journey exists with priority and owner |
| spec-ready | closed input/action/expected observation and canonical evidence owner |
| implemented | packaged implementation reaches the case; no expected evidence changed |
| automated-verified | semantic fixture passes, fresh-session rules pass, evidence is bound to code/package |
| Lab-verified | focused light-theme route passes direct user action/gesture with stable test IDs |
| integration-verified | packed artifact passes actual host adapter journey and cleanup |
| release-verified | required platform/security/performance/memory/migration gates pass and review approves evidence |
| excluded | product owner records scope, reason, affected journeys, and replacement behavior |

`blocked` is orthogonal and names the missing evidence/approval owner. A product decision
without canonical expected output can guide implementation but cannot promote a row to
release-verified.

## Immutable Evidence Record

Every promoted case has one manifest record containing:

- scenario/consumer ID, contract and observation revisions;
- implementation commit, packed-package name/version/SHA-256, expected-evidence SHA-256;
- dataset fixture, seed, action index/trace, volatile fields, normalized expected and
  actual hashes;
- command/runner version, browser/backend/OS/hardware/DPR/viewport/power profile;
- semantic assertion counts, console/page/network errors, raw artifact paths, result;
- reviewer, review date, linked missing evidence/exclusion, and superseded record if any.

A missing artifact, failed assertion, unexpected expected-output edit, browser/page/
console/network error, audit finding, package digest mismatch, or nonzero safety result
must exit nonzero and cannot be represented as pass.

## CI and Release Tiers

### Pull request

- catalog ID/shape/link/count and schema/type/default drift checks;
- affected semantic fixtures and exact errors;
- two fresh-session runs for changed deterministic behavior;
- packed consumer and declarations when public/package surface changes;
- affected headed input cases and lifecycle/resource cleanup;
- dependency audit and package-content/source-map/evidence firewall check.

### Release candidate

- every included capability and consumer case from the packed artifact;
- two fresh sessions, actual host integration, supported runtime/backend/DPR matrix;
- approved production fixture and performance/memory matrix;
- asset/CORS/CSP/extraction security, renderer-loss, page-resume, multi-instance and
  repeated lifecycle evidence;
- schema roundtrip, canary/rollback rehearsal, package inventory/SBOM and documentation
  example tests.

Release requires all included rows release-verified or explicitly excluded, all linked
product decisions resolved, zero unexplained semantic differences, zero known audit
vulnerabilities under approved policy, and clean evidence-to-package provenance.

## Test Matrix by Responsibility

| Layer | Required proof |
| --- | --- |
| schema/value | full/partial validator, defaults, invalid paths, immutability, export roundtrip |
| semantic engine | transaction, revision, geometry/text/paint, query, history, deterministic time |
| PixiJS integration | actual Application/stage/backend, asset upload, frame publication, extraction, renderer loss |
| browser interaction | real mouse/trackpad/touch/pen where supported, keyboard, focus, cancel/blur/capture |
| host integration | packed Core v2 in Dashboard/Editor/Report adapter for all CSM cases |
| lifecycle/resources | repeated mount/replace/destroy, page suspend/resume, multiple instances, late work |
| security/package | policy fixtures, CORS/taint/CSP, redaction, pack allowlist, SBOM/licenses/audit |
| performance | raw 2-warmup/7-sample proxy and target-Windows evidence after semantic pass |
| migration | schema-safe cutover, side-effect-free canary/shadow, rollback rehearsal |

## Performance Budget Registry

On the approved low-end Windows profile, every required scenario must have frame-gap
p95 at most `33ms`, action-to-visible p95 at most `50ms`, and zero main-thread tasks at
or above `100ms`. The evidence registry additionally records for every workload:

- validation/materialization/first-useful-frame median and p95;
- action-to-semantic-commit and commit-to-visible median/p95;
- input-to-visible p95, frame-gap median/p95/max, and dropped-frame ratio during pan,
  zoom, selection, transform, bar animation, and text/bulk update;
- animation duration/final-value error, extraction median/p95, and teardown time;
- retained JS heap, DOM/listener/ticker/texture counts, available native/GPU proxy, and
  allowed lifecycle growth;
- maximum regression versus the frozen production baseline and noise/retry policy.

The required workloads are seeded synthetic 100/500/1,000/2,000/5,000 plus the
digest-bound sanitized production-shaped fixture. Its materialized counts and exact
target hardware/OS/browser/power profile are contract-approved. Synthetic/4x results
remain provisional until the actual target-Windows matrix executes and is reviewed.

## Supported Runtime Registry

Supported production runtimes are Windows 10/11 with the latest two stable Chrome and
Edge versions at release time. WebGL2 is mandatory; WebGPU is optional and cannot
weaken semantics. Each release manifest pins exact browser, PixiJS v8, DPR range, CSP,
TypeScript, bundler/module targets, backend/fallback order, and unsupported-init result.
The standard browser path owns accessibility
and DOM overlays; a worker path cannot be treated as equivalent because PixiJS DOM
accessibility and DOM-backed editing are unavailable there.

Mouse, precision trackpad, keyboard/accessibility activation, browser-zoom, and host
CSS-transform cells are mandatory. Touch, pen, and multi-pointer support requires real
capable Windows-device evidence for each release cell; simulation alone is diagnostic.
Keyboard/focus/name/role/state/action behavior targets WCAG 2.2 AA and the release
manifest records headed NVDA evidence on the exact supported Chrome/Edge versions.

Renderer context/device loss is a classified lifecycle event. Core v2 either rebuilds
the PixiJS render resources from the same authoritative semantic scene and publishes
one recovered frame, or reports `RENDERER_LOST` as fatal while preserving safe host
state. It must not duplicate canvas/listeners, corrupt history, spin, or publish stale
assets. The same policy is exercised during idle, load, animation, gesture, extraction,
destroy, background suspension, and DPR change.

## Security and Privacy Boundary

The host supplies explicit asset protocol/origin/CORS/credential/media/size/decode/SVG
policies; the engine enforces them before fetch/decode/cache-lease/upload. Required
coverage includes:

- allowed URL protocols/origins, credentials/CORS mode, redirects, SVG external
  resources/scripts, data URI/media type, payload bytes, decoded dimensions, text/font
  and filter/texture limits;
- strict CSP compatibility through the approved PixiJS v8 environment entry and no
  silent fallback to unsafe execution;
- extraction preflight: a tainted/unreadable asset fails report publication with a
  recoverable diagnostic while the live scene remains usable;
- dataset text is never interpreted as HTML; arbitrary attrs cannot write renderer/DOM
  properties or prototypes;
- diagnostics redact raw user text, data URIs, credentials, tokens, query secrets, and
  arbitrary URLs while retaining category, logical ID, revision, and sanitized hash;
- packed output has no restricted evidence, fixtures, source maps, dependency bundle,
  secrets, or unapproved license/dependency and includes a digest-bound inventory/SBOM.

## Production Diagnostics

When enabled, an instance exposes a bounded read-only diagnostic snapshot:

- package version/digest, instance ID, lifecycle, supported backend and loss state;
- revision stamp, logical/materialized/text/relation counts, active gesture/animation/
  pending-asset counts, last completed action, categorized last error;
- canvas/listener/observer/ticker/texture-lease counts and cleanup result.

Host hooks may record init/load/update/interaction/extract/destroy duration, long tasks,
renderer loss, semantic mismatch, and cleanup failure. Hooks are cheap when disabled,
instance-local, redacted, disposable, and exception-isolated according to
`engine-boundary.md`.

## Actual Host Integration Gate

The real migration harness installs the packed artifact into the production host's
strict TypeScript and bundler boundary. It executes all 38 CSM routes with production
mount/remount layout, dataset/update envelopes, event disposal, save/export guard, and
report extraction. Results bind host revision, Core v2 revision, host commit, and
package digest.

The adapter is orchestration only. A case fails if it recreates engine geometry,
selection, transformer, history, asset lifetime, extraction, or cleanup semantics. A
mock adapter remains useful for pull requests but cannot satisfy integration-verified.

## Migration, Canary, and Rollback

1. **Schema-safe cutover:** the approved persisted dataset loads in current production
   and Core v2 integration. Core v2 load/edit/export/load stays schema-valid and
   semantically equivalent; mismatch blocks save and cutover.
2. **One authoritative engine:** a feature/session flag selects one engine for user
   effects. Optional shadow comparison is read/render-only and cannot publish host
   selection, command, history, persistence, callbacks, or analytics counted as user
   action.
3. **Canary:** promote one authoritative engine per session through 1% → 10% → 50% →
   100%. Any semantic mismatch, runtime error, performance-budget failure, or cleanup
   failure stops promotion. Evidence records cohort owner/dwell and rates without raw
   customer dataset leakage.
4. **Rollback:** a remote/session flag returns the next mount to the prior engine using
   the same persisted schema. It creates no duplicate canvas/listener/action and does
   not replay an in-flight gesture. Data written during canary must have passed the
   schema/roundtrip guard. Rollback is rehearsed before release.

## Documentation and Support Gate

The packed release includes tested public API/data-schema docs, minimal and
Dashboard/Editor/Report examples, host/engine responsibility and migration guides,
runtime compatibility matrix, semantic-versioning/deprecation policy, changelog,
asset/context-loss/extraction/performance troubleshooting, evidence revision, and
support escalation ownership. Examples compile and run against the packed artifact.

Semantic-observation and mutation-operation changes are versioned contracts. The
current dataset remains the existing unversioned array schema. Before any future schema
change, the owner must introduce a dataset version and migration contract; rejecting
previously valid data or changing normative observations is never an undocumented
dependency upgrade.

## Contract Dependency Order

```text
existing dataset + versioned mutation schema + normalized observation + diagnostics
                          |
             lifecycle + revision + cancellation
                 /                         \
       geometry/text/assets          events/state/history
                 \                         /
        relation/query/view/selection/transformer
                          |
                 consumer journeys + Lab
                          |
               packed actual-host integration
                          |
             security + performance + migration
```

Independent teams may work in parallel below a frozen parent contract. The main owner
integrates fixtures, reviews expected output, and runs aggregate gates; no subteam report
alone promotes a readiness level.
