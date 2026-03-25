# Feature Specification: Patchmap Compatibility Spec

**Feature Branch**: `001-patchmap-spec`  
**Created**: 2026-03-25  
**Status**: Draft  
**Input**: User description: "Produce a language-agnostic specification for the patch-map library by synthesizing the existing reference material and the currently observable runtime behavior."

## Problem Statement

The repository contains detailed implementation-facing guides for the current `patch-map` codebase, but it does not yet provide a single normative specification that describes the library only in terms of externally observable behavior.

This specification defines that behavioral contract. It is intended to be sufficient for a fresh implementation in another language, runtime, or rendering stack, while preserving the public API surface, default values, data semantics, navigation rules, interaction behavior, history rules, and transformer behavior that existing consumers can observe.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Render and Maintain a Patch Map (Priority: P1)

A host application can initialize a patch-map runtime, provide structured map data, render it into a navigable scene, and later replace or partially update that scene without rebuilding the application shell.

**Why this priority**: Rendering and updating map data is the core value of the library. Without this, the library is not useful.

**Independent Test**: Can be fully tested by initializing a blank runtime, drawing a valid map, verifying visible entities and generated grid cells, then applying partial updates and confirming that only the targeted entities change.

**Acceptance Scenarios**:

1. **Given** an uninitialized patch-map instance and a valid host container, **When** the host calls `init(container, options)`, **Then** the runtime becomes initialized exactly once, exposes its application, viewport, world, history, and state surfaces, and emits an initialization event.
2. **Given** an initialized patch-map instance and valid map data, **When** the host calls `draw(data)`, **Then** the library replaces the current world contents with the validated map contents, clears existing transient runtime state, schedules relation refresh, and emits a draw event asynchronously.
3. **Given** an initialized patch-map instance with rendered entities, **When** the host calls `update(options)` with explicit targets or a selector path, **Then** only the targeted entities are updated according to merge, replace, refresh, normalization, validation, and history options.

---

### User Story 2 - Navigate, Query, and Interact with the Scene (Priority: P2)

A host application can query rendered objects, attach event handlers, move or fit the camera to targets, and run stack-based interaction states including default selection behavior.

**Why this priority**: Patch maps are interactive artifacts, not static diagrams. Navigation, querying, and event routing are required to integrate the runtime into editing or monitoring tools.

**Independent Test**: Can be fully tested by drawing a scene, querying objects with selectors, binding events to the viewport and selected descendants, activating selection state behavior, and using `focus()` and `fit()` with normal nodes and relation nodes.

**Acceptance Scenarios**:

1. **Given** a rendered scene, **When** the host calls `selector(path, options)`, **Then** the query is evaluated relative to the world root and returns matching managed objects in flattened form.
2. **Given** a rendered scene, **When** the host calls `focus(ids, options)` or `fit(ids, options)`, **Then** the viewport moves to the resolved target bounds, and `fit()` also adjusts zoom using only the accepted padding forms.
3. **Given** an initialized runtime with registered interaction states, **When** events are dispatched from the viewport or the host's global keyboard event surface, **Then** the active modifier state intercepts them first, otherwise the state stack handles them from top to bottom until propagation is stopped.

---

### User Story 3 - Track Changes and Transform Selected Objects (Priority: P3)

A host application can group updates into undoable history steps, undo and redo them, display selection bounds, and resize supported objects with optional history recording.

**Why this priority**: Editing workflows depend on reversible changes and visible transformation affordances, but a minimal viewer still remains viable without them.

**Independent Test**: Can be fully tested by executing updates with and without `history`, verifying bundling by `historyId`, undoing and redoing partial attribute changes, and resizing selected elements through transformer handles.

**Acceptance Scenarios**:

1. **Given** a runtime with history-enabled updates, **When** multiple consecutive updates use the same `historyId`, **Then** they are undone and redone as one logical step.
2. **Given** a transformer with selected resizable elements, **When** the host enables resize handles and drags a handle, **Then** the selection bounds and target element sizes and positions update consistently with the active handle and aspect-ratio modifier state.
3. **Given** transformer resizing with resize history enabled, **When** the resize gesture completes, **Then** the resulting element mutations can be undone and redone through the shared history manager.

### Edge Cases

- What happens when `init()` is called more than once on the same instance? The second and later calls must be no-ops.
- What happens when `draw(data)` receives input outside the public map-data contract? The library must reject it before observable mutation.
- What happens when `draw(data)` or `update()` receives schema-invalid data? The library must reject it before observable mutation.
- What happens when duplicate element IDs appear in the public map tree? Validation must fail.
- What happens when `update()` targets the same element more than once through `elements` and `path`? Each resolved target must still be processed in order.
- What happens when `focus()` or `fit()` receives `null`, `undefined`, or no IDs? The library must use top-level managed world children, excluding top-level relation elements.
- What happens when `fit()` receives padding keys other than `x` and `y`? Validation must fail.
- What happens when a relation target is requested for focus or fit before its own rendered bounds are reliable? The library must resolve through linked endpoints when possible.
- What happens when all candidate targets for selection or resize are locked or under locked ancestors? They must be ignored.
- What happens when a resize computation produces fractional sizes? Output sizes must snap to integer unit steps with a minimum size of one unit.
- What happens when event IDs or actions are passed as whitespace-delimited strings? Each token must be processed independently.
- What happens when `contentOrientation` is omitted? Inner `text`, `icon`, and `bar` content must default to upright-on-screen behavior.
- What happens when multiple selectable objects overlap? Hit resolution must prefer higher `zIndex`, then later display order.

