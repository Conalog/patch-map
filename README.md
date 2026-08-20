# PATCH MAP

[한국어](./README_KR.md)

`@conalog/patch-map` is a PixiJS v8 GPU renderer and interaction runtime for
PATCH MAP v0.10 datasets. It keeps authoritative data in a dense store, uses a
small aggregate scene graph, and owns rendering, viewport interaction,
selection, history, assets, extraction, and lifecycle cleanup.

## Install

```sh
npm install @conalog/patch-map pixi.js
```

## Basic usage

```ts
import { PatchMap } from '@conalog/patch-map';

const data = [{
  type: 'item',
  id: 'rack-01',
  attrs: { x: 40, y: 32 },
  size: { width: 80, height: 120 },
  components: [
    {
      type: 'background',
      id: 'frame',
      source: { type: 'rect', fill: '#e2e8f0', radius: 6 },
    },
    {
      type: 'bar',
      id: 'usage',
      source: { type: 'rect', fill: '#2563eb', radius: 4 },
      size: { width: '72%', height: '65%' },
      placement: 'bottom',
      animation: true,
      animationDuration: 500,
    },
    {
      type: 'text',
      id: 'label',
      text: '65',
      placement: 'top',
      style: { fontSize: 14, fill: '#0f172a' },
    },
  ],
}];

const patchMap = await PatchMap.mount({
  container: '#map',
  data,
  theme: {
    primary: { default: '#0c73bf', dark: '#063559' },
    gray: { light: '#9eb3c3' },
  },
  viewport: { wheel: { activationModifier: 'control' } },
  fit: { padding: 24 },
});

patchMap.update({
  id: 'rack-01',
  bar: { height: 82 },
});

// During unmount:
await patchMap.destroy();
```

`mount()` defaults to the production WebGL2 Mesh renderer, owns the single
animation frame loop, observes the host size, fits the initial data, and
releases those resources in `destroy()`. Use `backend: 'webgpu'` only for an
explicit experimental session.
Its first publication settles only the active distinct image bindings; later
source changes retain the last resolved texture until an atomic replacement.
The package-created canvas stays detached until that complete first frame has
rendered, so hosts do not need an opacity, loading-overlay, timeout, or polling
workaround to hide an uninitialized WebGL drawing buffer.

Wheel zoom remains modifier-free when `viewport` is omitted. Set
`viewport: { wheel: { activationModifier: 'control' } }` when only Ctrl+wheel
or macOS Command+wheel should zoom the map. Plain, Shift-only, and Alt-only
wheel events are left unconsumed so their container or page can scroll.
Programmatic `viewport.zoomBy()`, pan, pinch, and selection gestures are
unchanged.

Primary point selection keeps the pointer-down target while each CSS-pixel
axis remains within 4px of its start. The boundary is strict: 4px is still a
click, while 5px activates ordinary viewport pan or the Shift-latched box
gesture. Once crossed, returning to the start remains a drag. Viewport zoom
and renderer DPR/resolution do not change this package-owned slop.

`theme` is a partial, instance-local palette override. Nested objects and
dot-path keys are both accepted; omitted keys fall back to PatchMap's
canonical default palette. Theme tokens are shared by authored rect, bar,
icon, and text tint paths and by concrete background/bar/icon/text presentation overlays.

Package-owned PATCH MAP v0.10 icon aliases preserve their exact 72×72 SVG
canvas and transparent padding. An icon `size` sets that source draw box; it
does not crop the source to its visible artwork. Direct URLs and host-injected
aliases follow the same authored view-box rule.

