# `@conalog/patch-map` Specification

Status: Draft v2  
Source of truth: Reverse-engineered from repository implementation and README

## 1. Purpose and Scope

- [Confirmed] `@conalog/patch-map` is a browser-side canvas library built on `pixi.js` and `pixi-viewport` for rendering and interacting with PATCH-style map data.
- [Confirmed] Its core consumer workflow is:
  1. create a `Patchmap` instance
  2. `init()` it into a DOM element
  3. `draw()` schema-defined map data
  4. manipulate rendered objects via `update()`, selection state, viewport focus/fit, custom events, undo/redo, and `Transformer`
- [Confirmed] The system boundary is a rendered PIXI scene graph plus supporting controller objects (`UndoRedoManager`, `StateManager`, `Transformer`).
- [Inferred] Persistence, application state management, server communication, data fetching, and domain-specific PATCH semantics beyond rendering/conversion are out of scope.
- [Confirmed] The library includes a legacy-data converter, but its main public contract is the current element/component schema consumed by `draw()`.

## 2. Package Identity and Distribution

### 2.1 Package Metadata

- [Confirmed] Package name: `@conalog/patch-map`
- [Confirmed] Current version in repository: `0.7.1`
- [Confirmed] License: `MIT`
- [Confirmed] Repository: `https://github.com/Conalog/patch-map.git`
- [Confirmed] Published files are restricted to `dist/` via `package.json#files`

### 2.2 Module Formats and Entrypoints

- [Confirmed] The package is authored as `"type": "module"`.
- [Confirmed] Package root export map:
  - `import` -> `./dist/index.esm.js`
  - `require` -> `./dist/index.cjs.js`
  - `types` -> `./dist/types/src/patchmap.d.ts`
- [Confirmed] Legacy fields also point to the same build products:
  - `main` -> `dist/index.cjs.js`
  - `module` -> `dist/index.esm.js`
  - `umd` -> `dist/index.umd.js`
- [Confirmed] No package subpath exports are declared.
- [Confirmed] The package root exposes named exports only; no default export is declared from `src/patch-map.ts`.
- [Confirmed] No CLI entrypoints (`bin`) are declared.
- [Confirmed] Rollup builds three JS artifacts from `src/patch-map.ts`: CJS, ESM, and UMD.
- [Inferred] CJS consumption is intended to be named-export based (`exports: 'named'` in Rollup).
- [Open Question] The declared type entrypoint targets `patchmap.d.ts`, but the JS barrel entry is built from `src/patch-map.ts`. Without a successful local build, it is not fully verified whether published root typings cover all named exports or only the `Patchmap` class declaration.

### 2.3 Supported Runtimes

- [Confirmed] Public rendering APIs (`Patchmap`, `Transformer`, selection state, canvas events) require browser DOM APIs:
  - `document`
  - `window`
  - `ResizeObserver`
  - DOM elements for mounting
  - canvas/WebGL support through PIXI
- [Confirmed] `globalThis.scheduler?.postTask` is used when available, with `setTimeout(..., 0)` fallback.
- [Confirmed] The package declares `engines.node >=20`.
- [Inferred] Despite the Node engine declaration, the main library is not Node-only and is not usable in a pure Node runtime without DOM shims.
- [Confirmed] Worker/edge runtimes without DOM are unsupported for the main `Patchmap` API.

## 3. Goals and Non-Goals

- [Confirmed] Goals
  - render a schema-defined map of groups, grids, items, relations, images, text, and rects
  - update rendered objects incrementally
  - support viewport navigation (`focus`, `fit`)
  - support interaction-state management through `State`/`StateManager`
  - support undo/redo for updates and transformer-driven resize
  - support legacy PATCH data conversion
- [Confirmed] Non-goals / absent capabilities
  - no public persistence/storage layer
  - no built-in networking API
  - no exported public element/component classes
  - no public `StateManager` export
  - no rotation support in `Transformer` despite README wording

## 4. Public API Surface

### 4.1 Top-Level Exports

Official package-root exports from `src/patch-map.ts`:

- [Confirmed] `Command`
- [Confirmed] `UndoRedoManager`
- [Confirmed] `State`
- [Confirmed] `PROPAGATE_EVENT`
- [Confirmed] `Patchmap`
- [Confirmed] `Transformer`
- [Confirmed] `findIntersectObject`
- [Confirmed] `isMoved`
- [Confirmed] `intersectPoint`
- [Confirmed] `uid`
- [Confirmed] `convertLegacyData`
- [Confirmed] `selector`

Not exported at the package root:

- [Confirmed] `StateManager`
- [Confirmed] `SelectionState`
- [Confirmed] element/component classes such as `Group`, `Grid`, `Item`, `Background`, `Icon`
- [Confirmed] schema modules under `src/display/data-schema/*`

Accidental or underspecified exposure:

- [Confirmed] `Patchmap` instances expose additional writable members such as `viewport`, `isInit`, and `animationContext`, but these are not documented as stable consumer APIs.
- [Confirmed] `patchmap.stateManager` is a usable public instance property, but the `StateManager` class itself is not exported.

### 4.1.1 Public Stability and Semver Notes

- [Confirmed] The intended semver-sensitive surface appears to be the package-root named exports from `src/patch-map.ts`, with the strongest evidence for README- and test-backed APIs centered on `Patchmap`, `Transformer`, `UndoRedoManager`, `State`, `PROPAGATE_EVENT`, and `Command`.
- [Inferred] The root-exported utilities `uid`, `isMoved`, `intersectPoint`, `findIntersectObject`, `selector`, and `convertLegacyData` also appear intentionally public because they are re-exported from the package root, but they are less strongly established as stable consumer-facing APIs than the README-documented class and instance APIs.
- [Confirmed] The following items appear exposed but not strongly established as stable:
  - writable `Patchmap` instance fields such as `viewport`, `isInit`, and `animationContext`
  - the concrete `patchmap.stateManager` implementation details beyond the documented ability to register/set states
  - undocumented passthrough options such as `update({ emit, validateSchema, normalize })`
- [Confirmed] Changes likely to be semver-significant include removing or renaming package-root exports, changing the argument or return contracts of README-documented methods, changing the return shape or validation semantics of root-exported utilities, and changing observable side effects such as emitted event names or redraw/update behavior that tests and README examples rely on.
- [Open Question] The published root type entrypoint is declared as `dist/types/src/patchmap.d.ts`, but without building the package it is not fully verified whether all named JS exports are covered by the published typings; if they are, changing those exported types would also be semver-significant.
- [Confirmed] Consumers should not rely on deep internal import paths under `src/*` because `package.json` declares no subpath exports, and should not treat incidental writable fields or undocumented helper behavior as stable package contract.

### 4.2 API Contracts

#### `class Patchmap extends WildcardEventEmitter`

- [Confirmed] Constructor takes no arguments.
- [Confirmed] Instance getters:
  - `app`: current PIXI `Application` or `null`
  - `viewport`: current custom viewport or `null`
  - `theme`: shallow copy of current theme object
  - `isInit`: boolean init flag
  - `undoRedoManager`: per-instance `UndoRedoManager`
  - `transformer`: assigned `Transformer` or `null`
  - `stateManager`: per-instance state manager after `init()`, else `null`
  - `animationContext`: GSAP context
  - `event`: wrapper with canvas-event management methods
