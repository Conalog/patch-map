# Mutations and history

Status: current  
Audience: package consumers and agents changing atomic edits, commits, or undo/redo  
Source: [`developer-api/mutations.ts`](../../src/patch-map/developer-api/mutations.ts), [`engine`](../../src/patch-map/engine), [`history`](../../src/patch-map/history)

## Scope

This page owns mutation form selection, atomic commit semantics, result status,
and history behavior. Supported presentation fields and relative transforms are
owned by [`presentation.md`](presentation.md) and
[`viewport-and-transform.md`](viewport-and-transform.md).

## Contract

| Intent | API | Input unit |
| --- | --- | --- |
| edit one logical owner | `update()` | one owner plus optional component patches |
| edit many homogeneous owners | `updateBatch()` | equal-length target-aligned columns |
| commit ordered or structural work | `transaction()` | `update`, `add`, `replace`, `remove`, `move`, `group`, or `ungroup` operations |

- Every call validates the complete request before authoritative scene, renderer,
  selection, publication revision, or history state changes.
- `update().changes` merges non-structural values. Identity and identity-bearing
  collections require an explicit structural transaction operation.
- A component ID may be omitted only when the owner has exactly one component of
  the requested kind.
- `updateBatch()` columns must match the resolved target count. Typed arrays are
  accepted as `ArrayLike`; caller columns and nested values remain unchanged.
- `animate` may be one boolean or a target/operation-aligned boolean column.
  Per-entry animation requires a bar-height destination. False heights publish
  immediately; true heights use the single scheduler while companion changes
  stay in the same commit.
- Authored semantic commits record history by default. Set `recordHistory` to
  `false` for a commit that must not create an undo entry. `actionId` identifies
  related work for history coalescing; `historyLimit: 0` disables retained
  entries. Concrete overlay behavior is defined in
  [`presentation.md`](presentation.md).
- `transaction(operations, { selectedIds })` publishes and restores the requested
  selection with the same history entry.
- `history.undo()` and `history.redo()` apply scene and companion selection state
  atomically. `history.clear()` removes both stacks without changing the scene.

`PatchMapUpdateResult.status` has four values:

| Status | Meaning |
| --- | --- |
| `committed` | at least one authoritative change published |
| `unchanged` | request was valid but produced no change |
| `rejected` | input, target, conflict, or policy validation failed before commit |
| `refused` | the active surface or lifecycle could not accept the prepared commit |

## Failure semantics

- A rejected or refused call has `changed: false` and never leaves a partial
  dataset, presentation, history, or publication revision.
- Missing targets are returned in `missing`; structured details are available in
  `diagnostic`. Re-query a stale set rather than filtering failures after commit.
- Ambiguous components, duplicate targets, unequal columns, accessor-backed
  values, unsupported fields, and non-finite values reject atomically.
- Reentrant surface acceptance invalidates the prepared candidate. PatchMap
  restores the authoritative surface scene and cancels the prepared history
  entry instead of committing stale work.
- Undo or redo with no available entry is unchanged. A refused restoration does
  not advance the history cursor.

## Verification map

| Claim | Implementation | Focused verification |
| --- | --- | --- |
| public lowering and batch validation | [`developer-api/mutations.ts`](../../src/patch-map/developer-api/mutations.ts) | [`engine-update-transactions.test.ts`](../../tests/patch-map/engine-update-transactions.test.ts) |
| authored commit ordering and atomicity | [`transaction-commit-coordinator.ts`](../../src/patch-map/engine/transaction-commit-coordinator.ts) | [`engine-semantic-mutation.test.ts`](../../tests/patch-map/engine-semantic-mutation.test.ts) |
| history cursor and companion state | [`history-application-coordinator.ts`](../../src/patch-map/engine/history-application-coordinator.ts) | [`engine-history-integration.test.ts`](../../tests/patch-map/engine-history-integration.test.ts) |
| refusal and reentrancy | [`operation-outcomes.ts`](../../src/patch-map/engine/operation-outcomes.ts) | [`engine-reentrancy-lifecycle.test.ts`](../../tests/patch-map/engine-reentrancy-lifecycle.test.ts) |
