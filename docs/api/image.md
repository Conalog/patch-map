# Image output

- Status: current
- Audience: image consumers, including browser pages owned by widget renderers
- Source: `src/image.ts`, `src/composition/image.ts`, `src/public/image.ts`, `src/engine/capture-extraction-authority.ts`

## Create, update, render, destroy

```ts
import { PatchMap } from '@conalog/patch-map/image';

const map = await PatchMap.create({
  data,
  width: 1000,
  height: 1000,
  background: '#ffffff',
  fit: { padding: 40 },
});
try {
  map.updateBatch({ targets: panelIds, text: { text: values } });
  const { blob, mime, size } = await map.render({ format: 'jpeg', quality: 0.9 });
  // Save or transmit blob in the host application.
} finally {
  await map.destroy();
}
```

`PatchMap.create()` prepares one reusable image session with a private detached
canvas. It omits PatchMap root pointer/viewport input and accessibility activation
bindings and selection/transformer overlays, including their scene-index and
paint-bound work. Data, assets, viewport transforms, and pixel publication still use the
shared runtime. Pixi retains its own renderer systems; global extensions and
shared tickers are not removed. It accepts the same dataset, assets, theme, fit,
and update inputs as the root product. Width and height are required positive integers in final output
pixels, independent of device pixel ratio. `data: []` creates an empty session.
Initial fit defaults to 24 pixels of padding. `viewport.initial` takes precedence
over fit. Mutations return the same committed/unchanged/rejected/refused results
as root mutations; handle rejection before rendering.

The session exposes `data.replace/snapshot/serialize`, `targets`, `assets`,
`update`, `updateBatch`, `transaction`, `viewport.fit/snapshot/restore/state`,
immediate `rotation`, `render`, and `destroy`. Mutations commit without history
or animation. Interactive controls, asynchronous replacement, canvas access,
resize, backend selection, and renderer strategy options are not exposed.

`render()` waits for active scene image bindings, publishes the current viewport,
and returns `{ blob, mime, size: [width, height] }`. It defaults to PNG. JPEG
accepts optional finite `quality` from 0 through 1; omission uses the browser's
encoder default. PNG rejects quality. PNG retains alpha; JPEG has no alpha, so
set an opaque background when its color matters. Use `background: '#00000000'`
for transparent PNG output; background strings follow the root hex-color contract.
Built-in fonts and image admission follow [Assets and capture](assets-and-capture.md).

This initial implementation renders the full viewport and encodes its canvas.
It provides no tile rendering, tile capture, memory budget, or speed guarantee.
Those internal strategies can be introduced later while retaining this session
and image-result contract. Browser/GPU canvas size limits still apply.

## Ordering and failures

- Await one `render()` before starting another; overlapping renders reject with
  `PatchMapError` code `CONFLICT`.
- A scene, viewport, or orientation change during rendering rejects with
  `SUPERSEDED`; render again after the change completes.
- Pass `signal` to render for cancellation. An aborted signal rejects with
  `CANCELLED`, including while waiting for assets or encoding. The browser's
  already-started native encoding may finish internally; its result is discarded.
- Destroy during rendering rejects with `DESTROYED` without waiting for encoding.
  `destroy()` releases the session and is idempotent: first completion returns
  `true`, subsequent calls return `false`.
- Asset/security failures, renderer loss, a missing Blob, or an unexpected MIME
  reject. No successful image result silently substitutes another format.
- Failed creation releases allocated renderer and asset resources.

## Environment and verification

Use a browser with WebGL2 and DOM canvas encoding. Node import is supported;
Node rendering, worker rendering, page screenshots, HTTP delivery, and image
transport are responsibilities of the host. No container is required and the
session does not append a canvas or start a managed render loop.

The root `@conalog/patch-map` entry retains `PatchMap.mount()` and `capture.png()`.
Exact image types are exported from `@conalog/patch-map/image`.

Reference: [Image example](../../examples/image.ts). Focused verification:
`tests/integration/image-api.test.ts` and
`tests/engine/engine-capture-extraction-authority.test.ts`; installed entry points,
dimensions, pixels, fonts, and repeated teardown are checked by the package gate.
