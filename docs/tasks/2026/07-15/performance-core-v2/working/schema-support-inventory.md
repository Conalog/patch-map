# Core v2 schema support inventory

Working implementation evidence only. This file does not revise the approved contract,
fixtures, normalized expected evidence, or review registry.

## Audited inputs

The 2026-07-20 audit covered all 30 catalog-referenced dataset profiles: 27 canonical
array datasets plus the `legacy-root`, `legacy`, and `malformed` compatibility/error
objects. It also covered `lab/fixtures/production-like.json` (40 grids, 29 items, 389
relation groups, and 167 components). Canonical arrays contain 79 elements and 37
components.

## Direct strict support

| Scope | Audited actual fields accepted by the materializer |
| --- | --- |
| Elements | group children; grid cells/item/gap/inactive strategy; item size/components/padding/orientation; relation links/style; image source/size/opacity; text text/style/size/overflow; rect size/fill/stroke/radius/eventMode; shared id/label/show/locked/attrs |
| Components | background id/show/source/tint/size/type; bar id/show/source/size/placement/margin/tint/animation/duration/type; icon id/show/source/size/placement/margin/tint/type; text id/show/text/placement/style/split/type |
| Attributes | x/y/angle/display/zIndex/scaleX plus open metadata; production relation metadata contains parent and light/dark color values |
| Nested records | relation cap/color/join/width; text font, fill, wrap, line and spacing fields; rect stroke; rect-texture border/radius; asset descriptor `src` plus `data.resolution` |

No audited element or component has a top-level `metadata` key. Metadata appears only
at `relations.attrs.metadata`. Caller input stays detached and immutable. Unknown
closed-record fields still fail. Per-corner radius arrays must have exactly four
nonnegative finite entries.

## Explicit projection gaps

| Input | Current dense projection |
| --- | --- |
| `rect.attrs.scaleX=-1` | Preserved in identity and diagnosed; horizontal flip not rendered |
| item `attrs.zIndex` | Preserved and diagnosed; component stacking not applied |
| `contentOrientation="upright"` | Diagnosed; counter-rotation not applied |
| component animation/duration | Preserved semantically; parser reports unsupported animation |
| text `split` | Diagnosed and rendered as one run |
| relation cap/join | Diagnosed and rendered with aggregate default line geometry |
| per-corner radius | Preserved semantically; scalar dense entity uses maximum corner with degradation diagnostic |
| component text lineHeight/letterSpacing | Not yet projected and currently lacks a dedicated diagnostic |
| standalone `breakWords` | Not independently projected and currently lacks a dedicated diagnostic |
| asset descriptor `data.resolution` | Semantic descriptor retained; dense image source currently uses only `src` without a dedicated diagnostic |
| background authored size | Currently affects placement, although the approved contract declares full-item/inert size semantics |

The last four rows are correctness work, not supported behavior. Valid materializer
defaults may also trigger parser warnings for upright content orientation or destroy
inactive-cell strategy; this must be corrected before their rendering/layout cases can
be promoted.

## Compatibility boundary

The production boundary remains direct PATCH MAP v0.10 array input. `malformed` is an
intentional atomic rejection. The approved `legacy-root` and `legacy` object profiles
remain unsupported compatibility inputs and must not be reported as array-schema
success. A versioned migration adapter is future work; no object root is silently
coerced in the current core.
