# Compatibility and release policy

These are tested profiles, not claims about unmeasured environments.

## Runtime matrix

| Area | Tested profile | Status |
| --- | --- | --- |
| renderer | PixiJS 8.19.0, WebGL2 | production baseline |
| renderer | PixiJS 8.19.0, WebGPU | experimental; separate evidence required |
| browser automation | bundled Chromium, headless | development/release proxy |
| Windows Chrome/Edge | exact latest-two versions from release manifest | pending until native headed measurement |
| WebGL1 / Canvas fallback | any | unsupported production runtime |
| Node | CJS import/parser smoke only | no DOM renderer claim |

## Toolchain matrix

| Area | Tested profile |
| --- | --- |
| TypeScript | 5.9.3, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`; `skipLibCheck` isolates a PixiJS 8.19.0 peer-declaration conflict |
| ESM | package `import` condition |
| CJS | package `require` condition |
| bundler | Vite 7.3.6 production build |
| PixiJS peer | `>=8.0.0 <9`; release proof is pinned to 8.19.0 |

## Semver and deprecation

The `core-v2` subpath is intentionally redesigned. A breaking change to an
exported runtime method, declaration, dataset interpretation, diagnostic
category, or lifecycle ownership rule requires a major package version.
Additive capabilities use a minor version; fixes that preserve the observable
contract use a patch version.

Deprecations must include a replacement, a removal version, declarations, and
runtime documentation. A declaration-only alias or silent behavioral shim is
not an acceptable deprecation path. Experimental WebGPU behavior does not
expand the production compatibility promise.

Every promoted artifact must keep one digest across strict TypeScript,
ESM/CJS, browser examples, the 38 host journeys, package hygiene, and
lifecycle cleanup evidence.
