# Keyed alpha implementation checkpoint

Scope: [presentation layers](presentation-layers.md), including their unused
render path. This is a bounded regression checkpoint, not full platform or
active-effect performance qualification.

## Correctness and ownership

Flutter 3.47.6 focused tests passed: 9 pure-layer, 5 low-level paint, 4 render-plan,
7 public widget cases. Existing session/widget 24 and static-plan 15 checks passed;
bar/relation/text 31 and rectangle 6 checks were reused from this change's focused
implementation verification. Analysis reported no issues. The extracted artifact
consumer passed public API draw/layer/update/clear/removal/reattachment and asset
loading checks; documentation verification passed.

Pixels cover alpha multiplication, content overlap, one member of a 100-item static
chunk, component-only effects, clear and exact restoration. Public tests cover
latest value retention, invalid/accepted replacement, draw-then-layer ordering,
inactive latest state/resume, selection/hit at alpha 0, filters and reattachment.

Independent review found redundant static alpha mesh preparation on ordinary
value publications. Identical chunks and opacity now share ref-counted variants;
a bar update preserves variant identity, and prior-plan disposal cannot invalidate
the new plan. No unresolved P1/P2 review finding remains. Effect setters preserve
the existing request/submission authority and do not mutate data/resource keys.

## Matched unused-path profile

SM-S936N, Android 16, Flutter 3.47.6 profile AOT/arm64, existing project runner and
host. Baseline library equals 14bd9f11; candidate includes keyed layers but the
workload never invokes them. Regular 10,000 panels, full mixed number/bar changes,
overview, normal 200ms bar animation. AB then BA: 4 fresh-process runs, each one cold,
two warmups and three measured requests (12 measured requests total). Profiler
and timeline disabled; fixed clock/thermal audits passed; every final 10,000-value
comparison matched. CPU is process CPU time through the matched drain window,
not utilization percentage or CPU time of only synchronous admission.

Values below are medians of the two per-run measured medians.

| Metric | Baseline | Candidate | Delta |
| --- | ---: | ---: | ---: |
| Input to submitted update |403.946ms|384.933ms|−19.013ms|
| Process CPU time |898.5ms|884.0ms|−14.5ms|
| Per-request frame p95 |168.697ms|162.898ms|−5.799ms|
| First UI frame work |128.443ms|122.528ms|−5.915ms|
| First raster work |39.804ms|39.863ms|+0.060ms|

No repeated adverse shift was observed. Paired CPU changes were +92ms and −121ms;
this is evidence against an observable regression in this condition, not a
speedup claim. This heavy workload already misses frame budgets. The result does
not establish smoothness for all workloads, active effects, iOS or WebView parity.

## Evidence and reproducibility

Artifacts are ignored under
`.artifacts/performance/flutter/presentation-layers3476-20261026/`:
`measurement-contract.json`, `summary.json`, raw per-run results and clock/thermal
audits, `candidate-snapshot.json`, `after-identity.json`, `evidence-sha256.json`,
`final-source-comparison.json`, and `cleanup.json`.

- Baseline APK SHA256: `3e8aefe104b52ccd77af9a203637afbd2d2c4335e546da17a964ccc1476bb20e`.
- Candidate APK SHA256: `71d2ca22580084b4693bf425d64cd5d49141222d90e8e9069db2b7bf5d7f72fb`.
- Final source differs only by braces around an unchanged exception guard in
  `_PresentationMesh.release`; the benchmark never enters that guard. The exact
  source diff is preserved, rather than claiming byte-identical final sources.
- Original installed APK was restored by hash, fixed-performance mode disabled,
  and task processes/forwarding removed.
- Package host report: `.artifacts/flutter/installed-consumer-ozydCI/report.json`.
  The later braces/document formatting changes introduce no API/behavior change;
  final source analysis and the 7-case widget run passed afterward.

No further broad matrix was run: the remaining release gates stay with
[delivery coverage](coverage.md).
