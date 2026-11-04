# Experiment-to-package performance checkpoint

October20,2026; production snapshot `0153a107`; Flutter3.47.6 profile AOT, SM-S936N, Impeller Vulkan. This is a
diagnosis, not an optimization or release qualification. That package snapshot had a material input-to-submission
regression against the October19 specialized experiment in text-free bar updates. Later work is indexed in [delivery coverage](coverage.md).

The preceding manual-device check fixed a stale-vsync animation skip by sampling monotonic time at callback
execution. A regression test and video show the200ms transition again; submission still does not await its end.
The mode-separated full-width host retained331–403ms bar latency. Evidence is under
`.artifacts/performance/flutter/native-bar-regression-device-20261020/`.

## Comparison boundary

One comparison host runs the historical implementation through a private fixture adapter and the current package
through its public API. Both receive the same 10,000 panels,100 managed SVGs, ordered regular/varied groups,
seed, camera, viewport and full-width bars. Number scenes retain full-height bars; bar scenes contain no text;
mixed scenes contain both. Input generation/conversion, initial preparation and final-value inspection are
outside the request clock. Initial preparation is excluded because the historical adapter still prepares its
original fixture before replacing it. The adapter disables the historical low-zoom text hide rule for the common
fixture.

The legacy full-scalar input and package component-update representations retain their respective API contracts.
Both validate complete input and complete after the changed paint submission, without waiting for the200ms bar
animation to end. Process CPU includes animation tail and selected raster completion, plus the same400ms camera
activity in zoom/pan conditions. It is accumulated process CPU time, not wall- clock latency. FrameTiming p95
does not capture all synchronous input work before a frame begins.

The primary matrix has120 requests:2 layouts ×3 modes ×2 views ×2 runtimes, with2 warmups and3 measured requests
per condition. Thirty additional requests reverse the grid/bar/zoom order and examine0%/1% changes within full
input. Thirty requests restart the process separately for each runtime/mode. All180 requests have complete
timing windows and no failures;36 final-value checks each match10,000 items. Screenshots supplement these
checks; value equality alone does not establish visual equivalence. Stage/CPU diagnostics use a separate APK and
are not pooled into the ordinary performance results.

## Text-free bar evidence

Medians; all rows change10,000 bars. The fresh-process row independently removes prior-scene retention as an
explanation for the large response gap.

| Condition | Historical response ms | Native response ms | Historical CPU ms | Native CPU ms | Historical frame p95 ms | Native frame p95 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Regular overview |68.1|255.2|398|580|45.3|20.3|
| Regular zoom/pan, fresh process |54.0|358.0|301|749|7.7|4.3|
| Varied overview |44.3|411.2|364|930|47.7|26.6|
| Varied zoom/pan |31.1|365.2|316|782|10.1|4.3|

Fresh-process response ranges are51.1–55.3ms historical and335.9–396.2ms native. The reversed-order grid/bar run
also reproduces46.3→328.3ms. With full input but 0% changed values, response is21.1→67.2ms; with1% changed it
is37.5→88.5ms. CPU in those sparse cases still includes the common camera activity.

Faster native frame execution does not cancel the304ms fresh-process response regression: the user waits before
the new drawing is submitted. These results do not establish display-presentation latency or smoothness in every
condition.

## Located costs and interpretation

One318ms native bar request, traced without CPU sampling, spends approximately 54ms in admission,56ms in bar
validation,10ms composing pending work,35ms resolving execution state,40ms preparing/projecting geometry,45ms
compiling draw nodes, 34ms comparing asset metadata and23ms constructing the render plan. First paint CPU
is0.24ms in that trace; this is not GPU execution time. Three stage traces range318–508ms. The stages locate
work, not a guaranteed removable time budget.

Source and CPU evidence identify these paths:

- `MapBackend.validateUpdate` resolves bar patches, validates colors and calls
  `ItemLayout.compile`. Execution later resolves against current state again;
  geometry preparation constructs another layout. Validation results are not
  retained as reusable proofs.
- `GeometrySnapshot.prepare/project` and the draw compiler prepare changed items
  through general component/layout paths even for height/tint-only changes.
- Asset-free updates still compare generated asset-target and creation-key lists.
  `RenderPlan._updateRetained` constructs static-member candidates before proving
  that existing static batches can be reused. The static mesh itself is reused;
  it is incorrect to claim every bar update rebuilds every mesh.
- CPU samples corroborate admission, validation, resolution and geometry work,
  including map operations and CSS color parsing. Inclusive samples overlap and
  must not be added as independent percentages.

The historical experiment already implemented full-input validation, diff, atomic publication and paint- based
completion. Those requirements alone do not explain the regression. Its fixed `Leaf/DisplayValue` structures did
not cover the package's entire general schema, addressing, reset/merge, partial-failure and lifecycle contract.
Necessary generality and avoidable repeated derivation are both present. Rendering optimizations survived
integration, but that snapshot's preparatory pipeline did not limit enough work to the changed dependencies.

The diagnosis proposed reusable normalization/validation proofs, field-specific dependency invalidation, and
reuse of static/resource identity without rebuilding candidate lists. Execution must still resolve queued
changes against current state; these proposals must not freeze speculative pending state or remove validation,
atomicity, text/SVG bounds or overlap guarantees. They require a subsequent implementation and matched
performance check. No speed target or removable fraction is established by this diagnosis alone.

## Text comparability and unresolved risks

Visual inspection found that the historical `Spec` lacks `breakWords`. Flutter emergency wrapping splits long
numbers and can retain a larger auto font. Native `NativeTextLayout._wrap` keeps an unbreakable number intact
when `breakWords:false`, matching JavaScript `segmentation-wrapping.ts`; the existing `text_layout_test.dart`
explicitly checks this behavior. The historical experiment does not implement that schema policy completely. It
is not evidence that native should restore emergency number wrapping.

Number/mixed timing observations are preserved, but are not equivalent-output regression ratios: line count,
font size and atlas/Paragraph eligibility differ. An aligned text-policy baseline remains necessary. Bar
evidence avoids this confound. Small border/stroke raster differences remain in the adapted prototype; pixel-
identical output is not asserted.

Fresh-process bar PSS is385.1→566.9MiB and Android `summary.graphics` is 195.5→235.0MiB. These are process
accounting observations, not peak memory, exclusive package GPU allocation or leak proof. Long single-process
matrix PSS increases across scenarios; allocator/engine caches and prior-scene resources are not separated.
Fresh-process runs address the response confound, not the underlying memory attribution.

The instrumented host encountered one native SIGSEGV during number-to-mixed replacement. Subsequent
[symbolication and mitigation](native-crash-checkpoint.md) identified the premature null-field read in AOT
component projection; this is no longer an unexplained GPU/device failure. Three measured samples per condition
and one Android device support the large regression finding, not small rankings or universal qualification.

Exact sources, APK identities, runners, raw results, Timeline/CPU traces, screenshots, crash evidence and the
Korean report are preserved under `.artifacts/performance/flutter/decision-parity3476-device-20261020/`. The
original manual profile app was restored after measurement.