## Requirements *(mandatory)*

### Functional Requirements

#### A. Public Surface

- **FR-001**: The library MUST expose a primary `Patchmap` runtime surface with the following public members: `init`, `destroy`, `draw`, `update`, `focus`, `fit`, `selector`, `rotation`, `flip`, `event`, `app`, `viewport`, `world`, `theme`, `isInit`, `undoRedoManager`, `stateManager`, `transformer`, and `animationContext`.
- **FR-002**: The library MUST expose a command abstraction, a history manager, a base interaction state abstraction with propagation control, a transformer surface, a selector function, and utility exports for hit testing, movement threshold checks, point intersection checks, and unique ID generation.
- **FR-003**: The public contract MUST preserve the method and property names above even if internal implementation details differ.

#### B. Initialization and Destruction

- **FR-004**: A newly constructed `Patchmap` instance MUST be inert: it MUST not create a canvas, viewport, world, or state manager until `init()` is called.
- **FR-005**: `init(container, options)` MUST be idempotent per instance. If the instance is already initialized, the call MUST return without recreating runtime state.
- **FR-005A**: `init()` MUST be asynchronous. Successful completion MUST not occur until the application surface is initialized, built-in and user assets required for the session are loaded, the host canvas wrapper is attached, resize observation is active, and the default `selection` state has been registered.
- **FR-006**: `init()` MUST create and connect an application surface, a viewport, a world root, a theme store, a history manager, and a state manager, and MUST register a default `selection` state.
- **FR-007**: `init()` MUST accept configuration for application options, viewport options, theme overrides, asset definitions, and an optional initial transformer.
- **FR-008**: `init()` MUST merge application, viewport, and theme options with library defaults rather than requiring full replacement.
- **FR-008A**: The default application options MUST be equivalent to: background `#FAFAFA`, antialias enabled, automatic start enabled, automatic density enabled, context alpha enabled, and resolution `2`.
- **FR-008B**: The default viewport options MUST be equivalent to: passive wheel disabled, zoom clamped to a minimum scale of `0.5` and maximum scale of `30`, and drag, wheel, pinch, and deceleration behavior enabled by default.
- **FR-008C**: The default theme palette MUST include `primary.default = #0C73BF`, `primary.dark = #083967`, `primary.accent = #EF4444`, `gray.light = #9EB3C3`, `gray.default = #D9D9D9`, `gray.dark = #71717A`, `white = #FFFFFF`, and `black = #1A1A1A`.
- **FR-008D**: Application initialization MUST inject host-container resize binding semantics equivalent to `resizeTo: container` even when the caller omits that field.
- **FR-008E**: Viewport initialization MUST inject current screen width, current screen height, and the host renderer’s event surface even when the caller omits those fields.
- **FR-008F**: `viewport.plugins` in `init()` options MUST be interpreted as declarative init-time plugin registrations rather than opaque data, and any plugin entry marked disabled MUST be skipped during that initial registration.
- **FR-009**: `init()` MUST load the library’s default icon assets and default font assets, and MUST merge user-supplied assets by stable identity so duplicate registrations are avoided.
- **FR-009A**: `opts.assets` MUST accept both bundle definitions of shape `{ name, items }` and single-asset definitions of shape `{ alias, src }`, and a compatible implementation MUST accept both forms in the same input list.
- **FR-009B**: Bundle definitions MUST be deduplicated by bundle `name`, single-asset definitions MUST be deduplicated by asset `alias`, and initialization MUST complete only after all required bundle and single-asset loads for the merged asset set have completed.
- **FR-009C**: The built-in icon-asset namespace MUST expose at least the source keys `object`, `inverter`, `combiner`, `device`, `edge`, `loading`, `warning`, and `wifi`.
- **FR-009D**: The built-in font namespace MUST provide `FiraCode` as the default text-rendering family and MUST additionally provide weight-addressable shipped families compatible with `thin`, `extralight`, `light`, `regular`, `medium`, `semibold`, `bold`, `extrabold`, and `black`.
- **FR-010**: `init()` MUST observe host container resizing and update the application, viewport, and world transform accordingly.
- **FR-011**: `init()` MUST emit `patchmap:initialized` after the runtime surfaces are ready.
- **FR-012**: `destroy()` MUST be a no-op when the instance is not initialized.
- **FR-013**: `destroy()` MUST dispose of history listeners, animation context, state manager state, registered canvas events, viewport resources, application resources, resize observers, and runtime references, then emit `patchmap:destroyed`.

