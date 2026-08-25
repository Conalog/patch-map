# Host integration and ownership

The host owns layout, persistence, application commands, accessibility DOM,
and when a state revision becomes a visible frame. PatchMap owns normalized
scene state, aggregate Pixi rendering, hit testing, selection, transformation,
history, renderer resources, per-instance subscriptions, and reusable frame
cadence.

Use `PatchMap.mount({ container, data })` once per mounted map. A host slot must
contain exactly one active PatchMap canvas. Multiple engines may share one `PatchMapAssetRuntime`;
each engine keeps its own asset session and releases only its leases at
destroy. Do not call PixiJS global cache destruction from an instance.

Pass service palette overrides through the same mount call as `theme`. Keep
the object partial and instance-local; PatchMap flattens nested palette groups,
normalizes their values, and applies canonical defaults for omitted keys. Do
not pre-resolve theme tokens in the adapter or mutate the caller dataset.

An external URL must pass the package ingestion policy, including configured
origin, response, MIME, size, and byte validation, before the engine admits its
texture. An existing Pixi global-cache entry with the same URL is not evidence
that those checks ran and is never borrowed as a validation shortcut.

The `PatchMap.mount()` path creates the package frame loop for visible
animation and gesture frames, observes the host size, schedules product
changes, pauses across document visibility transitions, and destroys these
resources before the Pixi surface. Low-level deterministic publication is an
internal verification concern, not a second consumer lifecycle. Never add a
host RAF publisher alongside the package loop.

Mount also owns image readiness for the first publication. It registers the
catalog, acquires only distinct bindings used by the active initial
presentation, and returns after that presentation has been published once.
The host must not add a sleep, status poll, or capture workaround to hide an
initial asset frame.

The packaged examples demonstrate the intended high-level boundary.
`examples/patch-map/host-adapter.ts` shows how a host can compose that same
boundary without acquiring a second engine API:

- `load()` first uses the explicit canonical/legacy compatibility
  materializer, then delegates the detached array to `data.replace()`;
- `prepareSave()` validates a detached array, strict references by default,
  and returns serialized data only after the guard succeeds;
- `lookup()` delegates to `targets.get()`;
- `bulkUpdate()` delegates operations and optional mixed animation policy to `transaction()`;
- `selection()` and `transform()` delegate to their public domains;
- `history()` delegates to state/undo/redo;
- `viewportSnapshot()` / `restoreViewport()` keep absolute view persistence on the root facade;
- `observeSelection()` / `observeViewportSettled()` own only returned disposers;
- `snapshot()` and `extract()` use `debug.snapshot()` and `capture.png()`;
- `destroy()` disposes host subscriptions before engine teardown.

The adapter must not import previous-runtime symbols, copy renderer behavior, rebuild
geometry, mutate normalized output, or retain Pixi display objects. Event
callbacks and canvas ownership remain instance-local.

Map a Ctrl/Command-gated legacy wheel plugin to
`viewport: { wheel: { activationModifier: 'control' } }` at `mount()`. PatchMap
checks the wheel event's own `ctrlKey || metaKey`, consumes only a wheel that
actually changes scale, and leaves ordinary wheel available to host/page
scroll. Do not retain the legacy key or wheel listeners. Zoom buttons continue
to call public `viewport.zoomBy()` and bypass this pointer-gesture gate.

Selection and tooltip plugins attach only to the public projections. Pass
`selection: { box, allowMultiple, isSelectable, resolveModifierSelection,
visual, clearOnBlankClick, deselectOnTargetDoubleClick }` to `mount()`, subscribe to
`selection.onPointerChange()` for non-echo pointer changes, and subscribe to
`pointer.onHover()` for stable target plus CSS/world anchors. A synchronous
`resolveModifierSelection({ target, currentIds, modifiers })` may use a host
relation graph on Ctrl/Cmd target clicks and return the complete stable ID set
for that same selection commit. PatchMap retains
the root pointer listener, pointer capture, aggregate hit test, coordinate
conversion, primary-drag versus pan arbitration, and frame invalidation. The
host owns only the returned disposers and its plugin callbacks.

Do not add a host click-distance timer or movement listener. PatchMap retains
the pointer-down target through an axis-aligned 4 CSS px slop; 4px is still a
point click and a strict excursion beyond 4px activates pan or the latched box
owner. The decision is independent of zoom, DPR/resolution, and event cadence.

