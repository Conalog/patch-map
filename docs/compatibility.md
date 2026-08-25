# Compatibility and releases

Status: current  
Audience: package consumers and release owners  
Owner: supported environments, backend policy, and versioning

Read when: qualifying an environment, upgrading the package, or publishing an
artifact. Feature behavior belongs to its API page and is not repeated here.

## Supported environments

| Surface | Supported policy |
| --- | --- |
| Node.js | Node 20 or newer for consumers; the repository uses `.nvmrc` for local work |
| Browsers | Current Chromium, Firefox, and Safari with WebGL2 |
| Renderer | WebGL2 aggregate renderer is the supported default |
| Package formats | ESM and CommonJS through declared package exports |
| TypeScript | Declarations are built and checked with the package artifact |

WebGPU is not a qualified consumer backend. Chromium-only observations are
development evidence, not Windows-native or cross-browser qualification.

## Versioning

- Public exports, dataset acceptance, visible behavior, event ordering, and
  documented defaults follow semver.
- Removing or changing a public capability requires a major release once the
  package leaves prerelease status.
- Internal renderer classes, dense slots, Pixi display objects, diagnostics
  implementation, and verification fixtures are not public identities.
- A deprecation must name the replacement and removal release. Compatibility
  aliases without a scheduled removal are not added.

## Published artifact

The package contains built output, the root README, public documents, public
examples, and required third-party licenses. Engineering documents, tests,
contract fixtures, retained evidence, performance output, and source maps are
excluded. The package verifier checks both required and prohibited paths and
binds the resulting documentation set into the artifact evidence.

## Verification map

| Claim | Owner | Gate |
| --- | --- | --- |
| Runtime and toolchain | `package.json`, `.nvmrc`, CI workflows | typecheck, build, CI classification |
| Export formats and declarations | `package.json`, build configuration | package integration |
| Included documentation and licenses | package artifact policy | `verify:package` and installed packed-consumer smoke |

