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

`theme` is a partial, instance-local palette override. Nested objects and
dot-path keys are both accepted; omitted keys fall back to PatchMap's
canonical default palette. Theme tokens are shared by authored rect, bar,
icon, and text tint paths and by concrete bar/icon presentation overlays.

Host tooltip and selection plugins use package-owned pointer projection rather
than duplicating hit tests. Keep ordinary primary drag as viewport pan and use
Shift+primary drag for box selection with
`selection: { box: { activationModifier: 'shift', visual: { color: '#1099ff',
strokeWidth: 1, fillAlpha: 0.08 } }, allowMultiple, isSelectable, visual: {
color: '#ef4444', strokeWidth: 3, displayMode: 'element-only' } }`,
observe stable hover targets through `pointer.onHover()`, and observe non-echo
pointer selection through `selection.onPointerChange()`. Both subscriptions
return disposers and are also cleared by `destroy()`. Selection display modes
compose individual and aggregate bounds; they never filter selection identity.
`selection.visual` paints persistent selected bounds; optional
`selection.box.visual` independently paints only the transient drag marquee.

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
}, { animate: true });
```

The input object is detached and never mutated. IDs and component owner/ID
identity remain stable. Invalid strict loads and mutations fail atomically.

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
