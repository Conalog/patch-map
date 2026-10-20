# Preparation cost sweep checkpoint

October 20, 2026. Baseline `1d7f0a57` already includes the preceding
[validation/resource reuse](update-reuse-checkpoint.md). This sweep keeps the
public schema, presentation reset/merge semantics, item atomicity, bar animation,
paint order and paint-submission completion boundary unchanged.

## Removed work and ownership

| Owner | Reuse or removal | Invalidation/lifetime |
| --- | --- | --- |
| Dataset colors | Resolve repeated scalar palette colors once; reuse successful scalar admission checks within a request | Palette cache256entries, strings<=128characters; mutable maps/lists always checked; request cache ends on return/throw |
| Presentation | Share detached operation paths, index and owner lists; avoid repeated current/authored lookups and empty failure bookkeeping | Existing session, pending reset barrier and ledger remain authoritative |
| Resolver | Wrap exclusively owned result maps without copying their entries again | Never wrap a borrowed mutable map; nested changes copy before editing; earlier results and memo bases remain immutable |
| Geometry | Reuse world transform when attrs, parent world and grid pitch are unchanged; visit aggregate pages only for changed contributions | Visibility, final logical/paint envelopes and relation endpoint dependencies invalidate independently; no previous snapshot chain retained |
| Component layout | Do not allocate an empty previous-component index when no previous layout exists | Existing identity/index lookup and reordered-component fallback preserved |
| Draw compilation | Share rectangle paint content independent of size and world transform; calculate world scale only for image/icon needs | Source/tint/opacity still identify rectangle content; existing leases own release |
| Static chunks | Reuse membership proof when its actual inputs are unchanged | Item world, visibility, opacity, paint bounds, component skeleton and background style/geometry remain checked |
| Bar transitions | Reuse active transition lookup; read matching previous component index before allocating an ID map | Reorder fallback, animation-off, retarget and monotonic frame clock preserved |

Resources already reuse immutable reference metadata. This sweep does not cache
mutable asset readiness or failure state, delay logical offscreen updates, change
FIFO/resource budgets, or introduce another frame/publication coordinator.

## Evidence and limitations

The comparison uses identical public-API input and host,10,000 regular/varied
panels,100 managed SVGs,full-width bars and deterministic values. Number-only
scenes retain full-height bars; bar-only scenes omit numbers. Each ordinary case
uses a fresh process, two warmups and three measured requests. Input generation
and verification are outside the measured interval. No synthetic Leaf conversion
is moved out of one arm only, and historical experiment ratios are not reused.

Response ends when the matching revision is submitted to Flutter paint. Process
CPU milliseconds cover animation/raster settlement plus the same400ms pan where
requested; these are not CPU percentages. FrameTiming p95 excludes some
synchronous admission/preparation, so it cannot independently qualify smoothness.
PSS/graphics are Android accounting, not exclusive GPU allocations.

Stages a–g ran in Flutter3.47.6 profile AOT on SM-S936N/Impeller Vulkan. Small
static/bookkeeping/geometry stage differences varied with order and temperature;
individual universal speedups are not claimed. A separate compute-only probe
measured geometry preparation39.7→34.2ms regular and39.7→34.0ms varied at thermal
status0. The varied status1repeat was65.3→65.5ms, neutral. The regular repeat
crossed thermal states and is excluded from ranking. Checksums match. Untimed
admission/layout-memo setup means this probe is not end-to-end response evidence.

The user disconnected the phone before the last candidate and final qualification.
Remaining runs use API34 arm64 emulator35.2.10,host GPU,Impeller OpenGLES,1440×3120
at600dpi,4virtual cores/4GiB. Their absolute timings do not represent the phone;
physical and emulator numbers must not be pooled. Emulator graphics accounting
returns0, so it cannot establish GPU memory use or retirement. Guest GC/PSS
checks cannot resolve the preceding physical-device graphics/PSS attribution.

Resolver stages h/h2/i include both favorable and adverse raw runs. Reversed
regular-bar response178→165ms had neutral CPU322→321ms. Varied-bar repeats changed
sign; the last was225→181ms,CPU643→586ms. Number zoom/pan remained164ms,CPU325→333ms.
The candidate removes duplicate allocation, but its standalone overall latency
benefit remains workload/noise dependent. All six paired application images match.

## Combined emulator comparison

Before→final medians;120requests,24final-value checks and12paired application
screenshots match. All timing windows complete, no update failures.

| Layout / update / view | Response ms | Process CPU ms |
| --- | ---: | ---: |
| grid / bar / overview | 283.2→204.0 | 685→585 |
| grid / bar / zoom-pan | 245.6→162.1 | 414→303 |
| grid / number / overview | 311.6→270.9 | 638→452 |
| grid / number / zoom-pan | 180.7→153.8 | 311→306 |
| grid / mixed / overview | 418.7→349.2 | 973→937 |
| grid / mixed / zoom-pan | 351.9→245.2 | 601→433 |
| random / bar / overview | 238.0→180.4 | 596→546 |
| random / bar / zoom-pan | 230.5→145.4 | 371→290 |
| random / number / overview | 240.2→244.9 | 398→472 |
| random / number / zoom-pan | 163.1→147.8 | 332→275 |
| random / mixed / overview | 651.8→403.3 | 1521→1046 |
| random / mixed / zoom-pan | 329.0→249.9 | 537→445 |

Varied-number overview initially increased CPU398→472ms; the reverse-order
repeat was419→412ms and response249.5→234.1ms. Neither a repeatable regression
nor a CPU improvement is established for this condition. Frame p95 changes are
mixed; this preparation reduction does not qualify uniform smoothness or60fps.

Late manual smoke also showed large delays. The identical benchmark APK/case
then rose from162.1ms to1046.4ms median in a fresh process. These separate
diagnostic runs establish timing variability, not its specific host/guest cause.
They are excluded from paired ratios; manual responsiveness remains unqualified.

## Sparse input and lifetime

Full10k inputs with0%/1% actual changes pass40requests and four paired images.
Bar zoom/pan response is40.9→37.3ms at0%,61.9→45.5ms at1%; number overview is
20.5→15.4ms at0%,65.1→73.6ms at1%. The latter response does not improve despite
CPU204→191ms. No-op measured requests all retain the unchanged outcome.

Four matched GC cycles per arm add40updates. After removal, every package class
live count/bytes matches its initial empty host. Host fixture/verification data
remain intentionally retained: removed Dart heaps are15.9–16.3MiB in both arms.
Updated mixed heaps fall78.87→74.41MiB regular,79.21→77.27MiB varied; number heaps
are effectively unchanged. PSS varies, including higher candidate samples.
Removed PSS ranges165–187MiB before,164–187MiB after; neither total-memory saving
nor native/GPU leak freedom is established by these bounded cycles.

## Verification

168 focused presentation, geometry, session, rendering and widget tests pass.
They cover invalid final input, mutable color channels, immutable earlier maps,
reset/rebase, parent/grid changes, text overflow, relation bounds, multi-page
aggregates, static style/visibility invalidation, component reorder, animation
retarget, atomic resource failure and painted generation. Static analysis is clean.
Independent review found no concrete contract/ownership defect in the candidates.

Raw samples, source/APK identities, stage patches, CPU samples and compute probe:
`.artifacts/performance/flutter/preparation-sweep3476-device-20261020/`.
The remaining comparisons and their separate environment record:
`.artifacts/performance/flutter/preparation-sweep3476-emulator-20261020/`.
The [physical-device review](final-device-profile-checkpoint.md) records current costs, candidates and unresolved graphics retention.