#### C. Draw and World Replacement

- **FR-014**: `draw(data)` MUST accept normalized public map data only.
- **FR-015**: `draw(data)` MUST treat the public input boundary as JSON-compatible data and MUST process a deep JSON-equivalent clone of the provided input before validation or mutation.
- **FR-016**: `draw(data)` MUST NOT perform legacy-input conversion or compatibility heuristics; any input that does not satisfy the public map-data contract MUST fail validation before observable mutation.
- **FR-017**: `draw(data)` MUST validate the public map data before mutating the rendered world. Invalid input MUST fail without partially drawing.
- **FR-018**: Before replacing the world contents, `draw(data)` MUST stop rendering, clear undo/redo history, revert the current animation context, and remove registered canvas events from the viewport surface.
- **FR-019**: A successful `draw(data)` MUST replace the entire rendered world contents with the validated map contents.
- **FR-020**: After a successful draw, the library MUST schedule one follow-up refresh pass for all relation elements so that relation geometry resolves after all link targets exist.
- **FR-021**: `draw(data)` MUST restart rendering after the replacement and MUST emit `patchmap:draw` asynchronously rather than in the same synchronous call stack.
- **FR-021A**: The internally scheduled post-draw relation refresh MUST NOT emit `patchmap:updated`.
- **FR-022**: `draw(data)` MUST return the validated normalized map data that was actually rendered.

#### D. Public Data Model

- **FR-023**: The public root draw data MUST be an ordered array of elements. The allowed public element kinds MUST be `group`, `grid`, `item`, `relations`, `image`, `text`, and `rect`.
- **FR-024**: All public elements MUST support optional `id`, optional `label`, optional `attrs`, optional `show` defaulting to `true`, and optional `locked` defaulting to `false` for element kinds.
- **FR-025**: The library MUST auto-generate a unique ID when a public element or component omits `id`.
- **FR-026**: `group` MUST require `children`, and `children` MUST recursively use the same public element contract.
- **FR-027**: `grid` MUST require a two-dimensional `cells` matrix and an `item` template. Active cells MUST generate concrete item instances, while inactive cells MUST follow the configured inactive-cell strategy.
- **FR-027A**: `grid.inactiveCellStrategy` MUST default to `destroy`, `grid.gap` MUST default to zero on both axes, and `grid.item` MUST default `components` to an empty list, `padding` to zero box spacing, and `contentOrientation` to `upright`.
- **FR-028**: Grid cell values of `1` and non-empty strings MUST be treated as active. A grid cell value of `0` MUST be treated as inactive. Empty strings MAY be schema-valid input but MUST behave as inactive cells at runtime.
- **FR-029**: Generated grid-cell item IDs MUST follow the format `{grid-id}.{row-index}.{column-index}`.
- **FR-029A**: Generated grid-cell item labels MUST equal the string form of the source cell value.
- **FR-030**: `item` MUST require `size` and MAY contain ordered components, padding, content-orientation rules, and arbitrary attributes.
- **FR-030A**: `item.components` MUST default to an empty list, `item.padding` MUST default to zero box spacing, and `item.contentOrientation` MUST default to `upright`.
- **FR-031**: `relations` MUST require ordered `links`, where each link references a `source` ID and a `target` ID.
- **FR-031A**: When relation style is omitted, the default path color MUST be `black`.
- **FR-032**: `image` MUST require `source`, `text` MUST support optional `text` content with default empty string, and `rect` MUST require `size`.
- **FR-032A**: Standalone root `text` elements MUST follow the world transform at the container level while keeping their rendered text visual upright and readable on screen under the same positive-determinant conditions used for upright item content.
- **FR-033**: Components MUST only be legal inside `item.components` or `grid.item.components`, and the supported component kinds MUST be `background`, `bar`, `icon`, and `text`.
- **FR-033A**: `background.tint`, `bar.tint`, `icon.tint`, and component-text `tint` MUST default to white; `bar.placement` MUST default to `bottom`; `icon.placement` and component-text placement MUST default to `center`; component margins MUST default to zero box spacing; component text MUST default to empty string with `split = 0`; and `bar.animation` plus `bar.animationDuration` MUST default to `true` and `200`.
- **FR-033B**: `background.source` MUST accept either a string source key or a texture-style object, `bar.source` MUST accept only a texture-style object, and `icon.source` MUST accept only a string source key.
- **FR-033C**: Texture-style objects MUST permit partial field sets, and if a `type` field is provided it MUST be `rect`.
- **FR-034**: Background components MUST always normalize to full parent size regardless of any input size value.
- **FR-035**: `bar`, `icon`, and component `text` MUST support placement and margin semantics, and bars MUST additionally support animation enablement and animation duration.
- **FR-035A**: The only valid placement values MUST be `left`, `left-top`, `left-bottom`, `top`, `right`, `right-top`, `right-bottom`, `bottom`, and `center`.
- **FR-036**: The library MUST support numeric shorthand and structured forms for size, gap, box spacing, and pixel-or-percent sizes. Numeric shorthand MUST normalize to the equivalent fully structured form.
- **FR-036A**: `Size` object values MUST include both `width` and `height`, and `PxOrPercentSize` object values MUST also include both `width` and `height`.
- **FR-036B**: `Size`, `Gap`, and pixel-or-percent numeric values MUST reject negative numbers.
- **FR-037**: Box spacing normalization MUST support numbers, `{ x, y }`, per-edge values, and mixed axis-plus-edge values where explicit edges override axis-derived values.
- **FR-037A**: Box spacing values MAY be negative, and both `margin` and `padding` MUST preserve those negative values through normalization.
- **FR-038**: Pixel-or-percent values MUST support nonnegative numbers, explicit percent strings, explicit `{ value, unit }` objects, and constrained `calc(...)` expressions containing only `%` or `px` terms with `+` or `-` operators separated by spaces.
- **FR-038A**: Scalar `PxOrPercentSize` inputs MUST expand to both axes, while structured `PxOrPercentSize` inputs MUST preserve distinct width and height values.
- **FR-039**: Validation MUST reject unknown keys on strict element and component objects.
- **FR-040**: Validation MUST reject duplicate public IDs across the root element array and recursively nested `group.children`.
- **FR-040A**: Managed top-level world children MUST remain ordered by `zIndex` and stable display order after both draw and update operations.
- **FR-040B**: `contentOrientation: 'upright'` MUST keep `item` and `grid.item` inner `text`, `icon`, and `bar` visually upright and readable on screen under world rotation and flip, while `contentOrientation: 'follow-item'` MUST make those inner components follow the item’s own orientation.

