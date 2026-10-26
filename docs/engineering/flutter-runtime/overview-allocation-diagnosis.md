# Overview paint allocation diagnosis

October 23, 2026. Follow-up to the [GC timing diagnosis](text-key-frame-diagnosis.md).
Current parameter/key reuse is retained. This unit proposes changes only;
no package source, host implementation, renderer policy or APK was rebuilt.

## Method and scope

SM-S936N, Android 16, Flutter 3.47.6 profile AOT/Impeller Vulkan. Exact candidate
APK from `c45eb46f`, SHA-256
`edb085ff805efcf673e2767888b7eb7c660a6d39dcca37c445f367b761887a10`.
Same regular 10,000-panel overview, random 1–6-digit strings and bars at 100%.
The existing parity host owns input, request completion and output verification.

After the existing cold/warmup/measured schedule, VM `setTraceClassAllocation`
and `getAllocationTraces` record selected classes in groups, two requests per
group. Allocation timestamps/stacks are intersected with the exact request's
`PAINT` span, matched through FrameTiming vsync. Dart/Embedder/GC timeline is
enabled. Native VM service support was checked on the running AOT app; no debug
or emulator evidence substitutes for the physical profile build.

Allocation tracing perturbs execution, including identity hashes and GC timing.
Do not use diagnostic response times as speed comparisons. Count observations
and source ownership explain candidates; improvement remains unmeasured.
The earlier 1,078 paint CPU samples per arm remain the timing evidence: native
Paragraph work dominates, while GC explains most of the added frame interval.

## Observed creation sites

Counts below occur inside one target paint, repeated in both captures of each
group. They are selected-class observations, not a census of every allocation.

| Site | Objects observed per paint | Interpretation |
| --- | ---: | --- |
| `Rect.topLeft` → `TextContent.paint` | 10,000 `Offset` | Canvas already carries item/component placement; component text destination starts at the origin. |
| `NativeTextLayout.resolve` | 1,666 `Offset` | New paint offset, zero in this fixture. |
| `Offset.+` → `OwnedTextLayout.paint` | 1,666 `Offset` | Adds the two zero offsets in this fixture. |
| `_paragraph` | 1,666 each of `ParagraphStyle`, `TextStyle`, `ParagraphConstraints` | String-independent setup repeats for native fallback strings. |
| `_encodeParagraphStyle` / `_encodeTextStyle` | 1,666 each of `Int32List` | Style encodings are recreated with their wrappers. |
| `_paragraph` font-family fallback preparation | 1,666 fixed lists | Single-family input still executes skip/map/toList. |
| `_GlyphPlacement` | 3,331 placements, 6,662 `Float32List`, 3,331 `Int32List` | Each new atlas string owns transforms, source rectangles and colors. |
| `_placements.putIfAbsent` → compact Map initialization | 3,331 backing-list creations | A per-handle Map is initialized for the current density. |
| `TextPool._resolve` / builder | 1,666 each of `NativeTextLayout`, native builder, native Paragraph and `OwnedTextLayout` | Actual new strings require their own current native shaping result. |
| `BarSliceBatch.flush` | 100 `Vertices` | Existing 100-item batching is active; this is not 10,000 bar meshes. |

Offset captures contain 13,340 paint allocations: the three text sites above
account for 13,332; eight more belong to camera bounds. No broad camera rewrite
is justified by those eight allocations. Container traces also show builder
placeholder/family lists; those engine-owned allocations cannot all be removed
by caching the package's style objects.

## Proposed order

1. **Avoid redundant origin offsets.** Reuse `Offset.zero` where the local
   destination/inset is proven zero; when adding an offset to zero, reuse the
   nonzero operand. Preserve nonzero text insets, stroke/shadow and arbitrary
   destinations. This targets up to 13,332 observed creations without a new
   cache or a numeric-only path. It is the smallest first experiment.
2. **Replace the placement-density Map with fixed slots.** The existing atlas
   owner provides only 3, 6 and 12 densities. Three nullable placement slots
   preserve all three retained results while avoiding Map lookup/backing
   initialization. Clearing remains with `TextPool._retire`. This is an internal
   representation change, not an atlas-resolution or cache-retention policy.
3. **Reuse prepared native paragraph configuration.** Share ParagraphStyle,
   TextStyle, resolved fallback-family lists and matching ParagraphConstraints
   for the same effective parameters, resolved font family, fitted size and
   paragraph width. Keep the existing general Paragraph creation path. The
   observed wrappers/encodings/fallback list total 9,996 creations per paint;
   not all builder internals or native work disappear. Bind reuse to the current
   text owner and do not add an unbounded global style cache.
   Implemented and compared in the [configuration checkpoint](paragraph-configuration-checkpoint.md);
   small CPU savings do not establish response, frame or GC improvement.
4. **Consider shared atlas transforms/colors later.** For matching metrics,
   length, density, alignment and color, immutable transforms/colors can be
   shared while source rectangles remain string-specific. It could remove two
   of three placement arrays, but needs a bounded ownership design and evidence
   beyond this diagnosis. Do not start with buffer pooling across live handles.

The first two proposals are smaller than another cross-string resource cache.
Native style sharing needs particular care: the installed 3.47.6 engine's
`ParagraphBuilder.pushStyle` updates the encoded leading-distribution bit.
Reuse must bind compatible paragraph defaults and preserve stroke/alpha/font
resolution semantics; do not treat arbitrary UI style objects as blindly safe
global constants. Actual Paragraphs for different strings remain distinct.
Changing atlas eligibility to avoid these Paragraphs is a separate policy and
visual question, not an approved allocation optimization here.

## Evidence limits and cleanup

Large Rect/Size traces overwrite the default allocation ring buffer, so their
paint counts are incomplete and not used to rank a broad geometry cache.
Single-class Offset/Vertices captures and stable text-site captures provide the
bounded evidence above. Container records lose earlier request allocations;
their target paint remains represented, but no full-request total is claimed.
Heap-profile accumulated/current fields did not corroborate allocation totals
across GC, so retained-byte differences are not reported as allocation volume.
Native Paragraph/GPU bytes and Pointer/boxed-double totals remain unquantified.

Runtime buffer/depth changes were rejected. A bounded attempt to enlarge the
startup buffer was rejected by the engine's Dart-flag allowlist and the test
process exited; no workaround was attempted. This diagnostic launch is excluded
from results. The existing APK and foreground were restored after all runs;
fixed mode was disabled and test processes/forwards were removed.

Successful groups had zero output mismatches. Package hashes still match the
measured APK. No code tests are repeated for a documentation-only unit; the
documentation gate is the relevant check. No speedup or GC-elimination claim
is made until a proposed change is separately implemented and compared.
Raw class lists, traces, matched paint summaries, code-derived site ownership,
failed-capture records and cleanup live under
`.artifacts/performance/flutter/overview-allocation3476-device-20261023/`.
Proposal 1 is subsequently applied and compared in the
[origin Offset checkpoint](origin-offset-checkpoint.md).
Proposal 2 is applied in the [fixed placement slots checkpoint](placement-slots-checkpoint.md);
its emulator performance comparison remains inconclusive due to host contention.
