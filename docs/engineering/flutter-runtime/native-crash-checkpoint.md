# Native component projection crash checkpoint

October20,2026; Flutter3.47.6 profile AOT, Android arm64. This records the failure
observed during the [experiment comparison](experiment-parity-checkpoint.md).

## Located failure

Both the SM-S936N SIGSEGV and the earlier emulator SIGSEGV resolve to
`_prepareComponentWorlds` in `draw_objects.dart`. APK-packaged and unstripped
`libapp.so` Build IDs and executable-section hashes match for each investigation.
The physical-device instruction at `0x4d0f90` reads a list length through an invalid
pointer derived from the VM null object. The stack continues through DrawNode,
DrawCompiler and MapBackend.prepareDocument. This is on component preparation,
not a GPU/raster stack.

The original Dart expression combined a `sameWorld` boolean with accesses to the
nullable previous node inside a collection loop. In the observed AOT output,
previous-node field/list loads precede the `sameWorld` branch. Register values
and disassembly establish that the crashing path has a null previous node.
The emulator has the same premature field-read pattern. This establishes the
mechanism in these exact binaries; it does not classify every crash in this SDK
or establish a universal compiler defect.

## Mitigation and evidence

Separate `previous == null` and changed-world paths into explicit early returns.
Only the remaining non-null, same-world path accesses previous component arrays.
Complete and partial projection sharing remain intact; no paint/update policy,
resource fallback, animation or public API is changed.

Five focused rendering geometry tests pass, including fresh number/mixed nodes,
partial transform replacement, sibling projection sharing and output checks.
Build `43b86efdac590332cf8980961dfe45d1` (guard-only baseline) and
`6122f293270836cacf0b4309dc2a2732` (subsequent optimization candidate) both place
previous-array reads behind the non-null/same-world branches; their packaged and
unstripped executable sections match.

The instrumented candidate completed twelve consecutive regular/varied 10,000-item
number→mixed→bar preparations, 36 updates and twelve final-value checks while the
CPU sampler and Timeline were enabled. No failure or native process exit occurred.
This exercises the earlier transition and profiler conditions; it is bounded
regression evidence, not Android/iOS stability qualification.

Exact tombstones, register values, symbolication scripts, hashes and disassembly
are under `.artifacts/performance/flutter/decision-parity3476-device-20261020/crash-investigation/`.
The optimized AOT proof and physical repetition records are under
`.artifacts/performance/flutter/update-reuse3476-device-20261020/`.
