# PatchMap for Flutter

`conalog_patch_map` is an experimental native retained renderer, version 1.0.0-alpha.1.
Widget/controller, native behavior, lifecycle and performance checkpoints are implemented;
full platform/consumer qualification remains incomplete. `publish_to: none` blocks publication.

Start with [setup](#consumer-setup) and [draw/update](#draw-and-update).
Use [commands and queries](#commands-and-queries), [presentation layers](#presentation-layers),
[camera](#camera-observation-and-rotation), [gestures](#touch-gestures-and-zoom-limits),
[selection](#pointer-events-and-selection) or [lifetime](#lifetime-and-callbacks)
for the relevant integration boundary.

## Consumer setup

Consumer bounds: Dart >=3.11.0 <4.0.0 and Flutter >=3.41.0. CI/service SDK identities are in [toolchain metadata](https://github.com/Conalog/patch-map/blob/release/1.0/packages/flutter/toolchains.json).
Device profiling uses Flutter 3.47.6; that evidence does not qualify other SDK roles or platforms.

```yaml
dependencies:
  flutter:
    sdk: flutter
  conalog_patch_map:
    path: ../patch-map/packages/flutter
```

Import `package:conalog_patch_map/conalog_patch_map.dart`. SVG icons and Fira Code are bundled;
equipment aliases such as `inverter` use `symbols`. See [third-party notices](THIRD_PARTY_NOTICES.md).
For checkout path dependencies, run `npm run assets:prepare -- flutter` from the
repository root before dependency resolution. Packaged artifacts include assets.

## Draw and update

Retain one controller in the application's State, and provide a bounded surface:

```dart
final controller = PatchMapController();

PatchMapView(
  controller: controller,
  initialData: diagram, // Existing JSON List/Map schema; retain this input identity.
  loadingBuilder: (_) => const Center(child: CircularProgressIndicator()),
  onImageFailure: (failures) { /* Report target, code, message, and path. */ },
  onEvent: (event) {
    if (event.kind == PatchMapInputKind.tap && event.target != null) {
      controller.toggleSelection([event.target!.id]);
    }
  },
);

// After attachment: complete or sparse presentation values are both accepted.
final result = await controller.updateValues([
  PatchMapUpdate(
    PatchMapTarget('grid-1.0.0', componentId: 'number'),
    {'text': '1234'},
  ),
]);
```

`draw(data)` replaces the diagram, hides the previous surface, resets selection/gestures and camera rotation to zero, then fits new bounds.
Calling `fit()` or updating values in the same diagram preserves rotation.
Use `loadingBuilder` for a spinner. Invalid replacement preserves the current drawing.
A changed non-null `initialData` identity also replaces; use `updateValues` for display-value changes.

Compose each equipment item's finite component set in the host before `draw`.
Component IDs/types stay fixed until replacement; first release has no component
add/remove/type-replacement API. Use `show: false` for currently unused members,
then update their existing IDs. Hidden components still need valid definitions
and may incur layout/resource preparation, so avoid speculative unused components.
Component updates address concrete items or grid cells, such as
`PatchMapTarget('grid-1.0.0', componentId: 'number')`. A grid template is not a
component update target: `PatchMapTarget('grid-1', componentId: 'number')` rejects
the whole request with `MISSING_TARGET`.

Updates retain omitted fields and use the schema's field-specific reset rules.
Inputs are detached and validated atomically; preparation failures retain the
whole previous item while independent items can succeed. The runtime composes
waiting fields to their latest values. Result `outcome`, `failures`, `superseded`,
and `interruption` are independent diagnostics. Unexpected implementation errors
complete the Future with its original error/stack. Completion confirms drawing
submission, not animation end or physical display presentation.

Bar `animationDuration` is a finite, nonnegative number of milliseconds
(default 200). Its conversion to rounded microseconds must fit a signed 64-bit
integer; out-of-range values reject the entire draw/update with `INVALID_VALUE`
before publication. Fractional milliseconds retain microsecond rounding.

## Commands and queries

| Commands | Behavior |
| --- | --- |
| `setPresentation(key, layer)` / `clearPresentation(key)` | Replace/remove one independent alpha layer; synchronous admission result |
| `camera` / widget `onCameraChanged` | Current immutable camera state / frame-coalesced change notification |
| `getValue(target)` | Immutable current effective record, including current components for a published item; null for a missing target |
| `getGeometry(id)` | Immutable published world origin, logical/paint bounds and local-box corners; no layout or frame request |
| `fit(targets:, padding:)` | Fit all or named targets; preserve rotation |
| `focus(ids, padding:)` | Move to targets; preserve scale and rotation |
| `setCamera(center:, scale:, rotation:)` | World center, logical scale, radians |
| `rotateTo(rotation)` | Absolute radians; configurable shortest-path animation; result confirms acceptance |
| `toWorld(local)` / `toLocal(world)` | Convert logical-pixel coordinates |
| `select` / `addSelection` / `removeSelection` / `toggleSelection` / `clearSelection` | Library-owned selection; host chooses actions |
| `isAttached` / `phase` / `selected` | Attachment status, current map phase and current selected objects |

### Object geometry

`getGeometry` addresses elements and concrete grid cells (`grid-1.0.0`), not
components. It returns null for an unknown ID or a detached/empty/preparing/failed
map. Inactive maps expose their last publication; queued updates are not included.
Held results remain immutable after updates, replacement or removal.

```dart
final geometry = controller.getGeometry('grid-1.0.0');
final worldAnchor = geometry?.corners?.bottomLeft;
final localAnchor = worldAnchor == null ? null : controller.toLocal(worldAnchor);
// Place an app-owned marker at localAnchor (map-widget logical pixels).
```

`origin`, `center`, `bounds`, `paintBounds` and `corners` are world coordinates.
`bounds` is the axis-aligned logical box; `paintBounds` reuses the conservative
culling/fit envelope, including overflow/strokes, not exact visible pixels.
Corners preserve local top-left/top-right/bottom-right/bottom-left identities
through rotation/reflection. Groups/grids aggregate visible descendant bounds;
they and relation paths have no box corners. Empty aggregates can have null
bounds/center. Hidden leaves retain logical bounds but have null paint bounds;
alpha layers and camera culling do not trim geometry. Reads expose published
layout, not pending input, bar-animation samples or physical display completion.

## Presentation layers

`PatchMapPresentationLayer(scope: addresses, targets: matches, unmatchedAlpha: .2)`
keeps matched objects unchanged and dims the other scope members. Addresses are
`PatchMapTarget` lists; at least one finite 0–1 `matchedAlpha`/`unmatchedAlpha` is
required (omitted means 1). Keys multiply existing alpha independently; setting a
key replaces it, clearing restores the latest live values. Groups/grids expand
to descendants, items to components; overlaps count once per key, matched wins.
Scope addresses must exist; requested addresses outside the exact scope are
ignored. Results include unique scope/target/matched/ignored counts. Layers leave
`getValue`, selection and hits unchanged, even at alpha 0. Accepted draw or widget
removal resets all keys; invalid draw preserves them. Set after accepted draw
uses the new diagram. Filters cannot mutate layers; inactive layers resume later.

## Camera observation and rotation

`controller.camera` exposes world center, scale, clockwise radians and logical `viewportSize`;
it is null when detached/empty/preparing/failed and remains readable when ready but inactive.
`onCameraChanged` receives `{state, sources}` after a map frame, at most once per frame. Sources combine gesture/programmatic/fit/focus/replacement/resize/configuration changes; unchanged states do not notify.
Subscribe without replay; read `camera` for current state. Replacement/removal discard old pending notifications;
inactivity defers them. Callbacks may issue commands; their new changes notify on a later frame.
These are latest applied values, not display-completion or debounced settled notifications.

`rotateTo` preserves center/scale and uses a clockwise half-turn when both paths
are equal. Its default is 180ms cubic ease-out. `setCamera` and touch rotation
remain immediate; the bar data-animation policy is unchanged.

```dart
PatchMapView(
  controller: controller,
  rotationAnimation: const PatchMapRotationAnimationOptions(
    enabled: true, // false makes rotateTo immediate; rebuild to toggle live.
    duration: Duration(milliseconds: 180),
  ),
);
controller.rotateTo(0); // Return to the diagram's original orientation.
```

Duration must be nonnegative; zero also applies immediately. Disabling during
travel finishes at the requested angle; changing duration affects the next
command. A new rotation retargets from the current displayed angle. A touch,
handled wheel input, accepted `setCamera`/fit/focus, scale clamping,
inactivity or removal stops travel at the applied angle. Resume does not replay
it; resizing alone preserves travel. Replacement cancels travel and resets the
new diagram to zero rotation. Invalid requests leave prior travel intact.
Intermediate angles may cross a full turn; completion stores the exact requested
angle. Angles too large to represent incremental travel require normalization
with immediate `setCamera` first. Camera callbacks report `programmatic` changes
through the existing frame path; no separate animation-completion event is added.

## Touch gestures and zoom limits

`gestures: const PatchMapGestureOptions(zoomThreshold: .02, zoomThresholdAfterRotation: .05, rotationThresholdDegrees: 15, rotationThresholdAfterZoomDegrees: 25)` configures touch activation.
Zoom uses relative span change; rotation uses degrees. An axis that starts first
raises only the pending axis's threshold; follow-on values never lower a custom
base. Simultaneous base crossings start both. Active axes stay active until
gesture restart. Each crossing sample becomes a new baseline without a jump;
zero base thresholds apply immediately.

Zoom values must be finite in [0, 1), rotation values finite and nonnegative.
`zoomEnabled` and `rotationEnabled` independently gate gestures. Settings are
captured per gesture. Wheel, commands and translation retain their behavior.

`PatchMapGestureOptions(longPressDuration: Duration(milliseconds: 300))` sets the
hold time for `longPress`. The package default is 300ms. Durations must be nonnegative; zero
recognizes on the next timer turn. The duration is captured on pointer down, so
rebuilding only changes subsequent presses. The host still chooses what a long
press does, including switching `dragMode` to paint/range for the held pointer.
A second pointer cancels pending long-press recognition, including its arena
participation, so a slow pinch is not captured by the hold deadline. Long-press
recognition restarts only after all tracked pointers have been released.

`zoomLimits: const PatchMapZoomLimits(minScale: .1, maxScale: 8)` clamps input, commands and fit. Omitted bounds are unrestricted; finite positive ordered bounds are required. A minimum can prevent fitting the entire drawing. Changed limits clamp current scale without refitting and notify `configuration`.

## Pointer events and selection

`dragMode` is pan by default; range and paint modes detect objects and report
callbacks. Input filters only judge candidates: make map changes in result
callbacks. Move callbacks are coalesced per frame while intermediate path hits
are retained. Interrupted drags have one end event with a reason; widget removal
does not emit a new callback. No domain fetching or business action is built in.

Configure selection decoration with `selectionStyle`; rebuilding the same widget
with a new value updates existing selection without replacing data, moving the
camera or emitting selection changes:

```dart
PatchMapView(
  controller: controller,
  selectionStyle: const PatchMapSelectionStyle(
    color: Color(0xffef4444),
    strokeWidth: 2,
    displayMode: PatchMapSelectionDisplayMode.elementOnly,
  ),
);
```

Defaults remain blue `#2f80ed`, 2 logical pixels, centered, fixed screen width,
and `all` (individual envelopes plus an aggregate for multiple objects).
Modes are `all`, `elementOnly`, `groupOnly`, `hidden`; hiding decoration preserves
selection and hits. `strokeAlignment` supports `center`, `inside`, `outside`.
`strokeScale: PatchMapSelectionStrokeScale.viewport` shrinks width on zoom-out,
clamped between `minStrokeWidth` (default 1) and `strokeWidth`. Both widths must
be finite and positive, with minimum <= base even for fixed mode. Invalid initial
settings reject attachment; invalid rebuild settings report a Flutter error and
retain the last valid style. Inactive style changes display on resume. Styles
persist across diagram replacement, while selection still resets. No editing
handles or object-transform commands are added.

## Lifetime and callbacks

The widget owns resources. Removal closes its session; the controller can then
attach to another widget without replaying detached commands. One controller
cannot attach to two live widgets. App background and `active: false` suspend
preparation/frames while preserving the latest admitted values. `colors` and
`symbols` are attachment configuration; changing them requires a new widget key.
Image preparation is asynchronous; it neither blocks first screen nor changes ready again.

| Widget callback/builder | Purpose |
| --- | --- |
| `onAttached(controller)` | Attachment notification; the drawing may still be preparing |
| `onPhaseChanged(phase, failure)` | `empty`, `preparing`, `ready` or `failed` state changes |
| `onImageFailure(failures)` | Asynchronous image failures with target/path diagnostics |
| `onEvent(event)` | Pointer, drag and selection events |
| `onCameraChanged(change)` | Frame-coalesced camera state and causes described above |
| `loadingBuilder` / `errorBuilder` | Host UI for preparation and fatal map failure |

`resolveDirectColor(value)` converts a direct CSS, numeric or JSON color value
using the same parser as the map. Use it when app-side color calculations must
match authored colors. It does not resolve theme tokens and throws
`FormatException` for unsupported or invalid values.

## Scope and verification

The runtime covers item, grid, group, relations, image, text, rect and the four
item components (background, bar, icon, text). It retains scene geometry and
uses CustomPainter, shared text/SVG resources, and internal bar optimizations.
Editor, PNG export and item screen-reader support are excluded from first release.
Advanced text effects and full platform equivalence are not qualified by synthetic tests.

The example covers 10,000 regular/varied panels, number/bar/mixed updates and navigation; its README documents profile commands. Checkpoints do not establish WebView equivalence.
See [delivery coverage](https://github.com/Conalog/patch-map/blob/release/1.0/docs/engineering/flutter-runtime/coverage.md).
See the repository [development environment](https://github.com/Conalog/patch-map/blob/release/1.0/docs/engineering/flutter-package.md),
[runtime contracts](https://github.com/Conalog/patch-map/blob/release/1.0/docs/engineering/flutter-runtime/contracts.md)
and [release operations](https://github.com/Conalog/patch-map/blob/release/1.0/docs/engineering/releases.md).
