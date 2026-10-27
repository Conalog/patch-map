# Mobile consumer replay checkpoint

The package-consuming example has a separate `lib/mobile_replay_main.dart`
entry point. It does not change the 10,000-panel performance workload or the
production Flutter runtime. Run from `packages/flutter/example`:

```sh
flutter run -t lib/mobile_replay_main.dart -d DEVICE_ID
flutter test --no-pub test/mobile_replay_test.dart
```

## Evidence boundary

Read-only consumers: patch-mobile `706b7ca0ee4db38fd6e320a2bf9b32d19b118bff`,
patch-webview `ae846bbd0a8b4dbc520e072d256b2fce14fa5fe6`.
Neither checkout was modified. The WebView actually installs PatchMap **0.10.0**;
that is different from native's approved release/1.0 reference.

`example/assets/mobile_replay.json` captures executed WebView builders, palette,
11 actual SVG assets, source hashes and installed renderer bundle identity.
`example/tool/capture_mobile_replay.mjs` regenerates it using the consumer's Bun
resolver. Panel sizes follow the prior source-exported authoring template;
IDs, eight/ten-cell arrangement, device positions, metrics and response timing
are modeled. This is **not a production API response or captured network trace**.
No credentials, live services or private plant data were accessed.

## Reproduced journeys

| Journey | Executed witness |
| --- | --- |
| Equipment display | Eight panel states plus light-background text; four inverter states; Router status and Edge power badge; existing components updated by stable local ID |
| Filter/memo and selection | One replaceable highlight channel; selection retained independently; restricted scope reconciled immediately and retained across clear; dimmed device type rejects touch; mixed equipment selection rejected by host |
| Date and diagram | Draw A/B, values submitted during preparation, old blueprint/metrics responses discarded by host generation, pending external selection applied after draw, surviving selected IDs restored by host |
| Sheet and geometry | Selection focus with screen bottom padding; public published item/grid bounds, rotated world-to-local projection, queries cleared on detach |

Current mobile has no geometry-query bridge RPC. The last row's geometry query
is an additional native host example; its `PANEL_SELECTION_FOCUS {bottomInset}`
path is the actual consumer flow. Native draw resets camera/selection; explicit
host reselection after draw reproduces mobile's surviving-selection policy.

## Integration differences found

1. **Incomplete hidden inverter icons reject the whole native draw.**
   WebView `inverterFrameComponents.js` returns hidden `legacy`, `unregi` or
   `step` icons without `size` and uses `validateSchema:false` when updating.
   Native `DatasetReader` requires icon source/size even when hidden. The replay
   seeds missing hidden sizes with zero and supplies the real size on show.
   Component topology is prepared once, as already decided; generic structural
   component replacement through `updateValues` remains rejected.
2. **The extra `style.ellipsis:true` flag is rejected.**
   The same builder also supplies `style.overflow:'ellipsis'`. The adapter removes
   only the redundant unsupported flag and retains the supported overflow value.
   Tests preserve the raw input and independently reproduce both admission errors.
3. **Text color can disappear against the background.**
   Installed 0.10.0's `Textstyleable._applyTextstyle` assigns `style.fill` to the
   BitmapText style separately from its `Tintable` handler. Native follows the
   [approved release projection](compatibility.md): admitted default white tint
   overrides fill. The replay observed a white inverter name on a white frame;
   the focused pixel test proves that explicit `tint:'#083967'` restores it.
   The adapter copies captured text fill into tint only when tint is absent,
   including dark text on light panel bars. General fill×tint combinations are
   not qualified by that narrow conversion.

These are concrete **host integration requirements**, not an approval to alter
the native schema or its settled color contract. The captured flows run after
the explicit preparation in `example/lib/mobile_replay/fixture.dart`.

## Host responsibilities that remain outside the renderer

- Strip blueprint envelopes to their drawing data, keep domain metadata/indices,
  map Registry IDs and assemble all equipment components before draw.
- Register the WebView palette/SVG aliases; arbitrary aliases are not native
  builtins. Preserve date/request tokens and publish host metrics/Registry only
  after their corresponding map operation succeeds.
- Translate generic selected objects into panel/inverter/Edge/Router business
  payloads, own single-device versus multiple-panel selection and stale replies.
- Reapply current visibility/highlight and surviving selection after replacement.
  Alpha presentation does not disable hits; use `eventFilter` as well. Hidden
  types use .08 and active highlight nonmatches .28; don't multiply both on the
  same item. This fixture has base alpha 1 and no support/other decoration.
- Current mobile initialization order is locale → snapshot → visibility →
  highlight → pending selection. The example starts at resolved draw input;
  it does not emulate transport, fetching, locale or Registry commit barriers.

Primary consumer owners: mobile `dashboard_monitoring_coordinator.dart`,
`map_highlight_provider.dart`, `webview_events.dart`; WebView
`ui/PatchMap.svelte`, `state/blueprintState.js`, `infra/patchmap/{metricsTemplates,
inverterFrameComponents,routerRenderer,edgeRenderer,objectVisibility,
panelSelection,focusViewport}.js`. Paths are relative to each consumer's map
feature, except mobile files, which are under `lib/presentation/plants/detail/`.

## Validation and limits

Flutter 3.47.6: seven focused host widget tests, example static analysis and
documentation checks. Native widget pixels were inspected and the name-color
difference has an automated pixel witness. No runtime hot path changed, so no
new CPU benchmark or full performance matrix was run.

No Android/iOS device was connected for this checkpoint. Host tests do not prove
physical-device performance, full browser pixel equivalence, arbitrary production
blueprints, long-press/range workflows, support decoration, fetch/retry, Registry
projection or bridge transport. Existing platform qualification remains separate.
