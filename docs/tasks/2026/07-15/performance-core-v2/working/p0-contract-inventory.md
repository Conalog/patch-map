# Core v2 P0 contract inventory: first journey-complete tranche

Temporary implementation analysis only. This file does not change the approved
functional contract or expected evidence.

Implementation update (2026-07-16): execution expanded the original five-case
journey closure with the independent empty-state journey `CSM-003`, producing the
current six-case foundation slice. The five-case counts below remain the exact
historical `CSM-001` dependency calculation. Source execution and actual-only folding
now exist for all six; `LIF-001` and `DAT-002` match every immutable assertion,
`LIF-002` and `DAT-001` retain the documented gaps/mismatches, and both journeys await
packed-host evidence. The next data tranche has exact handlers for DAT-003/004/005.

Implementation update (2026-07-20): the executable P0 slice is now 14 routes:
`LIF-001/002/004/005`, `DAT-001..008`, and `CSM-001/003`. Thirteen routes produce
actual observations; `DAT-008` produces an honest terminal-failure observation because
the immutable `retainTarget` action omits the action schema's required `as` operand.
The remaining 159 routes are explicit stubs. This document's original five-case counts
remain a historical dependency calculation rather than the current completion count.

## Scope and source of truth

- Baseline supplied in the task brief: HEAD `c491c74`.
- Contract revision: `core-v2-functional-contract/2026-07-16.2`.
- Observation revision: `core-v2-semantic-observation/1`.
- Catalog: 135 capabilities and 38 P0 consumer journeys, 173 cases total.
- Canonical capability priorities: 83 P0, 52 P1, 0 P2. With all 38 consumer
  journeys, the complete P0 backlog is 121 cases.
- Current state for every case selected below: analysis-owner contract-approved,
  execution `not-run`, readiness `spec-ready`, automation `not-implemented`, Lab
  `specified-not-implemented`, implementation `unassessed`.

The smallest journey-complete starting point is the explicit dependency closure of
`CSM-001`: `LIF-001`, `LIF-002`, `DAT-001`, and `DAT-002`, followed by the independent
`CSM-001` journey case. A smaller set cannot run the first-draw journey because
`consumer-journeys.md` maps all four capabilities to it. A broader first tranche would
prematurely pull in replacement, update, interaction, history, or cleanup branches.

This is a five-case tranche: 18 action invocations across 13 action kinds, 58 source
typed assertions, and 78 canonical normalized assertions. The canonical normalized
count is the acceptance count; `CSM-001` expands from 4 typed assertions to 24
normalized assertions through generated host-seam and safety clauses.

## Required prerequisite order

The normative contract-wide order is:

```text
dataset + mutation schema + normalized observation + diagnostics
  -> lifecycle + revision + cancellation
  -> geometry/text/assets || events/state/history
  -> relation/query/view/selection/transformer
  -> consumer journeys + Lab
  -> packed actual-host integration
  -> security + performance + migration
```

For this first vertical slice, use the following exact order:

1. Freeze the evidence/runner boundary: existing array-root dataset contract,
   `core-v2-mutation-transaction/1`, `core-v2-semantic-observation/1`, closed
   diagnostics, action schema, and immutable fixture/expected records. This is a
   prerequisite, not a new scenario completion claim.
2. Implement the semantic dataset foundation: `DAT-001` and `DAT-002`. They may be
   developed together, but both must pass before authoritative draw is accepted.
3. Implement the surface lifecycle: `LIF-001`.
4. Bind the semantic loader to revision/cancellation/frame publication: `LIF-002`,
   which depends on steps 2 and 3.
5. Run `CSM-001` independently through its host/engine seam and focused Lab route.
   Passing the four capability cases does not imply that the journey passed.

