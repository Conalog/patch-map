# Interaction, State, Transformer

## Canvas Events

`patchmap.event` must support:

- `add(options)`
- `remove(id)`
- `removeAll()`
- `on(idOrIds)`
- `off(idOrIds)`
- `get(id)`
- `getAll()`

Event options:

- `id?: string`
- `path: string`
- `action: string`
- `fn: function`

Required behavior:

- `path: '$'` targets the viewport/canvas surface, including empty-canvas
  pointer events.
- Other paths resolve from `world`.
- Multiple action names can be registered in one string.
- Multiple ids can be activated/deactivated/removed in one string.

## StateManager

Required behavior:

- `register(name, StateClassOrObject, isSingleton = true)`
- `setState(name, ...args)`
- `resetState()`
- `pushState(name, ...args)`
- `popState(payload?)`
- `getCurrentState()`
- `activateModifier(name, ...args)`
- `deactivateModifier()`
- `destroy()`

Events:

- `state:pushed`
- `state:popped`
- `state:set`
- `state:reset`
- `state:destroyed`
- `modifier:activated`
- `modifier:deactivated`
- wildcard namespace events

## State Base Class

Required behavior:

- Static `handledEvents`.
- Lifecycle methods: `enter`, `exit`, `pause`, `resume`, `destroy`.
- `PROPAGATE_EVENT` allows state event propagation.
- `abortController` resets on enter and aborts on exit.

## SelectionState

Default state registered as `selection`.

Supported options:

- `draggable`
- `paintSelection`
- `selectUnit`: `entity`, `closestGroup`, `highestGroup`, `grid`
- `drillDown`
- `deepSelect`
- `filter`
- `selectionBoxStyle.fill`
- `selectionBoxStyle.stroke`

Callbacks:

- `onDown`
- `onUp`
- `onClick`
- `onDoubleClick`
- `onRightClick`
- `onDragStart`
- `onDrag`
- `onDragEnd`
- `onOver`

Required behavior:

- Click and tap route to click handling.
- Double-click fires `onDoubleClick` and does not also fire `onClick`.
- Right-click prevents the browser canvas context menu.
- Drag selection supports rectangle selection.
- Paint selection supports freeform path/segment selection.
- Shift-drag multi-select behavior remains supported in benchmark scenarios.
- Ctrl/Meta deep selection can select deeper entities regardless of configured
  select unit.
- Selection hit testing honors `filter`.

## Transformer

Supported constructor options:

- `elements`
- `wireframeStyle.thickness`
- `wireframeStyle.color`
- `boundsDisplayMode`: `all`, `groupOnly`, `elementOnly`, `none`
- `resizeHandles`
- `rotateHandles`
- `transformHistory`
- `resizeKeepRatio`
- `getResizeKeepRatio`

Required behavior:

- Assigning `patchmap.transformer` activates the transformer.
- `transformer.elements` sets selected elements.
- `transformer.selection.add/remove/set` updates selection.
- Emits `update_elements` with `{ current, added, removed }`.
- Single rotated object uses oriented frame.
- Multi-object selection uses axis-aligned group frame.
- Resize handles can resize supported selections.
- Rotate handles rotate supported element types: grid, item, rect, image, text.
- Relations and groups are not mutated by transformer rotation.
- Locked elements remain selected but are not mutated.
- Shift rotation snaps delta to 15 degrees.
- Existing `attrs.rotation` users keep writing `rotation`; otherwise rotation
  gestures write `angle`.
- `transformHistory: true` groups one gesture into one undo/redo entry.

