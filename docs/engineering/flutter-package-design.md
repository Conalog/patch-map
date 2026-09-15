# Flutter package architecture

- Status: independent Dart/Canvas implementation selected and implemented.
- Contract baseline: npm `1.0.0-alpha.7` from `release/1.0`.
- Goal: npm and Flutter packages provide the same documented capabilities with
  independently owned runtimes, performance and release versions.

## Package ownership

The repository manages two peer packages:

| Owner | Responsibility |
| --- | --- |
| `packages/javascript/` | TypeScript engine, Pixi renderer, npm manifest, package tests, browser examples and JavaScript performance tools |
| `packages/flutter/` | Dart engine, Canvas renderer, pubspec, package tests and native example |
| `docs/` | Shared public behavior and platform binding documentation |
| `conformance/` | Versioned contracts, common command inputs and expected observations |
| `verification/flutter/` | Cross-package conformance, native verification and evidence collection |

The root is a private workspace coordinator, not either published package. The
[implementation structure](flutter-implementation-plan.md) owns exact build,
verification and release paths. Package consumers install only the artifact for
their platform. Neither package imports or executes the other package at runtime;
asset and fixture copying belongs to development or build steps.

[Public documentation](../README.md) owns shared behavior. Exported TypeScript
declarations define JavaScript API shapes, and the [Flutter binding](../integration/flutter.md)
defines their Dart counterparts. Implementations may use different algorithms and
internal classes. Changes to product semantics update the shared authority and
both implementations' conformance cases in one review.

## Dart and Canvas responsibilities

Dart owns dataset admission, transaction/history, geometry, hit testing,
viewport/interaction, presentation and asset lifecycle. The controller decides
semantic and presentation state; the renderer consumes that state and draws it.
Each instance has one state, publication, frame scheduling and cleanup owner.
Flutter widget rebuilds do not recreate the controller.

The Canvas adapter draws aggregate vertex buffers instead of creating a Widget
for each bar. Batch boundaries preserve paint order. Existing geometry and buffer
storage are reused for updates where possible, while viewport changes apply the
view transform. Text, images and vectors use the same publication lifecycle.
Repaints are requested for invalidations and active animations; idle instances do
not require a continuous game loop. Capture owns its explicit readback path.

The runtime uses Flutter `CustomPainter` and `Canvas`, with no embedded JavaScript
engine, WebView or Flame dependency. This is the selected architecture, not a
claim that every alternative renderer is slower. Retired candidate experiments
are not part of the maintained repository. Current work measures and improves the
shipping TypeScript/Pixi and Dart/Canvas implementations.

## Functional equivalence

The [conformance design](flutter-conformance-design.md) owns the capability matrix
and evidence requirements. Data, command results, logical geometry, event order,
selection, editor/history, capture and accessibility behavior are shared contracts.
A platform binding explicitly accounts for DOM versus Flutter hosting and
pointer, keyboard and touch input. Browser-specific diagnostics must not be
fabricated by the Dart implementation.

CSS pixels correspond to Flutter logical pixels, with DPR applied separately.
Raster pixels and system font results need explicit visual tolerances; those
tolerances must not conceal clipped text, incorrect geometry or paint order.
Conformance evidence establishes defined functional observations, not performance
equivalence or equivalence for every possible input.

## Performance verification

The maintained native [frame benchmark](../../verification/flutter/benchmark.md)
measures the full public SDK and real Canvas publication for 4×25 grids, 50 and
100 grids: 5,000 and 10,000 bars. It includes immediate height replacement and
animation. Package-local CPU profiling identifies commit, geometry and renderer
preparation costs without claiming GPU or frame performance.

npm/Pixi and Flutter performance equivalence requires full-SDK measurements with
matched input sequences, viewport, DPR, warmups, device and run mode. Flutter-only
numbers cannot establish that equivalence. Emulator, simulator debug/JIT and
physical-device profile/AOT measurements remain separate. Record command latency,
first/final publication, build/raster timings and frame intervals; lower build
time alone does not prove faster updates or sustained 60 FPS.

Follow [verification policy](verification.md) for changed hot paths and materiality.
Keep allocations, repeated traversals, full-map copies, resource retention,
readback and idle scheduling visible in the owning implementation. Independent
packages prevent a runtime dependency between renderers; this structural boundary
is not a substitute for measuring regressions within each package.

## Release ownership

npm and pub versions may differ. The shared contract revision and validated
capability set identify compatible combinations. Platform-only fixes or
optimizations may release independently when shared behavior is unchanged; new
shared features require both implementations and their conformance coverage.

Each package validates its contents and installed consumer separately. Dart's
`publish_to: none` keeps registry publication disabled until publication is
explicitly enabled. Two registry publishes are not atomic: record the versions
actually published and retry only the failed release. Functional qualification,
performance evidence and successful registry publication are distinct statuses.