- [Confirmed] `theme` is only shallow-cloned; nested objects remain shared references.
- [Confirmed] Assigning `patchmap.transformer` destroys the previous transformer instance (if any), unregisters its `object_transformed` listener, and mounts the new transformer into the viewport.
- [Confirmed] Assigning a non-`Transformer` value logs an error and leaves `patchmap.transformer` as `null`.

`async init(element, opts = {})`

- [Confirmed] Initializes PIXI application, viewport, default assets, DOM wrapper, resize observer, state manager, and optional transformer.
- [Confirmed] Resolves with `undefined`; it does not return `this` or any initializer object.
- [Confirmed] Accepted top-level option groups:
  - `app`
  - `viewport`
  - `theme`
  - `assets`
  - `transformer`
- [Confirmed] `assets` accepts a mixed array of:
  - bundle definitions `{ name, items: [...] }`
  - single asset definitions `{ alias, src, ... }`
- [Confirmed] Default `app` options:
  - `background: '#FAFAFA'`
  - `antialias: true`
  - `autoStart: true`
  - `autoDensity: true`
  - `useContextAlpha: true`
  - `resolution: 2`
- [Confirmed] Default viewport plugins include `clampZoom`, `drag`, `wheel`, `pinch`, and `decelerate`.
- [Confirmed] Default assets include bundled icons and bundled Fira Code fonts.
- [Confirmed] Asset definitions are merged by `name` and `alias`, then loaded through global `PIXI.Assets`.
- [Confirmed] A `selection` state is registered during `init()`, not during `draw()`.
- [Confirmed] Registering the `selection` state does not activate it; the state stack remains empty until the consumer calls `patchmap.stateManager.setState(...)` or `pushState(...)`.
- [Confirmed] Side effects:
  - installs undo/redo hotkeys on `document`
  - registers default/theme/asset state
  - appends a wrapper `<div>` containing the PIXI canvas into the provided DOM element
  - prevents the wrapper's default context menu
  - emits `patchmap:initialized`
- [Confirmed] If `isInit` is already true, `init()` returns early without reinitializing.
- [Inferred] Concurrent `init()` calls are not protected by a pending-promise lock because `isInit` flips to `true` only at the end.

`destroy()`

- [Confirmed] No-op if the instance was never initialized.
- [Confirmed] Destroys undo/redo manager, GSAP context, current state manager, all canvas events, viewport, PIXI app, and resize observer.
- [Confirmed] Removes the canvas wrapper element from the DOM.
- [Confirmed] Resets internal fields to new default instances where applicable (`themeStore`, `UndoRedoManager`, GSAP context).
- [Confirmed] Emits `patchmap:destroyed`, then removes all event listeners from the `Patchmap` instance.
- [Confirmed] It does not unload global `PIXI.Assets` bundles or icons/fonts previously loaded by `init()`.

`draw(data)`

- [Confirmed] Synchronous method that redraws the whole scene.
- [Confirmed] Input handling:
  - deep-clones input via `JSON.parse(JSON.stringify(data))`
  - auto-converts legacy data only when the cloned input is a non-array object containing a `grids` key
  - validates the processed data against `mapDataSchema`
- [Confirmed] On validation failure it throws the `zod-validation-error` result returned by `validateMapData`.
- [Confirmed] Returns the validated/default-filled data structure used for rendering.
- [Confirmed] Side effects:
  - stops the PIXI app during draw
  - clears undo/redo history
  - reverts the GSAP animation context
  - removes all registered canvas events from the viewport
  - destroys and replaces current rendered element tree
  - schedules an internal `update({ path: '$..[?(@.type=="relations")]', refresh: true, emit: false })` on the next ticker frame
  - restarts the PIXI app
  - emits `patchmap:draw` asynchronously
- [Confirmed] Because input is JSON-serialized first, non-JSON values are not preserved in `draw()` input.
- [Inferred] This makes `draw()` less permissive than the raw Zod schema suggests for values such as class instances or typed arrays.

`update(opts = {})`

- [Confirmed] Synchronous incremental update API over rendered display objects.
- [Confirmed] Documented options implemented in code:
  - `path`
  - `elements`
  - `changes`
  - `history`
  - `relativeTransform`
  - `mergeStrategy`
  - `refresh`
- [Confirmed] Additional implemented but undocumented pass-through options:
  - `emit`
  - `validateSchema`
  - `normalize`
- [Confirmed] `elements` accepts a single element or array.
- [Confirmed] `path` is resolved with the custom `selector()` helper against the current viewport tree.
- [Confirmed] `elements` and `path` results are concatenated; there is no de-duplication.
- [Confirmed] `relativeTransform: true` adds numeric `x`, `y`, `rotation`, and `angle` changes to the current element values.
- [Confirmed] `history: true` records a generated history ID; `history: 'some-id'` groups consecutive updates under that ID.
- [Confirmed] Returns the array of targeted rendered elements, including unchanged or duplicated matches.
- [Confirmed] Missing targets are ignored silently; tests confirm no throw when selectors match nothing.
- [Confirmed] Emits `patchmap:updated` unless `opts.emit === false`.
- [Confirmed] Validation errors from element schema application are thrown.

`focus(ids, opts)`

- [Confirmed] Synchronous viewport-centering API.
- [Confirmed] `ids` must be `string`, `string[]`, `null`, or `undefined`; invalid first-argument objects throw.
- [Confirmed] `opts` currently supports only `filter`.
- [Confirmed] If `ids` is omitted, focus targets default to top-level managed viewport children except `relations`.
- [Confirmed] Explicit `relations` IDs resolve through relation endpoint IDs when possible.
- [Confirmed] If a filtered-out container is rejected, its subtree is excluded from bounds calculation.
- [Confirmed] Returns `null` when no bounds contributors remain; otherwise moves viewport center and returns `undefined`.

`fit(ids, opts)`

- [Confirmed] Same target-resolution behavior as `focus()`, plus viewport zoom fitting.
- [Confirmed] `padding` defaults to `{ x: 16, y: 16 }`.
- [Confirmed] Accepted `padding` input:
  - number -> applied to both axes
  - `{ x?: number, y?: number }`
- [Confirmed] Edge-based keys such as `{ top: 10 }` are rejected.
- [Confirmed] Invalid option keys are rejected.
- [Confirmed] Returns `null` when no targets are found; otherwise re-centers then fits viewport dimensions.

`selector(path, opts)`

- [Confirmed] Thin wrapper around exported `selector(json, path, options)`.
- [Confirmed] Returns flattened JSONPath matches.
- [Confirmed] Default search behavior only descends through `children` arrays, not arbitrary object keys.
- [Confirmed] The second `opts` parameter is supported by implementation but undocumented in README.

`event`

- [Confirmed] Getter returns an object with:
  - `add(opts)`
  - `remove(id)`
  - `removeAll()`
  - `on(id)`
  - `off(id)`
  - `get(id)`
  - `getAll()`
