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

const patchMap = new PatchMap();

await patchMap.initialize({
  instanceId: 'rack-map',
  target: document.querySelector('#map')!,
  width: 960,
  height: 640,
  preference: 'webgl',
  strategy: 'mesh',
});

patchMap.loadDataset(data);
patchMap.fitViewport({ paddingCssPx: 24 });

const frameLoop = patchMap.createFrameLoop();
frameLoop.publishNow();

patchMap.updateBarHeights({
  targets: [{ ownerId: 'rack-01', componentId: 'usage' }],
  heights: [82],
});
frameLoop.request(600);

// During unmount:
frameLoop.destroy();
await patchMap.destroy();
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
