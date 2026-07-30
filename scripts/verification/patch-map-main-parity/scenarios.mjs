const ORIENTATION_MATRIX = Object.freeze([
  Object.freeze({
    type: 'world-transform',
    world: Object.freeze({ rotationDegrees: 90, flipX: false, flipY: false }),
  }),
  Object.freeze({
    type: 'world-transform',
    world: Object.freeze({ rotationDegrees: 180, flipX: false, flipY: true }),
  }),
  Object.freeze({
    type: 'world-transform',
    world: Object.freeze({ rotationDegrees: 315, flipX: true, flipY: false }),
  }),
]);

const INLINE_ICON = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2220%22 height=%2220%22 viewBox=%220 0 20 20%22%3E%3Cpath fill=%22white%22 d=%22M2 9h16v2H2zm7-7h2v16H9z%22/%3E%3C/svg%3E';
const INLINE_RED_IMAGE = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2280%22 height=%2280%22 viewBox=%220 0 80 80%22%3E%3Crect width=%2280%22 height=%2280%22 rx=%2212%22 fill=%22%23d34a44%22/%3E%3Ccircle cx=%2240%22 cy=%2240%22 r=%2216%22 fill=%22%23fff%22/%3E%3C/svg%3E';
const INLINE_BLUE_IMAGE = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2280%22 height=%2280%22 viewBox=%220 0 80 80%22%3E%3Crect width=%2280%22 height=%2280%22 rx=%2212%22 fill=%22%233478c8%22/%3E%3Cpath d=%22M18 38h44v8H18z%22 fill=%22%23fff%22/%3E%3C/svg%3E';

const PAR_001_ACCEPTED_DIFFERENCES = Object.freeze([
  Object.freeze({
    checkpoint: '*',
    path: 'entity.explicit-item::explicit-text.bounds.*',
    classification: 'approved-pinned-text-metrics',
    reason:
      'PatchMap keeps its approved deterministic text metrics while main uses browser-runtime glyph metrics',
  }),
  Object.freeze({
    checkpoint: '*',
    path: 'entity.explicit-rect.bounds.*',
    classification: 'semantic-vs-painted-stroke-bounds',
    reason:
      'main getBounds includes the centered stroke while PatchMap semantic bounds retain the authored frame; pixels include the stroke in both runtimes',
  }),
  Object.freeze({
    checkpoint: 'world-*',
    path: 'entity.explicit-item::explicit-background.bounds.*',
    classification: 'semantic-vs-painted-stroke-bounds',
    reason:
      'main getBounds includes the background stroke while PatchMap reports its authored component quad',
  }),
  Object.freeze({
    checkpoint: 'world-*',
    path: 'entity.explicit-item::explicit-icon.bounds.*',
    classification: 'approved-authored-center-orientation',
    reason:
      'PatchMap preserves the approved authored icon center during readable half-turn correction while main rotates the placement around the owner center',
  }),
  Object.freeze({
    checkpoint: 'world-*',
    path: 'image.entity.explicit-item::explicit-icon.*',
    classification: 'approved-authored-center-orientation',
    reason:
      'the icon pixels follow PatchMap authored-center orientation rather than main placement rotation',
  }),
]);

const PAR_002_ACCEPTED_DIFFERENCES = Object.freeze([
  Object.freeze({
    checkpoint: 'world-180-ny',
    path: 'entity.*::orientation-bar-*.bounds.*',
    classification: 'approved-readable-bar-placement',
    reason:
      'PatchMap keeps an upright bottom bar on the visible bottom after reflection as explicitly approved; main leaves it on the opposite visual edge',
  }),
  Object.freeze({
    checkpoint: 'world-180-ny',
    path: 'image.entity.*::orientation-bar-*.*',
    classification: 'approved-readable-bar-placement',
    reason:
      'the bar pixels follow the explicitly approved visible-bottom correction',
  }),
  Object.freeze({
    checkpoint: 'world-315-xn',
    path: 'entity.*',
    classification: 'approved-screen-axis-affine-order',
    reason:
      'PatchMap uses the approved F×R screen-axis reflection order while main black-box behavior composes the reflected rotation differently',
  }),
  Object.freeze({
    checkpoint: 'world-315-xn',
    path: 'image.content.bounds',
    classification: 'approved-screen-axis-affine-order',
    reason:
      'the whole-scene image envelope follows the approved PatchMap F×R screen-axis reflection order',
  }),
  Object.freeze({
    checkpoint: 'world-315-xn',
    path: 'image.entity.*',
    classification: 'approved-screen-axis-affine-order',
    reason:
      'leaf pixels follow the approved PatchMap F×R screen-axis reflection order',
  }),
]);

