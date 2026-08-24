# PatchMap documentation system

This document owns repository documentation structure, publication boundaries,
and lifecycle. It does not restate product behavior, API details, or performance
budgets owned elsewhere.

## Publication boundary

| Surface | Audience | Published package | Canonical owner |
| --- | --- | --- | --- |
| `README.md` | package evaluators | yes | install, minimal mount, and routes |
| `README_KR.md` | Korean package evaluators | yes | Korean quickstart only |
| `docs/patch-map/**` | package consumers | yes | detailed English public documentation |
| `examples/patch-map/**` | package consumers | yes | compile-checked runnable usage |
| `CONTRIBUTING.md` | contributors | no | setup and risk-based verification |
| `docs/maintainers/**` | maintainers | no | architecture, performance, and documentation ownership |
| `docs/reference/patch-map-product-policy.md` | maintainers | no | fixed product and release policy |
| `docs/reference/core-v2-functional-contract/**` | contract verifiers | no | immutable historical-identity verification inputs |
| `docs/tasks/**` | release verifiers | no | retained digest-bound evidence only |

`package.json` and
`scripts/verification/patch-map-package-matrix/artifact-policy.mjs` enforce the
package boundary. Every route exposed by `docs/patch-map/README.md`, including
font provenance and the bundled font license, is a required package artifact.
Reference contracts, task evidence, tests, performance results, and source maps
must not enter the package.

## Ownership rules

- Routers link to facts and do not copy them. Root readmes remain quickstarts;
  detailed API, compatibility, migration, host, asset, and troubleshooting facts
  live under `docs/patch-map/`.
- Architecture and performance documents explain ownership and gate selection;
  executable commands remain owned by `package.json` and their scripts.
- The `core-v2` name remains only in immutable contract paths and digest-bound
  historical evidence. It is not a second public product identity.
- External references may be consulted and cited when useful. Immutability and
  provenance rules protect evidence from mutation; they are not restrictions on
  reading external reference material.
- A new durable document needs one audience, one canonical owner, inbound routing,
  a verification owner, and a lifecycle classification.

## Language policy

English is the canonical language for detailed public documentation. Korean is
intentionally root-quickstart-only. Do not create isolated Korean peers for a
subset of public documents; a future full Korean taxonomy requires an explicit
product owner and parity verification.

## Completed brownfield migration

| Previous path or set | Final disposition | Migrated owner or reason |
| --- | --- | --- |
| oversized `README.md` and `README_KR.md` behavioral catalogs | reduced in place | detailed facts route to `docs/patch-map/**`; Korean remains quickstart-only |
| stale root instruction, branch, and reference restrictions | deleted | no repository-local agent instruction file, merged promotion scaffold, branch-specific instruction, or external-reference access ban remains |
| legacy and completed feature notes formerly under `docs/**` | deleted after fact migration | current facts moved to public, maintainer, or fixed-policy owners |
| `docs/designs/patch-map-architecture-foundation.md` | deleted at refactor completion | durable ownership moved to `docs/maintainers/**`; commit history retains the work record |
| `docs/patch-map/**` | kept and aligned | sole detailed package-consumer documentation set |
| `docs/patch-map/FIRA-CODE-LICENSE.txt` and `font-assets.md` | kept and package-required | font license and provenance owner |
| `docs/reference/patch-map-product-policy.md` | kept | fixed internal product policy |
| `docs/reference/core-v2-functional-contract/**` | kept without path migration | immutable contract and generated evidence identity |
| `docs/tasks/2026/07-15/performance-core-v2/**` | kept without path migration | retained digest-bound release evidence |

No archive alias or redirect is needed for deleted internal work records. Literal
inbound links are updated in the same change. Public package paths remain stable.

## Verification

For documentation-only changes, run local-link validation and `git diff --check`.
When public package documentation or its policy changes, also run the package
integration test, `verify:package`, and an installed packed consumer smoke. Code
or contract changes retain their architecture, unit, build, Lab, and contract
gates.
