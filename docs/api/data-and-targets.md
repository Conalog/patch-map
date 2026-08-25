# Data and targets

- Status: current
- Audience: package consumers and agents changing dataset admission or logical lookup
- Source: [`developer-api/contracts.ts`](../../src/patch-map/developer-api/contracts.ts), [`semantic/dataset`](../../src/patch-map/semantic/dataset), [`query-selection`](../../src/patch-map/query-selection)

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
- `attrs` remains the host extension point. PatchMap transforms only `x`, `y`,
  `angle` or `rotation`, and signed `scaleX`/`scaleY`; `scale`, `skew`, `pivot`,
  and their axis aliases are reserved and reject at their exact input path.
- Supported semantic records include `item`, `grid`, `relations`, `group`,
  `rect`, `text`, `image`, `icon`, and their component forms.
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
| validation, detachment, semantic hash | [`semantic/dataset`](../../src/patch-map/semantic/dataset) | [`dataset-contract.test.ts`](../../tests/semantic/dataset-contract.test.ts) |
| replacement freshness and atomic publication | [`dataset-replacement-coordinator.ts`](../../src/patch-map/engine/dataset-replacement-coordinator.ts) | [`engine-lifecycle.test.ts`](../../tests/engine/engine-lifecycle.test.ts) |
| target grammar and revision binding | [`query-selection`](../../src/patch-map/query-selection) | [`query-selection.test.ts`](../../tests/semantic/query-selection.test.ts) |
| facade shapes | [`developer-api/contracts.ts`](../../src/patch-map/developer-api/contracts.ts) | [`developer-api.test.ts`](../../tests/integration/developer-api.test.ts) |
