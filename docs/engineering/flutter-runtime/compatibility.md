# Compatibility findings

These findings qualify the [accepted contracts](contracts.md). Baseline is
release/1.0 except explicitly approved main behavior.

## Schema and layout

- `calc()` dimensions follow main's multi-term percent/pixel semantics. The current JS schema admits these inputs, while the release parser renders them at zero and its separate layout helper supports only two terms. Flutter compiles admitted expressions into one pixel offset and one fractional coefficient; no expression parsing occurs during paint or animation. Invalid derived negative/nonfinite geometry is rejected. This is an intentional correction to release/1.0 output, not a new expression language.
- `upright` preserves a readable authored angle and removes reflection/upside-down orientation. It does not pin content to screen axes. Bars use the item-center placement anchor; text retains its authored center, as in the shared JS geometry owner.

- Color resolution follows configured theme lookup and real ColorLike parsing, as in main. Custom leaf tokens used by the actual WebView (such as `statusRed`) are preserved during schema checking and validated with the configured palette before final acceptance. Release's accidental hash-color fallback is not reproduced. RGB/alpha conversion can differ by one quantization unit; exact pixel identity is not claimed.

## Paint projection

- An omitted standalone `rect.fill` retains release/1.0's white fallback.
  Main leaves that shape transparent; no approved decision specifically changes
  this default, so main's different default is not imported implicitly.
  Rectangular background textures keep their own schema defaults.
- Rectangle strokes project only color/width; relation strokes project
  color/alpha/width. Other admitted stroke fields remain without additional
  effects, matching the executed release parser. They must not cause a fatal
  native resource error or change hit/selection bounds. Relation input still
  validates the complete scalar grammar before projection. A 30-case JavaScript
  oracle and native output/update regressions cover this correction; native and
  browser antialiasing are not claimed to be bit-identical.
- SVG tint applies to the composited artwork, including overlapping primitives
  and embedded raster images. Per-path ColorMapper alpha is not equivalent.
  A non-white vector tint records a compositing layer; repeated image sharing
  rasterizes that correct result. Its vector fallback cost still needs the
  integrated profile; no performance equivalence is inferred from unit tests.
- Native text shares immutable Paragraphs and proved numeric layout metrics;
  atlas pages use fixed 3/6/12 densities. Unknown style/shape proof conditions
  use native layout. Advanced JS-only text/stroke effects remain qualification
  work and are not claimed as supported by the successful numeric fixtures.

- Text color preserves release's projection pipeline: component `tint` overrides
  `style.fill` (including the admitted white default); standalone text uses
  `style.fill`. Stroke raster RGB is modulated by that projection color and
  object opacity applies once after fill/stroke composition. The browser oracle
  at `.artifacts/verification/flutter-text-compat-20261019/` executes the release
  materializer/parser/style with Pixi8.22.0; native regression tests cover the
  corresponding color and opacity rules. Shadow/padding and other fields that
  release does not forward remain preserved data without newly added effects.
  The invalid JSON `stroke.fill` red error fallback is not a supported paint
  feature; JSON texture-backed text strokes remain unqualified.
