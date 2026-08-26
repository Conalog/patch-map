# Getting started

- Status: current
- Audience: package consumers
- Owner: construction, mount, resize, and teardown

Read when: installing PatchMap or creating a map instance.

## Scope

This page owns the high-level instance lifecycle. Dataset semantics are owned
by [Data and targets](api/data-and-targets.md), while host-side resource and
subscription responsibilities are owned by [Host integration](integration/host.md).

## Contract

Install the package and mount one instance into one empty host slot:

```ts
import { PatchMap } from '@conalog/patch-map';

const map = await PatchMap.mount({
  container: '#map',
  data,
  fit: { padding: 24 },
  theme: { primary: { default: '#0c73bf' } },
});

map.update({ id: 'rack-01', bar: { height: 72 } });
await map.destroy();
```

- Use `PatchMap.mount()`; the exported class cannot be constructed directly.
- A mounted host slot contains exactly one active PatchMap canvas.
- Mount validates and detaches caller input before publishing an instance.
- `theme` is partial and instance-local. Missing keys use the canonical palette;
  invalid values reject mount without publishing a partial instance.
- The default renderer is the package-owned WebGL2 aggregate path.
- Automatic resize is the default. Use `resizeMode: 'manual'` only when the host
  calls `map.viewport.resize(width, height)` itself.
- Call `destroy()` on unmount. Destruction is asynchronous and idempotent from
  the host's point of view; do not retain the canvas or Pixi objects afterward.

## Mount options

| Concern | Contract and default |
| --- | --- |
| identity | `instanceId` defaults to the host element ID, or a generated instance-local ID when the element has none |
| CSS size | `width` and `height` override the measured host size; mount rejects when neither source provides positive dimensions |
| renderer | `pixelRatio` defaults to `devicePixelRatio` or 1, `antialias` to true, `background` to `#FAFAFA`, and `powerPreference` to `high-performance` |
| backend | omitted or `webgl` selects the qualified WebGL2 path; `webgpu` is opt-in and remains unqualified as described in [Compatibility](compatibility.md) |
| camera | `zoomLimits` defaults to `[0.5, 30]`; initial viewport and fit ordering is owned by [Viewport and transform](api/viewport-and-transform.md) |
| diagnostics | `devtools` defaults to false; use [`debug.snapshot()`](integration/host.md#diagnostics-and-errors) for the public bounded snapshot |
| history | `historyLimit` configures retained undo entries; behavior and defaults are owned by [Mutations and history](api/mutations-and-history.md) |

`theme` accepts nested, instance-local color entries and flattens them to dotted
paths. The canonical fallback keys are `white`, `black`, `transparent`,
`primary.default`, `primary.dark`, `primary.accent`, `gray.light`,
`gray.default`, and `gray.dark`. Additional dotted paths may be referenced by
dataset color fields. Every supplied leaf is validated and detached before the
renderer is allocated.

Runnable lifecycle reference: [`examples/minimal.ts`](../examples/minimal.ts).

## State and ordering

Mount creates the renderer and frame authority, normalizes the dataset,
settles image bindings used by the initial presentation, renders once, and only
then attaches the canvas. A failed initial render, renderer loss, or destruction
during setup leaves no candidate canvas in the host.

The package owns resize observation, visibility pause/resume, animation cadence,
frame invalidation, and RAF cleanup. Mutations request publication through that
authority; the host must not add another render loop or a sleep before first use.

## Failure decisions

| Symptom | Meaning | Action |
| --- | --- | --- |
| Mount rejects before a canvas appears | Input, theme, renderer, or asset admission failed atomically | Read the structured error and fix its reported path |
| A blank or black candidate canvas flashes | The host exposed another canvas or bypassed mount publication | Remove host canvas/opacity/loading workarounds |
| A committed change is not visible | Host code bypassed the public mutation API or owns a competing frame loop | Use the public domains and remove host RAF publication |

## Verification map

| Claim | Code | Focused evidence |
| --- | --- | --- |
| Public construction | `src/index.ts`, `src/public/contracts.ts` | `tests/integration/developer-api-workflows.test.ts` |
| mount defaults and theme normalization | `src/composition/mount.ts`, `src/semantic/color.ts` | `tests/engine/engine-lifecycle.test.ts`, `tests/semantic/color-resolution.test.ts` |
| Initial canvas publication | `src/engine/surface-lifecycle-authority.ts`, `src/rendering/pixi-renderer/surface-publication-authority.ts` | `tests/engine/canvas-surface-lifecycle.test.ts` |
| Resize and teardown | `src/engine/index.ts`, `src/engine/page-lifecycle.ts` | `tests/engine/engine-lifecycle.test.ts`, `tests/integration/page-lifecycle.test.ts` |