- [Confirmed] `event.add()` both registers and immediately activates the event.
- [Confirmed] Event definitions support either `path`, `elements`, or both.
- [Confirmed] Event IDs and action lists are split on whitespace, so one call can address multiple event IDs or action names.
- [Confirmed] Duplicate event IDs are not replaced; implementation logs a warning and keeps the first registration.
- [Confirmed] Events attach to the currently resolved objects only. They do not automatically rebind to future matching objects created by later updates.
- [Confirmed] `draw()` removes all registered events, so event registrations do not survive a redraw.

#### `class UndoRedoManager extends WildcardEventEmitter`

- [Confirmed] Constructor signature: `new UndoRedoManager(maxCommands = 50)`
- [Confirmed] `commands` getter returns a shallow copy of the history stack.
- [Confirmed] `execute(command, { historyId } = {})` runs the command immediately, stores it, truncates redo history, and bundles by `historyId`.
- [Confirmed] `undo()` and `redo()` are silent no-ops when unavailable.
- [Confirmed] `canUndo()` / `canRedo()` report availability.
- [Confirmed] `clear()` resets history.
- [Confirmed] `destroy()` removes the keydown listener if installed, clears history, emits `history:destroyed`, then removes listeners.
- [Confirmed] Hotkeys are installed only when `_setHotkeys()` is called; `Patchmap.init()` calls this automatically on its own manager.

#### `class Command`

- [Confirmed] Constructor signature: `new Command(id)`
- [Confirmed] `execute()` and `undo()` throw unless overridden.

#### `class State`

- [Confirmed] Base class for `StateManager`-managed states.
- [Confirmed] Static contract: `handledEvents = []`
- [Confirmed] Lifecycle hooks:
  - `enter(store, ...args)`
  - `exit()`
  - `pause()`
  - `resume()`
  - `destroy()`
- [Confirmed] `enter()` stores `store`, captures `args`, and creates a fresh `AbortController`.
- [Confirmed] `exit()` aborts the controller.

#### `PROPAGATE_EVENT`

- [Confirmed] Unique symbol that tells `StateManager` to continue dispatching an event down the active state stack.

#### `patchmap.stateManager` instance surface

- [Confirmed] `patchmap.stateManager` is created during `init()` and set back to `null` during `destroy()`.
- [Confirmed] The concrete class is not exported at the package root, but the instance exposes these consumer-usable members:
  - `register(name, StateClassOrObject, isSingleton = true)`
  - `setState(name, ...args)`
  - `resetState()`
  - `pushState(name, ...args)`
  - `popState(payload?)`
  - `getCurrentState()`
  - `activateModifier(name, ...args)`
  - `deactivateModifier()`
  - getters `modifierState` and `stateRegistry`
  - inherited event methods such as `.on()`, `.off()`, `.emit()`
- [Confirmed] `register()` accepts either a state class or a state object. When `isSingleton` is true and a class is provided, the instance is created lazily on first activation; when a singleton object is provided, that object is reused directly.
- [Confirmed] Event listeners declared in `handledEvents` are bound once per event name:
  - `onkey*` handlers bind to `window`
  - all other handlers bind to the viewport
- [Confirmed] Dispatch priority is modifier state first, otherwise the state stack from top to bottom.
- [Confirmed] Event propagation stops unless a handler returns `PROPAGATE_EVENT`.
- [Confirmed] `pushState()` instantiates class-based states with `new StateClass(name)`, but `activateModifier()` instantiates class-based modifier states with no constructor arguments.
- [Confirmed] No default active state is installed by `Patchmap`; after `init()` and after every `resetState()`, `getCurrentState()` returns `null` until the consumer activates a state.

#### `class WildcardEventEmitter`

- [Confirmed] `Patchmap`, `UndoRedoManager`, `StateManager`, and `SelectionModel` behavior relies on namespace wildcards such as `history:*` and `state:*`.
- [Confirmed] Emitting an event named `namespace:type` also emits `namespace:*`.
- [Confirmed] Wildcard listeners receive the original payload plus injected `namespace` and `type` fields when the payload is an object.

#### `class Transformer extends PIXI.Container`

- [Confirmed] Constructor validates options with Zod and throws on invalid values.
- [Confirmed] Supported options:
  - `elements`
  - `wireframeStyle`
  - `boundsDisplayMode`
  - `resizeHandles`
  - `resizeHistory`
- [Confirmed] Public properties/methods:
  - `wireframe`
  - `boundsDisplayMode`
  - `selection`
  - `elements`
  - `wireframeStyle`
  - `resizeHandles`
  - `resizeHistory`
  - `draw()`
  - `update()`
  - `destroy()`
- [Confirmed] `selection` is a separate model with `set`, `add`, `remove`, and `update` events.
- [Confirmed] Constructor validation only checks that `elements`, when provided, is an array; individual array entries are not type-checked as PIXI display objects.
- [Confirmed] `elements = singleElement` is normalized to a single-element array.
- [Confirmed] Setting `transformer.elements = null` or `undefined` clears the selection.
- [Confirmed] `boundsDisplayMode` values: `'all' | 'groupOnly' | 'elementOnly' | 'none'`
- [Confirmed] Resize handles are only shown when `resizeHandles === true` and `boundsDisplayMode !== 'none'`.
- [Confirmed] Resize changes can be grouped into undo/redo history when `resizeHistory` is enabled.
- [Confirmed] Emits `update_elements` when selection changes.
- [Confirmed] Current implementation supports resize handles and wireframe bounds. No rotation UI or rotation gesture implementation was found.

#### Utility Exports

- **Name**: `uid`
- **Signature**: `uid()`
- **Parameters**: none. [Confirmed]
- **Returns**: `string`. The generated string is 15 characters long and matches `/^[a-zA-Z0-9]+$/`. [Confirmed]
- **Behavior**: synchronous wrapper around a module-scoped `nanoid` generator built with a custom alphanumeric alphabet and fixed length `15`. [Confirmed]
- **Side effects**: no observable mutation of library state; consumes randomness to generate a new ID value on each call. [Confirmed]
- **Errors / invalid input behavior**: no input validation is needed because there are no parameters; no explicit thrown-error path is implemented in repository code or tests. [Confirmed]
- **Invariants / guarantees**: tests confirm different values across repeated calls and no collisions in a 100,000-sample test run, but the repository does not state an absolute uniqueness guarantee beyond random generation. [Confirmed]
- **Certainty**: `[Confirmed]`

- **Name**: `isMoved`
- **Signature**: `isMoved(point1, point2, scale = { x: 1, y: 1 })`
- **Parameters**:
  - `point1`: starting point object expected to expose `x` and `y`. [Inferred]
  - `point2`: ending point object expected to expose `x` and `y`. [Inferred]
  - `scale`: optional scale object expected to expose numeric `x` and `y`; defaults to `{ x: 1, y: 1 }`. [Confirmed]
- **Returns**: `boolean`. Returns `true` when either axis moves more than `4 / scale.axis`, otherwise `false`. [Confirmed]
- **Behavior**: synchronous comparison helper. If either `point1` or `point2` is falsy, it returns `false` immediately. Otherwise it compares absolute `dx` and `dy` against the fixed `MOVE_DELTA` threshold of `4`, adjusted independently by `scale.x` and `scale.y`. [Confirmed]
- **Side effects**: none. [Confirmed]
- **Errors / invalid input behavior**: there is no explicit runtime validation or coercion; exact behavior for truthy malformed objects is not covered by tests and is left to normal JavaScript property access/arithmetic semantics. [Confirmed]
- **Invariants / guarantees**: axis checks are independent and use strict `>` comparison, so movement exactly equal to the threshold does not count as moved. [Confirmed]
- **Certainty**: `[Confirmed]` for threshold/default/return logic; `[Inferred]` for the intended point object shape.