`PIX-001` is explicitly P1 and therefore is not added to this P0 closure. Nevertheless,
the product boundary still requires the implementation used by `LIF-001`, `LIF-002`,
and `CSM-001` to render through genuine PixiJS/WebGL rather than a Canvas2D substitute.
`PIX-001` remains separately unverified until its own case runs.

## Exact case inventory

All fixture and expected references below point into the immutable generated catalog.
Each action type resolves in `catalog-action-schema.v1.json`.

| Order | ID and role | Fixture profiles and concrete inputs | Canonical action trace | Assertions | Canonical fixture | Canonical expected | Lab evidence |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| 1a | `DAT-001` — accept every element/component discriminator | `dataset-schema-matrix`; `all-kinds-scene`; seven element kinds (`group`, `grid`, `item`, `relations`, `image`, `text`, `rect`) and four component kinds (`background`, `bar`, `icon`, `text`); append `{type: "unsupported"}` strict variant | `loadDataset`, `queryAll`, `attemptStrictLoadVariant` (3) | 10 typed / **10 normalized** | `core-v2-contract-catalog-fixtures/1#/cases/51`; SHA-256 `5cfa90e97e2746014031ae46892c96ec14969eb61e74252d9faf9a450f97622d` | `core-v2-contract-catalog-normalized-expected/1#/cases/51`; SHA-256 `8dbfb7803b4c53f5c58892a047ac480fbfccf3fa7bd636bcc8ff3266c26842ed` | Route `/lab/core-v2?scenario=DAT-001&size=<SIZE>&seed=<SEED>`; root `scenario-dat-001`; **Render all kinds** |
| 1b | `DAT-002` — defaults plus caller immutability | `dataset-schema-matrix`; inline minimal 100x80 item with one rect bar and one text component; 2 fresh sessions | `freezeInput`, `loadDataset`, `snapshot`, `loadDataset`, `snapshot` (5) | 13 typed / **13 normalized** | `core-v2-contract-catalog-fixtures/1#/cases/52`; SHA-256 `3e32a84483dae0bfa1c186518b49aebb2ab849c8c603ed1146774670a61d24a0` | `core-v2-contract-catalog-normalized-expected/1#/cases/52`; SHA-256 `480c01b997b95e9d5e21f90acb3cf69f49e9607d7d3ab9b770f6c8dc7bcea372` | Route `/lab/core-v2?scenario=DAT-002&size=<SIZE>&seed=<SEED>`; root `scenario-dat-002`; **Render minimal defaults** |
| 2 | `LIF-001` — initialize interactive map surface | `lifecycle-generations`; 800x600 CSS px; DPR 2; `#FAFAFA`; zoom limits 0.5–30 | `initialize`, `initialize` (2) | 11 typed / **11 normalized** | `core-v2-contract-catalog-fixtures/1#/cases/45`; SHA-256 `d13052490666ee573a55bef22cb786f863963e4c55598583aa07d48d72ca6de0` | `core-v2-contract-catalog-normalized-expected/1#/cases/45`; SHA-256 `a143d0e236b48a109e54e7be4ccdb99d3a353e13bfca30fd831b1e8cc2ce9af4` | Route `/lab/core-v2?scenario=LIF-001&size=<SIZE>&seed=<SEED>`; root `scenario-lif-001`; **Initialize**, **Initialize again** |
| 3 | `LIF-002` — first authoritative draw with races/failure | `lifecycle-generations`; `all-kinds-scene`, `interactive-scene-revision-2`, malformed later submission; hidden component `{ownerId: "item-a", id: "hidden-label"}` | `initialize`, `snapshot-resolved-dataset`, `exercise-authoritative-draw-races`, `publishFrame` (4) | 20 typed / **20 normalized** | `core-v2-contract-catalog-fixtures/1#/cases/46`; SHA-256 `071500fc698ba13ad21df62c47c0c0d9f6a809ed55e6721152d33b4b7fe172c0` | `core-v2-contract-catalog-normalized-expected/1#/cases/46`; SHA-256 `a3d760d3b3afcbef89f22f22b5c4552450d95c780bf9104fd82f71f3ea0521ee` | Route `/lab/core-v2?scenario=LIF-002&size=<SIZE>&seed=<SEED>`; root `scenario-lif-002`; **Render selected dataset** plus rapid double-render |
| 4 | `CSM-001` — shared-runtime first draw journey; capabilities exactly `LIF-001`, `LIF-002`, `DAT-001`, `DAT-002` | `packed-host-seam`, `all-kinds-scene`, `lifecycle-generations`, `dataset-schema-matrix`; `interactive-scene`; host revision 1; lifecycle generation 1; 800x600 WebGL2 | `initialize-engine`, `load-scene`, `await-first-useful-frame`, `probe-declared-failure` (4) | 4 typed / **24 normalized** | `core-v2-contract-catalog-fixtures/1#/cases/135`; SHA-256 `a3fb2645432f3ed1111efb02a2b299d26877f336d118afea1bcbf1ce5d51f1ab` | `core-v2-contract-catalog-normalized-expected/1#/cases/135`; SHA-256 `91630a3162823886ec2b02565fe31bd05fea261eed27c3d76af4c1ebdc32b885` | Route `/lab/core-v2?scenario=CSM-001&size=<SIZE>&seed=<SEED>`; root `scenario-csm-001`; `consumer/first-draw` |

