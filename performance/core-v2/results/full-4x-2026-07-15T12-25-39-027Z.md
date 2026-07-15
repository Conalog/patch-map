# PATCH MAP Core v2 full performance checkpoint

- Result JSON: performance/core-v2/results/full-4x-2026-07-15T12-25-39-027Z.json
- Protocol: 2 warmups, 7 measured trials, Chromium 4x CPU throttle
- Scales: 100, 500, 1000, 2000, 5000, production
- Selected strategy: mesh
- Browser errors: 0 console, 0 page, 0 network
- WebGL: webgl2; ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)
- WebGPU adapter: unavailable
- Windows native: pending

| role | strategy | scale | expanded entities | normalize median ms | store load median ms | renderer build median ms | GPU prepare median ms | first frame median ms | pan/zoom trial-p95 p95 ms | full bar schedule median ms | full bar trial-p95 p95 ms | partial bar schedule median ms | partial bar trial-p95 p95 ms | text change median ms | hit/op median ms | select median ms | destroy median ms | re-init median ms | retained JS heap median bytes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| spike | mesh | 100 | 509 | 8.20 | 10.50 | 7.00 | 4.90 | 19.30 | 1.10 | 1.90 | 4.30 | 0.10 | 1.30 | 4.50 | 0.0054 | 1.90 | 11.30 | 23.40 | 132,964 |
| spike | particle | 100 | 509 | 8.00 | 10.50 | 10.70 | 5.70 | 28.10 | 1.00 | 1.90 | 16.20 | 0.70 | 7.90 | 3.80 | 0.0060 | 1.70 | 26.40 | 21.50 | 39,216 |
| spike | mesh | 500 | 2,549 | 37.60 | 44.80 | 22.70 | 6.20 | 51.80 | 1.50 | 7.80 | 11.20 | 1.70 | 2.30 | 12.00 | 0.0068 | 5.50 | 22.30 | 28.10 | 33,884 |
| spike | particle | 500 | 2,549 | 36.90 | 44.80 | 39.00 | 7.70 | 121.50 | 1.30 | 7.00 | 68.10 | 1.90 | 40.80 | 15.60 | 0.0070 | 7.60 | 56.80 | 23.80 | 27,768 |
| spike | mesh | 1000 | 5,099 | 76.30 | 85.40 | 44.00 | 7.70 | 86.00 | 1.30 | 13.40 | 19.70 | 2.40 | 3.40 | 40.80 | 0.0083 | 10.40 | 35.60 | 21.90 | 26,812 |
| spike | particle | 1000 | 5,099 | 70.50 | 83.00 | 73.50 | 10.70 | 193.50 | 1.20 | 12.70 | 116.70 | 3.00 | 58.20 | 31.00 | 0.0077 | 15.70 | 74.00 | 23.80 | 28,156 |
| spike | mesh | 2000 | 10,199 | 156.50 | 161.10 | 73.60 | 8.70 | 164.00 | 1.80 | 26.20 | 49.30 | 6.30 | 22.60 | 43.50 | 0.0102 | 20.90 | 66.50 | 22.70 | 24,172 |
| spike | particle | 2000 | 10,199 | 145.20 | 162.70 | 126.20 | 15.40 | 311.50 | 1.30 | 37.70 | 204.80 | 5.60 | 155.70 | 62.80 | 0.0102 | 35.10 | 120.10 | 24.40 | 29,732 |
| spike | mesh | 5000 | 25,499 | 381.70 | 391.60 | 151.20 | 11.70 | 373.10 | 4.90 | 140.80 | 88.50 | 9.20 | 14.70 | 106.70 | 0.0150 | 51.60 | 187.80 | 24.50 | 36,832 |
| spike | particle | 5000 | 25,499 | 338.50 | 383.30 | 281.80 | 15.00 | 696.00 | 2.80 | 63.90 | 415.50 | 15.30 | 375.20 | 150.30 | 0.0162 | 76.90 | 273.70 | 22.70 | 66,256 |
| spike | mesh | production | 37,071 | 344.30 | 559.20 | 69.80 | 7.30 | 40.80 | 5.40 | 95.20 | 49.30 | 12.90 | 6.20 | 5.00 | 0.0042 | 5.80 | 41.80 | 23.60 | 22,556 |
| spike | particle | production | 37,071 | 358.20 | 581.50 | 186.40 | 14.00 | 370.40 | 3.00 | 107.10 | 388.10 | 25.30 | 403.30 | 110.50 | 0.0039 | 50.50 | 122.60 | 23.60 | 24,624 |
| selected | mesh | 100 | 509 | 8.00 | 10.40 | 6.20 | 5.10 | 19.00 | 1.00 | 1.70 | 2.60 | 0.40 | 1.40 | 4.50 | 0.0055 | 2.10 | 11.80 | 20.70 | 24,952 |
| selected | mesh | 500 | 2,549 | 36.60 | 44.20 | 21.80 | 6.60 | 51.70 | 1.30 | 8.40 | 12.40 | 2.20 | 2.20 | 12.90 | 0.0071 | 5.60 | 25.40 | 29.00 | 23,480 |
| selected | mesh | 1000 | 5,099 | 71.50 | 83.70 | 42.40 | 7.60 | 87.00 | 1.60 | 13.80 | 21.40 | 2.30 | 25.40 | 21.80 | 0.0083 | 10.80 | 41.80 | 21.40 | 26,032 |
| selected | mesh | 2000 | 10,199 | 148.20 | 165.90 | 72.40 | 8.60 | 168.50 | 2.10 | 26.90 | 86.80 | 6.30 | 7.20 | 44.40 | 0.0104 | 22.20 | 81.80 | 25.90 | 22,488 |
| selected | mesh | 5000 | 25,499 | 324.70 | 381.30 | 151.70 | 11.80 | 430.90 | 4.30 | 62.10 | 110.90 | 14.10 | 14.90 | 106.50 | 0.0170 | 53.60 | 205.80 | 24.70 | 23,540 |
| selected | mesh | production | 37,071 | 400.40 | 567.10 | 70.00 | 7.60 | 44.30 | 5.60 | 98.40 | 32.30 | 12.80 | 8.50 | 4.40 | 0.0043 | 6.30 | 40.90 | 23.30 | 22,692 |

## Measurement limits

- Chromium with CDP 4x CPU throttling is a development proxy. Native low-end Windows measurement remains pending.
- Retained JS heap excludes DOM, browser-native, texture, and GPU allocations; the harness owns the per-trial collection method recorded in each raw trial.
- GPU timing is public-lifecycle wall time around prepare/render work, not a vendor GPU timestamp query.
- The selected rows are independent final-candidate trials, not aliases of spike samples.