- **Name**: `intersectPoint`
- **Signature**: `intersectPoint(obj, point)`
- **Parameters**:
  - `obj`: display object to test. [Inferred]
  - `point`: point in viewport/world coordinates, expected to expose `x` and `y`. [Inferred]
- **Returns**: `boolean`. Returns `false` when no viewport can be resolved for `obj`; otherwise returns the result of either `obj.containsPoint(point)` or polygon containment against the object's local corners projected into viewport space. [Confirmed]
- **Behavior**: synchronous hit-test helper. It first resolves a viewport via `getViewport(obj)`. If `obj.allowContainsPoint` is truthy, the helper delegates to `obj.containsPoint(point)`. Otherwise it computes local corners with `getObjectLocalCorners(obj, viewport)`, builds a PIXI `Polygon`, and checks `polygon.contains(point.x, point.y)`. [Confirmed]
- **Side effects**: none in repository code. [Confirmed]
- **Errors / invalid input behavior**: no explicit validation is performed. If `allowContainsPoint` is truthy but `containsPoint` is absent, or if dependent helpers reject malformed input, the thrown behavior is not documented by tests. [Open Question]
- **Invariants / guarantees**: the non-delegated path always evaluates containment in the coordinate space of the resolved viewport, not in the object's own local coordinates. [Confirmed]
- **Certainty**: `[Confirmed]` for viewport fallback and branch behavior; `[Inferred]` for the intended PIXI-like input shapes; `[Open Question]` for malformed-input exceptions.

- **Name**: `findIntersectObject`
- **Signature**: `findIntersectObject(parent, point, { filter, selectUnit, filterParent } = {})`
- **Parameters**:
  - `parent`: search root whose descendants are scanned. [Confirmed]
  - `point`: hit-test point passed through to `intersectPoint`. [Confirmed]
  - `filter`: optional predicate applied after selection-unit resolution; falsy return excludes the candidate. [Confirmed]
  - `selectUnit`: optional selection resolver. Confirmed values from code are `'entity'`, `'closestGroup'`, `'highestGroup'`, and `'grid'`; any other value falls back to the original candidate. [Confirmed]
  - `filterParent`: optional collection used during group/grid ancestor resolution; code calls `.has(...)` on it, and current callers pass a `Set`. [Confirmed]
- **Returns**: the first resolved selectable object in display order, or `null` if nothing qualifies. [Confirmed]
- **Behavior**: synchronous search helper. It rejects locked roots and locked descendants, collects selectable candidates, sorts them by descending `zIndex` and then by render-tree order, performs point hit-testing against the candidate itself or its children when `constructor.hitScope === 'children'`, then resolves the final selection through `selectUnit` before applying `filter`. [Confirmed]
- **Side effects**: none. [Confirmed]
- **Errors / invalid input behavior**: no explicit argument validation is present. The repository does not document or test failure behavior for malformed `parent`, `point`, or non-Set-like `filterParent` values. [Open Question]
- **Invariants / guarantees**: lock checks run before hit resolution; `filter` observes the resolved selection rather than the raw hit child; when `selectUnit` is omitted or unrecognized, the original candidate is returned. [Confirmed]
- **Certainty**: `[Confirmed]` for ordering, lock behavior, and selection resolution; `[Open Question]` for malformed-input failure modes.

- **Name**: `selector`
- **Signature**: `selector(json, path, options = {})`
- **Parameters**:
  - `json`: root object to search; `null`/`undefined` is coerced to `{}`. [Confirmed]
  - `path`: JSONPath expression; `null`/`undefined` is coerced to `''`. [Confirmed]
  - `options`: additional `JSONSearch` / `jsonpath-plus` options. The helper seeds defaults of `searchableKeys: ['children']` and `flatten: true`, then spreads `options`, so callers may override those defaults. [Confirmed]
- **Returns**: whatever `JSONSearch(...)` returns for the supplied options. With default options, repository code and tests treat the result as a flattened array of matches. [Confirmed]
- **Behavior**: synchronous wrapper around `JSONSearch` that restricts recursive traversal to `children` arrays by default instead of walking every object key. The same helper underlies `patchmap.selector(...)`, event path resolution, focus/fit ID resolution, and internal relation/path lookups. [Confirmed]
- **Side effects**: none. [Confirmed]
- **Errors / invalid input behavior**: no local validation is performed; invalid-path behavior is delegated to `jsonpath-plus` through `JSONSearch`, and repository tests do not pin the exact thrown-error contract. [Open Question]
- **Invariants / guarantees**: `path` and `json` are always supplied to `JSONSearch` even when the caller passes `null`/`undefined`; default traversal only descends into `children` unless `options.searchableKeys` overrides it. [Confirmed]
- **Certainty**: `[Confirmed]` for wrapper defaults and coercion; `[Open Question]` for downstream parser error behavior.

- **Name**: `convertLegacyData`
- **Signature**: `convertLegacyData(data)`
- **Parameters**:
  - `data`: legacy top-level object whose entries are iterated with `Object.entries(data)`. `Patchmap.draw()` only auto-invokes it for non-array objects containing a top-level `grids` key. [Confirmed]
- **Returns**: `Array<object>` containing current draw-data element records. Output entries are `grid`, `relations`, or `item` elements depending on the legacy collection key. [Confirmed]
- **Behavior**: synchronous pure conversion helper. It builds a fresh result array, ignores the top-level `metadata` key, converts `grids` into `grid` elements, converts `strings` into `relations` elements with sequential links, and converts every other collection into `item` elements. The detailed field mapping is specified in Section 8.5. [Confirmed]
- **Side effects**: no mutation of repository-managed state; repository code does not mutate the input object directly. [Confirmed]
- **Errors / invalid input behavior**: there is no schema validation or defensive coercion inside the converter. If the legacy shape is malformed relative to the accessed fields (`value.properties`, `value.children`, etc.), the exact thrown behavior is not documented by tests. [Open Question]
- **Invariants / guarantees**: the converter always returns an array; top-level `metadata` is skipped; `grids` normalize `'0'` cells to `0` and every other cell value to `1`; `strings` flatten nested `properties.props` into `attrs.metadata` when present; non-`strings`/`grids` collections singularize the collection key for icon/display naming except `combines -> combiner`. [Confirmed]
- **Certainty**: `[Confirmed]` for the conversion mapping implemented in code; `[Open Question]` for malformed-input failure behavior.

### 4.3 Usage Patterns

- [Confirmed] Primary flow:
  1. `const patchmap = new Patchmap()`
  2. `await patchmap.init(element, options)`
  3. `patchmap.draw(data)`
  4. optionally enable `stateManager` selection and `transformer`
  5. call `update()`, `focus()`, `fit()`, `undoRedoManager.undo()`, etc.
  6. `patchmap.destroy()`
