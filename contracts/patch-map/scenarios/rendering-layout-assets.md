# Rendering, Layout, and Asset Scenarios

## REN-001 — Compose nested groups

- **Priority:** P0
- **User goal:** Organize map regions so descendants move, hide, lock, and stack as one logical area.
- **Given:** Multiple nested groups containing mixed element kinds.
- **When:** The hierarchy is rendered or a parent transform/visibility changes.
- **Then:** Child order and local transforms compose through every ancestor; parent visibility removes descendant pixels and hit targets; parent lock prevents descendant editing while preserving visuals.
- **Edges:** Empty and deeply nested groups remain finite. A hidden or locked ancestor cannot leave an interactive descendant behind.
- **Lab:** `render/groups` uses a nested group specimen with parent move/show/lock controls.

## REN-002 — Render grid cells as repeated items

- **Priority:** P0
- **User goal:** See equipment laid out from a cell matrix with shared visual content.
- **Given:** A grid containing active, inactive, and named cells with mixed components.
- **When:** The grid is rendered.
- **Then:** Every active cell is a complete item at the expected row/column position; gaps, size, padding, component placement, orientation, and grid transform apply consistently.
- **Edges:** Inactive hide and removal strategies produce different semantic presence but no stale pixels or hits.
- **Lab:** `render/grid` uses a grid matrix editor with cell count and bounds assertions.

## REN-003 — Compose an item from ordered components

- **Priority:** P0
- **User goal:** Display one equipment object using background, bar, icon, and text layers.
- **Given:** A sized item containing all four component kinds in a deliberate order.
- **When:** The item is rendered.
- **Then:** The background covers the intended item area; bar, icon, and text use the padded content box; component order, visibility, tint, placement, and overflow produce a deterministic composite.
- **Edges:** An item with no components remains a valid sized semantic object and hit
  target when interaction is enabled. A hidden component retains logical/query identity
  but has no PixiJS render object; showing it materializes current state under the same ID.
- **Lab:** `render/item-components` uses an item component stack with per-component visibility toggles.

## REN-004 — Render standalone rectangles

- **Priority:** P0
- **User goal:** Draw zones, backgrounds, and markers without creating an item.
- **Given:** Rectangles using fill, stroke, opacity, a uniform scalar radius, transform, and stacking values.
- **When:** They are rendered and later resized or restyled.
- **Then:** Geometry and hit bounds match the declared size and transform; fill, stroke, radius, alpha, visibility, and stacking update without stale geometry.
- **Edges:** Zero stroke, transparent fill, large radius, negative world position, and rotated rectangles remain deterministic and finite.
- **Lab:** `render/rect` uses rect style and transform controls.

## REN-005 — Render standalone images

- **Priority:** P0
- **User goal:** Place site backgrounds and visual equipment assets in world space.
- **Given:** Images from registered aliases, direct URLs, data URIs, and inline descriptors with optional size and transform.
- **When:** Assets resolve and the scene renders.
- **Then:** Each image preserves the intended source, dimensions, transform, opacity,
  visibility, stacking, and hit bounds. Standalone image tint is not part of the strict
  dataset schema; a host that needs tint supplies an approved visual update only after
  a future schema revision.
- **Edges:** Slow, failed, destroyed-before-completion, and source-replaced loads do not publish stale pixels or retain abandoned resources.
- **Lab:** `render/image` uses an asset-source chooser with delayed/failing asset fixtures.

## REN-006 — Render standalone text

- **Priority:** P0
- **User goal:** Place labels and annotations independently of items.
- **Given:** Multiline text using supported family, weight, size, fill, wrap, line height, letter spacing, `left`/`center`/`right`/`justify` alignment, transform, and optional bounds.
- **When:** It is rendered or its content/style changes.
- **Then:** Text content, line breaks, baseline intent, spacing, bounds, stacking, opacity, visibility, rotation, and hit area update together. Visible multiline `justify` publishes the semantic line-broken text to Pixi `Text` with the semantic layout width; word gaps expand on every nonterminal line and the final line remains unexpanded.
- **Edges:** Empty text, long unbroken text, Unicode, mixed line endings, missing font, single-line justify, and rapid content replacement have explicit fallback and deterministic bounds. Bitmap routing fails closed for justify until its capability proof schema represents alignment.
- **Lab:** `render/standalone-text` uses a standalone text specimen with random Unicode and long-text controls.

## REN-007 — Render and maintain relations

- **Priority:** P0
- **User goal:** See connectivity between equipment while endpoints move and the view changes.
- **Given:** Ordered links connecting elements across nested groups and grids, with
  relation color/width/alpha style and a transformed relations container.
- **When:** The scene draws, endpoints move/resize/hide, link sets change, or the world rotates, flips, focuses, or zooms.
- **Then:** Every valid link connects the exact centers of source and target world bounds
  after conversion into the relations element's local frame; color, width, alpha, and
  visibility update; relation stacking remains deterministic relative to elements and
  overlays. Unsupported advanced stroke keys fail at the dataset boundary.
