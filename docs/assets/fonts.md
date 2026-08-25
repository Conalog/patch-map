# Packaged fonts

Status: current  
Audience: package consumers and release owners  
Owner: packaged font byte identity, provenance, and license inclusion

Read when: a release changes font bytes, package font digests, or license files.

Text family interpretation and fallback belong to [`text.md`](../api/text.md).
Font acquisition, leases, and first-frame readiness belong to
[`assets-and-capture.md`](../api/assets-and-capture.md).

## Payload contract

The package contains the unmodified Fira Code 6.2 Light, Regular, Medium,
SemiBold, and Bold WOFF2 payloads.

| Weight | File | Bytes | SHA-256 |
| ---: | --- | ---: | --- |
| 300 | `FiraCode-Light.woff2` | 102,924 | `e3aa3db06cfb19dfc0b0f1f38355add3e8d1ef45d3af39ce95d9ca7d96114e6c` |
| 400 | `FiraCode-Regular.woff2` | 103,240 | `a6ce59520b90e15d7062ffef214f94c8add5a4085c0bbb1683602ef227a4d1fe` |
| 500 | `FiraCode-Medium.woff2` | 102,384 | `0e04bafb989ea46e840a581e49557b229662a00021493a5744c595d0882adf28` |
| 600 | `FiraCode-SemiBold.woff2` | 106,992 | `d16779aa6dfc7c4effe686ece5bdf4b1356a7352167e37fa256f596a9d428f11` |
| 700 | `FiraCode-Bold.woff2` | 107,788 | `d778c19803c672d294663e9283c7b752cc125ab266f0ddb8e53b039da92caf67` |

## Provenance

The payloads are distributed under the SIL Open Font License 1.1. The required license is
[fira-code-6.2-license.txt](fira-code-6.2-license.txt). Exact packaged filenames,
sizes, SHA-256 values, and license inclusion are verified by the package
artifact gate. The license SHA-256 is
`1d41e10031ab125302780a05ec4c91d218e47db0c7e37cf315cce5e608cdc25c`.

## Failure decisions

| Symptom | Meaning | Action |
| --- | --- | --- |
| Package verification reports a font digest change | Payload identity changed | Review provenance and license, then intentionally update the artifact expectation |
| Package omits the license | Artifact contents are invalid | Restore the exact license file before release |

## Verification map

| Claim | Code | Focused evidence |
| --- | --- | --- |
| Payload and weight mapping | `src/patch-map/assets/builtin-font-payload.ts` | asset registry and leaf text style tests |
| License inclusion | package artifact policy | `verify:package` |
