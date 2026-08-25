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
| Initial canvas publication | `src/engine/surface-lifecycle-authority.ts`, `src/rendering/pixi-renderer/surface-publication-authority.ts` | `tests/engine/canvas-surface-lifecycle.test.ts` |
| Resize and teardown | `src/engine/index.ts`, `src/engine/page-lifecycle.ts` | `tests/engine/engine-lifecycle.test.ts`, `tests/integration/page-lifecycle.test.ts` |
