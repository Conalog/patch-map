# Core v2 Native Release Qualification

## Purpose

This checkpoint keeps local development evidence separate from release approval.
`npm run verify:release-readiness:core-v2` hashes the current local candidate
artifacts and reports the still-missing external cells. The strict command exits
nonzero until a digest-bound native manifest passes:

```text
npm run verify:release-readiness:core-v2
npm run generate:release-manifest:core-v2 -- --output performance/core-v2/results/native-release-manifest.json
npm run verify:release-readiness:core-v2:strict -- --native-manifest <path>
```

The verifier reads the approved decision fixtures directly. It does not rewrite
fixtures, normalized expected observations, review evidence, or comparisons.

## Required runtime cells

The release matrix contains exactly eight headed WebGL2 cells:

| OS | Chrome | Edge |
| --- | --- | --- |
| Windows 10 | latest-1, latest | latest-1, latest |
| Windows 11 | latest-1, latest | latest-1, latest |

Each cell records the exact browser executable/version and uses a stable ID such
as `windows-11-edge-latest`. A current installed browser may use
`--channel=chrome` or `--channel=msedge`; a preserved latest-1 browser uses its
exact `--executable-path`. The native marker refuses to run outside Windows,
without a headed browser, or without a pinned browser target.

```powershell
$cell = "windows-11-edge-latest"
$root = "performance/core-v2/results/native/$cell"

$env:CORE_V2_BROWSER_OUTPUT = "$root/browser-functional.json"
node scripts/verification/core-v2-browser.mjs `
  --native-windows --headed --channel=msedge --cell-id=$cell

$env:CORE_V2_MANUAL_LAB_OUTPUT = "$root/manual-lab-functional.json"
node scripts/verification/core-v2-manual-lab-browser.mjs `
  --all-routes --native-windows --headed --channel=msedge --cell-id=$cell

node performance/core-v2/contract-run.mjs `
  --native-windows --headed --channel=msedge --cell-id=$cell --output-dir=$root

$env:CORE_V2_MEMORY_ARTIFACT_DIR = $root
node scripts/verification/core-v2-memory.mjs `
  --native-windows --headed --channel=msedge --cell-id=$cell
```

Every owned browser, context, page, and temporary server closes in `finally`.
The persistent user dogfood server is not used by these commands.

Set `CORE_V2_CODE_COMMIT` to the exact 64-hex candidate before generating or
running evidence. For a `latest-1` cell, replace `--channel` with the preserved
browser's exact `--executable-path`. The memory runner refuses a native marker
outside Windows, in headless mode, without an exact browser target/cell ID, or
when WebGL2 resolves to a software renderer. It records ten ownership cycles
and a forced-GC window around those cycles; the ordinary local proxy retains
its established two-warmup/seven-measured plus nine ownership-cycle protocol.

## Approved target performance profile

Performance runs must use the exact `windows-low-end-n100-8g-v1` fixture:

- Windows 11 24H2 x64, cumulative build recorded;
- Intel Processor N100, 4 cores/4 threads;
- 8 GiB single-channel DDR4-3200;
- Intel UHD Graphics for Alder Lake-N, exact driver recorded;
- 1920×1080 at 60 Hz, 1280×720 CSS viewport, DPR 1, 100% OS scale
  and browser zoom;
- headed hardware-accelerated WebGL2;
- AC power, Windows Balanced mode, battery saver off, physical
  non-remote/non-VM execution, and at least five minutes cooldown per cell.

Every workload keeps two warmups and seven measured samples. Release budgets are
frame-gap p95 at most 33 ms, action-to-visible p95 at most 50 ms, no task at or
above 100 ms, dropped-frame ratio at most 0.02, forced-GC growth at most 2 MiB
after ten lifecycle cycles, zero canvas/listener/ticker/texture ownership delta,
and at most 10% regression against the frozen baseline.

## Native manifest boundary

The manifest schema is `core-v2-native-release-evidence/1`. The strict verifier
requires:

- the implementation commit, packed-package digest, exact PixiJS v8,
  TypeScript, bundler, and CSP profile;
- all eight cells with 173 actual cases, two fresh sessions, identical stable
  actuals, zero browser errors, and zero cleanup-owner delta;
- headed NVDA version and trace for every supported Chrome/Edge cell;
- real mouse, precision trackpad, keyboard, browser zoom, host CSS transform,
  scroll, and DPR-change traces;
- an honest `not-present-on-device` result or real capable Windows-device
  evidence for touch, pen, and multi-pointer—simulation cannot approve them;
- raw performance and lifecycle artifacts for every cell;
- packed, non-mock production-host execution of all 38 journeys;
- security/audit evidence, schema roundtrip, one-authority canary stages
  1% → 10% → 50% → 100%, rollback rehearsal, and independent review.

Every referenced artifact has a workspace-relative path and SHA-256. Paths into
dependencies, build output, bundles, or source maps are rejected. The current
local report intentionally remains `pending-external-evidence` until those
hardware, assistive-technology, production-host, migration, and review artifacts
exist.

The generated pending manifest reserves five unique digest roles per browser
cell: `functional`, `nvda`, `inputs`, `performance`, and `lifecycle`. It also
reserves unique `actual-host`, `security`, `migration`, and `review` roles.
The strict verifier rejects missing roles, role substitution, duplicate
artifacts, digest drift, placeholder exact-version values, candidate/package
drift, null numeric observations, headless/WebGPU substitution, budget
regression, nine-cycle lifecycle evidence, mock-host evidence, and pending
review. `npm run verify:native-release-probes:core-v2` proves one complete
digest-bound synthetic manifest can pass and that every declared drift class
fails without modifying approved expected evidence.
