# PatchMap documentation

PatchMap is an aggregate PixiJS renderer for PATCH MAP datasets. Choose the
single page that owns the task you are working on; routers intentionally do not
repeat feature contracts.

## Start a map

| Task | Read |
| --- | --- |
| Install, mount, resize, and destroy | [Getting started](getting-started.md) |
| Load data or find stable targets | [Data and targets](api/data-and-targets.md) |
| Update state, transact, animate, or use history | [Mutations and history](api/mutations-and-history.md) |
| Run grid, relation, text, or delete editor workflows | [Editor workflows](api/editor-workflows.md) |
| Handle hover, tooltip, click, box selection, or transformer paint | [Pointer and selection](api/pointer-and-selection.md) |
| Pan, zoom, fit, persist a viewport, or transform a target | [Viewport and transforms](api/viewport-and-transform.md) |
| Apply transient grid or keyed presentation | [Presentation](api/presentation.md) |
| Register images, inspect readiness, or capture PNG | [Assets and capture](api/assets-and-capture.md) |
| Understand text layout, font matching, or fallback | [Text](api/text.md) |
| Audit packaged font bytes, provenance, or license | [Packaged fonts](assets/fonts.md) |
| Integrate, diagnose, handle errors, or define the accessibility boundary | [Host integration](integration/host.md) |
| Check supported runtimes and release policy | [Compatibility](compatibility.md) |

Runnable examples live in [`examples/`](../examples/).
Exact TypeScript shapes are exported by `@conalog/patch-map`; these pages own
behavior, state ordering, failure meaning, and the shortest verification route.

Repository contributors start with the
[engineering fast path](https://github.com/Conalog/patch-map/blob/release/1.0/docs/engineering/README.md).
