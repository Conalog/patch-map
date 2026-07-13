# PATCH MAP v0.10 Public API Contract

Status: active  
Compatibility classification: Level 1 unless marked Level 2

## Package Surface

The package exposes `Patchmap`, `Transformer`, `State`, `PROPAGATE_EVENT`,
`Command`, `UndoRedoManager`, `selector`, `convertLegacyData`,
`findIntersectObject`, `isMoved`, `intersectPoint`, and `uid`.

The supported runtime is a browser with PixiJS 8 or newer. The package provides
ES module, CommonJS, and UMD distributions.

## Patchmap

### Properties

| Property | Contract |
| --- | --- |
| `app` | Pixi `Application` after initialization, otherwise `null`. |
| `viewport` | `pixi-viewport` `Viewport` after initialization, otherwise `null`. |
| `world` | Root container for managed map elements after initialization. |
| `theme` | Fully materialized current theme. |
| `isInit` | Whether initialization completed. |
| `undoRedoManager` | Current history manager. Recreated after destroy. |
| `transformer` | Current `Transformer` or `null`; assignment replaces and destroys the previous transformer. |
| `stateManager` | Current state manager after initialization. |
| `rotation` | Degree-based world rotation controller with `value`, `rotateBy`, and `reset`. |
| `flip` | World flip controller with `x`, `y`, `set`, `toggleX`, `toggleY`, and `reset`. |

`animationContext` is Level 2 compatibility surface.

### `init(element, options?)`

`init` is asynchronous and idempotent after successful initialization. It
creates the application, viewport, world, state manager, default assets, canvas,
resize observation, and optional transformer. It emits `patchmap:initialized`
after the public instance is ready.

Options:

- `app`: Pixi application options. Defaults include background `#FAFAFA`,
  antialiasing, auto density, context alpha, resolution `2`, and automatic
  rendering.
- `viewport`: pixi-viewport options. Defaults include non-passive wheel handling,
  clamp zoom from `0.5` to `30`, drag, wheel, pinch, and deceleration.
- `viewport.plugins`: plugin option objects; a plugin may be disabled or
  replaced.
- `theme`: deep partial of the default `primary`, `gray`, `white`, and `black`
  palette.
- `assets`: Pixi bundle definitions or individual alias/source definitions.
- `transformer`: optional `Transformer` instance.

### `destroy()`

Calling `destroy` before initialization is a no-op. A successful destroy removes
listeners, states, history, animation work, managed render objects, application,
canvas wrapper, and resize observer. Public instance state returns to its
pre-initialized shape, `patchmap:destroyed` fires once, and the instance can be
initialized again.

### `draw(data)`

- Before initialization, returns `undefined` without drawing.
- Accepts current `MapData` or the documented legacy object shape.
- Does not mutate the caller's input.
- Validates, normalizes, and materializes defaults; invalid data throws a
  validation error.
- Replaces the managed map, clears history and canvas-event registrations, and
  returns the materialized map data.
- Emits `patchmap:draw` asynchronously. A newer draw suppresses the pending event
  from an older successful draw. A later failed draw does not cancel the latest
  successful pending event.
- Same-data redraw is still a replacement operation; object identity is not
  preserved across draws.

### `update(options?)`

Target selection:

- `path`: JSONPath resolved from `world`; `$` is the world root.
- `elements`: one direct element reference or an array.
- When both are present, both target sets are updated in their resolved order.

Mutation options:

- `changes`: partial properties. May be omitted only for a refresh.
- `mergeStrategy`: `merge` by default; `replace` replaces each named top-level
  property.
- `refresh`: re-runs affected observable property behavior even when values are
  equal.
- `relativeTransform`: adds numeric `attrs.x`, `attrs.y`, `attrs.angle`, and
  `attrs.rotation` changes to current values.
- `rotateOrigin: 'center'`: preserves the visible center when applying rotation.
- `history`: `false`, `true`, or a history ID string. Equal history IDs combine
  compatible changes into one undo step.
- `validateSchema`, `normalize`, and `emit` are Level 2 options used by maintained
  consumers. `emit: false` suppresses `patchmap:updated` without delaying the
  mutation or next-frame visual update.

The method returns the targeted element references. Missing targets produce an
empty result without throwing. Unless `emit` is false, it emits
`patchmap:updated` with the returned elements.

### `selector(path, options?)`

Resolves JSONPath from `world` and returns live element references. Level 2
requires the expression families used by maintained products:

- root and direct children;
- recursive descent;
- ID, type, label, display, and parent-property filters;
- `&&`, `||`, strict and loose equality;
- string `toLowerCase` and `match` expressions;
- property projection such as `.children`, `.id`, and `.parent`.

### `focus(ids?, options?)` and `fit(ids?, options?)`

`ids` accepts a string, string array, `null`, or `undefined`. Without IDs, the
default target set is managed top-level elements excluding relations. A filter
may prune a container and its subtree. Explicit relation IDs remain addressable
and contribute their linked endpoints.

`fit` uses `16` default padding per side. A numeric padding replaces all sides;
`{ x, y }` overrides named axes while unspecified axes retain `16`. Edge-based
padding keys are invalid. `focus` centers without changing zoom; `fit` centers
and changes zoom to contain the target bounds.

### Canvas Events

`patchmap.event` provides `add`, `remove`, `removeAll`, `on`, `off`, `get`, and
`getAll`. `add` accepts `id?`, `path`, whitespace-separated `action`, and `fn`.
Path `$` targets the viewport/canvas surface; all traversing paths resolve from
`world`. A newly added event starts enabled. Draw and destroy remove registered
canvas events.