const PAR_004_ACCEPTED_DIFFERENCES = Object.freeze([
  Object.freeze({
    checkpoint: 'browser-wheel-*',
    path: 'viewport.scale',
    classification: 'interaction-calibration',
    reason:
      'both runtimes zoom toward the cursor but their public wheel-rate calibration differs',
  }),
  Object.freeze({
    checkpoint: 'browser-wheel-*',
    path: 'viewport.centerWorld.*',
    classification: 'interaction-calibration',
    reason:
      'cursor anchoring shifts each viewport center by the amount implied by its different public wheel-rate calibration',
  }),
  Object.freeze({
    checkpoint: 'browser-wheel-*',
    path: 'entity.*.bounds.*',
    classification: 'interaction-calibration',
    reason:
      'entity scale follows each runtime wheel-rate calibration after the same browser delta',
  }),
  Object.freeze({
    checkpoint: 'browser-wheel-*',
    path: 'image.content.bounds',
    classification: 'interaction-calibration',
    reason:
      'the raster envelope follows each runtime wheel-rate calibration',
  }),
  Object.freeze({
    checkpoint: 'browser-wheel-*',
    path: 'image.entity.*',
    classification: 'interaction-calibration',
    reason:
      'leaf pixels follow each runtime wheel-rate calibration',
  }),
  Object.freeze({
    checkpoint: 'browser-drag-*',
    path: 'viewport.*',
    classification: 'interaction-calibration',
    reason:
      'the prior wheel-rate difference changes the world-unit pan delta while both runtimes move by the same CSS-pixel drag',
  }),
  Object.freeze({
    checkpoint: 'browser-drag-*',
    path: 'entity.*.bounds.*',
    classification: 'interaction-calibration',
    reason:
      'entity geometry retains the prior wheel-rate difference after equal CSS-pixel pan',
  }),
  Object.freeze({
    checkpoint: 'browser-drag-*',
    path: 'image.content.bounds',
    classification: 'interaction-calibration',
    reason:
      'the raster envelope retains the prior wheel-rate difference after equal CSS-pixel pan',
  }),
  Object.freeze({
    checkpoint: 'browser-drag-*',
    path: 'image.entity.*',
    classification: 'interaction-calibration',
    reason:
      'leaf pixels retain the prior wheel-rate difference after equal CSS-pixel pan',
  }),
  Object.freeze({
    checkpoint: 'focus-*',
    path: 'viewport.scale',
    classification: 'interaction-calibration',
    reason:
      'focus preserves each runtime current zoom calibration while both centers converge on the same target',
  }),
  Object.freeze({
    checkpoint: 'focus-*',
    path: 'entity.*.bounds.*',
    classification: 'interaction-calibration',
    reason:
      'focused entity sizes retain each runtime current zoom calibration',
  }),
  Object.freeze({
    checkpoint: 'focus-*',
    path: 'image.content.bounds',
    classification: 'interaction-calibration',
    reason:
      'the focused raster envelope retains each runtime current zoom calibration',
  }),
  Object.freeze({
    checkpoint: 'focus-*',
    path: 'image.entity.*',
    classification: 'interaction-calibration',
    reason:
      'focused leaf pixels retain each runtime current zoom calibration',
  }),
  Object.freeze({
    checkpoint: 'world-*',
    path: 'viewport.scale',
    classification: 'interaction-calibration',
    reason:
      'world orientation preserves each runtime current zoom calibration',
  }),
  Object.freeze({
    checkpoint: 'world-*',
    path: 'entity.*.bounds.*',
    classification: 'interaction-calibration',
    reason:
      'world-oriented entity sizes retain each runtime current zoom calibration',
  }),
  Object.freeze({
    checkpoint: 'world-*',
    path: 'image.content.bounds',
    classification: 'interaction-calibration',
    reason:
      'the world-oriented raster envelope retains each runtime current zoom calibration',
  }),
  Object.freeze({
    checkpoint: 'world-*',
    path: 'image.entity.*',
    classification: 'interaction-calibration',
    reason:
      'world-oriented leaf pixels retain each runtime current zoom calibration',
  }),
]);

const PAR_005_ACCEPTED_DIFFERENCES = Object.freeze([
  Object.freeze({
    checkpoint: '*',
    path: 'entity.mutable-text.bounds.*',
    classification: 'approved-pinned-text-metrics',
    reason:
      'PatchMap keeps its approved deterministic text metrics while main uses browser-runtime glyph metrics',
  }),
  Object.freeze({
    checkpoint: '*',
    path: 'entity.mutable-rect.bounds.*',
    classification: 'semantic-vs-painted-stroke-bounds',
    reason:
      'main getBounds includes the centered stroke while PatchMap semantic bounds retain the authored frame; pixels include the stroke in both runtimes',
  }),
  Object.freeze({
    checkpoint: '*',
    path: 'image.content.bounds',
    classification: 'approved-text-and-stroke-envelope',
    reason:
      'the whole-scene raster envelope combines the approved pinned text metrics and different public stroke-bound semantics',
  }),
  Object.freeze({
    checkpoint: 'update-element-8',
    path: 'entity.mutable-rect.visible',
    classification: 'approved-visibility-correction',
    reason:
      'PatchMap honors the approved show:false update while main leaves the standalone rect visible',
  }),
]);

const PAR_007_ACCEPTED_DIFFERENCES = Object.freeze([
  Object.freeze({
    checkpoint: '*',
    path: 'entity.transform-target.bounds.*',
    classification: 'semantic-vs-painted-stroke-bounds',
    reason:
      'main getBounds includes the centered stroke while PatchMap semantic bounds retain the authored transformer frame',
  }),
  Object.freeze({
    checkpoint: '*',
    path: 'image.content.bounds',
    classification: 'semantic-vs-painted-stroke-envelope',
    reason:
      'the visible selection envelope includes renderer-specific centered stroke coverage',
  }),
]);

const PAR_010_ACCEPTED_DIFFERENCES = Object.freeze([
  Object.freeze({
    checkpoint: 'resize-*',
    path: 'viewport.centerWorld.*',
    classification: 'approved-center-preserving-resize',
    reason:
      'PatchMap preserves the declared world center across host resize, as pinned by LIF-004/VIE-007, while main keeps the prior top-left screen mapping',
  }),
  Object.freeze({
    checkpoint: 'resize-*',
    path: 'entity.*.bounds.*',
    classification: 'approved-center-preserving-resize',
    reason:
      'entity screen placement follows PatchMap world-center preservation after the host aspect ratio changes',
  }),
  Object.freeze({
    checkpoint: 'resize-*',
    path: 'image.content.bounds',
    classification: 'approved-center-preserving-resize',
    reason:
      'the raster envelope follows PatchMap world-center preservation after resize',
  }),
  Object.freeze({
    checkpoint: 'resize-*',
    path: 'image.entity.*',
    classification: 'approved-center-preserving-resize',
    reason:
      'isolated entity pixels follow PatchMap world-center preservation after resize',
  }),
]);

const PAR_012_ACCEPTED_DIFFERENCES = Object.freeze([
  Object.freeze({
    checkpoint: 'update-component-*',
    path: 'entity.animation-item::animation-bar.bounds.*',
    classification: 'transient-animation-clock-phase',
    reason:
      'both runtimes begin the authored transition, but their public frame clocks are sampled on adjacent browser frames',
  }),
  Object.freeze({
    checkpoint: 'update-component-*',
    path: 'image.entity.animation-item::animation-bar.*',
    classification: 'transient-animation-clock-phase',
    reason:
      'the blocking transition invariant separately proves both bars remain between the authored endpoints with a fixed bottom edge; adjacent public frame clocks may still paint a different fractional row',
  }),
]);

