# Native runtime ownership

The runtime is a retained renderer, not a domain model or application state
management framework. It consumes PATCH MAP JSON and presentation values; the
host owns data fetching, registry/metrics rules, time/date selection and business
actions. No new state-management or game-engine dependency is required.

## Files and dependencies

Names below establish responsibilities, not empty files to scaffold in advance.
Create a file when its implementation exists. Do not use `part` to join the
runtime into one giant library as the experiment does.

| Directory under `lib/src/` | Ownership and principal files |
| --- | --- |
| `api/` | Immutable addresses, command results, event values and public configuration. No renderer handles or mutable input exposure. |
| `widget/` | `patch_map_view.dart` owns session lifetime, controller attachment, Flutter lifecycle and surface size. `patch_map_controller.dart` is a command facade. |
| `dataset/` | `dataset_reader.dart`, value/style admission and immutable authored models. Full validation/detachment, identity and grid expansion metadata; no Canvas resources. |
| `session/` | One `map_session.dart` owns accepted generation, current document/presentation and request progression. Separate replacement/update/notification helpers implement bounded responsibilities; they cannot independently publish. |
| `presentation/` | Field operations, reset-aware pending composition, effective value resolution and dirty dependencies. Keeps authored values separate from live overrides; no frame scheduling. |
| `geometry/` | Numeric dimensions, local/world transforms, component layout, paint/hit envelopes and bounded uniform index. Shared by renderer, viewport and input. Main-isolate calculations. |
| `viewport/` | Camera, fit/focus, screen padding and coordinate conversion. Holds no copied scene or resource cache. |
| `interaction/` | One gesture coordinator, item hit resolution and range/paint path accumulation; selection owner and immutable event projection. Host callbacks choose actions. |
| `rendering/` | Render plan, ordered retained item/component projections, static chunks, dynamic bars and `map_painter.dart`. Consumes effective state; cannot decide update success or mutate authored data. |
| `resources/` | Text layout/Paragraph/atlas, SVG and external raster owners. Shared by actual creation identity. Each owns temporary work, reservations, references and safe retirement. |
| `frame/` | One `frame_coordinator.dart` schedules invalidation/animation and records the generation/revision actually painted. It confirms submission and drains safe retirement; no second canonical scene. |

Dependency direction: widget composition -> session coordination -> dataset,
presentation, geometry, viewport, interaction and resource/render ports.
Rendering/resources depend on shared values and geometry, not on the widget,
controller or concrete session. The composition root wires callbacks/ports;
callbacks are not permission for lower layers to change session state.
Tests and the example may import the package; production never imports example,
performance or verification code. Internal Dart libraries remain independently
testable. Avoid interfaces around every helper; use ports where ownership or
asynchronous lifetime crosses a real boundary.

## State and publication

The session owns one accepted generation and its authored state. It may retain
the prior *render publication* until safe disposal, but that is not another
authoritative dataset. Validate and detach a replacement before advancing the
accepted generation. Subsequent updates validate against the new accepted
dataset even while its first frame is pending. A rejected replacement changes
neither generation nor visible surface.

An accepted replacement hides the old diagram, cancels its request obligations
with explicit reasons and prepares the new one. Reset selection/gesture and
translation/scale; retain rotation and fit the new bounds. Images do not block
first-frame readiness. Surface loading/failure notifications let the host show
its spinner/error UI; the painter never restores the old diagram on failure.
The first-screen update batch is cut when processing of first-screen
presentation values begins. Requests admitted afterwards form the next pending
batch; they cannot indefinitely postpone initial readiness. A fatal preparation
or paint failure stops that generation and settles all outstanding requests with
the whole-map failure. Ordinary updates cannot restart it; only a new accepted
replacement starts recovery.

Presentation admission validates the entire input before accepting any field.
Each active session has one executing update and one composed pending update.
Reset barriers and subsequent child-field sets are kept as operations, not an
ordinary deep merge. Expected admission/resource outcomes are structured results;
unexpected implementation errors preserve the Future error and original stack. Request provenance survives composition so replaced fields
and preparation failures can both be reported. Immutable effective values and
retained projections are reused when unchanged; avoid allocating a complete
candidate object for every unchanged input record.

