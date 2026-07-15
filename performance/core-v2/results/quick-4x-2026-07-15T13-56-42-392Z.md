# PATCH MAP Core v2 quick performance checkpoint

- Result JSON: performance/core-v2/results/quick-4x-2026-07-15T13-56-42-392Z.json
- Protocol: 2 warmups, 7 measured trials, Chromium 4x CPU throttle
- Scales: 100, 1000
- Selected strategy: mesh
- Browser errors: 0 console, 0 page, 0 network
- WebGL: webgl2; ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)
- WebGPU adapter: unavailable
- Windows native: pending

| role | strategy | scale | expanded entities | normalize median ms | store load median ms | renderer build median ms | GPU prepare median ms | first frame median ms | pan/zoom trial-p95 p95 ms | hidden-bar visibility setup median ms | full bar schedule median ms | full bar trial-p95 p95 ms | partial bar schedule median ms | partial bar trial-p95 p95 ms | text change median ms | hit/op median ms | select median ms | destroy median ms | re-init median ms | retained JS heap median bytes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| spike | mesh | 100 | 509 | 8.40 | 10.10 | 6.30 | 5.10 | 18.20 | 1.10 | 0.00 | 1.90 | 2.70 | 0.20 | 2.30 | 5.30 | 0.0055 | 1.90 | 10.50 | 22.90 | 142,996 |
| spike | particle | 100 | 509 | 8.20 | 10.40 | 11.30 | 5.40 | 28.40 | 1.10 | 0.00 | 1.60 | 16.10 | 0.20 | 7.90 | 4.60 | 0.0062 | 1.50 | 27.10 | 21.50 | 39,080 |
| spike | mesh | 1000 | 5,099 | 76.70 | 85.10 | 44.30 | 7.50 | 81.50 | 1.20 | 0.00 | 11.00 | 20.30 | 3.00 | 10.00 | 24.00 | 0.0084 | 8.90 | 32.10 | 36.80 | 34,604 |
| spike | particle | 1000 | 5,099 | 72.90 | 84.70 | 73.50 | 10.50 | 190.90 | 1.20 | 0.00 | 10.80 | 116.20 | 2.70 | 59.20 | 28.50 | 0.0084 | 15.40 | 76.20 | 23.30 | 24,464 |
| selected | mesh | 100 | 509 | 8.10 | 10.40 | 6.50 | 5.70 | 19.30 | 1.00 | 0.00 | 1.80 | 2.00 | 0.20 | 1.10 | 5.00 | 0.0059 | 2.30 | 11.60 | 21.40 | 26,740 |
| selected | mesh | 1000 | 5,099 | 73.30 | 84.70 | 45.10 | 7.90 | 84.90 | 1.30 | 0.00 | 10.60 | 21.40 | 2.30 | 1.40 | 24.20 | 0.0081 | 10.20 | 35.00 | 38.90 | 25,248 |

## Measurement limits

- Chromium with CDP 4x CPU throttling is a development proxy. Native low-end Windows measurement remains pending.
- Retained JS heap excludes DOM, browser-native, texture, and GPU allocations; the harness owns the per-trial collection method recorded in each raw trial.
- GPU timing is public-lifecycle wall time around prepare/render work, not a vendor GPU timestamp query.
- The selected rows are independent final-candidate trials, not aliases of spike samples.
