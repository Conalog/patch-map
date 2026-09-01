# Packaged fonts

- Status: current
- Audience: package consumers and release owners
- Owner: packaged font byte identity, provenance, and license inclusion

Read when: a release changes font bytes, package font digests, or license files.

Text family interpretation and fallback belong to [`text.md`](../api/text.md).
Font acquisition, leases, and first-frame readiness belong to
[`assets-and-capture.md`](../api/assets-and-capture.md).

## Payload contract

The package contains the unmodified Fira Code 6.2 variable WOFF2 payload. One
physical file supplies the supported 300, 400, 500, 600, and 700 weights.
The runtime uses that file directly when its module-relative URL remains valid.
A package-owned, lazily loaded data-URL module preserves the same font bytes
when a consumer bundler relocates the library chunk.

| Weights | File | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| 300, 400, 500, 600, 700 | `FiraCode-VF.woff2` | 113,088 | `408e876a202f15ea6ee307a70a65cf40ceb222c589a0b17e0a3a371db96dd49f` |

## Provenance

The payload is distributed under the SIL Open Font License 1.1. The required license is
[fira-code-6.2-license.txt](fira-code-6.2-license.txt). Exact source filename,
size, and SHA-256 are verified by the focused asset registry test. Packaged
filename and size, browser loading, fallback byte equivalence, and license
inclusion are verified by the package artifact gate. The license SHA-256 is
`1d41e10031ab125302780a05ec4c91d218e47db0c7e37cf315cce5e608cdc25c`.

## Failure decisions

| Symptom | Meaning | Action |
| --- | --- | --- |
| Focused asset test reports a font digest change | Payload identity changed | Review provenance and license, then intentionally update the source identity expectation |
| Package omits the license | Artifact contents are invalid | Restore the exact license file before release |

## Verification map

| Claim | Code | Focused evidence |
| --- | --- | --- |
| Payload and weight mapping | `src/assets/builtin-font-payload.ts` | asset registry and leaf text style tests |
| License inclusion | package artifact policy | `verify:package` |
