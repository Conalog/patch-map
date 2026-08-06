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
| Node | package metadata requires 20+; CI and release verification use 22 | CJS/import/type consumer support only; no headless Node DOM renderer claim |

## Toolchain matrix

| Area | Tested profile |
| --- | --- |
| TypeScript | 5.9.3, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`; `skipLibCheck` isolates a PixiJS 8.19.0 peer-declaration conflict |
| ESM | package `import` condition |
| CJS | package `require` condition |
| bundler | Vite 7.3.6 production build |
| PixiJS peer | `>=8.0.0 <9`; release proof is pinned to 8.19.0 |

## Semver and deprecation

The root `@conalog/patch-map` API is intentionally redesigned. A breaking change to an
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

## Theme compatibility

`PatchMap.mount({ theme })` accepts a partial nested or dot-path palette and
keeps it instance-local. The canonical defaults include
`primary.default=#0C73BFFF`, `primary.dark=#083967FF`,
`primary.accent=#EF4444FF`, `gray.light=#9EB3C3FF`,
`gray.default=#D9D9D9FF`, `gray.dark=#71717AFF`, `white=#FFFFFFFF`, and
`black=#1A1A1AFF`. Missing custom keys fall back to those values. Supplied
values are detached and normalized before rendering, so authored component
colors and concrete presentation overlays use one palette without changing
dataset snapshots, history, or semantic hashes.

## Concrete grid presentation compatibility

The concrete-cell overlay is intentionally narrower than authored component
mutation. It supports bar `height/tint/source/show` and icon
`show/source/tint` through root `PatchMap.update()` / columnar
`PatchMap.updateBatch()`. Overlay state is revision-bound, excluded from
dataset snapshots, semantic hashes, and history, and cleared on dataset
replacement or destroy.

Concrete text `show/text/style`, background fields, and other component
changes remain unsupported and report
`PATCH_MAP_GRID_INSTANCE_PRESENTATION_UNSUPPORTED`. This is an explicit
compatibility boundary, not a best-effort drop policy.
