# PATCH MAP Core v2 quick performance checkpoint

- Result JSON: performance/core-v2/results/quick-4x-2026-07-15T12-14-50-012Z.json
- Protocol: 2 warmups, 7 measured trials, Chromium 4x CPU throttle
- Scales: 100, 1000
- Selected strategy: mesh
- Browser errors: 0 console, 0 page, 0 network
- WebGL: webgl2; ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)
- WebGPU adapter: unavailable
- Windows native: pending

| role | strategy | scale | expanded entities | normalize median ms | store load median ms | renderer build median ms | GPU prepare median ms | first frame median ms | pan/zoom trial-p95 p95 ms | full bar schedule median ms | full bar trial-p95 p95 ms | partial bar schedule median ms | partial bar trial-p95 p95 ms | text change median ms | hit/op median ms | select median ms | destroy median ms | re-init median ms | retained JS heap median bytes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| spike | mesh | 100 | 509 | 9.70 | 10.90 | 6.80 | 5.90 | 20.70 | 1.00 | 2.00 | 4.40 | 0.60 | 3.30 | 5.10 | 0.0059 | 2.10 | 12.90 | 25.60 | 133,216 |
| spike | particle | 100 | 509 | 7.90 | 9.90 | 10.50 | 5.20 | 28.00 | 0.90 | 1.80 | 13.60 | 0.60 | 7.50 | 4.70 | 0.0057 | 1.60 | 26.90 | 21.30 | 38,812 |
| spike | mesh | 1000 | 5,099 | 74.80 | 83.80 | 38.80 | 8.00 | 84.30 | 1.50 | 13.20 | 20.50 | 2.70 | 3.50 | 39.70 | 0.0085 | 8.20 | 33.50 | 22.10 | 33,964 |
| spike | particle | 1000 | 5,099 | 70.50 | 84.20 | 72.80 | 11.00 | 193.00 | 1.20 | 13.10 | 119.30 | 3.10 | 58.50 | 30.40 | 0.0083 | 15.90 | 73.10 | 23.80 | 26,516 |
| selected | mesh | 100 | 509 | 7.90 | 10.30 | 5.80 | 5.30 | 19.00 | 1.20 | 1.90 | 1.80 | 0.20 | 1.40 | 4.40 | 0.0061 | 2.00 | 11.60 | 20.80 | 25,372 |
| selected | mesh | 1000 | 5,099 | 72.30 | 82.70 | 42.30 | 7.70 | 85.10 | 1.40 | 12.80 | 21.00 | 2.90 | 24.10 | 23.30 | 0.0084 | 10.60 | 36.40 | 21.20 | 24,864 |

## Measurement limits

- Chromium with CDP 4x CPU throttling is a development proxy. Native low-end Windows measurement remains pending.
- Retained JS heap excludes DOM, browser-native, texture, and GPU allocations; the harness owns the per-trial collection method recorded in each raw trial.
- GPU timing is public-lifecycle wall time around prepare/render work, not a vendor GPU timestamp query.
- The selected rows are independent final-candidate trials, not aliases of spike samples.
