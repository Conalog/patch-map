# Accepted Flutter contracts and delivery coverage

Status: runtime integration implemented; performance and platform/consumer
qualification remain in progress as recorded below. These are Flutter first-release contracts, not a
claim of complete JavaScript API parity. The source decision inventory includes
historical proposals which this current specification supersedes.

## Contract groups

| ID | Contract | Owning implementation boundary | Verification obligation |
| --- | --- | --- | --- |
| F01 | Renderer only; host owns domain fetching, interpretation and business actions. Editor, PNG export and item screen-reader support are excluded from first release. | Public API / package scope | Package API and consumer replay |
| F02 | Existing JSON List/Map schema and stable element/grid-cell/component addresses; preserve attrs extension data and schema-specific defaults. All supported authored types remain in scope. | Dataset | Representative item/grid/group/relations/image/text/rect and four component fixtures |
| F03 | Caller values are detached on admission; public item data is read-only and reused. No public scene token or renderer object identity. | Dataset / API | Caller mutation and returned-data mutation isolation |
| F04 | Whole-input validation before any acceptance; reject invalid updates atomically with target/field diagnostics. Omission retains, explicit resets follow each supported field's existing meaning. | Dataset / presentation | Invalid last record; null/omission tests |
| F05 | Retain scene and unchanged resources; compare whole values, work only on changed dependencies. One executing update and one reset-aware field-composed pending update. | Session / presentation | Sparse/no-op/full changes, reset barrier, replaced-field attribution |
| F06 | Consistency is per item. Preparation failure retains the entire prior valid item; other items may publish. Failure and superseded information coexist. | Session / rendering | Mixed number/bar failure injection |
| F07 | Completion means corresponding engine drawing submission, not animation end/raster/display. Active no-op needs no extra frame only for already submitted values with no earlier executing/pending update; failed-value respecification retries. Replacement/removal terminate pending requests with reasons. | Frame / session | Paint-generation/revision witness; no paint cannot acknowledge |
| F08 | Valid replacement hides old diagram; latest accepted generation owns subsequent updates. Freeze the first-screen batch when its presentation processing starts; later input waits for the next batch. Invalid replacement preserves old state. Fatal preparation/paint failure settles outstanding work and only a new replacement can recover. | Session | Callback replace+update, competing replacement, fatal failure and late completion |
| F09 | Replacement resets selection/gesture and fits new bounds while retaining rotation. Same-scene updates preserve camera/selection. Image loading does not block first screen or alter ready state again. | Session / viewport | First frame, reset, images arriving later |
| F10 | Widget State owns lifetime. Controller may reconnect; at most one live attachment; detached commands reject without queueing. | Widget | Rebuild/remount/double attach/dispose |
| F11 | App background or explicit inactive map preserves resources but defers comparison/preparation/frames, composing latest input. Inactive replacements retain only latest valid dataset. | Session / resources | Background burst/resume and replacement |
| F12 | CustomPainter; one frame scheduling owner; calculations/search on main isolate. No per-item widget/ticker/listener. | Frame / rendering | Idle frames and lifetime counts |
| F13 | Shared geometry for bounds/hit/fit. Item is interaction unit; background-less item uses component intersections. Uniform index: max16 cells/item, overflow list once. With B occupied buckets, T=max(1,min(4096,ceil(B/4))); clipped query visiting Q>=T cells scans once. | Geometry | Large/overflow/rotated items; point/range/path equivalence |
| F14 | Library detects inputs/items and owns selection; host maps gestures to actions. Filter skips disallowed front objects; direct selection bypasses input filter. | Interaction | Overlap/filter/programmatic selection |
| F15 | Default drag pans; host may choose range or paint mode; mode stays stable during drag. Resolve each raw input using then-published geometry/camera, preserving intermediate path hits; coalesce only move notifications per frame. One end with reason; no extra final move; no end callback on permanent widget removal. | Interaction | Range/paint paths, changing camera/geometry, interruption, removal exception |
| F16 | Filters are judgment-only; mutations are allowed in result callbacks, admitted then processed after callback exit. Callback exceptions cannot break runtime cleanup. | Session / interaction | Reentry and throwing callback/filter |
| F17 | Events provide world/local/global logical-pixel coordinates. Fit adjusts scale; focus preserves it; rotation retained. Screen-edge padding is one unified option. Resize preserves world center/scale/rotation. Focus/fit reject while preparing; partial missing targets return applied/missing, all missing preserves camera. | Viewport / API | Rotated fit/padding/resize, preparation state and missing targets |
| F32 | Immutable current camera getter and optional once-per-frame notification with coalesced change causes; no separate scheduler. | [Camera observation](camera-observation.md) | Gesture/command/resize, reentry, no-op, replacement and activity |
| F33 | Independent zoom/rotation permissions and configurable touch thresholds (default 2% span / 10° rotation), each rebased at crossing without a jump; zero applies immediately. Optional common absolute zoom limits. | [Gesture options](gesture-options.md) | Independent input gates/thresholds, anchored/padded clamping, live configuration and commands |
| F31 | Independent keyed alpha layers multiply existing alpha, preserve values/selection/hits, and reset only on accepted replacement/removal. Synchronous admission is separate from value submission. | [Presentation layers](presentation-layers.md) | Composition/clear, replacement ordering, pixels, unused-path profile |
| F30 | CPU and memory are independent goals. Same-workload WebView comparison per user journey and Android/iOS evidence required; synthetic experiments are not product qualification. | Verification | Overview/update/pan/interaction/first frame, platform gates |

Rendering and resource contracts F18–F29 are owned by
[rendering contracts](rendering-contracts.md).

## Explicit implementation judgments

Use small immutable address/result types and one connected controller facade.
Precise Dart names are implementation choices; schema field meanings are not.
No generic per-field `null` reset outside the documented presentation grammar.
Keep root/component shape validation separate from value comparison, so an
unchanged record is still checked without allocating a new retained value.

Reserve temporary transfer-copy headroom inside the accepted64MiB source budget
(initial internal plan44MiB ownership plus20MiB copy headroom). This is not a
new user-confirmed numeric optimum or a bound on codec/native/GPU memory.
Update failure/cleanup paths must account for partial objects and work that
cannot actually be cancelled. Unknown SVG/parser intermediate memory and
general Paragraph active memory remain measured risks, not proved global caps.

Current SDK metadata and conformance include capabilities outside Flutter's
first release. Add explicit Flutter phase coverage; do not remove JS tests or
claim all conformance targets pass. Actual WebView deployment identity remains
an external verification input. Baseline source is the previously investigated
0.10.0 mobile WebView path, not automatically latest release/1.0.

Compatibility decisions and executed legacy evidence are owned by
[compatibility findings](compatibility.md).

Implementation status and remaining verification are tracked in
[delivery coverage](coverage.md).
