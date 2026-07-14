# Implementation-safe Performance Runbook

Status: ready for an implementation worktree created from export v4

This runbook operates only on the implementation under test and the source-clean `scripts/perf/**` harness. It contains no oracle execution setup. Performance output is provenance metadata interpreted under `docs/implementation/comparison-contract.md`.

## Bootstrap

From the root of a fresh v4 export, install the exact harness dependencies and Chromium, then verify that every package script resolves to included tooling:

```sh
npm install --ignore-scripts
npx playwright install chromium
npm run perf:check
```

The exported `package.json` pins Playwright `1.57.0` and Vite `7.3.6`. `perf:check` is executable before implementation code is added. The oracle execution workspace retains Vite `7.3.1` for evidence reproducibility and is not part of this bootstrap.

## Run the implementation

Add or mount the implementation under test in this worktree and expose a browser module that publicly exports `Patchmap`. For an entry at `src/index.js`, run the source-clean scaling harness directly:

```sh
npm run perf:low-end -- --entry /src/index.js --label cleanroom-implementation --commit implementation-under-test --cpu-throttle 4 --iterations 7 --warmups 2 --device-profile "implementation-windows-a" --power-mode "best-performance" --output artifacts/performance/implementation-throttled.json
```

For a native Windows candidate on the same implementation device, use `--cpu-throttle 1` and a distinct output file. Keep the exact entry, implementation revision, device profile, Windows power mode, browser version, raw samples, and summary statistics in the report. This does not satisfy the pending native Windows oracle gate by itself.