const PAR_013_ACCEPTED_DIFFERENCES = Object.freeze([
  ...[
    'visibility-background-item::visibility-background',
    'visibility-bar-item::visibility-bar',
    'visibility-icon-item::visibility-icon',
    'visibility-text-item::visibility-text',
  ].map((key) => Object.freeze({
    checkpoint: 'update-component-*',
    path: `entity.${key}.present`,
    classification: 'aggregate-hidden-logical-presence',
    reason:
      'main may physically remove a hidden component from its public selector while PatchMap intentionally retains aggregate logical identity; the fixed raster strip independently verifies that neither runtime paints it',
  })),
  ...[
    'visibility-background-item::visibility-background',
    'visibility-bar-item::visibility-bar',
    'visibility-icon-item::visibility-icon',
    'visibility-text-item::visibility-text',
  ].map((key) => Object.freeze({
    checkpoint: 'update-component-*',
    path: `entity.${key}.visible`,
    classification: 'main-wrapper-vs-painted-visibility',
    reason:
      'main keeps the selected component wrapper visible while suppressing its painted child; PatchMap exposes logical visibility directly and the fixed raster strip proves equivalent output',
  })),
  Object.freeze({
    checkpoint: '*',
    path: 'entity.visibility-text-item::visibility-text.bounds.*',
    classification: 'approved-pinned-text-metrics',
    reason:
      'PatchMap keeps approved deterministic CJK fallback metrics while main uses browser-runtime glyph metrics',
  }),
  Object.freeze({
    checkpoint: '*',
    path: 'image.content.bounds',
    classification: 'approved-pinned-text-envelope',
    reason:
      'the remaining scene envelope can be text-defined after other components are hidden, so it follows each runtime text metric policy',
  }),
]);

const PAR_014_ACCEPTED_DIFFERENCES = Object.freeze([
  Object.freeze({
    checkpoint: '*',
    path: 'entity.*.bounds.*',
    classification: 'approved-pinned-text-metrics',
    reason:
      'PatchMap uses deterministic Latin/CJK metrics and guarded fallback while main uses browser-runtime glyph metrics',
  }),
  Object.freeze({
    checkpoint: '*',
    path: 'image.content.bounds',
    classification: 'approved-pinned-text-envelope',
    reason:
      'the semantic text and renderer publication are compared separately; the outer glyph envelope follows each runtime metric policy',
  }),
]);

const PAR_016_ACCEPTED_DIFFERENCES = Object.freeze([
  Object.freeze({
    checkpoint: 'update-component-*',
    path: 'entity.component-style-background-item::component-style-background.bounds.*',
    classification: 'approved-background-geometry-correction',
    reason:
      'main publicly accepts the source update but expands its background bounds with malformed border geometry; PatchMap retains the approved full-item rounded rectangle',
  }),
  Object.freeze({
    checkpoint: 'undo-*',
    path: 'entity.component-style-background-item::component-style-background.bounds.*',
    classification: 'approved-background-geometry-correction',
    reason:
      'the malformed main background remains after undoing a later icon tint while PatchMap retains the approved full-item rounded rectangle',
  }),
  Object.freeze({
    checkpoint: 'redo-*',
    path: 'entity.component-style-background-item::component-style-background.bounds.*',
    classification: 'approved-background-geometry-correction',
    reason:
      'the malformed main background remains after redoing a later icon tint while PatchMap retains the approved full-item rounded rectangle',
  }),
  Object.freeze({
    checkpoint: 'update-component-*',
    path: 'image.entity.component-style-stage.*',
    classification: 'approved-background-geometry-correction',
    reason:
      'the stage raster differs because main paints malformed border loops after the accepted source update; isolated bar and icon regions remain independently compared',
  }),
  Object.freeze({
    checkpoint: 'undo-*',
    path: 'image.entity.component-style-stage.*',
    classification: 'approved-background-geometry-correction',
    reason:
      'the stage raster retains main malformed border loops while a later icon tint is undone',
  }),
  Object.freeze({
    checkpoint: 'redo-*',
    path: 'image.entity.component-style-stage.*',
    classification: 'approved-background-geometry-correction',
    reason:
      'the stage raster retains main malformed border loops while a later icon tint is redone',
  }),
]);

const EXPLICIT_COMPONENT_SCENE = Object.freeze([
  Object.freeze({
    type: 'item',
    id: 'explicit-item',
    contentOrientation: 'upright',
    size: Object.freeze({ width: 100, height: 80 }),
    padding: Object.freeze({ top: 7, right: 10, bottom: 5, left: 10 }),
    components: Object.freeze([
      Object.freeze({
        type: 'background',
        id: 'explicit-background',
        source: Object.freeze({
          type: 'rect',
          fill: '#336699',
          borderWidth: 2,
          borderColor: '#112233',
          radius: 4,
        }),
        tint: '#ffffff',
      }),
      Object.freeze({
        type: 'bar',
        id: 'explicit-bar',
        source: Object.freeze({ type: 'rect', fill: '#00aa66', radius: 2 }),
        tint: '#ffffff',
        size: Object.freeze({ width: '50%', height: '25%' }),
        placement: 'bottom',
        margin: Object.freeze({ top: 0, right: 3, bottom: 4, left: 2 }),
        animation: false,
      }),
      Object.freeze({
        type: 'icon',
        id: 'explicit-icon',
        source: INLINE_ICON,
        tint: '#ff8844',
        size: Object.freeze({ width: 20, height: 20 }),
        placement: 'left-top',
        margin: Object.freeze({ top: 3, right: 0, bottom: 0, left: 4 }),
      }),
      Object.freeze({
        type: 'text',
        id: 'explicit-text',
        text: '42',
        tint: '#ffffff',
        placement: 'center',
        style: Object.freeze({
          fontFamily: 'FiraCode',
          fontSize: 16,
          lineHeight: 20,
          fill: '#ffffff',
        }),
      }),
    ]),
    attrs: Object.freeze({ x: 80, y: 60, angle: 35, zIndex: 2 }),
  }),
  Object.freeze({
    type: 'rect',
    id: 'explicit-rect',
    size: Object.freeze({ width: 60, height: 30 }),
    fill: '#cc5533',
    stroke: Object.freeze({ width: 3, color: '#331100' }),
    radius: 5,
    attrs: Object.freeze({ x: 250, y: 90, angle: -20, zIndex: 1 }),
  }),
]);

const CONTENT_ORIENTATION_SCENE = Object.freeze(
  [0, 70, 140, 210, 280].map((angle, index) => Object.freeze({
    type: 'item',
    id: `orientation-${index}`,
    contentOrientation: index === 4 ? 'follow-item' : 'upright',
    size: Object.freeze({ width: 90, height: 60 }),
    padding: 5,
    components: Object.freeze([
      Object.freeze({
        type: 'background',
        id: `orientation-bg-${index}`,
        source: Object.freeze({ type: 'rect', fill: '#dfe6ef' }),
        tint: '#ffffff',
      }),
      Object.freeze({
        type: 'bar',
        id: `orientation-bar-${index}`,
        source: Object.freeze({ type: 'rect', fill: '#6842c2' }),
        tint: '#ffffff',
        size: Object.freeze({ width: '70%', height: '25%' }),
        placement: 'bottom',
        animation: false,
      }),
      Object.freeze({
        type: 'text',
        id: `orientation-text-${index}`,
        text: String(index),
        tint: '#ffffff',
        placement: 'center',
        style: Object.freeze({
          fontFamily: 'FiraCode',
          fontSize: 14,
          lineHeight: 18,
          fill: '#ffffff',
        }),
      }),
    ]),
    attrs: Object.freeze({
      x: 80 + index * 115,
      y: 120 + (index % 2) * 120,
      angle,
    }),
  })),
);