Profile digests used by this tranche:

- `lifecycle-generations`: `ee9577b874d819a31c326528fc2a46a406aca6e7bdb4def2f8dda1dfda1a8b65`
- `dataset-schema-matrix`: `741b25203969a48a10ec89078a222a9f32ae3993f58effd7546d06e63d4b0437`
- `packed-host-seam`: `b28b7398074de1264b67450539b5919ad1e9f131f97c2aecf9fde2f8d3251487`
- `all-kinds-scene`: `3a1cd4e3517b697e38cee7a6ca1efc460135a611e12231354c0df0fe16cdb597`

The shared profile file fixes seed `319`, a manual clock starting at `0` with frame
step `16.666667ms`, WebGL2, locale `und`, and reduced motion off. Its base environment
is 800x600 CSS px at DPR 1; `LIF-001` explicitly overrides DPR to 2.

## Action-kind inventory

The 13 exact action kinds required by the first tranche are:

```text
initialize
snapshot-resolved-dataset
exercise-authoritative-draw-races
publishFrame
loadDataset
queryAll
attemptStrictLoadVariant
freezeInput
snapshot
initialize-engine
load-scene
await-first-useful-frame
probe-declared-failure
```

Invocation multiplicity is: `initialize` 3, `loadDataset` 3, `snapshot` 2, and every
other action kind 1, for 18 total invocations. The canonical trace order in the table
must be preserved; an implementation-level API call with similar intent is not a
substitute for runner support for the catalog action.

## Exact acceptance evidence

### Immutable evidence chain

The implementation must consume, not regenerate or rewrite, this evidence chain:

- priority file SHA-256: `97a5710175669b9f6509c4842c18c993086c978ef2d1cf07ee75a7a8e5206d38`
- fixture-profile file SHA-256: `7d860b72d02fd24a743fb0f8fce92331090af74933853a08b1fd06f2aa29d3af`
- typed-case file SHA-256: `5926f2fb5806a29349f6f020ff34d4a7e5f10a3a2a109a151abb1e79eaadd8fe`
- action-schema file SHA-256: `2f428392f3798e890cf7c303a34bd55f9649b9d885f6b175b9e8f44c6fa4ebc2`
- observation-schema file SHA-256: `c80a42b85cf3a9b182415efda040d5e3a307a4b4c3bc6baf335b9418d2a9ced4`
- review-registry file SHA-256: `2381491471bcf80d4859c7187bd8f9f775dc46dcc8bf2d38556438f6a8c96cd3`
- generated fixture file SHA-256: `7ac497521a55b32e5777d99e7f9ce810877225be3a3c08329d254d489f4d7f88`
- generated normalized-expected file SHA-256: `e749547a4e80ec1ea3795d7b19607f14933f1241d18e30524a3aae2f89d5b4a5`

