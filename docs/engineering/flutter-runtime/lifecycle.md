# Session and resource lifetime

This page owns lifecycle transitions within the [runtime architecture](architecture.md).
Accepted product behavior is indexed by the [contracts](contracts.md).

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
After complete admission/validation, a validated retained batch reuses its exact
changed records for the idle no-op check and preparation. Otherwise the no-op
probe stops at the first changed or retryable record. A patch may retain one resolution memo, reusable only
when both authored and current records are identical. Merging its operations creates
a new patch; execution still resolves against current values after rebase or failure.
The backend consumes at most the latest admission batch's non-text layout memo,
checking component identity and owner size/content/orientation; text placeholders
never become measured geometry. These are optional computations, not pending state
or resource leases. A complete no-op still checks every addressed record before
taking the no-frame completion path.

A retained candidate owns staged content leases, not a second live scene.
Preparation and cancellation leave current geometry, drawing and exported values
unchanged. Publication captures the displayed animation start, detaches a shared
layout on first write and applies the prepared fields synchronously. Old content
uses the same safe retirement queue as replacement nodes. Candidate disposal
releases staged leases; hide, activity changes and refresh invalidate validation
reuse. An old internal publication may share retained handles after commit and
must not be treated as a historical value snapshot. Public values remain detached
immutable snapshots, and request completion still requires the matching paint.

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
