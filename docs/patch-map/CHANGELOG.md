# PatchMap changelog

## Unreleased

- Promoted the PixiJS WebGL PatchMap runtime to the package root with direct
  PATCH MAP v0.10 JSON input.
- Added dense scene transactions, stable logical queries, selection,
  transformer, viewport, history, asset, extraction, and lifecycle APIs.
- Added packaged minimal, Dashboard, Editor, and Report examples plus a
  consumer-owned host adapter.
- Added explicit canonical/legacy input materialization and guarded persistence
  roundtrip APIs, with host-owned guidance for canary rollout, shadowing, and
  next-remount rollback.
- Added strict ESM/CJS/types, package hygiene, multi-instance, host journey,
  documentation, and digest-bound release verification.
- Restored the canonical default palette and wired partial, instance-local
  `PatchMap.mount({ theme })` overrides through authored and overlay rendering.
- Added stable hover and pointer-selection projections plus package-owned,
  policy-filtered drag box selection with root pointer capture and cleanup.
- Added an explicit Shift-only box activation policy so ordinary primary drag
  remains viewport pan, and restored the exact filled 72×72 PATCH MAP v0.10
  built-in SVG catalog without changing host-injected alias ownership. Built-in
  Pixi cache identities now include the exact SVG content so an older glyph
  cannot satisfy the same public alias after an artifact replacement. Runtime
  textures preserve the catalog's exact 72×72 view boxes and transparent outer
  padding, so public icon `size` describes the source canvas/draw box.
- Added root `selection.visual` color, CSS-pixel stroke, and display-mode
  policy plus a package-owned transient box marquee. Display modes preserve
  Transformer bounds semantics: individual, aggregate, both, or hidden,
  without filtering selection identity. One canvas, pointer authority, frame
  loop, and destroy lifecycle remain preserved.
- Split transient marquee paint into optional `selection.box.visual` while
  keeping `selection.visual` dedicated to persistent selected bounds. Omitting
  the new policy preserves the prior shared color/width and `0.08` fill.
- Added independent blank-canvas clear and selected-target double-deselect
  policies. Existing blank single-click clearing remains the default; the
  opt-in service policy keeps new-target and Shift-click response immediate,
  preserves multi-selection on the first selected-target click, and removes
  only that target on the paired second click.
- Added opt-in `pointer.hoverDuringPress` so root-owned hover projection can
  remain stable through a selectable-target click while preserving the
  compatible pointer-down leave default and real leave/cancel cleanup.
- Fixed persistent selection and active marquee stroke tessellation so their
  configured CSS-pixel widths remain stable across viewport zoom and renderer
  DPR changes without redrawing unchanged aggregate overlay frames.
- Added `selection.visual.strokeAlignment` with outside/center/inside semantic
  values. The compatible default remains centered; outside keeps the full
  persistent bound beyond target paint without changing marquee placement.
- Fixed persistent selection/transformer bounds to use cached visual paint
  geometry rather than only the semantic owner quad. Centered rect/background
  strokes now contribute their exact outward half-width, projected component
  layout and negative margins participate in owner bounds, and unchanged
  frames still perform no component scan or overlay retessellation.
- Added opt-in persistent selection stroke LOD with
  `selection.visual.strokeScale: 'viewport'` and a CSS-pixel
  `minStrokeWidth` floor. The compatible fixed-screen default, high-zoom cap,
  visual paint bounds, outside alignment, and fixed marquee width remain
  unchanged.
- Added root `viewport.wheel.activationModifier` with compatible `none` and
  opt-in `control` semantics. Ctrl/Command wheel retains package cursor-anchor
  zoom and native consumption, while rejected plain/Shift/Alt wheel remains
  available to page or container scrolling without host listeners.
- Restored the main-compatible point-selection slop: movement through 4 CSS px
  per axis remains a click, while a strict excursion beyond 4px activates the
  sticky primary-pan or Shift-box owner independently of viewport zoom,
  renderer DPR/resolution, and pointer event cadence.
- Fixed omitted multiline text line height so it scales with the resolved font
  size at the preserved 16px/20px ratio. Explicit authored line height remains
  exact, and automatic font fitting evaluates each candidate with its matching
  proportional line height before wrap and overflow decisions.

WebGPU and native headed Windows release measurements remain separately
reported experimental/pending evidence; they are not implied by this entry.
