# Patch-service Compatibility

Patch-service usage is a first-class contract for the rewrite.

## Stable Selector Paths

Required paths include:

- `$..children[?(@.display=="panelGroup")].children`
- `$..children[?(@.display=="inverter")]`
- `$..children[?(@.type==="relations")]`
- `$..children[?(@.display=="...")]`
- `$..children[?(@.type=="...")]`
- `$..[?(@.id=="...")]`

The rewrite must preserve:

- Generated grid item ids.
- `attrs.display` indexing and updates.
- Type indexing after updates.
- Relations path stability.

## Panel Bar Workflows

Patch-service frequently updates all or many panel items with:

```js
patchmap.update({
  elements: item,
  changes: {
    components: [
      {
        type: 'bar',
        show: true,
        size: { height: '64%' },
        tint: '#2563eb',
        animation: true,
      },
      { type: 'icon', show: false },
      { type: 'text', show: false },
    ],
  },
  validateSchema: false,
  emit: false,
});
```

Required behavior:

- Final bar-only state can use aggregate rendering.
- Hidden icon/text remain hidden and do not draw over bars.
- If icon/text later become visible, normal component rendering is restored.
- Background + bar updates keep aggregate rendering when final visible state is
  compatible.
- Bar alpha follows item alpha in bulk highlight/dim workflows.
- Bar animation is smooth and visible.
- Aggregate layer ordering remains between item backgrounds and relations.

## Background and Relations Updates

Required behavior:

- Report-style background color changes must update visible backgrounds.
- Relations visibility/path refresh updates must not break selector indexes.
- Relations remain above backgrounds and bars.

## Compatibility Objects

Objects returned from `selector()` and callbacks must expose:

- `id`
- `label`
- `type`
- `props`
- `children`
- transform/display properties used by documented APIs

They do not need to be stable Pixi native DisplayObject subclasses in the new
engine. Compatibility wrappers are acceptable.

