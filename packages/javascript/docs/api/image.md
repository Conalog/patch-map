# Image output

- Status: current
- Audience: image consumers, including browser pages owned by widget renderers
- Source: `src/image.ts`, `src/composition/image.ts`, `src/public/image.ts`, `src/engine/capture-extraction-authority.ts`

## Create, update, render, destroy

```ts
import { PatchMap } from '@conalog/patch-map/image';

const map = await PatchMap.create({
  data, width: 1000, height: 1000,
  background: '#ffffff', fit: { padding: 40 },
});
try {
  const result = map.updateBatch({ targets: panelIds, text: { text: values } });
  if (result.status === 'rejected' || result.status === 'refused') throw new Error(result.diagnostic?.code ?? 'Map update failed');
  const { blob, mime, size } = await map.render({ format: 'jpeg', quality: 0.9 });
  // Save or transmit blob in the host application.
} finally {
  await map.destroy();
}
```

`PatchMap.create()` prepares one reusable image session with private detached GPU and output canvases.
It omits PatchMap root pointer/viewport input and accessibility activation bindings and selection/transformer overlays,
including their scene-index and paint-bound work. Data, assets, viewport transforms, and pixel publication still use the shared runtime.
Pixi retains its own renderer systems; global extensions and shared tickers are not removed.
The image WebGL2 context omits depth and stencil buffers, which these rendering lanes do not use.
Image output always enables antialiasing and requires an AA4 (four-sample) render target; `antialias: false` is rejected before allocation.
It accepts the same dataset, assets, theme, fit, and update inputs as the root product.
Width and height are required positive integers in final output pixels, independent of device pixel ratio.
Dimensions above 4,294,967,295 are rejected before allocation to prevent Canvas integer wrapping; browser canvas limits can be lower.
`data: []` creates an empty session. Initial fit defaults to 24 pixels of padding; `viewport.initial` takes precedence over fit.
Mutations return the same committed/unchanged/rejected/refused results as root mutations; handle rejection before rendering.

The session exposes `data.replace/snapshot/serialize`, `targets`, `assets`, `update`, `updateBatch`, `transaction`,
`viewport.focus/fit/snapshot/restore/state`, immediate `rotation`, `render`, and `destroy`. Mutations commit without history or animation.
Focus and fit share the target traversal and filter contract in [Viewport and transform](viewport-and-transform.md).
Interactive controls, asynchronous replacement, canvas access, resize, backend selection, and renderer strategy options are not exposed.

`render()` waits for active scene image bindings, publishes the current viewport,
and returns `{ blob, mime, size: [width, height] }`. It defaults to PNG. JPEG
accepts optional finite `quality` from 0 through 1; omission uses the browser's
encoder default. PNG rejects quality. PNG retains alpha; JPEG has no alpha, so
set an opaque background when its color matters. Use `background: '#00000000'`
for transparent PNG output; background strings follow the root hex-color contract.
Built-in fonts and image admission follow [Assets and capture](assets-and-capture.md).
Image sessions use Pixi Text for standalone and component labels.

The scene is prepared once for the full output viewport. Rasterization reuses one AA4 render target of at most 2048×2048 pixels
and a 1×1 GPU canvas. Each axis is divided evenly within that limit, reducing unused edge space without increasing the tile count.
For example, a 5000×5000 output uses a 1667×1667 work target and nine tiles.
Each tile is resolved, read back, and copied into a full-size CPU output canvas, which is encoded once.
Tiles do not apply additional scene culling or change fit. Partial edge tiles retain only their output pixels;
transparent PNG uses straight-alpha pixels during assembly. One pixel readback buffer, at most 16 MiB, is reused across tiles and repeated renders.
Edge tiles use exact-length views of that buffer, and each tile is copied into the output canvas before the next read overwrites it.
WebGL readback errors reject the render instead of publishing previous tile bytes.
Repeated renders reuse the work target; teardown releases both canvases, the target, and the readback buffer.

Tile rasterization can produce antialiasing coverage and channel rounding differences compared with one full-size target.
Individual edge pixels may differ substantially even when the overall image appears similar; byte-for-byte equivalence with root capture is not guaranteed.
The full-size CPU canvas and encoder still consume memory proportional to output area, and browser canvas size limits still apply.
There is no fixed memory budget or speed guarantee.

## Recommended usage and cost

These are starting recommendations, not measured speed guarantees; [ordering requirements](#ordering-and-failures) apply.
For implementation decisions, complete browser examples and a bounded CPU host queue, use [Image jobs](../integration/image-jobs.md).

| Workload or decision | Recommended pattern |
| --- | --- |
| One image | Prepare final values in `create({ data })`. Batch remaining target-dependent changes, render once, then destroy in `finally`. |
| Several variants of one map | Reuse at a fixed size/theme: update, await render, consume result, repeat. Explicitly reset fields each variant needs; earlier updates persist. |
| Many changed targets | Use aligned `updateBatch` columns; no 100-target chunk size is required. Use `transaction` for atomic heterogeneous operations; see [mutations](mutations-and-history.md). |
| Output size | Use required final pixel dimensions. Tiles bound the work target, not the output canvas/encoder. Doubling both dimensions quadruples pixel count. |
| Output format | PNG preserves alpha/lossless detail; JPEG needs an opaque background when its color matters. Inspect lossy quality/file size; lower quality does not guarantee faster encoding. |
| CPU-only server | Require browser software WebGL2/AA4. Start one active job per page/session with a bounded queue; increase host concurrency after measuring peak memory and throughput. |

Pool browser pages separately from maps, with a bound. Destroy maps before releasing pages and reset request state before reuse. Consume Blobs and release host references instead of accumulating results. AA4 and tile sizing are managed internally.
Measure create → updates → render → consume → destroy, plus queue time for service latency. Compare cold/warm runs at fixed size/format and track whole-browser/container peak memory, not only JS heap. `render()` includes rasterization, readback and encoding.

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
Node rendering, worker rendering, page screenshots, HTTP delivery, and image transport are responsibilities of the host.
No container is required; the session does not append a canvas or start a managed render loop.

The root `@conalog/patch-map` entry retains `PatchMap.mount()` and `capture.png()`.
Exact image types are exported from `@conalog/patch-map/image`.

Reference: [Image example](../../examples/image.ts). Focused verification:
`tests/integration/image-api.test.ts` and `tests/engine/engine-capture-extraction-authority.test.ts`; installed entry points,
dimensions, pixels, fonts, and repeated teardown are checked by the package gate.