const INTERACTION_SCENE = Object.freeze([
  Object.freeze({
    type: 'rect',
    id: 'hit-low',
    size: Object.freeze({ width: 100, height: 80 }),
    fill: '#3478c8',
    stroke: Object.freeze({ width: 2, color: '#173a64' }),
    radius: 6,
    attrs: Object.freeze({ x: 100, y: 100, zIndex: 1 }),
  }),
  Object.freeze({
    type: 'rect',
    id: 'hit-high',
    size: Object.freeze({ width: 100, height: 80 }),
    fill: '#d95f59',
    stroke: Object.freeze({ width: 2, color: '#6f211e' }),
    radius: 6,
    attrs: Object.freeze({ x: 150, y: 120, zIndex: 2 }),
  }),
  Object.freeze({
    type: 'rect',
    id: 'hit-third',
    size: Object.freeze({ width: 70, height: 60 }),
    fill: '#38a169',
    attrs: Object.freeze({ x: 310, y: 100, zIndex: 0 }),
  }),
]);

const MUTATION_SCENE = Object.freeze([
  Object.freeze({
    type: 'rect',
    id: 'mutable-rect',
    size: Object.freeze({ width: 90, height: 60 }),
    fill: '#386cb0',
    stroke: Object.freeze({ width: 2, color: '#173a64' }),
    radius: 4,
    attrs: Object.freeze({ x: 120, y: 120, zIndex: 1 }),
  }),
  Object.freeze({
    type: 'text',
    id: 'mutable-text',
    text: 'Before',
    size: Object.freeze({ width: 140, height: 40 }),
    style: Object.freeze({
      fontFamily: 'FiraCode',
      fontSize: 18,
      lineHeight: 22,
      fill: '#1f2937',
    }),
    attrs: Object.freeze({ x: 300, y: 130, zIndex: 2 }),
  }),
]);

const ROUNDED_BAR_SCENE = Object.freeze([
  Object.freeze({
    type: 'item',
    id: 'rounded-bar-item',
    contentOrientation: 'follow-item',
    size: Object.freeze({ width: 180, height: 90 }),
    padding: 8,
    components: Object.freeze([
      Object.freeze({
        type: 'bar',
        id: 'rounded-bar',
        source: Object.freeze({
          type: 'rect',
          fill: '#6d42c7',
          radius: 8,
        }),
        tint: '#ffffff',
        size: Object.freeze({ width: '80%', height: '52%' }),
        placement: 'center',
        animation: false,
      }),
    ]),
    attrs: Object.freeze({ x: 220, y: 180, angle: 0, zIndex: 1 }),
  }),
]);

const TRANSFORM_SCENE = Object.freeze([
  Object.freeze({
    type: 'rect',
    id: 'transform-target',
    size: Object.freeze({ width: 120, height: 80 }),
    fill: '#3478c8',
    stroke: Object.freeze({ width: 2, color: '#173a64' }),
    radius: 6,
    attrs: Object.freeze({ x: 180, y: 160, angle: 0, zIndex: 1 }),
  }),
]);

const ASSET_REPLACEMENT_SCENE = Object.freeze([
  Object.freeze({
    type: 'image',
    id: 'asset-target',
    source: INLINE_RED_IMAGE,
    size: Object.freeze({ width: 80, height: 80 }),
    attrs: Object.freeze({ x: 240, y: 170, zIndex: 1 }),
  }),
]);

const HIERARCHY_RELATION_SCENE = Object.freeze([
  Object.freeze({
    type: 'group',
    id: 'hierarchy-root',
    attrs: Object.freeze({ x: 60, y: 60 }),
    children: Object.freeze([
      Object.freeze({
        type: 'rect',
        id: 'hierarchy-back',
        size: Object.freeze({ width: 100, height: 80 }),
        fill: '#3478c8',
        attrs: Object.freeze({ x: 0, y: 0, zIndex: 0 }),
      }),
      Object.freeze({
        type: 'rect',
        id: 'hierarchy-front',
        size: Object.freeze({ width: 100, height: 80 }),
        fill: '#d95f59',
        stroke: Object.freeze({ width: 2, color: '#6f211e' }),
        radius: 8,
        attrs: Object.freeze({ x: 50, y: 30, zIndex: 2 }),
      }),
      Object.freeze({
        type: 'group',
        id: 'hierarchy-nested',
        attrs: Object.freeze({ x: 230, y: 10 }),
        children: Object.freeze([
          Object.freeze({
            type: 'rect',
            id: 'hierarchy-leaf',
            size: Object.freeze({ width: 80, height: 60 }),
            fill: '#38a169',
            attrs: Object.freeze({ x: 0, y: 0, zIndex: 1 }),
          }),
        ]),
      }),
    ]),
  }),
  Object.freeze({
    type: 'relations',
    id: 'hierarchy-links',
    links: Object.freeze([
      Object.freeze({ source: 'hierarchy-back', target: 'hierarchy-leaf' }),
    ]),
    style: Object.freeze({ color: '#222222', width: 3 }),
  }),
]);

const ANIMATED_BAR_COMPONENTS_BEFORE = Object.freeze([
  Object.freeze({
    type: 'background',
    id: 'animation-background',
    source: Object.freeze({ type: 'rect', fill: '#e2e8f0', radius: 8 }),
  }),
  Object.freeze({
    type: 'bar',
    id: 'animation-bar',
    source: Object.freeze({ type: 'rect', fill: '#6d42c7', radius: 6 }),
    tint: '#ffffff',
    size: Object.freeze({ width: '80%', height: 12 }),
    placement: 'bottom',
    animation: false,
    animationDuration: 120,
  }),
]);

const ANIMATED_BAR_SCENE = Object.freeze([
  Object.freeze({
    type: 'item',
    id: 'animation-item',
    contentOrientation: 'upright',
    size: Object.freeze({ width: 180, height: 100 }),
    padding: 8,
    components: ANIMATED_BAR_COMPONENTS_BEFORE,
    attrs: Object.freeze({ x: 220, y: 170, zIndex: 1 }),
  }),
]);

