# Rendering and resource contracts

These are F18–F29 of the [accepted contract inventory](contracts.md).
The [architecture](architecture.md) owns internal dependency boundaries.

| ID | Contract | Owning implementation boundary | Verification obligation |
| --- | --- | --- | --- |
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
