# Data and targets

- Status: current
- Audience: package consumers and agents changing dataset admission or logical lookup
- Source: `src/public/contracts.ts`, `src/semantic/dataset`, `src/query-selection`

## Scope

This page owns whole-dataset replacement, detached persistence reads, public
target identity, and semantic queries. Mutation, selection, and renderer state
are owned by their respective API pages.

## Contract

- `data.replace(input, options?)` validates and publishes an available PATCH MAP
  array synchronously. `data.replaceAsync()` provides the same result while
  allowing replacement work to yield.
- Input is detached before it becomes authoritative. PatchMap does not retain or
  mutate caller arrays, records, query objects, or returned snapshots.
- `attrs` remains the host extension point. PatchMap transforms `x`, `y`,
  `angle` or `rotation`, signed `scaleX`/`scaleY`, and `zIndex` on supported
  elements and components; `scale`, `skew`, `pivot`, and their axis aliases are
  reserved and reject at their exact input path.
- Supported root elements are `group`, `grid`, `item`, `relations`, `image`,
  `text`, and `rect`. Item and grid templates may contain `background`, `bar`,
  `icon`, and `text` components.
- `background.size` is accepted only for v0.10/1.0 input compatibility and is
  discarded during normalization. A background always fills its owning item;
  omit `size` from new data.
- `zIndex` orders siblings within their current scope. With the default mesh
  renderer, overlapping item descendants paint as item-scoped composite units,
  so a component's high `zIndex` cannot cross in front of a later sibling item.
  Equal values keep authored order; component order is resolved inside the
  owning item.
- `{ strict: true }` rejects dangling relations and invalid required values before
  publication. Without strict mode, a dangling relation is omitted and reported;
  its endpoint is never silently changed.
- A committed replacement returns `rootIds`, `semanticHash`, and `sceneRevision`.
  It makes target sets from the prior scene stale.
- `data.snapshot()` returns a detached dataset array. `data.serialize(true)`
  additionally requires strict reference validity before producing JSON.

Public addresses have one shape:

| Address | Meaning |
| --- | --- |
| `{ id }` | element or expanded grid instance |
| `{ id, componentId }` | component owned by that element or instance |

`targets.get(address)` returns one detached match or `null`. `targets.query()`
matches the optional `id`, `componentId`, semantic `type`, ancestor `within`, and
`scope` (`all`, `authored`, or `instances`). A returned `PatchMapTargetSet` is
bound to the scene revision in which it was created and can be passed directly
to selection, mutation, viewport, and presentation APIs.

Display objects, dense slots, renderer objects, and mutable live nodes are not
public identities.

## Failure semantics

| Condition | Result | Consumer action |
| --- | --- | --- |
| invalid root, record, value, or required reference | atomic rejection with a structured path diagnostic | correct the reported input; do not retry unchanged data |
| a newer async replacement wins | the older request rejects as `SUPERSEDED` | treat only the fulfilled latest request as application state |
| stale or foreign `PatchMapTargetSet` | operation rejects without touching current targets | run `targets.query()` again |
| unknown address | `targets.get()` returns `null`; mutations report it as missing | verify `id`, `componentId`, and current scene revision |

## Verification map

| Claim | Implementation | Focused verification |
| --- | --- | --- |
| validation, detachment, semantic hash | `src/semantic/dataset` | `tests/semantic/dataset-contract.test.ts` |
| replacement freshness and atomic publication | `src/engine/dataset-replacement-coordinator.ts` | `tests/engine/engine-lifecycle.test.ts` |
| target grammar and revision binding | `src/query-selection` | `tests/semantic/query-selection.test.ts` |
| hierarchical zIndex and authored tie order | `src/parsing/`, `src/semantic/paint-order.ts` | `tests/semantic/paint-order.test.ts`, `tests/rendering/component-render-lanes.test.ts` |
| facade shapes | `src/public/contracts.ts` | `tests/integration/developer-api-targets-presentation.test.ts` |
