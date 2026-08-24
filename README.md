# PATCH MAP

[한국어](./README_KR.md)

`@conalog/patch-map` is a PixiJS v8 GPU renderer and interaction runtime for
PATCH MAP v0.10 datasets. `PatchMap.mount()` is the supported construction path.

## Install

```sh
npm install @conalog/patch-map pixi.js
```

## Basic usage

```ts
import { PatchMap } from '@conalog/patch-map';

const patchMap = await PatchMap.mount({
  container: '#map',
  data: [{
    type: 'item',
    id: 'rack-01',
    attrs: { x: 40, y: 32 },
    size: { width: 80, height: 120 },
    components: [{
      type: 'bar',
      id: 'usage',
      source: { type: 'rect', fill: '#2563eb', radius: 4 },
      size: { width: '72%', height: '65%' },
      placement: 'bottom',
      animation: true,
      animationDuration: 500,
    }],
  }],
  fit: { padding: 24 },
});

patchMap.update({
  id: 'rack-01',
  bar: { height: 82 },
});

await patchMap.destroy();
```

Mount owns the selected rendering surface—WebGL2 by default—the single frame
loop, host-size observation, initial publication, and cleanup. Input data is
detached and never mutated; invalid strict loads and mutations fail atomically.

## Documentation

- [Public documentation](./docs/patch-map/README.md)
- [API and PATCH MAP dataset](./docs/patch-map/api-and-dataset.md)
- [Host integration and lifecycle ownership](./docs/patch-map/host-integration.md)
- [Migration guide](./docs/patch-map/migration.md)
- [Compatibility and release policy](./docs/patch-map/compatibility.md)
- [Troubleshooting](./docs/patch-map/troubleshooting.md)
- [Runnable examples](./examples/patch-map)

The English documents above are the canonical detailed public documentation.
`README_KR.md` intentionally remains a Korean quickstart instead of maintaining
a partial second documentation taxonomy.

## Runtime support

- Node.js `>=20` for package consumers
- PixiJS `>=8 <9`
- WebGL2 is the production backend; WebGPU is experimental

See the [compatibility matrix](./docs/patch-map/compatibility.md) for the tested
browser, toolchain, semver, and deprecation policy.
