Goal
- Create source-backed feature guides for the current `patch-map` implementation.
- Make the reference set sufficient for later development agents to start from docs alone, without rebuilding source-file context first.

Scope
- Public entry points from `src/patch-map.ts`.
- `Patchmap` lifecycle and interaction APIs from `src/patchmap.js`.
- Map data schema, renderable elements, and components from `src/display/data-schema/data.d.ts` and related schema files.
- Event, selection, focus/fit, history, transformer, and utility surfaces that affect usage.

Current understanding
- The repository now has a `project-context` task workspace for the patchmap guide set.
- The existing reference set explains runtime usage well, but developer-facing source ownership and validation workflow were under-documented.
- Documentation should continue to target the current JS/TS implementation; implementation-independent abstraction is not required in this phase.

Current output snapshot
- Completed reference docs under `docs/reference/patchmap/`:
  - `public-api.md`
  - `overview.md`
  - `data-model.md`
  - `interactions.md`
  - `history-and-transformer.md`
  - `developer-context.md`
  - `coverage-checklist.md`
- Review loop completed:
  - overview reviewer findings reflected in `overview.md`
  - interactions reviewer findings reflected in `interactions.md`
  - history/transformer reviewer findings reflected in `history-and-transformer.md`
  - data-model reviewer findings reflected in `data-model.md`
  - public API completeness gaps reflected in `public-api.md` and `coverage-checklist.md`
  - developer handoff gaps reflected in `developer-context.md`, `overview.md`, `coverage-checklist.md`, and `docs/memory.md`
