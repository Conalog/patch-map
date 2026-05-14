# Rendering Semantics

The rewrite may replace the internal Pixi display tree. It must preserve visual
and logical behavior.

## Layer Order

Required relative order:

- User map groups/items/backgrounds render first.
- Aggregate panel bar layer, when used, renders above item backgrounds.
- Relations render above backgrounds and aggregate bars.
- Transformer and transient interaction overlays render above map content.

The previously validated contract is:

`group/item content < aggregate panel bar layer < relations < transformer`

## Element Rendering

### Groups

- Apply transform/visibility to descendants.
- Contribute descendants to focus/fit bounds.

### Grids

- Layout active cells by row/column, item size, padding, and gap.
- Generated item ids and selector paths remain stable.
- Inactive cells obey `inactiveCellStrategy`.

### Items

- Render components according to component order.
- Component placement/margin/size are resolved relative to item bounds.
- `contentOrientation: 'upright'` keeps inner text/icon/bar readable under item
  angle and world rotation/flip.
- `contentOrientation: 'follow-item'` follows item angle.

### Backgrounds

- Support rect texture style and string image/asset sources.
- Rect background supports fill, border, and radius.

### Bars

- Support rect texture style, tint, placement, margin, percent/px size, and
  animation.
- Rounded bars must render without visibly distorted corners when radius is
  enabled.
- Bar animation changes height/size smoothly over `animationDuration`.
- `animation: false` applies changes immediately.

### Icons

- Support asset/source keys, tint, placement, margin, and size.

### Text

- Item text supports style, split, tint, placement, margin, auto font behavior,
  word wrap width, and overflow modes.
- Standalone text supports text, style, size, and transforms.

### Relations

- Resolve source/target ids.
- Recalculate endpoints on refresh and linked object transform changes.
- Support style fields compatible with existing stroke behavior.

## View Transform

World rotation and flip must preserve:

- `patchmap.rotation.value`
- `patchmap.rotation.rotateBy()`
- `patchmap.rotation.reset()`
- `patchmap.flip.x/y`
- `patchmap.flip.set()`
- `patchmap.flip.toggleX()`
- `patchmap.flip.toggleY()`
- `patchmap.flip.reset()`

## Rendering Optimization Freedom

Allowed internal replacements:

- DisplayObject-per-component can be replaced by render IR nodes.
- Background/bar/relation/text/icon renderers can be feature-specific.
- Aggregate GPU/mesh/particle layers can replace individual Pixi objects.
- Scheduler can batch and reorder internal GPU uploads as long as public update
  order and callbacks remain compatible.

