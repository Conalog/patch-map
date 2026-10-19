# Accepted Flutter contracts and delivery coverage

Status: contracts accepted; runtime implementation pending unless a coverage
entry below says otherwise. These are Flutter first-release contracts, not a
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
| F18 | Bar schema alone controls animation (default true/200ms). Width/height and placement change together, cubic ease-in-out; retarget from displayed size. | Rendering / frame | Intermediate frames, retarget, disabled and zero duration |
| F19 | Static geometry max100; representative initial most frequent width fixed until replacement; matching bars use shared3-slice, others9-slice, ineligible/pending paths use Canvas. | Rendering | Overview and zoom+update+pan; order/shape and width transitions |
| F20 | Bar images share color/height-independent masks by radius; unused cache1MiB, FIFO preparation max4; skip unusable resources and drop unstarted unreferenced jobs. Remember failed creation identities until replacement; Canvas success is not an update failure. | Resources | Single/multiple radius, repeated failure, inactivity and cleanup |
| F21 | Text uses internally selected shared Paragraph or validated numeric atlas; fixed3/6/12 filtered levels, shape/style sharing independent of color/placement. | Text resources | Numeric grammar/font/shaping; scale/rotation and fallback |
| F22 | Reuse validated numeric layout metrics; create native Paragraph only when required. Values/layout/bounds update immediately. Single-pass FIFO eviction preserves existing limits. | Text resources | 1–12 digit validated font cases; new visibility; 10,000 updates |
| F23 | Text active atlas cap remains deferred. Unused-cache policies remain bounded; derived color arrays follow actual references. Do not add an unbounded global cache or silently change active policy. | Text resources | Churn/refcount/cache retirement |
| F24 | Existing SVG parser and shared vector result. Whole-diagram16-reference threshold; visible-demand image preparation at192/384/768/1536; vector fallback for excess demand/budget. | SVG resources | Real consumer sizes/icons; repeat count; transition |
| F25 | Bar+SVG optimization images share2MiB including preparation/retirement. Budget denial keeps basic rendering. Reconsider denied SVG only on space or required-resolution change; boundary regeneration is known limitation. | Resources | Reservations, fallback, zoom transitions |
| F26 | First URL image transient failures: max3 attempts, delays0.5/1s, each attempt20s. Inactive time counts but new work waits for active. Later update failure retries only when value is respecified. | Image resources | Local controlled network failure/deadline/inactivity |
| F27 | Downloads max16; individual source20MiB; map source total64MiB, initially reserve20MiB then shrink on reliable length; stop over-limit receive. | Image resources | Unknown length, streaming overrun, shared source |
| F28 | Before decode: each axis<=8192, pixels<=16,777,216. Decode max2 and128MiB in-flight predicted pixels; single over-limit fails. | Image resources | Descriptor validation and reservation lifecycle |
| F29 | Raster result total256MiB per widget including active/preparing/retiring; safe last-reference release, no unused raster cache; decode FIFO. | Image resources | Replace/remove/failed decode and temporary ownership |
| F30 | CPU and memory are independent goals. Same-workload WebView comparison per user journey and Android/iOS evidence required; synthetic experiments are not product qualification. | Verification | Overview/update/pan/interaction/first frame, platform gates |

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

## Delivery status

| Boundary | Status | Evidence |
| --- | --- | --- |
| Ownership/contracts | Reviewed; six missing transition conditions incorporated | Independent contract/architecture review against all213 inventoried source sections |
| Dataset and geometry | Geometry primitives/index/camera implemented; dataset/layout integration pending | `test/geometry/`: nested signed transforms, quad/path hits, 10,000-item scan oracle with overflow/moves; rotated padding fit and resize/anchor checks |
| Session/widget/frame | Pending | — |
| Rendering/resources | Experimental algorithms only | No package-runtime claim |
| Interaction/lifecycle | Pending | — |
| Playground uses package | Pending | Current optimized app still standalone |
| Platform/WebView qualification | Pending | Foundation host checks are not functional qualification |
