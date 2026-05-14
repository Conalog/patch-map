# Public API

The clean-room rewrite must preserve these public exports and Patchmap instance
behaviors.

## Module Exports

- `Patchmap`
- `Transformer`
- `Command`
- `UndoRedoManager`
- `State`
- `PROPAGATE_EVENT`
- `selector`
- `convertLegacyData`
- Existing exports from `src/utils/index.js`

## Patchmap Lifecycle

### `new Patchmap()`

Creates an uninitialized patch-map instance.

### `init(element, options)`

Initializes the instance once.

Supported option groups:

- `app`: Pixi Application options accepted by the current implementation.
- `viewport`: viewport options and `plugins`.
- `theme`: theme token overrides.
- `assets`: asset bundle/asset definitions.
- `transformer`: optional `Transformer` instance.

Required behavior:

- Creates an application, viewport, world, state manager, undo/redo manager, and
  default selection state.
- Emits `patchmap:initialized` after successful initialization.
- Calling `init()` after initialization is a no-op.
- Default viewport plugins include clamp zoom, drag, wheel, pinch, and decelerate
  unless overridden.

### `destroy()`

Required behavior:

- Removes canvas events.
- Destroys state manager and undo/redo manager.
- Destroys viewport/application resources.
- Disconnects resize observer.
- Resets instance fields so a later `init()` can create a fresh instance.
- Emits `patchmap:destroyed`.

## Patchmap Properties

- `app`: current Pixi Application object. Public for compatibility, but the
  rewrite does not guarantee stable internal children.
- `viewport`: viewport object. Official support is limited to documented
  viewport plugin methods and coordinate/event behavior.
- `world`: root map object for selector compatibility. Direct mutation is not an
  official feature.
- `theme`: resolved theme object.
- `isInit`: initialization state.
- `undoRedoManager`: history manager.
- `transformer`: assignable `Transformer` instance or `null`.
- `stateManager`: state manager instance.
- `animationContext`: GSAP context compatibility surface. The rewrite may remove
  GSAP internally if this remains behavior-compatible for public usage.
- `event`: event management facade.
- `rotation`: world view rotation controller.
- `flip`: world view flip controller.

## Patchmap Methods

- `draw(data)`: validates and renders map data.
- `update(options)`: applies changes to selected elements.
- `focus(ids, options)`: moves viewport center to target bounds.
- `fit(ids, options)`: moves viewport and fits target bounds.
- `selector(path, options)`: JSONPath-style object lookup rooted at `world`.

## Events

Patchmap emits:

- `patchmap:initialized`
- `patchmap:draw`
- `patchmap:updated`
- `patchmap:destroyed`
- `patchmap:rotated`
- `patchmap:flipped`

The event emitter supports exact event names and wildcard namespaces through the
existing `WildcardEventEmitter` behavior.