#### E. Selector Query Language

- **FR-041**: `selector(path, options)` MUST interpret `path` using JSONPath semantics relative to the provided root object.
- **FR-041A**: Compatibility-oriented selector implementations MUST support at least root `$`, direct child selection, recursive descent `..`, array wildcard `[*]`, and filter predicates `?()` sufficient to evaluate queries equivalent to `$.children[*]`, `$..children`, `$..children[?(@.type != null)]`, and `$..[?(@.id=="item-1")]`.
- **FR-042**: Unless caller-supplied options explicitly override traversal behavior, selector traversal MUST descend only through `children` keys and MUST ignore other object keys for recursive discovery.
- **FR-042A**: Selector evaluation MUST preserve the result ordering produced by JSONPath evaluation over that `children`-only traversal and MUST flatten the result list by default.
- **FR-043**: `selector('$')` MUST return the root object itself, and `path: '$'` used by the event facade MUST continue to carry its special meaning of binding against the viewport surface rather than the world root.
- **FR-044**: A nullish selector root MUST be treated as an empty object for evaluation purposes rather than causing selector execution itself to fail.

#### F. Update Resolution and Mutation

- **FR-045**: `update(options)` MUST accept targets from `elements`, `path`, or both. If both are supplied, the resolved target list MUST concatenate both sources in order.
- **FR-045A**: `update(options)` MUST NOT deduplicate targets resolved more than once; each resolved occurrence MUST be processed in order.
- **FR-046**: `update(options)` MUST silently skip `null` or missing resolved targets rather than failing the whole update.
- **FR-047**: `update(options)` MUST support `changes`, `history`, `relativeTransform`, `mergeStrategy`, `refresh`, `validateSchema`, and `normalize` options.
- **FR-048**: When `history` is `false`, updates MUST apply without recording a history step. When `history` is `true`, the library MUST create a fresh history group ID. When `history` is a string, that exact string MUST be used as the history group ID.
- **FR-049**: When `relativeTransform` is enabled, numeric `attrs.x`, `attrs.y`, `attrs.rotation`, and `attrs.angle` deltas MUST be added to the target’s current values before apply; no other fields may be treated as relative.
- **FR-050**: Unless explicitly disabled, updates MUST normalize shorthand input before merge and MUST validate the resulting payload before mutating the rendered target.
- **FR-050A**: Normalization MUST only transform plain-object payloads; non-plain payload values MUST pass through unchanged.
- **FR-051**: `mergeStrategy: 'merge'` MUST merge into existing state. `mergeStrategy: 'replace'` MUST replace at the top level while using special reconciliation rules for managed child and component arrays rather than naïve full-object replacement.
- **FR-052**: `refresh: true` MUST force reprocessing of all existing keys on the target, not only newly changed keys.
- **FR-053**: If the resolved change set is empty for a target, the update MUST be a no-op for that target.
- **FR-054**: When history is active, the mutation MUST be represented as an undoable command rather than mutating the target immediately.
- **FR-055**: Managed `children` and managed `components` MUST be reconciled by identity-aware matching, update existing managed instances in place when possible, create missing managed instances when necessary, and under `replace` remove unmatched managed instances while preserving unmanaged raw rendering children.
- **FR-055A**: Identity-aware matching for managed `children` and `components` MUST search existing still-unmatched managed instances using the first key present on the incoming change object from this priority order: `id`, then `label`, then `type`.
- **FR-055B**: If an incoming managed child or component change object contains none of `id`, `label`, or `type`, it MUST be treated as a request to create a new managed instance rather than match an existing one.
- **FR-055C**: Validation and default-filling for managed `children` and `components` MUST be applied only to unmatched incoming definitions that will create new managed instances; matched existing instances MUST be updated in place.
- **FR-055D**: Under `mergeStrategy: 'replace'`, matched surviving managed `children` and `components` MUST be re-ordered to follow the incoming array order before unmatched managed instances are removed, while unmanaged raw rendering children remain untouched.
- **FR-056**: For relation elements under `merge`, incoming links that duplicate an existing `{ source, target }` pair MUST be ignored instead of appended again.
- **FR-057**: `update()` MUST return the resolved target list after processing and MUST emit `patchmap:updated` unless `emit` is explicitly `false`.

