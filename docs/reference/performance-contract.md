# PATCH MAP Performance Contract

Status: active  
Baseline owner: reference/oracle environment

## Goal

The rewrite must remove the object-count sensitivity observed on Windows and
lower-performance desktop hardware while preserving Level 1 and Level 2
behavior. Performance is measured against the frozen v0.10.0 package on the same
machine, browser build, viewport, fixture, and run configuration.

## Device Profiles

1. **Native target**: representative low-performance Windows desktop. This is
   the release decision source of truth.
2. **Throttled proxy**: headless Chromium with 4x CPU throttling and a
   1440x900 viewport. This is the repeatable development and CI comparison.
3. **Developer native**: unthrottled local Chromium. This detects large
   regressions but cannot replace the native target.

Record OS, CPU model, logical core count, memory, GPU, Node, Chromium, package
commit, viewport, device scale factor, throttle rate, and power mode with every
baseline. Pass the target machine and power setting with `--device-profile` and
`--power-mode`; do not leave them `unspecified` for release evidence.

## Canonical Workloads

### S1: Object scaling

Independently generate grids containing 100, 500, 1,000, 2,000, and 5,000 active
items. Every item uses a fixed-size background, non-animated bar, icon, and text
component. IDs and labels are deterministic.

Measure initial draw, final-state render cost, public scene-handle count, JS
heap after draw and after update, teardown time, and post-destroy heap for every
size. The standalone runner records public scene handles automatically. Record
backend render primitives separately through implementation-specific
instrumentation; a compatibility facade handle is not necessarily a render
primitive.

In the headless proxy, call `app.render()` immediately after `draw()` or
`update()` returns and record operation time, synchronous final-state render
time, and their total separately. Background/headless scheduling can delay the
next automatic ticker frame by seconds and is not a usable proxy metric. Native
scheduled-frame timing, visible-pixel timing, and screenshot equivalence belong
to the Windows oracle run.

### S2: Maintained-product fixture

Use the frozen representative fixture on the oracle side. Measure initial draw,
same-data redraw, clear-then-draw, fit, report-style redraw, and time to the first
frame at which consumers may safely read the scene.

The fixture itself is not automatically clean-room safe. Export it only after an
analysis owner confirms that it contains no excluded implementation material or
sensitive production data.

### S3: Update throughput and immediacy

Measure:

- one trusted bulk component update across all grid items;
- sequential per-item mixed component updates;
- bulk alpha/highlight updates;
- relation visibility and link refresh;
- update return time and next-visible-frame time.

The updated state must be observable before `update()` returns and visible on
the next rendered frame.

### S4: Interaction frame stability

Measure viewport pan/zoom, pointer hit testing, hover, box selection, paint
selection, transformer resize, and transformer rotation at 1,000 and 2,000
items. Capture frame intervals, long tasks, selected IDs, and final transforms.

## Statistics

- Run at least 2 warmups and 7 measured samples per scenario.
- Report raw samples plus median, p95, minimum, and maximum.
- Run reference and replacement in alternating order when hardware is shared.
- Close unrelated applications and use the same power mode.
- Treat a result as provisional when p95/median exceeds 1.35; rerun after
  identifying environmental noise.
- Compare relative results. Do not use one developer machine's absolute time as
  a cross-machine release gate.

## Rewrite Go/No-go Gates

On the native target and throttled proxy at 2,000 items:

- initial draw plus final-state render median and p95 must be at most 50% of the
  reference proxy; native draw-to-visible timing must meet the same relative
  gate;
- trusted bulk update plus final-state render median and p95 must be at most 50%
  of the reference proxy; native update-to-visible timing must meet the same
  relative gate;
- backend render-primitive count must be at most 50% of the reference, with the
  counting definition and instrumentation recorded for each backend;
- retained JS heap after draw must be at most 70% of the reference;
- interaction frame p95 must be at most 33.4ms, with no compatibility mismatch;
- the 100-item workload must not regress by more than 10% without an explicit
  accepted tradeoff.

If the vertical slice improves critical real workloads by less than 1.5x, stop
the full rewrite and return to targeted optimization. A 1.5x–2x result requires
an explicit cost/benefit decision. A 2x or better result with full behavior
conformance permits expansion to the full rewrite.

## Baseline Commands

The standalone low-end runner is the canonical scaling baseline:

```sh
npm run perf:low-end -- --cpu-throttle 4 --iterations 7 --warmups 2 \
  --device-profile "low-end-windows-a" --power-mode "best-performance"
```

The replacement runs the identical harness by selecting its browser entrypoint:

```sh
npm run perf:low-end -- --entry /src/index.js --label cleanroom-v2 \
  --cpu-throttle 4 --iterations 7 --warmups 2 \
  --device-profile "low-end-windows-a" --power-mode "best-performance"
```

Existing browser benchmarks remain useful for maintained-product scenarios:

```sh
npx vitest bench --project browser --browser.headless src/tests/perf/draw.bench.js
npx vitest bench --project browser --browser.headless src/tests/perf/update.bench.js
```

Baseline JSON is generated evidence, not source. Store it outside the approved
implementation handoff unless it has been reviewed and explicitly marked safe.
