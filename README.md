# PatchMap

`@conalog/patch-map` is a PixiJS v8 renderer and interaction runtime for PATCH
MAP datasets.

## Install

```sh
npm install @conalog/patch-map pixi.js
```

## Use

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

## Documentation

- [Choose a task](./docs/README.md)
- [Getting started](./docs/getting-started.md)
- [Host integration](./docs/integration/host.md)
- [Compatibility](./docs/compatibility.md)
- [Runnable examples](./examples)
- [Contributing and engineering](./CONTRIBUTING.md)