- [Confirmed] Legacy flow: passing a legacy object with `grids` to `draw()` triggers auto-conversion before validation.
- [Confirmed] Selection flow: `patchmap.stateManager.setState('selection', config)` configures the built-in internal selection state.
- [Confirmed] Transform flow: assign `patchmap.transformer = new Transformer(...)`, then drive `transformer.elements` or `transformer.selection`.

## 5. Core Data Types and Semantics

### 5.1 Primary Data Structures

- [Confirmed] Top-level `MapData` is an array of element objects.
- [Confirmed] Supported top-level element discriminators:
  - `group`
  - `grid`
  - `item`
  - `relations`
  - `image`
  - `text`
  - `rect`
- [Confirmed] `group.children` recursively contain elements.
- [Confirmed] `grid.item` describes the per-cell rendered item template.
- [Confirmed] `item.components` can contain:
  - `background`
  - `bar`
  - `icon`
  - `text`
- [Confirmed] `attrs` is an open-ended record carried into runtime object properties.

### 5.1.1 Detailed Element Contract

- [Confirmed] Every element type inherits the strict base fields:
  - `type`: discriminator
  - `show?: boolean` default `true`
  - `id?: string` default generated `uid()`
  - `label?: string`
  - `attrs?: Record<string, unknown>`
  - `locked?: boolean` default `false` on elements only, not components
- [Confirmed] `group` requires:
  - `children: Element[]`
- [Confirmed] `grid` requires:
  - `cells: Array<Array<0 | 1 | string>>`
  - `inactiveCellStrategy?: 'destroy' | 'hide'` default `'destroy'`
  - `gap?: number | { x?: number, y?: number }` normalized to `{ x, y }`
  - `item: { size: Size, padding?: Margin, components?: Component[] }`
- [Confirmed] `item` requires:
  - `size: Size`
  - `padding?: Margin`
  - `components?: Component[]`
- [Confirmed] `relations` requires:
  - `links: Array<{ source: string, target: string }>`
  - `style?: RelationsStyle`
- [Confirmed] `image` requires:
  - `source: string`
  - `size?: Size`
- [Confirmed] standalone `text` requires:
  - `text?: string` default `''`
  - `style?: ElementTextStyle`
  - `size?: Size`
- [Confirmed] `rect` requires:
  - `size: Size`
  - `fill?: Color`
  - `stroke?: StrokeStyle`
  - `radius?: number | { topLeft?: number, topRight?: number, bottomRight?: number, bottomLeft?: number }` default `0`

### 5.1.2 Detailed Component and Primitive Contract

- [Confirmed] Every component type inherits the strict base fields:
  - `type`
  - `show?: boolean` default `true`
  - `id?: string` default generated `uid()`
  - `label?: string`
  - `attrs?: Record<string, unknown>`
- [Confirmed] `background` requires:
  - `source: string | TextureStyle`
  - `size` input, if provided, is ignored and normalized to `{ width: { value: 100, unit: '%' }, height: { value: 100, unit: '%' } }`
  - `tint?: Color` default `0xffffff`
- [Confirmed] `bar` requires:
  - `source: TextureStyle`
  - `size: PxOrPercentSize`
  - `placement?: Placement` default `'bottom'`
  - `margin?: Margin` default zero box
  - `tint?: Color` default `0xffffff`
  - `animation?: boolean` default `true`
  - `animationDuration?: number` default `200`
- [Confirmed] `icon` requires:
  - `source: string`
  - `size: PxOrPercentSize`
  - `placement?: Placement` default `'center'`
  - `margin?: Margin` default zero box
  - `tint?: Color` default `0xffffff`
- [Confirmed] item `text` component requires:
  - `text?: string` default `''`
  - `placement?: Placement` default `'center'`
  - `margin?: Margin` default zero box
  - `tint?: Color` default `0xffffff`
  - `style?: LabelTextStyle`
  - `split?: number` default `0`
- [Confirmed] `Size` accepts either:
  - non-negative number -> `{ width, height }`
  - `{ width: nonNegativeNumber, height: nonNegativeNumber }`
- [Confirmed] `PxOrPercentSize` accepts either:
  - non-negative number
  - percentage string like `'75%'`
  - `calc(...)` expression string
  - `{ width, height }` using the same scalar contract per axis
- [Confirmed] `pxOrPercentSchema` accepts arbitrary strings only when they satisfy the library's `calc(...)` validator; malformed strings such as `'100'` are rejected.
- [Confirmed] Supported `Placement` values are exactly:
  - `'left'`
  - `'left-top'`
  - `'left-bottom'`
  - `'top'`
  - `'right'`
  - `'right-top'`
  - `'right-bottom'`
  - `'bottom'`
  - `'center'`
- [Confirmed] `Color` accepts Pixi color-source compatible values used in tests and schema:
  - string
  - number
  - numeric array
  - `Float32Array`
  - `Uint8Array`
  - `Uint8ClampedArray`
  - HSL/HSV/RGB object forms
  - Pixi `Color` instance
- [Confirmed] `TextureStyle` is a partial object whose recognized keys are:
  - `type?: 'rect'`
  - `fill?: string`
  - `borderWidth?: number`
  - `borderColor?: string`
  - `radius?: number | EachRadius`
- [Confirmed] `LabelTextStyle` defaults and extensions over shared `TextStyle`:
  - base defaults: `fontFamily`, `fontWeight`, `fill`, `fontSize: 16`
  - component-only additions: `autoFont`, `wordWrapWidth`, `overflow`
  - `fontSize` may be `number | 'auto' | string`
- [Confirmed] standalone `ElementTextStyle` defaults and extensions over shared `TextStyle`:
  - `wordWrap: true`
  - `letterSpacing: 0`
  - `lineHeight?: number`

### 5.2 Normalization and Validation Rules

- [Confirmed] Element and component schemas are strict; unknown keys are rejected during validated apply/draw.
- [Confirmed] Duplicate IDs across top-level elements and nested group descendants are rejected by `mapDataSchema`.
- [Confirmed] Common defaults:
  - `show: true`
  - generated `id` when omitted
  - `locked: false` on elements
  - `components: []` where applicable
  - `gap: { x: 0, y: 0 }`
  - `padding`/`margin`: all-zero box
  - `relations.style: {}`
  - `background.size`: forced to 100% width and height
- [Confirmed] Numeric `size` values normalize to `{ width, height }`.
- [Confirmed] Numeric `gap` normalizes to `{ x, y }`.
- [Confirmed] Box spacing normalization accepts:
  - number
  - `{ x, y }`
  - `{ top, right, bottom, left }`
  - mixed axis+edge forms where edge keys override axis-derived sides
- [Confirmed] `bar` and `icon` sizes accept pixels, percentages, or `calc(...)`-style strings as defined by `pxOrPercentSchema`.
- [Confirmed] `fit()` padding intentionally does not reuse full box-spacing syntax; it accepts only axis-based input.
- [Confirmed] `update()` normalizes change payloads before validation unless `normalize: false` is passed.
- [Confirmed] `calc(...)` expressions must alternate term/operator tokens and require spaces around `+` and `-`, for example `calc(100% - 20px)`.
- [Confirmed] Theme color tokens are resolved lazily from dot-path strings such as `primary.default`; unresolved strings are left unchanged and passed through as raw Pixi color strings.