#### G. Query, Events, Focus, and Fit

- **FR-058**: `selector(path, options)` MUST evaluate queries relative to the world root, and `selector('$')` MUST return the world root itself.
- **FR-058A**: If `path` is `null` or `undefined`, selector evaluation MUST treat it as the empty query string rather than as a missing call or an error.
- **FR-058B**: Selector evaluation MUST default to traversing only through `children` keys and MUST flatten results by default.
- **FR-058C**: `selector(path, options)` MUST merge caller-supplied selector options over those defaults, so compatible callers can override default selector behavior such as flattening.
- **FR-059**: The event facade MUST provide `add`, `remove`, `removeAll`, `on`, `off`, `get`, and `getAll`.
- **FR-059A**: `event.add(...)` MUST accept an event definition containing optional `id`, optional `path`, optional `elements`, required `action`, required callable `fn`, and optional listener `options`; it MUST auto-generate a unique ID when `id` is absent, MUST activate the newly registered event immediately, and MUST return the registered event ID.
- **FR-059B**: `event.remove(id)` MUST support removing a single ID or multiple space-delimited IDs in one call.
- **FR-059C**: `event.on(id)` and `event.off(id)` MUST support single IDs and multiple space-delimited IDs in one call.
- **FR-059D**: `event.add(...)` MUST preserve an existing registration when the same ID is added again instead of overwriting it.
- **FR-059E**: Event registrations MUST accept one or more actions in a whitespace-delimited string and MUST attach or detach every named action for every resolved target.
- **FR-059F**: `event.add(...)` MUST default to viewport-surface targeting when neither `path` nor `elements` is provided, and MUST bypass selector resolution when only explicit `elements` are provided.
- **FR-059G**: `event.remove(id)` MUST detach any currently active listeners for the targeted registrations before removing them from the registry, and `event.removeAll()` MUST do the same for every currently registered event.
- **FR-059H**: Each whitespace-delimited `action` token supplied to `event.add(...)` MUST be forwarded verbatim as an event name to the target surface with no aliasing, normalization, or remapping.
- **FR-059I**: Listener `options` supplied to `event.add(...)` MUST be passed through unchanged to both listener attachment and listener removal.
- **FR-060**: Event registration with `path: '$'` MUST bind against the viewport surface itself. Other selector paths MUST resolve relative to the world surface.
- **FR-060A**: If `elements` and `path` are both provided to `event.add(...)`, both sources MUST contribute targets without deduplication.
- **FR-060B**: `event.get(id)` MUST return `null` for unknown IDs, and `event.getAll()` MUST expose the full current event registry.
- **FR-060C**: For registrations that include a selector path, target resolution MUST occur at listener activation and deactivation time rather than being frozen to the result set from `event.add(...)`.
- **FR-060D**: When both explicit `elements` and selector-resolved `path` targets are present for one registration, attachment and detachment order MUST process explicit `elements` first and selector-resolved targets second.
- **FR-061**: `focus(ids, options)` and `fit(ids, options)` MUST accept a single ID, an array of IDs, or a nullish value for default targeting.
- **FR-062**: When `ids` is nullish, `focus()` and `fit()` MUST resolve targets from top-level managed world children and MUST exclude top-level relation elements from this default target set.
- **FR-063**: When an explicitly requested target is a relation element, `focus()` and `fit()` MUST attempt to resolve the linked endpoint elements first and MUST only use the relation element itself if no linked endpoints can be resolved.
- **FR-063A**: Bounds collection for `focus()` and `fit()` MUST recurse into managed child elements for contributor bounds, except that grid elements MUST contribute as whole elements rather than recursing into generated cell items.
- **FR-064**: Both `focus()` and `fit()` MUST accept an optional `filter(target)` predicate. During target expansion and bounds collection, any candidate for which the predicate returns false MUST be excluded; if that candidate is a container, its managed descendant subtree MUST also be excluded from further consideration.
- **FR-065**: `focus()` MUST move the viewport center to the resolved bounds center without changing zoom.
- **FR-066**: `fit()` MUST move the viewport center to the resolved bounds center and MUST also fit the viewport to the bounds using a default padding of `{ x: 16, y: 16 }`.
- **FR-066A**: `fit()` padding MUST behave in viewport space based on the current viewport scale rather than being added directly as world-space dimensions.
- **FR-067**: `fit()` padding MUST accept only a number or an object with optional `x` and `y` keys; any other padding shape MUST fail validation.
- **FR-068**: If `focus()` or `fit()` resolves no valid targets after filtering, the method MUST return `null` and MUST not move or scale the viewport.
- **FR-068A**: The public viewport surface MUST expose plugin-control helpers that can add, remove, pause, and resume named viewport plugins, and plugin addition MUST skip entries marked disabled.
- **FR-068B**: Adding a named viewport plugin through the plugin-control facade MUST replace any existing plugin with the same key before activating the new one.

