# Core v1 selected-path quick performance checkpoint

- Mode: quick; Chromium CDP CPU throttle 4×
- Warmups: 1; measured samples: 3
- Result JSON: performance/core-v1/selected/results/quick-4x-2026-07-15T06-33-11-422Z.json
- Browser errors: 0; network failures: 0
- Core invariant smoke: {"entityCount":100,"firstFrameRendered":true,"firstFrameCommands":190,"atomicFailure":true,"destroyed":true,"idempotent":true}
- Production fixture: 1,317,998 bytes / 9afd9e179c613b3833acd99cbe0a747fe2068475dc14ab9dada5d512fdbd1a86; expanded 37,071 entities

| workload | entities | normalize median ms | load median ms | first flush median ms | trusted 10% commit+flush median ms | random 10% commit+flush median ms | animation frame p95 ms | post-update hit-test median ms | select+flush median ms | destroy median ms | retained JS heap median bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| synthetic-100 | 100 | 0.10 | 2.60 | 2.10 | 0.90 | 0.80 | 1.30 | 1.90 | 0.90 | 0.00 | 24,016 |
| synthetic-1000 | 1,000 | 2.10 | 23.20 | 7.00 | 4.90 | 5.20 | 4.90 | 3.50 | 4.50 | 0.10 | 23,580 |
| production-37071 | 37,071 | 153.30 | 644.90 | 28.50 | 54.00 | 46.50 | 35.60 | 16.30 | 23.90 | 0.30 | 7,636 |

## Measurement limits

- Chromium 4× CPU throttling is a development proxy, not Windows-native approval; Windows native remains pending.
- Forced CDP GC and JSHeapUsedSize cover retained JavaScript heap only. DOM, Canvas2D backing stores, browser native allocations, and GPU memory are excluded, and signed deltas can be noisy.
- Canvas renderer commandCount records aggregate Canvas2D submissions, not GPU draw calls. A command may cover multiple logical rectangles, while text, bars, relations, and selection can submit multiple commands.
- CPU timings include browser main-thread and GC interruption but do not partition CPU from GC. GPU upload is not directly observable for this Canvas2D backend.
- Spatial membership is updated lazily at the first post-geometry hit-test; the post-update hit metric includes that refresh boundary.
