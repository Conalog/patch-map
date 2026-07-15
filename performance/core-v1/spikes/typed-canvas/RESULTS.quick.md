# Typed Canvas spike results

Mode: quick; Chromium CPU throttle: 4×; warmups: 2; measured runs: 5; contract checks: pass.

| workload | entities | load median/p95 | first render median/p95 | trusted update median/p95 | validated update median/p95 | animation frame median/p95 | hit/select median/p95 | teardown median/p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 100 | 0.100/0.300 | 1.600/1.800 | 0.000/0.000 | 0.000/0.300 | 0.000/0.200 | 0.000/0.011 | 0.100/0.300 |
| 500 | 500 | 0.500/0.700 | 1.800/2.300 | 0.000/0.100 | 0.000/0.000 | 0.000/0.600 | 0.002/0.006 | 0.000/0.000 |
| 1000 | 1000 | 0.400/1.000 | 1.800/10.400 | 0.000/0.100 | 0.100/0.300 | 0.100/0.700 | 0.002/0.013 | 0.000/0.400 |
| production-458 | 458 | 0.100/0.800 | 1.700/1.900 | 0.000/0.100 | 0.000/0.500 | 0.000/0.500 | 0.002/0.008 | 0.000/0.100 |

All values are milliseconds; hit/select is milliseconds per operation. Raw samples are preserved in the adjacent JSON. Canvas2D exposes no portable GPU-upload counter. Windows-native measurement is pending.