- **Edges:** Relations declared before endpoints settle after the same draw. A missing
  or removed endpoint omits only that segment. A hidden retained grid cell keeps endpoint
  identity/geometry but hides its segments until shown. Self-links remain finite;
  duplicate ordered pairs keep only the first authored link and reverse pairs remain
  distinct.
- **Lab:** `render/relations` uses a movable endpoint board with link/style/visibility controls.

## REN-008 — Render item backgrounds

- **Priority:** P0
- **User goal:** Give an item a scalable solid or image-backed visual surface.
- **Given:** Rectangular and asset-backed backgrounds with border/radius/tint variants.
- **When:** Parent size, padding, background source, style, tint, or visibility changes.
- **Then:** The background stays aligned with the full item area, preserves corner and
  border intent, and switches source without showing stale texture or bounds.
- **Edges:** Transparent styles, asynchronous replacement, and hidden-to-visible transitions are deterministic.
- **Lab:** `render/background` uses a background source/style switcher.

## REN-009 — Render and animate bars

- **Priority:** P0
- **User goal:** See continuously changing measurements without blocking interaction.
- **Given:** Bars with pixel/percentage size, placement, margin, source, tint, animation setting, and duration.
- **When:** One or many bar sizes change.
- **Then:** The destination commits immediately. Visible size uses `easeOutCubic` from
  the current presentation value to the destination over the requested duration,
  default `200ms`; `t >= duration` is exact. Immediate mode jumps to final geometry;
  texture, tint, parent transform, visibility, and stacking stay correct throughout.
- **Edges:** A new change interrupts an active animation from the current visual state. Disabling animation during motion lands on the final state. Zero duration, hidden/destroyed targets, source replacement, and rapid bulk updates cannot leave ghost bars.
- **Performance:** The declared 100/500/1,000/2,000/5,000 bar workload records frame gaps and long tasks during the full animation.
- **Lab:** `Random bar update` is repeatable and always animated unless immediate mode is explicitly selected.

## REN-010 — Render icons

- **Priority:** P0
- **User goal:** Display equipment status using reusable or direct image assets.
- **Given:** Icons with source, pixel/percentage size, placement, margin, tint, visibility, and orientation.
- **When:** They render or any of those fields changes.
- **Then:** The correct asset occupies the expected content-box position and size; tint and visibility update; source changes preserve placement and remove stale texture state.
- **Edges:** Missing asset, delayed replacement, mixed percentage units, padding changes, and orientation changes remain recoverable.
- **Lab:** `render/icon` uses an icon source/placement/tint matrix.

## REN-011 — Render item text labels

- **Priority:** P0
- **User goal:** Display readable names, values, and statuses inside equipment items.
- **Given:** Text labels using placement, margin, tint, split, font style, automatic size, wrap width, and overflow mode.
- **When:** They render or text/style/parent geometry changes.
- **Then:** Text stays inside its declared layout mode, resolves the correct visible content, and publishes finite bounds that reflect wrap, split, overflow, and orientation.
- **Edges:** Empty, multiline, grapheme/CJK/bidi/RTL/emoji/combining-mark, very long,
  rapidly changing, hidden, and missing-font text must not retain prior glyphs or
  geometry. `split=0` preserves the original string; positive values split only at
  grapheme boundaries, and negative values are rejected.
- **Performance:** Dynamic text scenarios separately measure layout work, glyph/texture work, upload, render, and next-frame visibility.
- **Lab:** `render/item-text` provides **Render random text** and **Change random text** with configurable length and Unicode ratio.

## LAY-001 — Resolve the item content box

- **Priority:** P0
- **User goal:** Keep components aligned as item size and padding change.
- **Given:** Items and grid templates using scalar, axis, and edge padding.
- **When:** Components use percentage sizes or edge/center placement.
- **Then:** All component geometry derives from the same padded content box; explicit edge overrides win; parent resize or padding update recomputes every dependent component in the same publication.
- **Lab:** `layout/content-box` uses a padding/content-box overlay with size and percentage controls.

## LAY-002 — Place components in every supported slot

- **Priority:** P1
- **User goal:** Position labels and icons consistently at all nine supported anchors.
- **Given:** Identical components using each placement value and asymmetric margin.
- **When:** The item renders under different sizes, padding, rotation, and flip.
- **Then:** Each named placement occupies its declared anchor relative to the current
  content frame; margins offset the expected edges. Unknown placements are rejected.
- **Lab:** `layout/placement` uses a placement matrix with orientation controls.

## LAY-003 — Preserve stacking and display order

