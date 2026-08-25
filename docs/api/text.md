# Text

- Status: current
- Audience: package consumers and agents changing semantic text layout or raster publication
- Source: [`semantic/text-layout`](../../src/semantic/text-layout), [`text-render-route.ts`](../../src/semantic/text-render-route.ts), [`aggregate-text-leaf-lane.ts`](../../src/rendering/aggregate-text-leaf-lane.ts)

## Scope

This page owns text layout, automatic fitting, renderer route selection, raster
resolution, font-family interpretation, and fallback behavior. Font leases and
readiness are owned by [`assets-and-capture.md`](assets-and-capture.md); byte
identity and licensing are owned by [`fonts.md`](../assets/fonts.md).

## Contract

- A finite authored `style.lineHeight` is preserved exactly, including a value
  below `fontSize`. When omitted, line height is `fontSize × 1.25`: 16px resolves
  to 20px and 52px resolves to 65px.
- `autoFont` evaluates each candidate size with that candidate's proportional
  line height before wrapping, overflow, and `maxLines` decisions.
- Standalone text and item/grid text components share the same semantic layout.
  The resolved line height is passed to both Pixi Text and BitmapText routes; the
  renderer does not infer a second value.
- For fitted item/grid labels, final browser glyph raster is measured after
  semantic fitting. If raster pixels exceed the margin-derived quad, PatchMap
  scales down uniformly and recenters; it never scales the semantic result up or
  changes authored data, snapshots, history, or semantic hash.
- Pixi Text uses bounded DPR-aware raster tiers as viewport zoom changes, capped
  at 10x zoom and a 2048px texture edge. A reraster occurs only at a tier change
  or when deferred offscreen text becomes visible. A capability-proven
  BitmapText atlas retains its authored resolution.
- Only exact `FiraCode` resolves to the bundled browser family; alternate spellings
  are not normalized to it and caller data remains immutable. Numeric
  300/400/500/600/700 select the corresponding
  package faces; `normal` maps to 400, `bold` and `bolder` to 700, and `lighter`
  to 300. Other CSS weights use browser nearest-face matching.
- Fira Code has no Korean glyphs. CJK text uses the browser fallback stack at the
  authored weight through Pixi Text; Latin, digits, punctuation, and operators
  use the matching Fira Code face. Font fallback does not change semantic
  coordinates or line height.

## Failure semantics

- Non-finite font size, line height, spacing, or layout bounds reject during
  semantic validation; no text object is published for a partial value.
- A requested family or weight without a package face follows browser CSS font
  matching. This is font fallback, not a renderer degradation decision.
- BitmapText is selected only with a valid capability proof. Route, attached
  object kind, and published probe must agree; otherwise publication is refused
  or uses the supported Pixi Text route.
- Offscreen deferral changes materialization timing only. It does not change the
  semantic layout, stable identity, or eventual visible text.

## Verification map

| Claim | Implementation | Focused verification |
| --- | --- | --- |
| line height, wrapping, fitting | [`semantic/text-layout`](../../src/semantic/text-layout) | [`text-layout.test.ts`](../../tests/rendering/text-layout.test.ts) |
| route capability and fallback | [`text-render-route.ts`](../../src/semantic/text-render-route.ts) | [`text-render-route.test.ts`](../../tests/rendering/text-render-route.test.ts) |
| published route/object agreement | [`aggregate-text-leaf-lane.ts`](../../src/rendering/aggregate-text-leaf-lane.ts) | [`text-render-publication.test.ts`](../../tests/rendering/text-render-publication.test.ts) |
| raster tiers and visual fit | [`leaf-text-style.ts`](../../src/rendering/leaf-text-style.ts) | [`leaf-text-style.test.ts`](../../tests/rendering/leaf-text-style.test.ts) |
| engine text probes | [`text-probe-publication-policy.ts`](../../src/engine/text-probe-publication-policy.ts) | [`engine-text-probe.test.ts`](../../tests/engine/engine-text-probe.test.ts) |