const COMPONENT_VISIBILITY_SCENE = Object.freeze([
  Object.freeze({
    type: 'item',
    id: 'visibility-background-item',
    size: Object.freeze({ width: 100, height: 70 }),
    components: Object.freeze([
      Object.freeze({
        type: 'background',
        id: 'visibility-background',
        source: Object.freeze({ type: 'rect', fill: '#3478c8', radius: 8 }),
      }),
    ]),
    attrs: Object.freeze({ x: 80, y: 100, zIndex: 1 }),
  }),
  Object.freeze({
    type: 'item',
    id: 'visibility-bar-item',
    size: Object.freeze({ width: 100, height: 70 }),
    padding: 6,
    components: Object.freeze([
      Object.freeze({
        type: 'bar',
        id: 'visibility-bar',
        source: Object.freeze({ type: 'rect', fill: '#38a169', radius: 5 }),
        size: Object.freeze({ width: '85%', height: '55%' }),
        placement: 'bottom',
        animation: false,
      }),
    ]),
    attrs: Object.freeze({ x: 220, y: 100, zIndex: 1 }),
  }),
  Object.freeze({
    type: 'item',
    id: 'visibility-icon-item',
    size: Object.freeze({ width: 100, height: 70 }),
    components: Object.freeze([
      Object.freeze({
        type: 'icon',
        id: 'visibility-icon',
        source: INLINE_ICON,
        tint: '#f97316',
        size: Object.freeze({ width: 44, height: 44 }),
        placement: 'center',
      }),
    ]),
    attrs: Object.freeze({ x: 360, y: 100, zIndex: 1 }),
  }),
  Object.freeze({
    type: 'item',
    id: 'visibility-text-item',
    size: Object.freeze({ width: 120, height: 70 }),
    components: Object.freeze([
      Object.freeze({
        type: 'text',
        id: 'visibility-text',
        text: '표시 42',
        tint: '#7c3aed',
        placement: 'center',
        style: Object.freeze({
          fontFamily: 'Noto Sans KR',
          fontSize: 18,
          lineHeight: 22,
          fill: '#7c3aed',
        }),
      }),
    ]),
    attrs: Object.freeze({ x: 500, y: 100, zIndex: 1 }),
  }),
]);

const UNICODE_TEXT_SCENE = Object.freeze([
  Object.freeze({
    type: 'text',
    id: 'unicode-root-text',
    text: '장비 A-17\n상태 정상',
    size: Object.freeze({ width: 220, height: 70 }),
    style: Object.freeze({
      fontFamily: 'Noto Sans KR',
      fontSize: 18,
      lineHeight: 24,
      fill: '#1f2937',
    }),
    attrs: Object.freeze({ x: 120, y: 110, zIndex: 1 }),
  }),
  Object.freeze({
    type: 'item',
    id: 'unicode-item',
    size: Object.freeze({ width: 180, height: 80 }),
    components: Object.freeze([
      Object.freeze({
        type: 'text',
        id: 'unicode-component-text',
        text: '온도 24℃',
        tint: '#2563eb',
        placement: 'center',
        style: Object.freeze({
          fontFamily: 'Noto Sans KR',
          fontSize: 20,
          lineHeight: 24,
          fill: '#2563eb',
        }),
      }),
    ]),
    attrs: Object.freeze({ x: 420, y: 110, zIndex: 1 }),
  }),
]);

const MOVING_RELATION_SCENE = Object.freeze([
  Object.freeze({
    type: 'rect',
    id: 'moving-relation-a',
    size: Object.freeze({ width: 80, height: 60 }),
    fill: '#3478c8',
    attrs: Object.freeze({ x: 110, y: 130, zIndex: 1 }),
  }),
  Object.freeze({
    type: 'rect',
    id: 'moving-relation-b',
    size: Object.freeze({ width: 80, height: 60 }),
    fill: '#d95f59',
    attrs: Object.freeze({ x: 430, y: 250, zIndex: 1 }),
  }),
  Object.freeze({
    type: 'relations',
    id: 'moving-relation-links',
    links: Object.freeze([
      Object.freeze({ source: 'moving-relation-a', target: 'moving-relation-b' }),
    ]),
    style: Object.freeze({ color: '#222222', width: 4 }),
  }),
]);

const COMPONENT_STYLE_SCENE = Object.freeze([
  Object.freeze({
    type: 'item',
    id: 'component-style-background-item',
    size: Object.freeze({ width: 180, height: 110 }),
    components: Object.freeze([
      Object.freeze({
        type: 'background',
        id: 'component-style-background',
        source: Object.freeze({
          type: 'rect',
          fill: '#dbe7f3',
          borderWidth: 3,
          borderColor: '#334155',
          radius: 12,
        }),
      }),
    ]),
    attrs: Object.freeze({ x: 80, y: 180, zIndex: 1 }),
  }),
  Object.freeze({
    type: 'item',
    id: 'component-style-bar-item',
    size: Object.freeze({ width: 180, height: 110 }),
    padding: 10,
    components: Object.freeze([
      Object.freeze({
        type: 'bar',
        id: 'component-style-bar',
        source: Object.freeze({
          type: 'rect',
          fill: '#2f80ed',
          radius: 4,
        }),
        size: Object.freeze({ width: '60%', height: '30%' }),
        placement: 'bottom',
        animation: false,
      }),
    ]),
    attrs: Object.freeze({ x: 310, y: 180, zIndex: 1 }),
  }),
  Object.freeze({
    type: 'item',
    id: 'component-style-icon-item',
    size: Object.freeze({ width: 100, height: 110 }),
    components: Object.freeze([
      Object.freeze({
        type: 'icon',
        id: 'component-style-icon',
        source: INLINE_ICON,
        tint: '#f97316',
        size: Object.freeze({ width: 28, height: 28 }),
        placement: 'left-top',
        margin: Object.freeze({ top: 5, right: 0, bottom: 0, left: 5 }),
      }),
    ]),
    attrs: Object.freeze({ x: 560, y: 180, zIndex: 1 }),
  }),
]);