#### H. Rotation and Flip

- **FR-069**: The runtime MUST expose a `rotation` controller with `value`, `set`, `rotateBy`, and `reset`.
- **FR-070**: The runtime MUST expose a `flip` controller with `x`, `y`, `set`, `toggleX`, `toggleY`, and `reset`.
- **FR-071**: Rotation and flip updates MUST recompute the world transform and MUST emit `patchmap:rotated` or `patchmap:flipped` respectively.
- **FR-071A**: `rotation.value` MUST be expressed in degrees.
- **FR-071B**: `rotation` and `flip` controllers MUST be usable before initialization or draw, MUST retain their assigned state while no world is attached, and MUST apply that retained state once the world becomes available.

#### I. State Manager and Default Selection Behavior

- **FR-072**: The state manager MUST support `register`, `setState`, `pushState`, `popState`, `resetState`, `activateModifier`, and `deactivateModifier`.
- **FR-072A**: When a state is entered, resumed, or otherwise invoked by the state manager, the state MUST receive the public patch-map runtime surface as its store argument rather than an internal-only scene context.
- **FR-072B**: `register(name, stateDefinition, isSingleton)` MUST support either a state class or an already-instantiated state object, and singleton registration MUST reuse the same state instance across activations when requested.
- **FR-072C**: `setState()` MUST clear the existing state stack before pushing the requested state, `pushState()` MUST pause the previously active state before entering the new one, and `popState(payload)` MUST exit the current state then resume the next state with the provided payload.
- **FR-073**: A modifier state MUST intercept all handled events before the normal state stack and MUST not mutate the main stack when activated or deactivated.
- **FR-074**: Without an active modifier state, events MUST be offered from the top of the state stack downward until a handler returns something other than the propagation sentinel.
- **FR-075**: The state manager MUST emit lifecycle events for state pushes, pops, resets, destruction, and modifier activation and deactivation.
- **FR-075A**: State event handlers for keyboard activity MUST bind to the host’s keyboard event surface, while non-keyboard handled events MUST bind to the viewport surface.
- **FR-075B**: `state:set` payloads MUST include `{ state, target }`, where `state` is the new active state instance and `target` is the state manager.
- **FR-075C**: `state:pushed` payloads MUST include `{ pushedState, pausedState, target }`, and `state:popped` payloads MUST include `{ poppedState, resumedState, target }`.
- **FR-075D**: `state:reset` and `state:destroyed` payloads MUST include `{ target }`.
- **FR-075E**: `modifier:activated` and `modifier:deactivated` payloads MUST include `{ modifierState, target }`.
- **FR-076**: The default registered `selection` state MUST support configuration for dragging, paint selection, filtering, selection unit, drill-down selection, deep selection, callbacks for down/up/click/double-click/right-click/drag/drag-end/hover, and selection-box styling.
- **FR-076A**: The default `selection` state configuration MUST default to `draggable: false`, `paintSelection: false`, `filter: () => true`, `selectUnit: 'entity'`, `drillDown: false`, `deepSelect: false`, no-op callbacks, `selectionBoxStyle.fill = { color: '#9FD6FF', alpha: 0.2 }`, and `selectionBoxStyle.stroke = { width: 2, color: '#1099FF' }`.
- **FR-077**: Default selection movement threshold MUST be scale-aware and equivalent to four world-space pixels at unit scale.
- **FR-078**: Default selection MUST ignore locked objects and descendants of locked ancestors.
- **FR-079**: Default selection MUST support selection units `entity`, `closestGroup`, `highestGroup`, and `grid`.
- **FR-079A**: If `selectUnit` is unknown or unsupported at runtime, the selection result MUST fall back to the original target entity rather than throwing.
- **FR-080**: Double-click drill-down MUST repeatedly search deeper targets at the same point, and deep selection with control/meta pressed MUST force grid-level search behavior.
- **FR-081**: The default selection implementation MUST treat right-click, click, double-click, drag-box selection, paint selection, and viewport-movement cancellation as distinct interaction outcomes.
- **FR-081A**: The default selection implementation MUST call its low-level `onUp` callback only for pointer-up transitions that did not become drag or paint gestures.
- **FR-081B**: The default selection implementation MUST call its hover callback only while idle.
- **FR-081C**: The default selection implementation MUST clear selection gesture state on pointer leave without synthesizing a drag-end callback.
- **FR-081D**: Compatibility-oriented implementations MUST provide the selection state with access to the current transformer selection or an equivalent selected-elements source; otherwise ancestor-filtering selection behavior is undefined.
- **FR-081E**: Point hit-testing and selection MUST prefer selectable candidates by descending `zIndex`, then by display order within common ancestors.
- **FR-081F**: A selectable object configured to delegate hit-testing to children MUST resolve through its descendants instead of treating its own bounds as the hit target.
- **FR-081G**: A double-click MUST invoke `onDoubleClick` and MUST NOT also invoke `onClick` for the same interaction.
- **FR-081H**: Tap input MUST be routed through the same click-resolution path as pointer click, including the same viewport-moved and movement-threshold guards.

