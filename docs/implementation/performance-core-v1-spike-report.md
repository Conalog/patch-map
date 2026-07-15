# Core v1 Spike Decision Report

## Decision

Select the dense typed store with the aggregate Canvas2D command path as the Core v1 implementation baseline. Both spikes passed their recorded transaction, input-immutability, stale-reference, explicit-frame, and lifecycle checks, so the store direction is supported independently of renderer choice. Canvas2D is selected because its current 4× proxy evidence has materially lower first-render and animation-frame cost, avoids the measured Pixi renderer-startup tax, and does not show the Pixi spike's large teardown cost.

The flat Pixi aggregate spike is retained as rejected/provisional evidence, not discarded or declared intrinsically unsuitable. Its two unique runs varied too much to support a stable gate, and its latest run still trails Canvas2D on the renderer-dominated measurements. It may be reconsidered only after an identical-workload, warmed renderer comparison or if later visual requirements demonstrate a benefit that compensates for the measured cost.

This is a spike-selection decision, not a release-performance claim. The quick evidence does not cover 2,000 or 5,000 entities, exact retained heap, GPU upload, headed pixel correctness, or native Windows.

## Evidence inventory

| Evidence | SHA-256 | Sampling | Workloads |
| --- | --- | --- | --- |
| `performance/core-v1/results/baseline-quick.json` | `a98a1df7c784f95e9e147e857786aae7de2e92600ea45b49a94b58545c782061` | 1 warmup, 3 measured samples | compatibility 100, 500, 1,000, production |
| `performance/core-v1/spikes/typed-canvas/results.quick.json` | `536e3c4777e203afe35aa1a656cf08c37d1702aeb1f6a047c48ed60dfae43fe8` | 2 warmups, 5 measured samples, 80 animation samples | flat 100, 500, 1,000, production-458 |
| flat Pixi run at `05-22-05` | `ced43bc48a8b4d1963e4b187f6a5442eaa23321f3fecd631454bf7c529e64842` | 1 warmup, 3 measured samples, 6 animation frames/sample, 128 hit tests | flat 100, 500, 1,000, production-458 |
| flat Pixi run at `05-24-03` | `865a7afdb5acfc2c9c755ce0c4a57706453305ea90a7b7c7112488d78caf070f` | same | same |
| flat Pixi `latest-quick-4x.json` | `865a7afdb5acfc2c9c755ce0c4a57706453305ea90a7b7c7112488d78caf070f` | byte-identical alias of `05-24-03` | same |

Run `node performance/core-v1/report/verify.mjs` from the repository root to check every current result JSON. The validator requires a nonzero workload, preserved raw evidence, and finite `min`, `median`, `p95`, and `max` summaries. The latest validation covered 20 workload records and 260 summaries; the three flat Pixi filenames contain two unique payloads.

## Workload comparability

The three harnesses do not yet execute identical semantic workloads. The baseline is responsibility evidence, not a direct speedup denominator.

| Label | Compatibility baseline | Core v1 spikes |
| --- | --- | --- |
| generated-100 | one grid, 100 cells, 501 ManagedNodes | 100 flat entities |
| generated-500 | one grid, 506 cells, 2,501 ManagedNodes | 500 flat entities |
| generated-1,000 | one grid, 1,024 cells, 5,001 ManagedNodes | 1,000 flat entities |
| production | 458 top-level records, 9,336 expanded grid cells, 19,577 ManagedNodes | 458 top-level records represented as 458 flat entities |

The production baseline therefore includes expansion work that neither spike performs. Generated baseline entities also materialize four components per item. Any baseline-to-Core-v1 ratio would mix product-model removal with implementation speed and must not be presented as an apples-to-apples renderer speedup.

The update boundaries differ as well. The compatibility result separates synchronous update and explicit render. Flat Pixi separates synchronous store update from render and reports their total. Typed Canvas records `trustedBulkUpdate` and `validatedBulkUpdate` without a separate update-render field, so those values are treated as transaction-phase evidence rather than compared directly with Pixi's total. Hit-test units also differ: typed Canvas reports milliseconds per operation; flat Pixi reports a 128-operation batch in milliseconds.

## Compatibility responsibility evidence

Values are median milliseconds; the direct normalize/build probes overlap public load and are not additive.

| Scenario | Normalize | Managed-scene build | Public load | First render | ManagedNodes |
| --- | ---: | ---: | ---: | ---: | ---: |
| 100 | 0.8 | 22.7 | 48.8 | 12.2 | 501 |
| 500 | 0.6 | 95.2 | 154.6 | 12.8 | 2,501 |
| 1,000 | 1.0 | 182.8 | 370.0 | 27.7 | 5,001 |
| production | 60.9 | 1,265.1 | 2,076.5 | 2,039.8 | 19,577 |

The scene-build growth and object counts support the ManagedNode-removal hypothesis. Production noise is high: first-render median/p95 is 2,039.8/9,799.4 ms, trusted-update total is 3,907.4/13,487.7 ms, and animation-frame median/p95 is 90.5/975.6 ms. These values show responsibility pressure but are not stable release thresholds.

## Store and first-frame comparison

Each cell is median/p95 milliseconds. Flat Pixi values use the latest unique run. Compatibility load is shown for context only because its expanded workload is different.

