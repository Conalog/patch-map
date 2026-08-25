# Editor workflows

- Status: current
- Audience: host applications implementing structured editors
- Source: [`editor-workflow`](../../src/editor-workflow), [`public/editor.ts`](../../src/public/editor.ts)

## Scope

This page owns logical editor modes and multi-step grid, relation, text, and
delete workflows. Geometry preview belongs to
[`viewport-and-transform.md`](viewport-and-transform.md); host-owned panels,
dialogs, clipboard, and keyboard routing belong to
[`host.md`](../integration/host.md).

## Contract

Use `map.editor.execute(action)` for a typed workflow transition and inspect
`map.editor.state` for the current public mode:

| Workflow | Representative actions |
| --- | --- |
| grid | `enter-grid-edit`, `reveal-inactive-cells`, `resize-grid`, `set-grid-cell-active`, `exit-grid-edit` |
| relation | `enter-relation-edit`, `add-relation-link`, `remove-relation-link`, `exit-relation-edit` |
| text | `open-text-editor`, `commit-text-edit`, `cancel-text-edit` |
| delete | `request-delete-plan`, `apply-host-cascade-confirmation`, `delete-transaction` |

- Session-only actions change editor mode or selection without inventing a
  semantic transaction.
- Semantic actions validate the complete workflow plan and commit through the
  same atomic transaction and history path as `map.transaction()`.
- Grid-linked-cell, relation conflict, missing target, and host-confirmation
  invariants reject before workflow or scene state changes.
- A returned result contains status, changed, code, facts, selection IDs, and
  the resulting public editor state. Internal plans and renderer objects do not
  cross the package boundary.

## Host boundary

PatchMap owns target validity, editor mode, semantic commit, selection, preview,
and undo ordering. The host owns overlays, confirmation UI, clipboard decoding,
shortcut choice, and persistence transport. Commit detached host state with
`transaction(..., { companion })` when it must follow undo/redo.

## Verification map

| Claim | Implementation | Focused verification |
| --- | --- | --- |
| workflow state and invariants | [`editor-workflow/index.ts`](../../src/editor-workflow/index.ts) | [`editor-workflow.test.ts`](../../tests/semantic/editor-workflow.test.ts) |
| public result projection | [`public/editor.ts`](../../src/public/editor.ts) | [`developer-api.test.ts`](../../tests/integration/developer-api.test.ts) |
| atomic semantic history | [`history-application-coordinator.ts`](../../src/engine/history-application-coordinator.ts) | [`engine-history-integration.test.ts`](../../tests/engine/engine-history-integration.test.ts) |