- **Priority:** P0
- **User goal:** Keep backgrounds, equipment, relations, aggregate content, selection overlays, and editing handles in the intended visual order.
- **Given:** Nested elements with equal and different stacking values and runtime source/visibility changes.
- **When:** The scene draws, updates, redraws, or restores history.
- **Then:** Higher stacking values render above lower ones; equal values preserve stable sibling order; overlays remain usable; optimized rendering paths do not change public order.
- **Lab:** `layout/stacking` uses overlapping color-coded objects with order mutation controls.

## LAY-004 — Keep content readable or follow its item

- **Priority:** P0
- **User goal:** Choose whether inner text, icon, and bar rotate with equipment or remain readable on screen.
- **Given:** Items and grid templates using `upright` and `follow-item`, nested group transforms, item angle/rotation, and world rotation/flip combinations.
- **When:** Any local or world orientation changes.
- **Then:** `follow-item` content follows the authored item frame; `upright` content counter-transforms so its screen orientation stays readable while placement and visible center remain aligned.
- **Edges:** Cover 0/90/180/270 degrees, arbitrary angles, X/Y/double flip, negative scale, nested rotation, and mode changes after render.
- **Lab:** `layout/orientation` uses an orientation matrix with screen-axis overlay.

## LAY-005 — Publish correct local, world, and visible bounds

- **Priority:** P0
- **User goal:** Select, focus, fit, connect, and edit what is visibly rendered.
- **Given:** Rotated, flipped, overflowing, nested, hidden, and asset-backed objects.
- **When:** Bounds are consumed by hit testing, relations, viewport operations, or transformer overlays.
- **Then:** Each consumer receives geometry consistent with the visible object in its required coordinate space; a bounds refresh cannot lag behind the published visual state.
- **Edges:** Zero-size nodes, overflowing text, transparent-but-interactive objects, and destroyed targets have explicit contributor rules.
- **Lab:** `layout/bounds` uses a bounds overlay and hit probe for every element kind.

## AST-001 — Register and load reusable assets

- **Priority:** P0
- **User goal:** Load built-in and application assets once and reuse them across the scene.
- **Given:** Asset bundles and individual aliases including fonts, SVGs, and raster images.
- **When:** A map instance initializes and elements reference those aliases.
- **Then:** Only initialization assets explicitly marked required block readiness.
  Duplicate registration is safe, aliases resolve consistently, and a global PixiJS
  cache entry is protected by per-instance leases until the last lease/pending user is
  released. Every instance revalidates its own host security policy before acquiring a
  shared entry. Re-registering one global alias with a non-equivalent descriptor fails
  with `ASSET_ALIAS_CONFLICT`; cache identity includes every observable loader option.
  Dataset-compatible built-ins include object, inverter, combiner, device,
  edge, loading, warning, and wifi imagery plus Fira Code weights 300–700.
- **Edges:** Required-init failure rejects initialization cleanly. Scene-target asset
  failure publishes deterministic placeholder geometry/hit behavior and retry while
  unrelated content remains usable.
- **Lab:** `assets/bundles` uses a bundle/alias fixture with success, duplicate, and failure controls.

### Scene-asset placeholder profile

- a failed standalone image keeps authored size; when size is absent and natural size
  is unavailable, it uses finite `32×32` world-unit fallback bounds;
- a failed item background keeps the full item frame and a failed icon keeps its
  authored component bounds;
- the target remains queryable and point/box selectable under its ordinary visibility,
  lock, and interaction rules; bounds and relation endpoints use placeholder geometry;
- semantic paint records `asset-placeholder` plus sanitized asset identity while exact
  pixels remain environment-qualified;
- one target-scoped diagnostic is emitted per failed attempt. Explicit retry deduplicates
  concurrent requests, and the first successful replacement frame atomically removes
  placeholder state without changing logical identity.

## AST-002 — Load inline asset descriptors distinctly

- **Priority:** P1
- **User goal:** Use the same URL with different loader options such as SVG resolution.
- **Given:** Equivalent and non-equivalent descriptors containing source URL, loader data, format, and parser hints.
- **When:** Images, icons, or backgrounds load them.
- **Then:** Equivalent descriptors reuse one resolved resource; descriptors differing in observable loader options remain distinct; caller-provided descriptor objects remain unchanged.
- **Edges:** Query strings, URL fragments, data URIs, unknown descriptor fields, and cyclic/reused option objects have deterministic validation and cache identity.
- **Lab:** `assets/descriptors` uses a descriptor cache-identity specimen with resolution variants.

## AST-003 — Handle stale asynchronous asset completion

- **Priority:** P1
- **User goal:** Change datasets or leave the page while assets are still loading without flashes or leaks.
- **Given:** Delayed asset requests followed by source replacement, redraw, or destroy.
- **When:** Earlier requests complete after the authoritative scene changed.
- **Then:** Late results cannot attach to the new scene, overwrite a newer source, emit a false success, or retain a destroyed instance; resources follow the declared cache ownership policy.
- **Lab:** `assets/stale-completion` uses deterministic delayed-loader controls for replace/redraw/destroy races.