Host tooltip and selection plugins use package-owned pointer projection rather
than duplicating hit tests. Set `pointer: { hoverDuringPress: true }` when a
tooltip should retain its current target through pointer down/up and click;
the compatible omitted/false policy publishes leave on pointer down. Keep
ordinary primary drag as viewport pan and use
Shift+primary drag for box selection with
`selection: { box: { activationModifier: 'shift', visual: { color: '#1099ff',
strokeWidth: 1, fillAlpha: 0.08 } }, allowMultiple, isSelectable, visual: {
color: '#ef4444', strokeWidth: 3, strokeAlignment: 'outside',
strokeScale: 'viewport', minStrokeWidth: 1,
displayMode: 'element-only' },
clearOnBlankClick: 'double', deselectOnTargetDoubleClick: true }`,
observe stable hover targets through `pointer.onHover()`, and observe non-echo
pointer selection through `selection.onPointerChange()`. Both subscriptions
return disposers and are also cleared by `destroy()`. Selection display modes
compose individual and aggregate bounds; they never filter selection identity.
`selection.visual` paints persistent selected bounds; optional
`selection.box.visual` independently paints only the transient drag marquee.
`strokeScale: 'viewport'` scales the persistent outline down below 1x with a
`minStrokeWidth` CSS-pixel floor while capping it at `strokeWidth` above 1x.
Omit it for the compatible fixed-screen-width policy. The marquee remains
fixed-screen-width and independent.
The compatible blank-click default is `single`; opt into `double` (or
`never`) explicitly. Target double-deselect is also opt-in: an unselected
target paints immediately, while only a target selected before the gesture is
armed for removal by its second modifier-free click. Shift click remains the
immediate multi-selection toggle.

For repeated grid-instance updates, query one semantic target set and reuse it
without JSONPath or per-update scene scans:

```ts
const cells = patchMap.targets.query({
  within: 'rack-grid',
  scope: 'instances',
});

patchMap.updateBatch({
  targets: cells,
  bar: {
    componentId: 'usage',
    height: new Float32Array(cells.count).fill(75),
    changes: { tint: barTints, source: barSources, show: barShows },
  },
  icon: {
    componentId: 'status',
    changes: { show: iconShows, source: iconSources, tint: iconTints },
  },
  background: {
    componentId: 'surface',
    changes: { source: cellBackgrounds, show: cellBackgroundVisibility },
  },
  text: {
    componentId: 'value',
    text: cellLabels,
    style: cellTextStyles,
    changes: {
      show: cellTextVisibility,
      margin: cellTextMargins,
      tint: cellTextTints,
    },
  },
}, { animate: true });
```

The input object is detached and never mutated. IDs and component owner/ID
identity remain stable. Invalid strict loads and mutations fail atomically.

For temporary host state such as focus, search, alarms, or time ranges, use a
keyed renderer-only presentation layer instead of mutating authored alpha:

```ts
const scope = patchMap.targets.query({ type: 'item', scope: 'authored' });

patchMap.presentation.set('dashboard:focus', {
  scope,
  targets: activeIds,
  matched: { alphaMultiplier: 1 },
  unmatched: { alphaMultiplier: 0.32 },
});
```

Same-key calls replace atomically and `presentation.clear(key)` removes only
that layer. Overlapping layers multiply with the authored/live base alpha.
They affect visible captures but not dataset snapshots, serialization,
history, or semantic hashes; successful dataset replacement and destroy clear
them. The initial API intentionally supports only `alphaMultiplier` in `[0, 1]`.

## Runtime support

- Node.js: `>=20` for package consumers; Node.js 22 for repository CI
- WebGL2: production baseline
- WebGPU: experimental
- WebGL1 and Canvas fallback: unsupported
- PixiJS peer dependency: `>=8 <9`

See [product documentation](./docs/patch-map/README.md), the packaged
[examples](./examples/patch-map), and the interactive Lab started with
`npm run lab`.

Upgrading an existing host integration? Follow the
[migration guide](./docs/patch-map/migration.md) before replacing its engine,
frame loop, persistence, or teardown path.

## Development

Use Node.js 22 (`.nvmrc`; package minimum is 20) and install the locked dependencies with `npm ci`.
See [CONTRIBUTING.md](./CONTRIBUTING.md) for the risk-based verification gates.

```sh
npm run typecheck
npm run lint
npm run unit
npm run build
npm run verify:contract
```

Version `0.10.0` is retained on this branch. The release version is bumped
after merge.