| Workload | Compatibility load | Typed load | Typed first render | Pixi load | Pixi renderer init | Pixi first render | Pixi first-paint total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 48.8/55.7 | 0.1/0.3 | 1.6/1.8 | 0.6/0.9 | 28.4/31.3 | 23.3/32.8 | 54.6/61.2 |
| 500 | 154.6/159.3 | 0.5/0.7 | 1.8/2.3 | 1.8/1.8 | 25.0/27.5 | 26.2/34.9 | 51.2/62.4 |
| 1,000 | 370.0/396.0 | 0.4/1.0 | 1.8/10.4 | 2.4/2.6 | 21.3/21.9 | 33.4/34.2 | 53.8/55.5 |
| production-458 | 2,076.5/3,022.6 | 0.1/0.8 | 1.7/1.9 | 5.1/5.5 | 24.8/32.1 | 25.5/26.2 | 48.9/57.6 |

The comparable flat-entity spike rows favor Canvas2D on first render. At 100, 500, and 1,000 entities, its first-render medians are 14.6×, 14.6×, and 18.6× lower than the latest Pixi first-render medians. This excludes Pixi renderer initialization; including initialization widens the measured first-frame difference. The typed 1,000 p95 is a single 10.4 ms outlier, so the median advantage is clearer than tail stability.

## Update and animation comparison

Each cell is median/p95 milliseconds. Typed update metrics are the recorded transaction phase; Pixi render and total include renderer work.

| Workload | Typed trusted update | Typed validated update | Pixi sync update | Pixi update render | Pixi update total | Typed animation p95 | Pixi animation p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 0.0/0.0 | 0.0/0.3 | 0.1/0.1 | 5.1/5.2 | 5.2/5.3 | 0.2 | 10.0 |
| 500 | 0.0/0.1 | 0.0/0.0 | 0.6/1.0 | 11.2/15.9 | 11.8/16.9 | 0.6 | 11.6 |
| 1,000 | 0.0/0.1 | 0.1/0.3 | 0.7/0.7 | 19.7/21.7 | 20.4/22.3 | 0.7 | 15.9 |
| production-458 | 0.0/0.1 | 0.0/0.5 | 0.7/1.3 | 11.2/11.5 | 11.6/12.5 | 0.5 | 8.6 |

Many typed transaction samples quantize to 0 or 0.1 ms, so they establish only that the phase is below the current timer resolution for most samples. The more useful renderer discriminator is animation p95, where Canvas2D records 0.2–0.7 ms and the latest Pixi run records 8.6–15.9 ms.

Typed hit-test medians are 0–0.0016 ms/op. Dividing the latest Pixi 128-operation batch medians by 128 yields approximately 0.0031–0.0063 ms/op. This arithmetic normalization is directional only because the selection work and query setup are not proven identical.

## Raw-run noise

The flat Pixi directory contains two independent runs, not three: `latest-quick-4x.json` is byte-identical to the later timestamped file. The independent run medians changed materially:

| Workload | First-paint total | Update total | Animation frame | Teardown |
| --- | ---: | ---: | ---: | ---: |
| 100 | 120.7 → 54.6 | 7.4 → 5.2 | 13.3 → 4.2 | 2,967.2 → 469.3 |
| 500 | 157.8 → 51.2 | 32.1 → 11.8 | 24.0 → 9.1 | 2,601.1 → 269.0 |
| 1,000 | 179.5 → 53.8 | 51.8 → 20.4 | 39.4 → 14.8 | 1,356.7 → 339.0 |
| production-458 | 119.0 → 48.9 | 21.8 → 11.6 | 27.7 → 7.0 | 1,491.7 → 320.2 |

The direction improves uniformly but the magnitude, especially 4.0×–9.7× teardown variation, indicates a strong warm/cold or browser-lifecycle effect that this evidence does not isolate. The latest run also has p95/median noise ratios of 2.38 for 100-entity animation and 1.75 for 500-entity hit-test/selection. Pixi teardown must therefore remain a diagnostic, not a product gate.

Typed Canvas has only one preserved quick run. Its five-sample coverage is better within that run, but sub-millisecond timer quantization and the 1,000-entity first-render outlier prevent a strong tail-latency claim. Baseline and flat Pixi use three samples, so their reported p95 is effectively the observed maximum rather than a stable 95th-percentile estimate.

## Unresolved measurement limits

- No quick spike includes the required 2,000- and 5,000-entity checkpoints.
- Production comparison is structurally mismatched: 458 flat spike entities versus 9,336 expanded cells and 19,577 compatibility nodes.
- Typed Canvas records no retained-heap metric. Flat Pixi records zero retained-heap delta in every summary, which is not proof of zero retention. Baseline heap uses Chromium `performance.memory` with exposed GC and remains approximate.
- The JSON evidence contains no CPU profile, GC allocation trace, draw/upload byte count, or GPU timing. Aggregate surface counts do not prove minimal GPU upload.
- Measurements are macOS arm64 headless Chromium under 4× CPU throttling; the compatibility renderer identifies SwiftShader. They are development-proxy evidence only. Native low-end Windows remains pending.
- Headed pixel output, texture/text fidelity, browser input latency, and long-running animation stability are not established by these spikes.

## Implementation checkpoint

Proceed with a dense typed store, ID-to-slot index, generation-checked references, atomic batch transactions, explicit flush, dirty ranges, and pooled Canvas2D render commands. Keep renderer publication behind a narrow Core v1 boundary so profiling can replace the backend without exposing renderer objects in the public API. Preserve both flat Pixi unique result payloads as the rejected/provisional competitor.

Before promoting performance results beyond spike selection, run an identical normalized workload through both renderers, include 2,000 and 5,000 entities plus the fully expanded production workload, collect enough samples for meaningful p95, separate renderer construction from steady-state frames, add retained-object and GPU-upload diagnostics, and rerun the selected path in headed Chromium 4×. Native Windows approval remains explicitly pending.