#### J. History and Commands

- **FR-082**: The history manager MUST maintain an ordered command stack, a current pointer, a configurable maximum stack size defaulting to fifty, and `execute`, `undo`, `redo`, `canUndo`, `canRedo`, `clear`, and `destroy` operations.
- **FR-083**: Executing a new command after an undo MUST discard the redo branch.
- **FR-084**: Consecutive executed commands that share the same non-empty `historyId` MUST be bundled into one undo/redo step. Non-consecutive commands with the same `historyId` MUST start a new bundle.
- **FR-085**: Undo MUST traverse bundled commands in reverse order, and redo MUST replay them in forward order.
- **FR-086**: Undo for partial attribute updates MUST restore the full previous attribute state for every changed attribute, including target instance values that were not explicitly stored in the previous props payload.
- **FR-087**: The history manager MUST emit execution, undo, redo, clear, and destroy events, and MUST support wildcard subscriptions across the history event namespace.
- **FR-087A**: `history:executed`, `history:undone`, and `history:redone` payloads MUST include `{ command, target }`, while `history:cleared` and `history:destroyed` payloads MUST include `{ target }`.
- **FR-088**: The runtime MUST register default keyboard shortcuts for undo and redo using common `Ctrl`/`Cmd` combinations unless the event target is a text-input-like element.

#### K. Transformer and Resize Behavior

- **FR-089**: The transformer MUST manage a selection model of current elements and expose that selection both as a model API and as a direct `elements` property.
- **FR-089A**: `transformer.selection` MUST expose `set(elements)`, `add(elements)`, `remove(elements)`, and `destroy()`, and its `elements` getter MUST return a copy of the current selection array rather than the internal array itself.
- **FR-090**: Assigning `patchmap.transformer` MUST reject values that are not transformer instances. Assigning a new transformer MUST detach and destroy any existing transformer before attaching the new one.
- **FR-090A**: When a transformer is attached, the runtime MUST subscribe it to object-transform notifications so that the transformer can refresh when managed objects move or resize.
- **FR-091**: The transformer MUST support bounds display modes `all`, `groupOnly`, `elementOnly`, and `none`.
- **FR-092**: The transformer MUST emit `update_elements` whenever its selection changes and whenever resize updates need to notify selection observers.
- **FR-092A**: `update_elements` payloads MUST include `{ target, current, added, removed }`, where `target` is the transformer, `current` is the full current selection snapshot, and resize-only notifications with unchanged membership MUST use empty arrays for both `added` and `removed`.
- **FR-093**: The transformer MUST support optional resize handles for the group bounds of the current resizable selection and optional resize history recording.
- **FR-093A**: When resize handles are visible, the transformer MUST expose four visible corner handles named `top-left`, `top-right`, `bottom-right`, and `bottom-left`, and MUST also expose edge resize hit targets named `top`, `right`, `bottom`, and `left` for the same bounds.
- **FR-093B**: In overlap regions, visible corner handles MUST take hit priority over edge resize targets.
- **FR-094**: Resize handles MUST only appear when at least one selected element is resizable and not blocked by locking constraints.
- **FR-094A**: Resize bounds and handle positions MUST be computed from only the resizable subset of the current selection; selected non-resizable elements MUST neither receive resize mutations nor influence the displayed resize geometry.
- **FR-095**: Resize gestures MUST update selected resizable elements in viewport-consistent space, including element positions and sizes, and MUST ignore non-resizable or interaction-locked elements.
- **FR-095A**: Resize mutations MUST write translated positions into `attrs.x` and `attrs.y` and dimensions into `size.width` and `size.height`; compatibility-oriented implementations MUST NOT write width or height into `attrs`.
- **FR-095B**: All element updates within one resize gesture MUST be computed from element states captured at gesture start and from one shared group-bounds resize transform for that gesture.
- **FR-096**: Holding the aspect-ratio modifier during resize MUST preserve the original group aspect ratio for edge and corner handles.
- **FR-096A**: With aspect-ratio preservation enabled, corner-handle resize MUST anchor the corner opposite the active handle, while edge-handle resize MUST anchor the opposite edge and expand or shrink symmetrically about the perpendicular centerline.
- **FR-097**: Resize output sizes MUST never fall below one unit and MUST snap fractional sizes to integer unit steps in a stable, directional manner.
- **FR-097A**: When a resize gesture begins while edge-panning support is available but paused, the resize flow MUST temporarily resume it for the gesture and restore it when the gesture ends.
- **FR-097B**: When resize-history recording is enabled, all element mutations produced by a single resize gesture MUST share one generated history ID.