### 5.2.1 Update, Merge, and Identity Matching Rules

- [Confirmed] Runtime `apply()` first computes a shallow patch diff against current props; unchanged keys are skipped unless `refresh: true`.
- [Confirmed] `mergeStrategy: 'merge'` uses deep recursive merge semantics:
  - plain objects merge per key
  - arrays merge by identity priority `id -> label -> type`
  - primitive values replace directly
- [Confirmed] `mergeStrategy: 'replace'` still preserves unspecified top-level props by starting from `{ ...this.props, ...normalizedChanges }`, but array-typed fields handled by child/component mixins are effectively replaced because unmatched managed children/components are destroyed.
- [Confirmed] New child elements and new components are validated in batch before creation; existing matched children/components are updated in place.
- [Confirmed] Child/component matching uses `findIndexByPriority()` with priority keys `['id', 'label', 'type']`.
- [Confirmed] `attrs`, `id`, and `label` are applied as raw runtime mutations before higher-level property handlers run.
- [Confirmed] Special raw-attribute handling:
  - `x` and `y` are applied together through `position.set(x, y)`
  - `width` and `height` are applied together through `setSize(width, height)`
  - `undefined` deletes runtime properties except `id` and `label`
- [Confirmed] `grid.cells` materialization creates child item IDs as `${grid.id}.${rowIndex}.${colIndex}` and uses the cell value stringified as the generated child `label`.
- [Confirmed] Inactive grid cells behave as follows:
  - falsy cell with `inactiveCellStrategy: 'destroy'` -> no child is created and obsolete child is removed
  - falsy cell with `inactiveCellStrategy: 'hide'` -> child remains but `show: false`
- [Confirmed] Updating `grid.item` and/or `grid.gap` re-applies size/components to existing materialized cell items and recomputes each child `attrs.x`/`attrs.y`.
- [Confirmed] `relations.apply()` has merge-only deduplication logic for `links`: when `mergeStrategy === 'merge'`, incoming links already present in current props are filtered out before validation.

### 5.3 State and Lifecycle

- [Confirmed] Per-instance mutable state:
  - theme store
  - viewport/application handles
  - undo/redo manager
  - GSAP context
  - optional transformer
  - state manager
- [Confirmed] Shared/global mutable state:
  - element registry side effects
  - component registry side effects
  - GSAP PixiPlugin registration
  - `PIXI.Assets` global cache/resolver state
- [Confirmed] Multiple `Patchmap` instances can coexist, but they share asset cache and module-level registrations.

## 6. Repository and Internal Architecture

### 6.1 Important Directories and Modules

- [Confirmed] `src/patch-map.ts`: package barrel export
- [Confirmed] `src/patchmap.js`: main `Patchmap` class
- [Confirmed] `src/init.js`: application, viewport, asset, resize-observer initialization
- [Confirmed] `src/display/`: rendering layer, element/component classes, schema, normalization
- [Confirmed] `src/events/`: selection helpers, focus/fit logic, state system
- [Confirmed] `src/command/`: undo/redo manager and commands
- [Confirmed] `src/transformer/`: selection visualization and resize interaction
- [Confirmed] `src/utils/`: selectors, hit testing, IDs, spacing, theme, diff helpers
- [Confirmed] `src/tests/`: browser-oriented render/update/transformer tests

### 6.2 Composition and Dependency Flow

- [Confirmed] Package root -> `Patchmap` class -> `init`/`draw`/`update` helpers -> mixin-based element/component runtime.
- [Confirmed] Rendered elements are created through registries populated by import-time side effects.
- [Confirmed] `update()` delegates to runtime element `apply()` methods, which normalize, validate, diff, and run registered property handlers.
- [Confirmed] Undo/redo wraps `apply()` through `UpdateCommand`.
- [Confirmed] `Transformer` listens to viewport `object_transformed` events to keep wireframes synced with object changes.
- [Confirmed] `draw()` replaces viewport-managed element children by applying a synthetic root `{ type: 'canvas', children: data }` payload to the viewport.
- [Confirmed] Registries are mandatory for runtime creation:
  - `newElement(type, store)` throws if the type was not registered
  - `newComponent(type, store)` throws if the type was not registered
- [Confirmed] Relations keep a `linkedObjects` lookup keyed by linked element ID and mark themselves dirty when any linked object or linked ancestor emits `object_transformed`.
- [Confirmed] Source-bearing components first try synchronous texture resolution from built-in texture helpers and Pixi caches, then fall back to async `PIXI.Assets.load(source)` for string sources.
- [Confirmed] Async source loads are token-guarded, so stale late responses do not overwrite newer `source` updates; failed loads warn and set `Texture.EMPTY`.

## 7. Configuration and Environment Contract

### 7.1 Consumer-Facing Options

- [Confirmed] `init()` accepts consumer options for PIXI app, viewport behavior, theme overrides, custom assets, and initial transformer.
- [Confirmed] `update()` accepts targeting, change application, history, refresh, and relative transform options.
- [Confirmed] `focus()` accepts only `filter`.
- [Confirmed] `fit()` accepts `filter` and axis-based `padding`.
- [Confirmed] Built-in `selection` state accepts options such as:
  - `draggable`
  - `paintSelection`
  - `filter`
  - `selectUnit`
  - `drillDown`
  - `deepSelect`
  - `selectionBoxStyle`
  - `onDown`
  - `onUp`
  - `onClick`
  - `onDoubleClick`
  - `onRightClick`
  - `onDragStart`
  - `onDrag`
  - `onDragEnd`
  - `onOver`
- [Confirmed] `Transformer` options are validated, but unknown keys are stripped rather than rejected.
- [Confirmed] Default theme contents are:
  - `primary.default: '#0C73BF'`
  - `primary.dark: '#083967'`
  - `primary.accent: '#EF4444'`
  - `gray.light: '#9EB3C3'`
  - `gray.default: '#D9D9D9'`
  - `gray.dark: '#71717A'`
  - `white: '#FFFFFF'`
  - `black: '#1A1A1A'`
- [Confirmed] `themeStore.get()` returns only a shallow copy of the root object; nested theme objects remain shared references after retrieval.

### 7.2 Build-Time / Runtime Assumptions

- [Confirmed] No environment variables are read.
- [Confirmed] The library assumes consumer-installed `pixi.js` (`peerDependencies`) and browser DOM globals.
- [Confirmed] Default font/icon assets are bundled into the package and loaded through `PIXI.Assets`.
- [Confirmed] Consumer-supplied `assets` or image/background sources may trigger asset loads through PIXI, including remote URLs if provided.
- [Confirmed] `UndoRedoManager` listens on `document`, and `StateManager` may listen on `window` for keyboard events.

### 7.3 Compatibility Constraints

- [Confirmed] Peer dependency: `pixi.js >=8`
- [Confirmed] Runtime dependency list includes `pixi-viewport`, `gsap`, `zod`, `jsonpath-plus`, `nanoid`, and others.
- [Confirmed] Rollup externalizes `pixi.js` and `nanoid`; other dependencies are bundled into JS build outputs.
- [Confirmed] No `sideEffects` field is declared in `package.json`.
- [Inferred] Consumers should not rely on deep internal module paths because only the package root is exported.

## 8. Runtime Behavior