## Map Data

All element kinds accept optional `id`, `label`, `show`, `locked`, and `attrs`.
Defaults are generated ID, `show: true`, and `locked: false`. `attrs` values are
observable on the live element handle as well as in `props.attrs`.

| Element | Required | Optional/default behavior |
| --- | --- | --- |
| `group` | `children` | Nested elements and group transforms. |
| `grid` | `cells`, `item.size` | `gap: 0`, `inactiveCellStrategy: 'destroy'`, item components, padding, upright content. |
| `item` | `size` | Components `[]`, padding `0`, upright content. |
| `relations` | `links` | Stroke style and visibility. Duplicate links are not added during merge updates. |
| `image` | `source` | Optional size; natural texture dimensions otherwise. |
| `text` | none | Empty text and default bitmap-text style. |
| `rect` | `size` | Fill, stroke, and radius `0`. |

Grid `cells` contain `0`, `1`, or strings. Every active or hidden-strategy cell
creates an item with ID `<grid-id>.<row>.<column>`, label equal to the cell value,
and deterministic position from item size and gap. `destroy` removes inactive
items; `hide` retains them with `show: false`.

## Item Components

All components accept optional `id`, `label`, `show`, `tint`, and `attrs`.
Defaults are generated ID, `show: true`, and white tint.

| Component | Required | Optional/default behavior |
| --- | --- | --- |
| `background` | `source` | Fills the item and ignores item padding. |
| `bar` | `source`, `size` | Bottom placement, margin `0`, animation enabled, duration `200ms`. |
| `icon` | `source`, `size` | Center placement and margin `0`. |
| `text` | none | Empty text, center placement, margin `0`, split `0`, visible overflow. |

Component arrays match existing children by explicit ID, then label/type behavior
defined by conformance fixtures. Merge updates retain unmatched existing
components; replace updates remove unmatched managed components. Partial updates
must preserve existing required fields and nested style values.

## Primitive Inputs

- Fixed `size`: number or `{ width, height }` numbers.
- Component size: number, percent string, `{ value, unit: 'px' | '%' }`, or a
  width/height object using those values.
- `gap`: number or `{ x?, y? }`.
- `margin`/`padding`: number, `{ x?, y? }`, or edge object. Explicit edges
  override values expanded from axes.
- placement: `left`, `left-top`, `left-bottom`, `top`, `right`, `right-top`,
  `right-bottom`, `bottom`, `center`, or `none`.
- source: registered asset key/URL, strict inline asset descriptor, or rectangle
  texture style where permitted.
- color: Pixi-compatible color source or a theme path such as
  `primary.default`.

Inline asset descriptors require `src` and may contain `data`, `format`,
`parser`, or deprecated `loadParser`. They do not accept a public alias. Async
asset completion must not overwrite a newer source or a destroyed object.

## State and Selection

`State` subclasses declare `static handledEvents`, receive the shared store on
`enter`, and support `exit`, `pause`, `resume`, and `destroy`. Returning
`PROPAGATE_EVENT` passes an event to the next state in the stack.

The default `selection` state is registered during initialization and may be
configured with:

- `draggable`, `paintSelection`, `selectUnit`, `drillDown`, `deepSelect`, and
  `filter`;
- selection-box fill/stroke style;
- `onDown`, `onUp`, `onClick`, `onDoubleClick`, `onRightClick`, `onDragStart`,
  `onDrag`, `onDragEnd`, and `onOver` callbacks.

Supported selection units are `entity`, `closestGroup`, `highestGroup`, and
`grid`. Click does not also fire when a completed double-click is reported.
Drag starts only after the movement threshold, and updates are immediate when a
live drag callback is configured.

## Transformer

Constructor options include elements, wireframe style, bounds display mode,
resize handles, rotate handles, transform history, ratio locking, and a dynamic
ratio callback. Bounds modes are `all`, `groupOnly`, `elementOnly`, and `none`.

`elements` accepts one element or an array. `selection` provides `add`, `remove`,
and `set`. Selection changes emit `update_elements` with current, added, and
removed elements.

Resize and rotation skip locked or unsupported elements without removing them
from selection. A gesture uses one history ID when transform history is enabled.
Shift locks resize ratio and snaps rotation to 15-degree increments. A single
rotated selection uses an oriented frame; multiple selections use a group frame.

## Undo/Redo

`Command` has an ID and overridable `execute`/`undo`. `UndoRedoManager` defaults
to 50 commands and provides `commands`, `execute`, `undo`, `redo`, `canUndo`,
`canRedo`, `clear`, and `destroy`. Executing after undo clears redo state.
History IDs combine compatible commands into one user-visible step.

Events are `history:executed`, `history:undone`, `history:redone`,
`history:cleared`, `history:destroyed`, and wildcard `history:*`.

## Event Names

Patchmap events include `patchmap:initialized`, `patchmap:draw`,
`patchmap:updated`, `patchmap:destroyed`, `patchmap:rotated`, and
`patchmap:flipped`.

State events include `state:pushed`, `state:popped`, `state:set`, `state:reset`,
`state:destroyed`, modifier activation/deactivation, and `state:*`/`modifier:*`
wildcards.

The conformance suite, not this prose alone, is the final authority for exact
callback ordering, floating-point tolerances, and browser interaction details.