#### L. Emitted Events

- **FR-098**: The runtime MUST emit at least the following patch-map events: `patchmap:initialized`, `patchmap:draw`, `patchmap:updated`, `patchmap:rotated`, `patchmap:flipped`, and `patchmap:destroyed`.
- **FR-098A**: `patchmap:initialized` and `patchmap:destroyed` payloads MUST include `{ target }`, where `target` is the patch-map runtime.
- **FR-098B**: `patchmap:draw` payloads MUST include `{ data, target }`, where `data` is the validated normalized draw result that was rendered.
- **FR-098C**: `patchmap:updated` payloads MUST include `{ elements, target }`, where `elements` is the resolved updated-target list returned by `update()`.
- **FR-098D**: `patchmap:rotated` payloads MUST include `{ angle, target }`, and `patchmap:flipped` payloads MUST include `{ x, y, target }`.
- **FR-099**: The state manager MUST emit at least `state:pushed`, `state:popped`, `state:set`, `state:reset`, `state:destroyed`, `modifier:activated`, and `modifier:deactivated`.
- **FR-100**: The history manager MUST emit at least `history:executed`, `history:undone`, `history:redone`, `history:cleared`, and `history:destroyed`.
- **FR-100A**: The patch-map runtime, state manager, and history manager MUST support event subscription and unsubscription, including wildcard namespace listeners for grouped event families.
- **FR-100B**: Emitting a namespaced event such as `namespace:event` MUST also emit the corresponding wildcard event `namespace:*` with the original object payload enriched with `namespace` and `type`.

### Key Entities *(include if feature involves data)*

- **Patchmap Runtime**: The long-lived instance that owns initialization, rendering, updates, event registration, view transforms, history, state management, and optional transformation tools.
- **Map Data**: The ordered public array of renderable elements consumed by `draw()` and partially reused by `update()`.
- **Element**: A top-level or grouped renderable object of type `group`, `grid`, `item`, `relations`, `image`, `text`, or `rect`.
- **Component**: A visual sub-object attached to an `item` or grid-item template, limited to `background`, `bar`, `icon`, or `text`.
- **Grid Cell Item**: A runtime-generated `item` created from a `grid` cell and addressable by a deterministic composite ID.
- **Selector Query**: A JSONPath expression evaluated relative to the world root and, by default, traversing only through `children` links for object discovery and update targeting.
- **Interaction State**: A stack-managed behavioral unit that handles pointer or keyboard events, with optional propagation and modifier precedence.
- **History Command**: A reversible mutation unit recorded by the history manager, optionally bundled with adjacent commands under a shared history ID.
- **Transformer Selection**: The set of currently transformable elements tracked by the transformer and used for wireframes and resize handles.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A fresh implementation that follows this spec can pass a compatibility test suite covering initialization, draw, update, selection, focus/fit, history, and transformer behaviors with no unresolved spec ambiguities.
- **SC-002**: All public methods and surfaces listed in FR-001 through FR-003 can be exercised without consulting the original source implementation.
- **SC-003**: A host application can render a representative PATCH-style scene containing groups, grids, items, relations, images, text, and rectangles, then mutate it through `update()` while preserving the expected observable behavior.
- **SC-004**: Undo/redo bundling, default selection behavior, and transformer resize behavior are reproducible closely enough that existing behavior-oriented tests can be ported to another language or framework without semantic changes.

## Assumptions

- A reimplementation may choose any rendering engine, event system, schema validator, asset loader, or JSONPath-capable selector engine as long as it preserves the observable behavior defined in this specification.
- The host environment provides a container that can receive a rendered surface, pointer events, keyboard events, and resize notifications.
- Host applications are expected to supply plain data objects and arrays at the public draw/update boundary rather than opaque runtime instances.
- The spec defines compatibility at the library contract level, not binary compatibility with the original package layout or build artifacts.

## Out of Scope

- Prescribing the internal scene-graph model, renderer classes, animation engine, validation library, or packaging format.
- Improving current behavior where consumers may already depend on observable quirks documented in this specification.
- Defining non-behavioral repository concerns such as source file layout, build tooling, or distribution artifact names.