Map an existing Transformer wireframe with
`visual: { color: '#ef4444', strokeWidth: 3, strokeScale: 'viewport',
minStrokeWidth: 1, strokeAlignment: 'outside', displayMode: 'element-only' }`.
This draws one bound per selected object, matching Transformer
`boundsDisplayMode: 'elementOnly'`, while the explicit outside placement maps
the prior wireframe beyond the selected element's visual/client edge. PatchMap
computes that edge from the semantic owner plus its projected component layout
and exact centered rect-stroke outset, so a panel background border is not
covered by the selection wireframe. Use `group-only` for only the aggregate
selection frame or `all` for both. PatchMap applies it to programmatic and
pointer selection. Configure the independently owned transient marquee with
`box: { activationModifier: 'shift', visual: { color: '#1099ff', strokeWidth: 1,
fillAlpha: 0.08 } }`. When `box.visual` is omitted, its color and width inherit
from `selection.visual` for compatibility. Do not add a host canvas,
DOM overlay, pointer listener, coordinate conversion, or RAF for selection
paint.
The viewport-linked policy matches a Transformer wireframe that shrinks below
1x: it uses 3 CSS px at 1x, scales continuously to a 1 CSS px floor, and never
exceeds 3 CSS px when zoomed in. Omit `strokeScale` to retain PatchMap's
compatible fixed-screen-width behavior. This policy is persistent-bound only;
the blue marquee remains its configured fixed 1 CSS px.

If clicking a selectable target should keep its tooltip visible, pass
`pointer: { hoverDuringPress: true }` at mount. This preserves the current
hover projection across pointer down/up without adding a host listener or hit
test. Omit it, or set it to `false`, for the compatible pointer-down leave;
real canvas leave and pointer cancel clear hover in both modes.

For main-style tooltip pinning, pass
`pointer: { tooltip: { pinOnContextMenu: true, preventDefault: true } }` and
subscribe through `pointer.onTooltip()`. Right-click publishes `pin` for the
stable target and keeps it through pointer leave; the next primary target
click publishes the new target and unpins, while a blank click publishes
`hide`. Set `preventDefault: false` only when the native context menu must
remain. PatchMap reuses its one canvas listener, hit test, and transform.
Document-captured pointer movement from a host-owned DOM overlay does not
become idle canvas hover. A pointer sequence already owned from canvas down
continues through capture so pan and selection drags remain uninterrupted.

To preserve selection on a blank single click, clear on blank double click,
and remove only an already-selected target on its double click, set
`clearOnBlankClick: 'double'` and `deselectOnTargetDoubleClick: true`.
Unselected targets still select immediately and Shift click remains the
immediate multi-selection toggle; no host click timer is needed.

For live concrete grid state, send background, bar, icon, and text columns in
one `updateBatch()` call. Background supports `source/tint/size/show/attrs`;
bar supports `height/tint/source/show`; icon supports `show/source/tint`; text
supports `text/style/show/placement/margin/tint/split/attrs`. Use `null` in a
column to restore the current authored field. Do not prefilter these fields or
maintain a second animation loop.
The `animate` option accepts one boolean or one boolean per queried target.
The array form requires a `bar.height` column: false targets snap, true targets
retarget, and every companion presentation column still validates and commits
atomically. Use the uniform boolean form when every row has the same policy so
the existing hot path remains allocation-free.

For heterogeneous non-grid owners, align the column to public transaction
operations, not lowered component writes:

```ts
patchMap.transaction([
  { type: 'update', id: 'owner-a', bar: { height: 20 }, text: { text: '즉시' } },
  { type: 'update', id: 'owner-b', bar: { height: 80 } },
], { animate: [false, true] });
```

Both owner updates and their companion fields remain one validation,
publication, and history commit. The previous
`PATCH_MAP_OWNER_MIXED_ANIMATION_UNSUPPORTED` host boundary is therefore no
longer valid.
Existing height-only batches keep the optimized concrete-bar path; the same
public call automatically selects the broader atomic overlay only when paint,
visibility, icon, background, or text columns are present. Labels,
identity/structural changes, and other component fields remain in the host
under the structured `PATCH_MAP_GRID_INSTANCE_PRESENTATION_UNSUPPORTED`
boundary.

For an icon or asset-background source retarget, PatchMap retains the last
resolved texture until the new binding is ready and swaps it in one owned
frame. A new image with no resolved predecessor stays pixel-transparent while
pending or failed; geometry, hit behavior, and diagnostics are not blocked.

Initial surface publication is package-owned too. A package-created canvas is
not attached to the host until the completed initial frame has rendered. Host
adapters must not add an opacity toggle, loading canvas, timeout, sleep, or
publication poll. Mount rejection, renderer loss before the first frame, or
destroy during asset settlement leaves no candidate canvas in the host.

Canary and rollback selection stay in the host. PatchMap ships compatibility
materialization and persistence guards, but does not expose renderer-choice or
shadow-runtime authorities as a competing product API.

For extraction, publish the desired state, capture the exact
`publishedTuple`, and request `image/png` at the current CSS size. PatchMap
waits the active image bindings, keeps the authoritative canvas mounted, and
rejects stale tuples. Do not insert a host sleep or asset-status polling loop
between `replaceAsync()` / `updateBatch()` and `await capture.png()`.

Persist viewport state with `viewport.snapshot()` and restore it either with
`viewport.restore(snapshot)` or mount-time `viewport: { initial: snapshot }`.
Mount-time initial state wins over initial `fit`; scale is clamped through the
same viewport authority, and resize retains the absolute center/scale.
`viewport.onSettled()` coalesces pointer, wheel, fit, restore, zoom-button, and
resize bursts before calling the host. Persist a fresh `snapshot()` inside the
callback and release its disposer on route unmount; `destroy()` also cleans it.
