# Native runtime ownership

The runtime is a retained renderer, not a domain model or application state
management framework. It consumes PATCH MAP JSON and presentation values; the
host owns data fetching, registry/metrics rules, time/date selection and business
actions. No new state-management or game-engine dependency is required.

## Files and dependencies

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
| `rendering/` | Render plan, ordered retained item/component projections, static chunks, dynamic bars and the CustomPainter adapter in `widget/patch_map_view.dart`. Consumes effective state; cannot decide update success or mutate authored data. |
| `resources/` | Text layout/Paragraph/atlas, SVG and external raster owners. Shared by actual creation identity. Each owns temporary work, reservations, references and safe retirement. |
| `frame/` | One `frame_coordinator.dart` schedules invalidation/animation and records the generation/revision actually painted. It confirms submission and drains safe retirement; no second canonical scene. |

Dependency direction: widget composition -> session coordination -> dataset,
presentation, geometry, viewport, interaction and resource/render ports.
Rendering/resources depend on shared values and geometry, not on the widget,
controller or concrete session. The composition root wires callbacks/ports;
callbacks are not permission for lower layers to change session state.
Production never imports example, performance or verification code. Use ports
where ownership or asynchronous lifetime crosses a real boundary.

## Lifecycle ownership

[Session and resource lifetime](lifecycle.md) specifies admission, publication,
completion, inactivity and retirement transitions. Session owns accepted state;
the frame coordinator confirms the exact painted generation/revision; resource
owners retain reservations until actual work settles.

## Rendering and performance boundaries

Keep paint order scoped to items and authored sibling order. Geometry provides
conservative bounds and overlap safety; Canvas is the correctness fallback.
Contain bars within item bounds, and retain text/SVG overflow and overlap checks.
Static compatible runs contain at most 100 items. View changes reuse static
geometry; bar animation changes dynamic data only.
The frame coordinator samples a monotonic elapsed clock when its callback runs.
Queued vsync timestamps may precede synchronous admission/preparation; their age
must not consume a newly published bar's animation duration. The clock does not
schedule work, and inactive transitions are still cleared on suspension.

The renderer visits visible candidates in paint order. Logical updates still
cover offscreen items. Only approved deferred work (native Paragraph bodies and
visible-demand SVG rasterization) is delayed; do not generalize this to all
offscreen preparation. Text layout/bounds must be available before publication.
Atlas admissibility depends on validated format and font/style conditions.

Text preparation shares parsed non-text parameters within one synchronous
transaction. Its identity cache ends on return or throw; value-based handle keys
still share equivalent independently admitted styles. Text-specific metrics,
numeric proof and Paragraph ownership remain with the text resource owner.

Presentation resolution produces a `RecordDelta`: the prior/effective raw
record and actual changed dependency groups. The patch memo is valid only for
the same authored/prior identities; reset and rebase recompute it. A zero
dependency mask does not discard a changed raw representation or a source retry.
Compound validation, local layout, content preparation, static-plan reuse and
bar transitions consume those dependencies. Item component IDs resolve once to
retained sorted indices; later stages use those slots. Reordering invalidates
slot hints. Owner size/padding/orientation, opacity and order changes
expand work only where required; unchanged sibling records/resources are shared.
For an idle, fully submitted session, `RetainedUpdate` carries the validated
component records and scalar geometry directly into resource preparation. Its
reuse is bound to the document, publication, generation, revision, activity epoch
and patch identities. Composed or rebased changes bind their resolved records to
the same preparation/commit owner; owner/source/order changes keep the general
projection path. No typed or restricted public input API is required.

Preparation never changes live handles. It acquires content leases, measures
text from the acquired handle and stages bounds/static-plan changes. The existing
backend publication boundary then synchronously updates retained draw/geometry
handles. Initial grid layouts remain shared until the first committed write;
that write detaches only the changed item's mutable layout. General replacement
nodes own independent component handles so later mutation cannot change an old
node's resource lease. Unchanged records, scalar geometry and content are still
shared. Public getters/events export immutable JSON before exposing it.
Component orientation memoization and lazy matrices follow the [bar transform checkpoint](bar-transform-reuse-checkpoint.md).

Publication leases still require bookkeeping. On the general projection path,
one compact component-change collection carries hints through preparation.
Its first entry is inline; additional entries append directly. Index only repeated
multi-component lookups. Publication releases hints after plan/transition preparation;
do not duplicate entries or retain snapshot chains.
`ItemDataView` projects the effective component list in authored order only on
read. It unwraps older views and keeps one current layout, not revision history.
The input/query boundary materializes JSON and releases that layout reference
before exposing event data; unchanged world-only projections preserve identity.

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
