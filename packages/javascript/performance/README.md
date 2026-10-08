# Performance

Performance code measures the current source tree and writes transient results
under the workspace root’s `.artifacts/performance/`. Run the commands below
from `packages/javascript/`. Runners depend only on current source and owned fixtures.

| Owner | Purpose | Command |
| --- | --- | --- |
| `browser-options.mjs` | Shared headed/headless Chromium launch options for executable measurements | imported by benchmark and memory runners |
| `benchmark/` | Browser workload, visible milestones, and current-run summary | `node performance/runners/benchmark.mjs --smoke` or full without `--smoke` |
| `fixtures/` | Deterministic synthetic and production-shaped inputs | imported by benchmark and focused tests |
| `probes/memory/` | Mount/load/render/destroy heap and resource release | `node performance/runners/memory.mjs` |
| `probes/extraction/` | Exact-tuple PNG readback timing and cleanup | `node performance/runners/extraction.mjs` |
| `probes/update/` | Public transaction CPU-path input | `node performance/runners/update.mjs` |
| `runners/` | Thin executable entrypoints | invoke the matching owner above |

Benchmark smoke and probe success establish harness correctness and lifecycle
invariants. Timing results are measurements, not regression claims, until a
comparable baseline and predeclared budget exist for the same environment.

## Image API baseline

`performance/runners/image.mjs` measures the built `dist/image.js` public API
with a frozen widget-renderer workload. Build once before collecting a baseline:

```bash
npm run build
node performance/runners/image.mjs \
  --inputs /absolute/path/to/frozen-widget-inputs \
  --output .artifacts/performance/image-baseline-new-run \
  --executable-path /absolute/path/to/hardware-Chromium
```

Use the shared `--channel`, `--headed`, or `--headless` browser options when
appropriate. The actual renderer must be hardware WebGL2 with four AA samples;
a software renderer fails the workload gate. `--smoke` runs one 5000 JPEG trial
and verifies the measurement path, without establishing a performance baseline.
Output paths are resolved from the workspace root. The output directory must
be new; previous results are never overwritten.

The explicit input directory contains `model.json` (`blueprint`,
`runtimeUpdates`, `fit`, `antialias`), `assets.json`, `cache.json`,
`asset-cache/<file>`, and `icons/{ess,inverter-frame}.svg`. The cache records
contain `url`, `file`, `contentType`, and `sha256`. Assets that used the local
widget service use `http://fixture.invalid` in `assets.json`. The runner copies
and hashes the inputs, validates cached asset digests, and rewrites remote
model URLs to a local frozen HTTP server. External requests fail verification.
Real customer data stays in ignored artifacts; the runner never fetches fresh
production data or imports another checkout.

The protocol is 2 warmups + 7 measured trials for each of 5000 and 7000 pixels,
JPEG quality 0.9 and PNG. Each trial has a fresh browser/cache, DPR 1, white
background, no CPU throttle, concurrency 1, and the same ordered updates grouped
in batches of at most 100. Case order alternates between rounds. The API output
size is physical pixels, independent of browser viewport. Build and consumer
bundling finish before sampling; the consumer uses the emitted library and
installed PixiJS, not source-only test adapters.

Timings separate create, updates, render/encode, binary Blob transfer, and
destroy. `blobReadyMs` covers create through Blob completion; `requestMs` adds
local transfer. `coldNodeReadyMs` additionally includes browser launch, page and
module preparation, measurement setup, and argument delivery. These are local
library/consumer measurements, not widget-renderer's HTTP response latency.
Pixel decode/checksum validation and destroy are outside the primary memory and
image-ready timing window. The probe observes native WebGL context creation and MSAA renderbuffer
allocations without changing renderer options. It restores the canvas prototype
before updates/render. Output dimensions and the GPU carrier dimensions are
reported separately; image tiles must allocate four samples within 2048×2048.
The probes also count native pixel reads, requested bytes, buffer capacity and
distinct backing stores using a WeakSet, without retaining readback buffers.