### 8.1 Main Execution Flows

- [Confirmed] `draw()` replaces the scene wholesale.
- [Confirmed] `update()` mutates rendered objects in place.
- [Confirmed] Relations are refreshed in a later ticker task after draw so linked endpoints exist before relation rendering updates run.
- [Confirmed] Undoable updates capture a partial previous state slice, then restore with `mergeStrategy: 'replace'` on undo.

### 8.2 Concurrency and Reentrancy

- [Confirmed] The package maintains mutable instance state and is not reentrant in a functional sense.
- [Inferred] Overlapping `init()` calls on the same instance may race because initialization is not promise-serialized.
- [Confirmed] `draw()`, `update()`, `destroy()`, and transformer changes all mutate shared instance state synchronously.
- [Confirmed] Shared caches/registries mean instances are isolated for scene state but not for asset/registry globals.

### 8.3 Timeout, Retry, and Cancellation Semantics

- [Confirmed] No retry behavior exists.
- [Confirmed] No timeout behavior exists.
- [Confirmed] `init()`/asset loading promises do not expose cancellation.
- [Confirmed] State lifecycle uses `AbortController`, but only for custom state implementation use; public async APIs do not accept `AbortSignal`.

### 8.4 Selection, Hit Testing, and Canvas Event Semantics

- [Confirmed] Selection-state handled event names are exactly:
  - `onpointerdown`
  - `onpointermove`
  - `onpointerup`
  - `onpointerover`
  - `onpointerleave`
  - `onclick`
  - `ontap`
  - `rightclick`
- [Confirmed] Selection drag activation threshold is `4px`, scaled by current viewport scale via `isMoved(point1, point2, scale)`.
- [Confirmed] `SelectionState` default config is:
  - `draggable: false`
  - `paintSelection: false`
  - `filter: () => true`
  - `selectUnit: 'entity'`
  - `drillDown: false`
  - `deepSelect: false`
  - `selectionBoxStyle.fill: { color: '#9FD6FF', alpha: 0.2 }`
  - `selectionBoxStyle.stroke: { width: 2, color: '#1099FF' }`
  - all callbacks default to no-op functions
- [Confirmed] Pointer interaction state machine is:
  - `IDLE` -> `PRESSING` on `pointerdown`
  - `PRESSING` -> `DRAGGING` or `PAINTING` once movement exceeds threshold and `draggable === true`
  - reset to `IDLE` on `pointerup` or `pointerleave`
- [Confirmed] `pointermove` does nothing while `IDLE` or when `draggable === false`; click/hover callbacks still work even if dragging is disabled.
- [Confirmed] `onDown` fires immediately on `pointerdown` before right-click clearing logic runs.
- [Confirmed] Right-button `pointerdown` clears current gesture/selection-box state after `onDown`.
- [Confirmed] `onUp` fires only for non-drag pointer release from the `PRESSING` state.
- [Confirmed] `onDragStart` fires once when drag/paint begins.
- [Confirmed] `onDrag` fires repeatedly with the current selected target set during box-drag or paint-select.
- [Confirmed] `onDragEnd` fires only when the active gesture was `DRAGGING` or `PAINTING`.
- [Confirmed] `onClick` and `onDoubleClick` are suppressed if either:
  - pointer movement crossed the drag threshold
  - viewport panned/zoomed during the gesture
- [Confirmed] `ontap` is routed to the same logic as `onclick`.
- [Confirmed] `drillDown: true` causes repeated hit testing inside the previously hit target on multi-clicks before dispatching `onDoubleClick`.
- [Confirmed] Despite the JSDoc wording, the current `deepSelect` implementation forces `selectUnit: 'grid'` when Ctrl/Meta is held; it does not force `'entity'`.
- [Confirmed] Selection hit testing and transformer resize selection both exclude locked objects and descendants of locked ancestors.
- [Confirmed] `selectUnit` resolution behaves as follows:
  - `'entity'` -> the directly hit selectable object
  - `'closestGroup'` -> nearest ancestor `group`, else nearest ancestor `grid`
  - `'highestGroup'` -> highest ancestor `group`, else nearest ancestor `grid`
  - `'grid'` -> nearest ancestor `grid`
- [Confirmed] When transformer selection already exists, selection searches exclude ancestors of the currently transformed elements to avoid selecting a container that encloses the active selection.
- [Confirmed] Canvas-event registration contract:
  - schema fields are `id`, `path`, `elements`, `action`, `fn`, `options`
  - default `id` is generated when omitted
  - default `path` is `'$'`
  - when `elements` is provided and `path` is omitted, stored `path` becomes `null`
  - `elements` is normalized to an array when provided
- [Confirmed] `event.on(id)` and `event.off(id)` split both event IDs and event action names on whitespace.
- [Confirmed] Canvas events store an `active` flag and will not double-bind or double-unbind if repeatedly turned on/off.
- [Confirmed] Event targets are resolved from `event.elements` plus current selector results for `event.path`; no deduplication is performed.

### 8.5 Legacy Conversion Contract

- [Confirmed] Legacy input auto-conversion is keyed only on the presence of a top-level `grids` property in a non-array object passed to `draw()`.
- [Confirmed] `convertLegacyData()` ignores the legacy top-level `metadata` key.
- [Confirmed] Legacy `grids` entries convert to `grid` elements with:
  - `id <- value.id`
  - `label <- value.name`
  - `cells <- value.children` mapped so `'0'` becomes `0` and every other value becomes `1`
  - `gap: 4`
  - `item.size.width <- properties.spec.width * 40`
  - `item.size.height <- properties.spec.height * 40`
  - default `background` and hidden `bar` components
  - `attrs.x <- properties.transform.x`
  - `attrs.y <- properties.transform.y`
  - `attrs.angle <- properties.transform.rotation`
  - `attrs.display <- 'panelGroup'`
- [Confirmed] Legacy `strings` entries convert to `relations` elements with:
  - sequential links between consecutive child endpoint arrays joined by `'.'`
  - a self-link when exactly one child exists
  - `style.width: 4`
  - `style.color <- value.properties.color.dark`
  - `style.cap: 'round'`
  - `style.join: 'round'`
  - `attrs.display <- 'string'`
  - `attrs.zIndex <- 20`
  - `attrs.metadata` flattens `properties.props` into the surrounding metadata object when present
- [Confirmed] All other legacy collections convert to `item` elements with:
  - `size: 40`
  - default `background`, `icon`, and hidden `bar` components
  - icon/display name derived from the collection key by singularizing `key.slice(0, -1)`, except `combines -> combiner`
  - `attrs.x <- properties.transform.x`
  - `attrs.y <- properties.transform.y`
  - `attrs.metadata <- remaining legacy properties`
  - `attrs.display <- singularized key or 'combiner'`
  - `attrs.zIndex <- 10`

## 9. Error Model

- [Confirmed] Schema validation errors are surfaced as thrown `zod-validation-error` instances/messages from:
  - `draw()`
  - `fit()`
  - `focus()`
  - `Transformer` constructor
  - runtime `update()` application
  - `event.add()` when its config is invalid
