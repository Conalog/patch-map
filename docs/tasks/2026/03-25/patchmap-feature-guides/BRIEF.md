Goal
- Create source-backed feature guides for the current `patch-map` implementation.

Scope
- Public entry points from `src/patch-map.ts`.
- `Patchmap` lifecycle and interaction APIs from `src/patchmap.js`.
- Map data schema, renderable elements, and components from `src/display/data-schema/data.d.ts` and related schema files.
- Event, selection, focus/fit, history, transformer, and utility surfaces that affect usage.

Current understanding
- The repository has no existing `docs/` project-context structure.
- `README.md` documents major APIs but does not yet provide subsystem-level guides.
- Documentation can target the current JS/TS implementation; implementation-independent abstraction is not required in this phase.

Current output snapshot
- Completed reference docs under `docs/reference/patchmap/`:
  - `public-api.md`
  - `overview.md`
  - `data-model.md`
  - `interactions.md`
  - `history-and-transformer.md`
  - `coverage-checklist.md`
- Review loop completed:
  - overview reviewer findings reflected in `overview.md`
  - interactions reviewer findings reflected in `interactions.md`
  - history/transformer reviewer findings reflected in `history-and-transformer.md`
  - data-model reviewer findings reflected in `data-model.md`
  - public API completeness gaps reflected in `public-api.md` and `coverage-checklist.md`
