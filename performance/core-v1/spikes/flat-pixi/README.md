# Flat Pixi spike

This intentionally incompatible spike tests a performance-first product core:

- dense typed arrays and an `id -> slot` index own entity state;
- snapshots and generation-checked refs are detached from the render scene;
- a batch validates completely before mutating any state;
- state changes are synchronous, while `AggregatePixiRenderer.flush()` is the only render boundary;
- hit testing uses coarse spatial buckets rather than Pixi events;
- one PixiJS `Graphics` surface represents each 256-entity chunk, with no per-entity
  `DisplayObject`, event listener, ticker, or closure;
- animation is stepped explicitly and dirty chunks alone are rebuilt.

Run the low-end proxy checkpoint:

```sh
node performance/core-v1/spikes/flat-pixi/run.mjs --quick
```

Run the full 100/500/1,000/2,000/5,000 plus production workload:

```sh
node performance/core-v1/spikes/flat-pixi/run.mjs
```

Pass `--native` only for an unthrottled local measurement. This macOS/SwiftShader
evidence is not a substitute for pending Windows-native validation.