Every selected expected record declares only these volatile paths:
`provenance.codeCommit`, `provenance.packedPackageSha256`, and
`environment.browserVersion`. No other value may be ignored or tolerance-qualified
without a contract revision.

### Promotion target for this tranche

The first tranche is accepted as implemented plus automated/Lab verified only when:

1. The packaged implementation reaches all five cases without changing expected
   evidence.
2. The canonical action traces emit five actual
   `core-v2-semantic-observation/1` records and all **78** normalized assertions pass.
3. Each actual evidence record binds scenario ID, contract/observation revisions,
   implementation commit, package name/version/SHA-256, the case's exact fixture and
   expected SHA-256, seed/action trace, expected/actual hashes, runner command/version,
   browser/backend/OS/hardware/DPR/viewport/power profile, semantic assertion count,
   raw artifact paths, result, and reviewer metadata.
4. Changed deterministic behavior runs twice in fresh Chromium sessions with seed 319.
   `DAT-002` additionally proves its fixture-declared two fresh sessions have equal
   semantic hashes and unchanged caller input.
5. All five focused light-theme routes pass with the exact root test IDs in the table;
   console, page, and network errors are zero.
6. Every case runs its canonical cleanup action `destroy-case` with
   `expectedResourceDelta: 0`; no nonzero safety result is represented as pass.
7. `CSM-001` separately proves its 24 normalized clauses, including root order
   `[item-a, rect-b, text-c, links]`, published tuple `{scene: 1, view: 0,
   interaction: 0}`, immutable scene, one canvas, host-seam returns/rollback/final
   state, and zero non-finite geometry, unpaired surrogate, unresolved paint intent,
   stale gesture, unclassified event, or corrupt history counts.

This tranche does **not** make `CSM-001` integration-verified. That later state requires
the packed artifact to pass the real host adapter and bind host revision, Core v2
revision, host commit, and package digest. It also does not claim release verification,
Windows performance, security, or migration completion.

## Frozen-contract acceptance blocker

Two canonical expected codes in this five-case tranche conflict with the closed stable
diagnostic registry in `semantic-observation.md`:

- `LIF-002` requires `/outcome/failedLater/code == "INVALID_DATASET"`.
- `DAT-001` requires `/outcome/validation/unsupportedType/code ==
  "INVALID_DISCRIMINATOR"`.

The closed `INVALID_INPUT` registry contains `INVALID_RECORD_KIND` and does not contain
either `INVALID_DATASET` or `INVALID_DISCRIMINATOR`. The same conflict is present in
the digest-bound typed cases/generated expected records, so an implementation cannot
both satisfy those exact expected values and obey the closed public diagnostic
registry. `probe-declared-failure` in `CSM-001` uses `DECLARED_FAILURE` as an injected
contract-branch marker, not as an asserted public diagnostic, and is not the same issue.

Do not solve this in Core v2 code by inventing aliases, and do not edit expected
evidence. The analysis/contract owner must issue a versioned resolution choosing either
the registry code or revised expected records before `DAT-001` and `LIF-002` can be
truthfully promoted to automated-verified. Implementation and runner scaffolding can
proceed while that resolution is pending, but the five-case tranche cannot claim exact
acceptance.

## Recommended stop boundary

Stop the first implementation tranche after `CSM-001` is executable and all
non-conflicted evidence passes. Do not fold in `CSM-002` scene replacement: its explicit
closure adds `LIF-003`, `UPD-001`, and `UPD-009`, which crosses into stable-target,
structural update, selection/history cleanup, and stale-state behavior. That is the
next coherent dependency tranche after the first-draw foundation is accepted.