On macOS, `probes/image/sample.py` samples `proc_pid_rusage` v2 every 50 ms for
the benchmark Node process and its descendants, excluding the sampler itself.
The primary memory metric is the peak **simultaneous sum of physical footprint**,
including Chromium's GPU process. GPU/renderer/Node role peaks are independent
and cannot be added to reproduce the simultaneous total. RSS is reported
separately. Neither metric measures individual GPU allocation sizes. Sampling
can miss short peaks; actual maximum sample gaps are preserved. CPU-seconds are
the observed sum of process user+system CPU counters, converted using the host
Mach timebase, over the same window. CPU-seconds aggregate parallel cores and
are not wall-clock latency or GPU execution time.

`contract.json` pins the protocol, production source, shared assets/preparation,
workspace lock, build/probe/sampler
hashes and fixture bytes. `baseline.json` retains all warmup/measured results,
median/range/p95, environment, and failures. Each trial has process samples and
a result; the first round also saves the output image. Same-case downsampled
pixel hashes must remain identical, dimensions/MIME must match, updates must
succeed, inputs must remain unchanged, and DOM canvases/fonts must be released.
Browsers and server close in cleanup. Post-GC retained JS heap is recorded
separately from peak process memory. A successful report validates baseline
collection; it does not assert a latency/resource budget or improvement. With
seven measured samples p95 equals the observed maximum and is not a stable tail
estimate. Compare future candidates using the same workload hashes, browser,
hardware, lifecycle, cache, and protocol; retain adverse samples.

## Widget-renderer HTTP E2E with the image API

The library probe above does **not** measure widget-renderer's full HTTP request.
Use the widget E2E runner for request dispatch through receipt of the complete
JPEG response, including data queries, model creation, browser preparation,
`create`, `updateBatch`, `render`, Blob transfer, destroy, browser close, and
HTTP response transmission:

```bash
npm run build
node performance/runners/widget-e2e.mjs \
  --widget-root /absolute/path/to/widget-renderer \
  --inputs /absolute/path/to/frozen-widget-inputs \
  --output .artifacts/performance/widget-image-e2e-new-run \
  --executable-path /absolute/path/to/hardware-Chromium
```

The input directory additionally needs the original `request.json` and
`data.json` with captured blueprint/registry query results. The runner snapshots
the supplied widget's current `src`, assets and package files under ignored
artifacts. It does not create a worktree or modify the supplied widget checkout.
Dependencies come from that checkout without installation; the browser bundle
aliases the image entry to a frozen copy of this library's emitted `dist`.
The snapshot and all source/input/probe hashes are recorded. The real widget
HTTP handler, authorization validation, Patch API HTTP client, data source,
model builder, fit/output calculations, and response path are reused. Only the
experimental browser/image adapter and asset transport are replaced.

External Patch API queries and images replay frozen bytes over local HTTP;
production network/database latency is excluded. A benchmark-only local bearer
token exercises the actual authorization path. The server is already listening
before the request starts; Chromium starts fresh for every request. The protocol
is 2 warmups + 7 measured requests for 5000 and 7000, serial execution, hardware
WebGL2 AA4, JPEG90, white background, and no CPU throttling. Widget output is
fixed JPEG90, so this owner does not add a PNG HTTP case. `--smoke` performs a
single 5000 request for harness validation.

The workload uses text mode, 12-character values and `#e53935`. Model-derived
bar heights represent 100% in the widget's units; the library accepts numeric
height columns, rather than the string `100%`. Final values are cleared from
initial component templates before `create` so that every `updateBatch` performs
a real bar/color/text change. Label components and layout stay intact. The same
ordered target list is grouped by authored/concrete target kind and text
component, at most 100 per batch. All 3,377 targets must commit both bar and text
changes, with no transaction or unchanged-result shortcut. This initial reset
is specific to the explicitly requested post-create update workload and its
cost remains included in HTTP E2E time; it is not a production widget patch.

Each raw result preserves client E2E latency, browser/API stages, the actual
widget trace, query count, output dimensions, update outcomes, and sampled CPU
and process footprint. Every JPEG is retained and same-case output digests
must match across all trials. Post-render fonts/canvases and browser close are
verified before the HTTP response returns. `e2e-baseline.json` summarizes
measured samples only. Measurement semantics and sampling limitations match
the image owner's macOS sampler above. This establishes a local consumer E2E
baseline for the new API; it is not a deployment measurement or a speedup
comparison with the widget's published screenshot backend.
