# Flutter mobile benchmark

- Status: selected bar slice measured on 2026-09-14; full Flutter package and architecture qualification remain open.
- Goal: compare JS reuse and independent Dart implementation with real rendering.
- Current devices: dedicated Android 14 / API 34 arm64 emulator; iPhone 15 / iOS 17.2 simulator.
- Owners: [protocol and runners](../../performance/mobile/README.md), [runtime candidates](flutter-mobile-js-candidates.md).

## Findings and decision boundary

Six primary runs completed all 96 blocks and 3,840 sample/frame matches each.
Full-height replacement favored the specialized Dart path in paired frame time
on both simulators. Of the tested JS routes, flutter_js's buffer path had the
lowest full-replacement preparation time; jsf's JSON route beat its ArrayBuffer
API. Small updates did not always produce a material frame-time difference:
flutter_js buffer cases were neutral under the frame criterion on both platforms.
Android emulator frame p95 also exceeded 16.67 ms in several Dart cases; short
CPU preparation time does not establish sustained 60 FPS.

This supports keeping frequent bar geometry work on the Dart side. It does not
settle the full engine architecture: JS semantic reuse with Dart geometry remains
unmeasured, as do Flame overhead, general transforms and the rest of the API.
Preserve the [full conformance requirement](flutter-conformance-design.md).
The reproducible report/CSV and raw evidence live under ignored
`.artifacts/performance/mobile/`; no historical number becomes a release gate.

## What is comparable

The first slice updates rounded bars in 50 and 100 grids of 4 rows × 25 columns,
with full random replacement and scattered 10% replacement. Each targeted height
changes. JS imports the existing rounded-bar geometry implementation; Dart uses
an independent equivalent implementation. Both render through the same Flutter
Canvas triangle buffers. Before timing, coordinates must agree with the imported
TypeScript oracle and with each runtime's output for every prepared input.

This isolates geometry computation, bridge conversion/copying, native vertex
publication, and Flutter build/raster time. It excludes dataset admission,
transaction/history, text, selection, capture and the rest of the public API.
Dart specializes this axis-aligned fixture; JS retains its production transform
and change-detection branches. This is not an equal-general-algorithm language
comparison, and rotation/projection/UV behavior and costs are unqualified.
A result here does not establish complete feature parity or rank a full port.
It also does not rank architectures that keep geometry in Dart while sharing
only JS semantic logic. That boundary can substantially reduce transfer volume.

## Candidate transport differences

| Candidate | Controlled baseline | Additional route |
| --- | --- | --- |
| jsf 1.1.0 | JSON input/output | ArrayBuffer API; internally still tagged JSON |
| flutter_js 0.8.7 | JSON input/output | Android QuickJS function handle with copied binary input/output; iOS JSC bindings with JSON input and copied binary output |
| quickjs_engine 0.1.5 | JSON input/output | QuickJS function handle with copied binary input/output |
| Independent Dart | Same heights and geometry | No JS bridge; same Canvas renderer |

JSF's published `lib/src/value.dart` converts object values using
`JSF_ValueToJson`; `lib/src/conversion.dart` represents ArrayBuffer as bytes in
its JSON transfer schema. ArrayBuffer API support is therefore not evidence of
native binary transfer or zero-copy. The other QuickJS wrappers expose a usable
`JSInvokable.invoke` route despite their incomplete generic `callFunction` and
`convertValue` methods. Their wrapper copies ArrayBuffer bytes into Dart memory.
The iOS adapter retains the JSC object while copying its temporary buffer pointer.

quickjs_engine 0.1.5's initial iOS framework contained the Swift plugin but omitted
the native C/C++ sources, so `jsNewRuntime` lookup failed before timing. The
benchmark Podfile explicitly includes those published source files; no engine
or geometry code is changed. Required FFI exports are checked in the built
framework. Its iOS measurements include this integration fix and do not qualify
the package's unmodified pod setup as working.

## Interpretation and environment

Android emulator uses an arm64 profile build. The iOS simulator uses debug/JIT.
Both platforms are proxies;
their rankings must not be presented as physical phone performance. Different
platforms and build modes are never pooled. Common JSON and package-specific
buffer routes are reported separately, including copying and conversion costs.

Flutter's profile label does not guarantee an optimized embedded C engine.
The first quickjs_engine Android run used native Debug without optimization and
is diagnostic only. Source engines (jsf and quickjs_engine) are rebuilt with
`-O3` and `NDEBUG` on both platforms; actual Android compiler commands and iOS
target settings are checked and preserved. flutter_js uses its shipped Android
binary and system JSC on iOS, whose compiler settings are not controlled here.
These results compare complete package paths, not isolated VM implementations.

The protocol fixes six alternating Dart/JS blocks, ten warmups and thirty samples,
viewport and input seed. It records raw frame timings, sample-to-frame mapping,
source and dependency identities, and before/after environment state. Read the
protocol for budgets, correctness gates, exclusions and lifecycle handling.
Post-frame submission is not screen photon latency. Frame timings are matched
by the monotonic build interval, not by equality with the scheduled vsync time.

An initial simulator attempt failed when host free space reached 25 MiB; no
performance claim uses it. The NDK installed by that attempt was removed, and
native builds now use the already installed NDK 28.2.13676358. Runs require at
least 2 GiB free disk space. Subsequent smoke runs are qualification only.
The user subsequently requested switching Android to an emulator and disconnected
the SM-S936N during the first physical run. Its available logs are preserved as
an incomplete run, not a candidate ranking. Only one simulator runs at a time.
Historical raw measurements remain under ignored `.artifacts/performance/`.
An initial optimized jsf Android run showed an unexplained, approximately fourfold
slowdown in both JS and paired Dart across adjacent cases. The same APK was rerun;
the step did not recur. The second attempt is primary, and the complete first run
is preserved without trimming samples. Before/after snapshots do not prove the
cause or eliminate transient load on this shared development host.