Prepare and publish related changes as an item-consistent unit. One item's new
bar must not appear with its old number. A failed item keeps its prior valid
publication; successful items may proceed. This is not a new 100-items-per-frame
progressive publication policy. Static geometry's maximum chunk size of 100 is
a drawing optimization, not an update batching contract.

The frame coordinator stamps actual paint with generation and publication
revision, and acknowledges submitted work after that paint. A generic
`endOfFrame` without a matching paint is insufficient. FrameTiming joins are
measurement-only; operation completion does not wait for raster, display scanout
or the end of a bar animation. An active unchanged update can finish without an
extra frame only when its values were already submitted in this generation and
attachment and no earlier executing/pending update exists. Respecifying a value
whose required preparation failed is a retry, not a no-op. Inactive work follows
the resume/publication obligation.

## Lifetime and resources

The widget State owns the session. A controller may reattach after disconnection
but cannot retain a hidden renderer or replay commands issued while disconnected.
One controller attaches to one live widget. Rebuilds with the same State preserve
the session. Session termination closes obligations and detaches callbacks before
resource retirement. Late work checks its generation and resource lease.
Failed optimization-only bar image creation is remembered by generation and
creation identity until replacement. It is not retried on each update/pan/zoom,
and successful Canvas fallback does not make the update a partial failure.

Host `active` and app foreground jointly enable work. Inactive sessions validate
and compose input but do not start new resource preparation or frames. Validation
may resolve the addressed raw record against pending field operations when a
cross-field constraint requires it; it does not traverse or compare the scene. In-flight
uncancellable work retains its slot/reservation until actual settlement; no early
release on logical cancellation. Resume uses latest state without replaying old
animations. Started transfers may finish; further decode waits for activity.

Each preparation function owns its partial results until one explicit transfer
to the live resource owner. `finally` disposes temporary Picture/codec/buffers.
Failure, supersession and destruction use the same ownership path. Retirement
after a submitted frame is distinct from physical engine/GPU memory reclamation.
No permanent empty-frame loop or per-frame whole-cache scan is introduced.

## Rendering and performance boundaries

Keep paint order scoped to items and authored sibling order. Geometry provides
conservative bounds and overlap safety; Canvas is the correctness fallback.
Contain bars within item bounds, and retain text/SVG overflow and overlap checks.
Static compatible runs contain at most 100 items. View changes reuse static
geometry; bar animation changes dynamic data only.

The renderer visits visible candidates in paint order. Logical updates still
cover offscreen items. Only approved deferred work (native Paragraph bodies and
visible-demand SVG rasterization) is delayed; do not generalize this to all
offscreen preparation. Text layout/bounds must be available before publication.
Atlas admissibility depends on validated format and font/style conditions.

Raw input resolves coordinates and hits against the camera/geometry published
when that input is processed. Coalesce notifications only, not the geometric
interpretation of a path against a later camera. Focus/fit reject while the
first diagram is preparing; they are not queued. Partial missing addresses are
reported alongside applied addresses; if none resolve, preserve the camera and
return the empty-target result.

The optimized experiment supplies tested algorithms, not a package architecture.
Remove its global singleton, benchmark constants, hard-coded Leaf schema,
`part` coupling and diagnostic branches during transfer. Preserve algorithm
provenance and compare output/workload after integration. Never use the manual
app's scale-based number hiding as an unconditional package text policy.

## Review checkpoints

Review concrete transitions, not class count: invalid last input; replace inside
notification then update; reset then partial override; remove during resource
creation; inactive latest update; overlapping items; newly visible native text;
bar width/height tween through slice transitions; and package-only teardown.
Reopen user policy only for demonstrated contract/scope/quality changes or
material performance tradeoffs. Routine internal choices remain implementation
responsibility.