- [Confirmed] `Command.execute()` and `Command.undo()` throw when not overridden.
- [Confirmed] `Patchmap.transformer = invalidValue` logs to `console.error` and clears the transformer instead of throwing.
- [Confirmed] `update()` on missing targets is silent and returns an empty or partially empty target list.
- [Confirmed] `focus()`/`fit()` on missing targets return `null`.
- [Inferred] Calling render-manipulation APIs before successful `init()` is invalid usage; no defensive guard prevents null dereferences in `draw()`, `update()`, `focus()`, or `fit()`.

## 10. README vs Implementation Notes

- [Confirmed] README features confirmed by code/tests
  - `Patchmap`, `UndoRedoManager`, `State`, `Transformer` are real exports
  - `focus()`/`fit()` behavior and padding defaults match implementation/tests
  - selection-state callbacks and select-unit behaviors are implemented
  - undo/redo bundling by `historyId` is implemented
- [Confirmed] README mismatches with implementation
  - README says `SelectionState` is registered when `patchmap.draw()` runs; code registers it in `init()`
  - README documents `SelectionState` as a primary public concept, but the package does not export the `SelectionState` class; consumers interact with it only by state name through `patchmap.stateManager`
  - README includes an `asset` section, but no `patchmap.asset` public property or method exists
  - README says `destroy()` destroys registered assets; code does not unload `PIXI.Assets`
  - README omits `autoStart` and `useContextAlpha` from the actual default `app` options
  - README's default viewport plugin list omits `pinch`, which code enables by default
  - README development section mentions `npm run dev`; `package.json` has no `dev` script
  - README describes transformer transformations "such as resizing or rotating"; implementation only provides wireframe display and resize
- [Confirmed] Implementation behavior missing from README
  - `init()` supports `assets` and `transformer` options
  - `draw()` JSON-serializes input before validation
  - `update()` supports `emit: false`, `validateSchema`, and `normalize`
  - `event.add()` supports direct `elements`
  - root package exports utility functions and `convertLegacyData`
  - selector traversal is restricted to `children` by default

## 11. Testing and Validation Evidence

- [Confirmed] Unit/browser tests cover:
  - schema defaults and strictness
  - duplicate ID rejection
  - spacing normalization
  - focus/fit option validation and relation-target behavior
  - `Patchmap.draw()` rendering and async draw event emission
  - `Patchmap.update()` merge/replace/relative-transform behavior
  - `UndoRedoManager` execute/undo/redo/bundling/events
  - transformer wireframe and resize behavior
  - `uid()` output shape
- [Confirmed] `src/display/data-schema/data.d.ts` has explicit tests ensuring it documents key schema distinctions.
- [Open Question] No test coverage was found for published package consumption shape, especially declared root TypeScript typings and UMD global usage.
- [Open Question] No direct automated tests were found for the canvas event wrapper lifecycle across redraw/rebind scenarios.

## 12. Build, Packaging, and Release Behavior

- [Confirmed] Build command: `npm run build` -> `tsc && rollup -c`
- [Confirmed] Test commands:
  - `npm run test:unit`
  - `npm run test:browser`
  - `npm run test:headless`
- [Confirmed] Formatting/lint commands:
  - `npm run format`
  - `npm run lint`
  - `npm run lint:fix`
- [Confirmed] Release command: `npm run release` -> `standard-version`
- [Confirmed] Rollup copies `src/assets/fonts/OFL-1.1.txt` into `dist/assets/fonts/`
- [Confirmed] No GitHub Actions workflow was present in `.github/`; repository metadata includes issue and PR templates only.
- [Confirmed] Local build/test execution was not performed in this review pass because `node_modules/` is absent in the workspace. Behavioral claims in this spec are therefore grounded in repository code and committed tests, not fresh command execution.

## 13. Known Gaps and Open Questions

- [Open Question] Published type-entry correctness: `package.json#types` points at `dist/types/src/patchmap.d.ts`, which may not describe all root exports from `src/patch-map.ts`.
- [Confirmed] Public docs rely on `src/display/data-schema/data.d.ts`, but that file is not exposed through `exports`; consumers should treat it as repository documentation, not an import path contract.
- [Confirmed] Several instance members are publicly writable (`viewport`, `isInit`) without README coverage or validation, suggesting accidental exposure.
- [Confirmed] `draw()` input cloning may silently discard otherwise schema-valid non-JSON values.
- [Open Question] UMD global access shape is not documented in README and was not locally verified.
- [Confirmed] Remaining gaps after this spec revision are packaging/documentation questions, not core runtime-behavior questions required for clean-room reimplementation of the repository code.

## 14. Evidence Notes

- Package/distribution: `package.json`, `rollup.config.mjs`, `tsconfig.json`
- Root exports: `src/patch-map.ts`
- Main class/runtime behavior: `src/patchmap.js`, `src/init.js`, `src/display/draw.js`, `src/display/update.js`
- Data contract: `src/display/data-schema/element-schema.js`, `src/display/data-schema/component-schema.js`, `src/display/data-schema/primitive-schema.js`, `src/display/data-schema/data.d.ts`
- State/interaction system: `src/events/StateManager.js`, `src/events/states/State.js`, `src/events/states/SelectionState.js`, `src/events/focus-fit.js`, `src/events/schema.js`
- Undo/redo: `src/command/UndoRedoManager.js`, `src/command/commands/base.js`, `src/command/commands/update.js`
- Transformer: `src/transformer/Transformer.js`, `src/transformer/SelectionModel.js`
- Utilities: `src/utils/index.js`, `src/utils/selector/selector.js`, `src/utils/event/canvas.js`, `src/utils/theme.js`, `src/utils/uuid.js`
- Behavioral evidence: `src/tests/render/patchmap.test.js`, `src/events/focus-fit.test.js`, `src/events/schema.test.js`, `src/command/UndoRedoManager.test.js`, `src/tests/Transformer.test.js`, schema/normalize tests
- README claims: `README.md`

## Appendix A. Reference Usage Flows

### A.1 Basic Render Flow

```js
import { Patchmap } from '@conalog/patch-map';

const patchmap = new Patchmap();
await patchmap.init(container, {
  theme: { primary: { default: '#c2410c' } },
});

const validatedData = patchmap.draw(mapData);
```

### A.2 Incremental Update With Undo

```js
patchmap.update({
  path: '$..[?(@.id=="item-1")]',
  changes: { attrs: { x: 200 } },
  history: true,
});

patchmap.undoRedoManager.undo();
patchmap.undoRedoManager.redo();
```

### A.3 Selection + Transformer Flow

```js
import { Transformer } from '@conalog/patch-map';

patchmap.transformer = new Transformer({ resizeHandles: true });

patchmap.stateManager.setState('selection', {
  draggable: true,
  onClick: (target) => {
    patchmap.transformer.elements = target ? [target] : [];
  },
  onDragEnd: (targets) => {
    patchmap.transformer.elements = targets;
  },
});
```

## Appendix B. Glossary

- `Element`: top-level renderable node in map data (`group`, `grid`, `item`, `relations`, `image`, `text`, `rect`)
- `Component`: visual child of an `item` (`background`, `bar`, `icon`, `text`)
- `Selection State`: built-in internal state registered under the name `selection`
- `Transformer`: wireframe/resize overlay for selected rendered objects
- `History ID`: identifier used to bundle multiple updates into one undo/redo step
