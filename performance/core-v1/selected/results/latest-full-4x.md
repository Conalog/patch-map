# Core v1 selected-path full performance checkpoint

- Mode: full; Chromium CDP CPU throttle 4×
- Warmups: 2; measured samples: 7
- Result JSON: performance/core-v1/selected/results/full-4x-2026-07-15T06-06-56-034Z.json
- Browser errors: 0; network failures: 0
- Core invariant smoke: {"entityCount":100,"firstFrameRendered":true,"firstFrameCommands":190,"atomicFailure":true,"destroyed":true,"idempotent":true}
- Production fixture: 1,317,998 bytes / 9afd9e179c613b3833acd99cbe0a747fe2068475dc14ab9dada5d512fdbd1a86; expanded 37,071 entities

| workload | entities | normalize median ms | load median ms | first flush median ms | trusted 10% commit+flush median ms | random 10% commit+flush median ms | animation frame p95 ms | hit-test median ms | select+flush median ms | destroy median ms | retained JS heap median bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| synthetic-100 | 100 | 0.40 | 2.60 | 2.50 | 1.20 | 1.40 | 1.30 | 0.80 | 1.50 | 0.10 | 8,660 |
| synthetic-500 | 500 | 0.80 | 11.30 | 4.20 | 5.50 | 5.30 | 2.70 | 1.80 | 4.10 | 0.10 | 112 |
| synthetic-1000 | 1,000 | 1.80 | 20.40 | 5.30 | 8.90 | 8.70 | 3.50 | 1.80 | 3.60 | 0.10 | 456 |
| synthetic-2000 | 2,000 | 3.60 | 41.50 | 7.00 | 16.30 | 14.10 | 4.50 | 1.40 | 6.00 | 0.10 | 312 |
| synthetic-5000 | 5,000 | 11.20 | 108.40 | 12.90 | 41.90 | 34.10 | 10.70 | 1.50 | 10.10 | 0.10 | 200 |
| production-37071 | 37,071 | 163.80 | 571.40 | 30.10 | 175.30 | 185.90 | 24.80 | 1.50 | 24.10 | 0.00 | 1,920 |

## Measurement limits

- Chromium 4× CPU throttling is a development proxy, not Windows-native approval; Windows native remains pending.
- Forced CDP GC and JSHeapUsedSize cover retained JavaScript heap only. DOM, Canvas2D backing stores, browser native allocations, and GPU memory are excluded, and signed deltas can be noisy.
- Canvas renderer commandCount records aggregate Canvas2D submissions, not GPU draw calls. A command may cover multiple logical rectangles, while text, bars, relations, and selection can submit multiple commands.
- CPU timings include browser main-thread and GC interruption but do not partition CPU from GC. GPU upload is not directly observable for this Canvas2D backend.
