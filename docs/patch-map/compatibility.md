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

## Built-in image compatibility

Root `PatchMap.mount()` always provides the package-owned `object`, `inverter`,
`combiner`, `device`, `edge`, `loading`, `warning`, and `wifi` aliases. These
aliases resolve to distinct semantic glyph silhouettes, not generic fallback
tiles. An authored icon and a concrete icon overlay that name the same alias
share its texture, including `show`, `tint`, component order, and `zIndex`
behavior. `await capture.png()` settles a currently visible built-in source;
replacement and destroy release its lease and Pixi cache ownership.
The package catalog embeds the original transparent 72×72 filled PATCH MAP
v0.10 SVG artwork for `object`, `inverter`, `combiner`, `device`, `edge`,
`loading`, `warning`, and `wifi`; white artwork preserves multiplicative tint.
Its internal Pixi cache identity is content-bound while the public alias stays
stable, so replacing an exact package artifact cannot reuse a texture produced
from an older built-in SVG under the same alias.
The package derives a square, artwork-fitted runtime view box for each built-in
without changing the original SVG file or its digest. This makes a built-in
icon's public `size` describe its visible maximum axis while preserving its
aspect ratio. Direct URLs and host-registered aliases retain their authored
canvas and view-box sizing; they are never implicitly trimmed.
Distinct host aliases remain instance registrations and cannot replace a
reserved built-in alias.

## Pointer and selection compatibility

`PatchMap.mount({ selection })` optionally enables package-owned drag box
selection and accepts `allowMultiple` plus a stable-target `isSelectable()`
predicate. `box: { activationModifier: 'shift' }` preserves ordinary primary
pan and assigns only Shift+primary drag to box selection. The modifier is
latched at pointer-down so press/release during a gesture cannot change its
owner. `box: true` or `activationModifier: 'none'` explicitly assigns every
primary drag to box selection. Middle-pointer pan and wheel zoom remain
available.

Point click versus primary pan/box arbitration matches the established
per-axis 4 CSS px slop: 4px remains a click and an excursion strictly beyond
4px starts the latched drag owner. Returning to the start after crossing the
boundary does not restore click eligibility. Viewport scale, renderer DPR,
and pointer event cadence do not alter this threshold.

`pointer.onHover()` publishes `hover/move/leave` with a CSS anchor, world point,
and stable `{ id, componentId? }`. `selection.onPointerChange()` publishes only
pointer-origin selection, while `selection.onChange()` retains its all-source
ID contract. Grid hover components use `<grid>.<row>.<column>` as `id` and the
template component identity as `componentId`; point and box selection resolve
to the stable grid-cell `id`. Subscriptions are instance-local,
return disposers, and are also cleared by `destroy()`.

`PatchMap.mount({ pointer: { hoverDuringPress: true } })` preserves the current
hover target through a press/click, so a host tooltip does not disappear when
the same selectable target is clicked. The option defaults to `false` for
compatibility. A real leave or pointer cancel still publishes `leave` and
clears the retained target.

Wheel zoom remains modifier-free when the mount option is omitted. Consumers
that previously enabled zoom only while Ctrl/Command was held map that behavior
to `viewport: { wheel: { activationModifier: 'control' } }`. The package reads
`ctrlKey || metaKey` directly from each wheel event; it adds no keyboard state
listener. Rejected plain/Shift/Alt wheel is not prevented or propagation-
stopped, while an accepted scale-changing wheel retains cursor anchoring and
zoom clamping. Public `viewport.zoomBy()` is independent of this gesture gate.

Selection paint is configured only at the root mount boundary with
`selection.visual`. Color, 1x CSS-pixel stroke width, fixed or viewport-linked
low-zoom scaling (with a CSS-pixel floor), outside/center/inside
placement, and `all`/`group-only`/
`element-only`/`hidden` display mode apply equally to programmatic, click, and
box selection. Display mode composes individual bounds and their aggregate
bound; it never filters the selected semantic target types or changes their
identity. The package renders and cleans the transient drag marquee in
the same canvas. `selection.box.visual` may give that marquee an independent
color, CSS-pixel stroke, and 0..1 fill alpha; omitting it retains the legacy
selection color/width fallback and `0.08` fill. Persistent bounds never inherit
from `box.visual`. The marquee is intentionally absent from dataset, history,
semantic hash, and debug state.
`strokeScale` defaults to `fixed` for compatibility. `viewport` multiplies the
configured persistent width by scale below 1x, clamps it to
`minStrokeWidth`, and caps it at the configured width above 1x. It never
changes element/group path composition or the marquee's fixed screen width.
Alignment applies only to persistent selection bounds. The compatible omitted
value is centered; `outside` preserves a target's own edge paint, while the
transient marquee remains centered and continues to use `box.visual` only.
The persistent frame uses a package-computed visual paint bound: visible
projected background/image, bar, icon, and text layout boxes are unioned with
the semantic owner, negative margins are retained, and centered rect strokes
contribute their exact outward half-width. Texture alpha is not scanned and an
animated bar retains its stable full-track layout bound. The index is rebuilt
only for a changed immutable projection, so unchanged frames add no component
scan, Pixi `getBounds()`, or tessellation.

Blank-canvas and target double-click deselection are independently opt-in.
`clearOnBlankClick` defaults to `single` for compatibility and additionally
accepts `double` or `never`. `deselectOnTargetDoubleClick` defaults to `false`;
when true it never delays a new target, never collapses a multi-selection on
the first click of an already-selected target, and removes only that armed
target on the paired second modifier-free click. Shift click keeps its
immediate add/toggle semantics.
