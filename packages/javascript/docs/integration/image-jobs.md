# Image jobs and performance decisions

- Status: current
- Audience: agents implementing browser image consumers and CPU-only image services
- Owner: host job design and runnable image recipes

Read [Image output](../api/image.md) for contracts and failures. These are recommendations, not speed or memory guarantees.

## Choose the job shape before writing an adapter

| Situation | Implement | Reason / acceptance check |
| --- | --- | --- |
| One image, known business values | Final ordinary-item `data` → create → render → destroy | Avoid updating an intermediate scene. Check final color, full height and labels. |
| Concrete grid cells resolved after admission | Create template, resolve cells, batch once, render | Keep target-specific updates; do not expand templates into thousands of authored items to avoid batching. |
| Variants, same geometry/dimensions/theme | One map, sequential complete batches and renders | Reset every variable field. Compare variant B against standalone B. |
| Independent requests, changed dimensions/theme, incomplete reset rules | Fresh map per job; pool bounded browser pages | Isolate request state; no global mutable map across customers. |
| Transparency, tiny labels, exact diagram colors | Start with PNG | Check representative output at its actual display size. |
| Opaque report where smaller files matter | Try JPEG with an explicit background, initially quality 0.9 | Compare label/color quality and byte size with PNG. Lower quality is not a speed guarantee. |
| CPU-only server | Browser WebGL2/AA4 image smoke test | Node import does not provide rendering. Verify software rendering in the actual container. |

Set width/height to the required final pixel dimensions; do not multiply by device pixel ratio again.
AA4 and tile division are internal. Adding screenshot capture, host tile composition or an interactive `mount()` duplicates work for this use case.
For homogeneous changes use one batch with equal-length columns, not one update per cell or arbitrary 100-cell batches.
For mixed atomic operations, follow [Mutations and history](../api/mutations-and-history.md).

## Complete browser recipes

Copy [image.ts](../../examples/image.ts) into the consumer's source tree; its imports use only the public image entry.
Install a version exporting `./image` and its PixiJS peer ([package README](../../README.md)). Verify the subpath import, then run your browser bundle:

```ts
import { previewImage, runImageExample } from './image';
await runImageExample(previewImage);
```

This call prepares full-height colored bars and labels, returns a JPEG, then renders warning/restored PNG variants with one map.
The callback decodes each Blob, appends an image and releases its object URL. Remove preview images when the view ends.
For servers, await binary transfer/storage instead of previewing or accumulating Blobs.

| Helper | Replace / preserve |
| --- | --- |
| `buildPanelData(readings)` | Replace layout with your adapter; supply final values. Caller input remains unchanged. |
| `renderMapImage({ create, updates?, output? })` | Omit updates if data is final; batch residual fields once. Returns Blob, MIME and size after teardown. |
| `buildPanelBatch(readings)` | Supply every variable/reset value in aligned columns. Height remains authored at 100%. |
| `renderMapVariants(create, variants, consume)` | Complete batches, fixed map, awaited consumer. Failure stops the group and destroys the map. |

Both variants supply colors/text for both targets.
Explicitly restore visibility, height, orientation or viewport too if they vary; this sample does not manage them.
For grid-cell overlays, use stable identities from [Data and targets](../api/data-and-targets.md).

## CPU service admission and cleanup

[image-job-queue.ts](../../examples/image-job-queue.ts) provides a bounded FIFO queue and service adapter without driver dependencies.
Create one service at process startup: one active job, four waiting jobs. Four is illustrative, not a measured optimum.
Wire `acquirePage`, `renderAndReadBytes`, `release`, and `send(input, bytes)` to your browser pool and response transport:

1. Validate payload size, target count and pixel area before enqueueing. Set limits from representative container measurements.
2. Reject overflow with an overload response; no unlimited secondary queue. Multiply limits by process/replica counts.
3. Acquire one page only when the job starts. Its browser function calls `renderMapImage`, reads `await result.blob.arrayBuffer()` and transfers bytes using the driver's supported mechanism. The page must finish map destruction before its job settles.
4. Await output delivery, then release the page in `finally`. The example holds the worker slot through delivery and page cleanup, so slow consumers apply backpressure. A broken page is discarded/replaced by the pool's release adapter.
5. Release callbacks/bytes after settlement. Bound the page pool separately; do not start a browser/page per request.

The adapter leaves driver startup, HTTP responses and deadlines to the host; its queue does not implement cancellation or shutdown draining.
Add request deadlines before admission and recheck expired jobs before page acquisition. Inside a browser job, use a local AbortController's signal in render options when the driver delivers cancellation.
Do not free a worker/page slot merely because a `Promise.race` timeout returned: await cleanup or discard/close the page before reusing it. Native encoding can finish internally after cancellation; see the API owner.
Treat update failures or nonempty `missing` targets as data errors; `ImageUpdateError.result` retains both. Do not render stale data or retry invalid input.
Invalid envelopes/columns can throw TypeError or RangeError directly; propagate these through host error handling too.
On renderer loss, recreate the page/session according to a bounded host retry policy. Do not recursively retry without admission limits.

## Decide whether more concurrency is cheaper

Start with one active job per process, then compare 1 and 2 under the same CPU/memory limit, browser version, dataset, output dimensions, format and quality.
Keep the higher count only when sustained throughput improves while end-to-end tail latency and whole-container peak memory remain within the host's budgets.
Pool pages independently from maps; browser reuse does not establish map isolation or software AA4 availability.

Record these intervals separately in the host:

| Interval | Includes |
| --- | --- |
| Queue | Accepted request → worker admission |
| Data / create | Preprocessing, page acquisition, input transfer and `PatchMap.create` separately |
| Updates | Residual batch/transaction only; count calls and targets |
| Render | First-use shader work, tile rasterization, readback, assembly and encoding |
| Consume | Blob → bytes, browser-to-host transfer and response/storage completion |
| Cleanup | Map destruction and page release |

Use the complete accepted-request → response/cleanup interval for end-to-end comparisons.
Report cold and warm cases separately, repeat runs and compare median/p95 plus bytes and peak memory. JS heap alone excludes large canvas/native/process allocations; include the browser process tree or container peak.
Do not claim a faster encoder, fixed per-job memory ceiling or optimal worker count from local timings on a different production architecture.

## Consumer acceptance checks

- Verify PNG/JPEG MIME, decoded dimensions, representative colors, labels and transparent background where required.
- Render normal → warning → normal and compare the final image with standalone normal output; check no stale text/visibility/viewport state.
- Force invalid updates, consumer failure and queue overflow; ensure no stale result is delivered and the next valid job can run.
- Check cancellation/page-loss recovery and bounded page/map/output counts in the actual host, including repeated jobs and slow output delivery.

The package gate compiles these copied examples against installed public declarations and executes their image, reset, failure-cleanup and queue behavior in Chromium. Host-specific driver, HTTP and container qualification remain with the consumer.