export const FIRST_PARITY_TRANCHE = Object.freeze([
  Object.freeze({
    id: 'LIF-001',
    title: 'empty initialize, publish, and terminal destroy',
    dataset: 'empty-scene',
    actions: Object.freeze([{ type: 'publish', timeMs: 33.333_334 }]),
  }),
  Object.freeze({
    id: 'LIF-002',
    title: 'direct load keeps one canvas and caller input',
    dataset: 'minimal',
    actions: Object.freeze([{ type: 'fit', padding: 24 }]),
  }),
  Object.freeze({
    id: 'LIF-003',
    title: 'resize preserves the loaded scene',
    dataset: 'interactive-scene',
    actions: Object.freeze([
      { type: 'fit', padding: 24 },
      { type: 'resize', width: 720, height: 480, pixelRatio: 1 },
      { type: 'fit', padding: 24 },
    ]),
  }),
  Object.freeze({
    id: 'DAT-002',
    title: 'all supported root kinds load directly',
    dataset: 'all-kinds-scene',
    actions: Object.freeze([{ type: 'fit', padding: 24 }]),
  }),
  Object.freeze({
    id: 'DAT-003',
    title: 'nested groups retain visible descendant placement',
    dataset: 'nested-groups',
    actions: Object.freeze([{ type: 'fit', padding: 24 }]),
  }),
  Object.freeze({
    id: 'DAT-004',
    title: 'item components share the authored content box',
    dataset: 'item-components',
    actions: Object.freeze([
      { type: 'fit', padding: 24 },
      ...ORIENTATION_MATRIX,
    ]),
  }),
  Object.freeze({
    id: 'REN-003',
    title: 'rect fill, stroke, radius, and transformed bounds',
    dataset: 'rect-specimen',
    actions: Object.freeze([
      { type: 'fit', padding: 24 },
      { type: 'world-transform', world: { rotationDegrees: 37, flipX: false, flipY: false } },
    ]),
  }),
  Object.freeze({
    id: 'REN-008',
    title: 'standalone text visibility and placement',
    dataset: 'standalone-text',
    actions: Object.freeze([
      { type: 'fit', padding: 24 },
      { type: 'world-transform', world: { rotationDegrees: 180, flipX: false, flipY: false } },
    ]),
  }),
  Object.freeze({
    id: 'REN-009',
    title: 'relation endpoints remain aligned through fit',
    dataset: 'relations',
    actions: Object.freeze([{ type: 'fit', padding: 24 }]),
  }),
  Object.freeze({
    id: 'LAY-004',
    title: 'content box and upright content stay inside the owner',
    dataset: 'content-box',
    actions: Object.freeze([
      { type: 'fit', padding: 24 },
      ...ORIENTATION_MATRIX,
    ]),
  }),
  Object.freeze({
    id: 'LAY-005',
    title: 'stacking order remains visibly equivalent',
    dataset: 'stacking',
    actions: Object.freeze([{ type: 'fit', padding: 24 }]),
  }),
  Object.freeze({
    id: 'REN-011',
    title: 'bounds include rotated and overflow specimens',
    dataset: 'bounds',
    actions: Object.freeze([
      { type: 'fit', padding: 24 },
      { type: 'world-transform', world: { rotationDegrees: 90, flipX: true, flipY: true } },
    ]),
  }),
  Object.freeze({
    id: 'PAR-001',
    title: 'explicit leaf/component geometry avoids default and asset ambiguity',
    dataset: 'inline:explicit-components',
    input: EXPLICIT_COMPONENT_SCENE,
    acceptedDifferences: PAR_001_ACCEPTED_DIFFERENCES,
    pixelRegions: Object.freeze([
      Object.freeze({
        checkpoint: '*',
        keys: Object.freeze(['explicit-rect']),
      }),
      Object.freeze({
        checkpoint: 'loaded',
        keys: Object.freeze(['explicit-item::explicit-icon']),
      }),
      Object.freeze({
        checkpoint: 'set-view-*',
        keys: Object.freeze(['explicit-item::explicit-icon']),
      }),
    ]),
    actions: Object.freeze([
      { type: 'set-view', centerWorld: [220, 150], scale: 1.5 },
      { type: 'world-transform', world: { rotationDegrees: 90, flipX: false, flipY: false } },
      { type: 'world-transform', world: { rotationDegrees: 180, flipX: true, flipY: false } },
    ]),
  }),
  Object.freeze({
    id: 'PAR-002',
    title: 'upright and follow-item content orientation matrix',
    dataset: 'inline:content-orientation',
    input: CONTENT_ORIENTATION_SCENE,
    acceptedDifferences: PAR_002_ACCEPTED_DIFFERENCES,
    actions: Object.freeze([
      { type: 'set-view', centerWorld: [350, 210], scale: 1 },
      ...ORIENTATION_MATRIX,
    ]),
  }),
  Object.freeze({
    id: 'PAR-003',
    title: 'point, overlap, empty, and box selection use browser input',
    dataset: 'inline:interaction',
    input: INTERACTION_SCENE,
    actions: Object.freeze([
      { type: 'browser-click', x: 120, y: 120, button: 'left', clickCount: 1 },
      { type: 'browser-click', x: 170, y: 140, button: 'left', clickCount: 1 },
      { type: 'browser-click', x: 700, y: 500, button: 'left', clickCount: 1 },
      {
        type: 'browser-drag',
        x: 80,
        y: 80,
        toX: 270,
        toY: 230,
        steps: 8,
        button: 'left',
      },
    ]),
  }),
  Object.freeze({
    id: 'PAR-004',
    title: 'programmatic and browser viewport actions preserve the same point of interest',
    dataset: 'inline:viewport',
    input: INTERACTION_SCENE,
    compareViewport: true,
    acceptedDifferences: PAR_004_ACCEPTED_DIFFERENCES,
    actions: Object.freeze([
      { type: 'set-view', centerWorld: [220, 160], scale: 1.5 },
      { type: 'browser-wheel', x: 300, y: 220, deltaX: 0, deltaY: -120 },
      {
        type: 'browser-drag',
        x: 500,
        y: 420,
        toX: 560,
        toY: 460,
        steps: 8,
        button: 'middle',
      },
      { type: 'focus', ids: ['hit-high'] },
      {
        type: 'world-transform',
        world: { rotationDegrees: 90, flipX: false, flipY: false },
      },
    ]),
  }),
  Object.freeze({
    id: 'PAR-005',
    title: 'element updates preserve selection and round-trip through history',
    dataset: 'inline:mutation-history',
    input: MUTATION_SCENE,
    acceptedDifferences: PAR_005_ACCEPTED_DIFFERENCES,
    actions: Object.freeze([
      { type: 'select', ids: ['mutable-rect'] },
      {
        type: 'update-element',
        id: 'mutable-rect',
        history: true,
        changes: {
          size: { width: 130, height: 75 },
          fill: '#d95f59',
          stroke: { width: 4, color: '#6f211e' },
          radius: 12,
          attrs: { x: 170, y: 160, zIndex: 3 },
        },
      },
      { type: 'undo' },
      { type: 'redo' },
      {
        type: 'update-element',
        id: 'mutable-text',
        history: 'text-edit',
        changes: {
          text: 'After',
          style: {
            fontFamily: 'FiraCode',
            fontSize: 22,
            lineHeight: 26,
            fill: '#7c3aed',
          },
        },
      },
      { type: 'undo' },
      { type: 'redo' },
      {
        type: 'update-element',
        id: 'mutable-rect',
        history: true,
        changes: { show: false },
      },
      { type: 'undo' },
    ]),
  }),
  Object.freeze({
    id: 'PAR-006',
    title: 'rounded bar preserves its authored corner geometry',
    dataset: 'inline:rounded-bar',
    input: ROUNDED_BAR_SCENE,
    pixelRegions: Object.freeze([
      Object.freeze({
        checkpoint: '*',
        keys: Object.freeze(['rounded-bar-item::rounded-bar']),
      }),
    ]),
    actions: Object.freeze([
      { type: 'set-view', centerWorld: [310, 225], scale: 1.75 },
      {
        type: 'world-transform',
        world: { rotationDegrees: 25, flipX: false, flipY: false },
      },
    ]),
  }),
  Object.freeze({
    id: 'PAR-007',
    title: 'transformer move, resize, rotate, undo, and redo preserve visible state',
    dataset: 'inline:transformer',
    input: TRANSFORM_SCENE,
    acceptedDifferences: PAR_007_ACCEPTED_DIFFERENCES,
    actions: Object.freeze([
      { type: 'select', ids: ['transform-target'] },
      {
        type: 'transform',
        transformKind: 'move',
        ids: ['transform-target'],
        deltaWorld: [40, 30],
        mainChanges: { attrs: { x: 220, y: 190, angle: 0, zIndex: 1 } },
      },
      { type: 'undo' },
      { type: 'redo' },
      {
        type: 'transform',
        transformKind: 'resize',
        ids: ['transform-target'],
        handle: 'se',
        deltaWorld: [30, 20],
        mainChanges: { size: { width: 150, height: 100 } },
      },
      {
        type: 'transform',
        transformKind: 'rotate',
        ids: ['transform-target'],
        deltaDegrees: 30,
        centerWorld: [295, 240],
        mainChanges: { attrs: { x: 220, y: 190, angle: 30, zIndex: 1 } },
      },
      { type: 'undo' },
      { type: 'redo' },
    ]),
  }),
  Object.freeze({
    id: 'PAR-008',
    title: 'image replacement resolves the new source without retaining stale pixels',
    dataset: 'inline:asset-replacement',
    input: ASSET_REPLACEMENT_SCENE,
    pixelRegions: Object.freeze([
      Object.freeze({
        checkpoint: '*',
        keys: Object.freeze(['asset-target']),
      }),
    ]),
    actions: Object.freeze([
      { type: 'set-view', centerWorld: [280, 210], scale: 2 },
      {
        type: 'update-element',
        id: 'asset-target',
        history: true,
        changes: { source: INLINE_BLUE_IMAGE },
      },
      { type: 'undo' },
      { type: 'redo' },
    ]),
  }),
  Object.freeze({
    id: 'PAR-009',
    title: 'nested hierarchy, relation geometry, and z-order stay visibly aligned',
    dataset: 'inline:hierarchy-relations',
    input: HIERARCHY_RELATION_SCENE,
    pixelRegions: Object.freeze([
      Object.freeze({
        checkpoint: '*',
        keys: Object.freeze(['hierarchy-front']),
      }),
      Object.freeze({
        checkpoint: 'set-view-*',
        fixed: Object.freeze([
          Object.freeze({
            key: 'hierarchy-relation-span',
            bounds: Object.freeze([265, 220, 255, 55]),
          }),
        ]),
      }),
    ]),
    actions: Object.freeze([
      { type: 'set-view', centerWorld: [240, 160], scale: 1 },
      {
        type: 'update-element',
        id: 'hierarchy-front',
        history: true,
        changes: { attrs: { x: 50, y: 30, zIndex: -1 } },
      },
      { type: 'undo' },
      { type: 'redo' },
    ]),
  }),
  Object.freeze({
    id: 'PAR-010',
    title: 'resize preserves a pinned viewport and visible geometry',
    dataset: 'inline:resize',
    input: Object.freeze([
      Object.freeze({
        type: 'rect',
        id: 'resize-target',
        size: Object.freeze({ width: 120, height: 80 }),
        fill: '#3478c8',
        radius: 8,
        attrs: Object.freeze({ x: 140, y: 110, zIndex: 1 }),
      }),
    ]),
    compareViewport: true,
    acceptedDifferences: PAR_010_ACCEPTED_DIFFERENCES,
    pixelRegions: Object.freeze([
      Object.freeze({
        checkpoint: '*',
        keys: Object.freeze(['resize-target']),
      }),
    ]),
    actions: Object.freeze([
      { type: 'set-view', centerWorld: [200, 150], scale: 1.5 },
      { type: 'resize', width: 640, height: 480, pixelRatio: 1 },
      { type: 'set-view', centerWorld: [200, 150], scale: 1.5 },
    ]),
  }),
  Object.freeze({
    id: 'PAR-011',
    title: 'transformed viewport point hit-test selects and clears the same target',
    dataset: 'inline:transformed-hit-test',
    input: INTERACTION_SCENE,
    actions: Object.freeze([
      { type: 'set-view', centerWorld: [220, 160], scale: 1.5 },
      {
        type: 'world-transform',
        world: { rotationDegrees: 90, flipX: false, flipY: false },
      },
      { type: 'browser-click', x: 400, y: 270, button: 'left', clickCount: 1 },
      { type: 'browser-click', x: 700, y: 500, button: 'left', clickCount: 1 },
    ]),
  }),
  Object.freeze({
    id: 'PAR-012',
    title: 'animated bar reaches the same final geometry after an in-flight update',
    dataset: 'inline:animated-bar',
    input: ANIMATED_BAR_SCENE,
    acceptedDifferences: PAR_012_ACCEPTED_DIFFERENCES,
    pixelRegions: Object.freeze([
      Object.freeze({
        checkpoint: '*',
        keys: Object.freeze(['animation-item::animation-bar']),
      }),
    ]),
    actions: Object.freeze([
      {
        type: 'update-component',
        ownerId: 'animation-item',
        componentId: 'animation-bar',
        history: true,
        changes: {
          size: { width: '80%', height: 52 },
          animation: true,
          animationDuration: 800,
        },
      },
      { type: 'wait', durationMs: 900 },
    ]),
  }),
  Object.freeze({
    id: 'PAR-013',
    title: 'background, bar, icon, and text visibility remain directly reversible',
    dataset: 'inline:component-visibility',
    input: COMPONENT_VISIBILITY_SCENE,
    acceptedDifferences: PAR_013_ACCEPTED_DIFFERENCES,
    pixelRegions: Object.freeze([
      Object.freeze({
        checkpoint: '*',
        fixed: Object.freeze([
          Object.freeze({
            key: 'component-visibility-strip',
            bounds: Object.freeze([65, 85, 575, 100]),
          }),
        ]),
      }),
    ]),
    actions: Object.freeze([
      {
        type: 'update-component',
        ownerId: 'visibility-background-item',
        componentId: 'visibility-background',
        history: true,
        changes: { show: false },
      },
      {
        type: 'update-component',
        ownerId: 'visibility-bar-item',
        componentId: 'visibility-bar',
        history: true,
        changes: { show: false },
      },
      {
        type: 'update-component',
        ownerId: 'visibility-icon-item',
        componentId: 'visibility-icon',
        history: true,
        changes: { show: false },
      },
      {
        type: 'update-component',
        ownerId: 'visibility-text-item',
        componentId: 'visibility-text',
        history: true,
        changes: { show: false },
      },
      {
        type: 'update-component',
        ownerId: 'visibility-background-item',
        componentId: 'visibility-background',
        history: true,
        changes: { show: true },
      },
      {
        type: 'update-component',
        ownerId: 'visibility-bar-item',
        componentId: 'visibility-bar',
        history: true,
        changes: { show: true },
      },
      {
        type: 'update-component',
        ownerId: 'visibility-icon-item',
        componentId: 'visibility-icon',
        history: true,
        changes: { show: true },
      },
      {
        type: 'update-component',
        ownerId: 'visibility-text-item',
        componentId: 'visibility-text',
        history: true,
        changes: { show: true },
      },
    ]),
  }),
  Object.freeze({
    id: 'PAR-014',
    title: 'Latin and CJK text content, style change, and history remain observable',
    dataset: 'inline:unicode-text',
    input: UNICODE_TEXT_SCENE,
    acceptedDifferences: PAR_014_ACCEPTED_DIFFERENCES,
    actions: Object.freeze([
      {
        type: 'update-element',
        id: 'unicode-root-text',
        history: 'text-edit',
        changes: {
          text: '장비 B-42\n상태 경고',
          style: {
            fontFamily: 'Noto Sans KR',
            fontSize: 22,
            lineHeight: 28,
            fill: '#dc2626',
          },
        },
      },
      {
        type: 'update-component',
        ownerId: 'unicode-item',
        componentId: 'unicode-component-text',
        history: true,
        changes: {
          text: '온도 87℃',
          style: {
            fontFamily: 'Noto Sans KR',
            fontSize: 20,
            lineHeight: 24,
            fill: '#ea580c',
          },
          tint: '#ea580c',
        },
      },
      { type: 'undo' },
      { type: 'redo' },
    ]),
  }),
  Object.freeze({
    id: 'PAR-015',
    title: 'relation endpoints follow element movement and history without stale geometry',
    dataset: 'inline:moving-relation',
    input: MOVING_RELATION_SCENE,
    pixelRegions: Object.freeze([
      Object.freeze({
        checkpoint: '*',
        fixed: Object.freeze([
          Object.freeze({
            key: 'moving-relation-stage',
            bounds: Object.freeze([90, 110, 460, 230]),
          }),
        ]),
      }),
    ]),
    actions: Object.freeze([
      {
        type: 'update-element',
        id: 'moving-relation-a',
        history: true,
        changes: { attrs: { x: 170, y: 220, zIndex: 1 } },
      },
      {
        type: 'update-element',
        id: 'moving-relation-b',
        history: true,
        changes: { attrs: { x: 500, y: 130, zIndex: 1 } },
      },
      { type: 'undo' },
      { type: 'redo' },
      {
        type: 'world-transform',
        world: { rotationDegrees: 90, flipX: false, flipY: false },
      },
    ]),
  }),
  Object.freeze({
    id: 'PAR-016',
    title: 'aggregate component radius, border, fill, tint, and size updates stay visible',
    dataset: 'inline:component-style',
    input: COMPONENT_STYLE_SCENE,
    acceptedDifferences: PAR_016_ACCEPTED_DIFFERENCES,
    pixelRegions: Object.freeze([
      Object.freeze({
        checkpoint: '*',
        fixed: Object.freeze([
          Object.freeze({
            key: 'component-style-stage',
            bounds: Object.freeze([60, 160, 620, 150]),
          }),
        ]),
      }),
      Object.freeze({
        checkpoint: 'update-component-2',
        keys: Object.freeze(['component-style-bar-item::component-style-bar']),
      }),
      Object.freeze({
        checkpoint: 'update-component-3',
        keys: Object.freeze(['component-style-icon-item::component-style-icon']),
      }),
      Object.freeze({
        checkpoint: 'undo-*',
        keys: Object.freeze(['component-style-icon-item::component-style-icon']),
      }),
      Object.freeze({
        checkpoint: 'redo-*',
        keys: Object.freeze(['component-style-icon-item::component-style-icon']),
      }),
    ]),
    actions: Object.freeze([
      {
        type: 'update-component',
        ownerId: 'component-style-background-item',
        componentId: 'component-style-background',
        history: true,
        changes: {
          source: {
            type: 'rect',
            fill: '#c7f0d8',
            borderWidth: 5,
            borderColor: '#166534',
            radius: 20,
          },
        },
      },
      {
        type: 'update-component',
        ownerId: 'component-style-bar-item',
        componentId: 'component-style-bar',
        history: true,
        changes: {
          source: {
            type: 'rect',
            fill: '#8b5cf6',
            radius: 10,
          },
          size: { width: '82%', height: '62%' },
          animation: false,
        },
      },
      {
        type: 'update-component',
        ownerId: 'component-style-icon-item',
        componentId: 'component-style-icon',
        history: true,
        changes: { tint: '#0891b2' },
      },
      { type: 'undo' },
      { type: 'redo' },
    ]),
  }),
]);

export function firstParityTrancheIds() {
  return Object.freeze(FIRST_PARITY_TRANCHE.map(({ id }) => id));
}
