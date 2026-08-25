# PatchMap interaction and history catalog review

## Reviewed surface

The review covers pointer input, query and selection, viewport, transformer,
updates, history, lifecycle, and their consumer journeys in the current
169-case candidate.

| Binding | SHA-256 |
| --- | --- |
| manifest | `4301c7289e2df417e7a80244bb2c685a8dca005fda62a3d4ac9fc5de15990d91` |
| fixtures | `7ddb0f54dbaf5dd9e509b739b01160240c5cbb6a4ec4bfefced94359a562397f` |
| normalized expected | `2033efb7d64254d8696f5414ebe4bced9ce3e5431b322740a3d9ac99c8bb4f93` |
| typed cases | `3a221cbc5dd479063863cfabbad459c728760ac0de4fe7fc908e68cda966437f` |

## Findings

- Manifest, fixtures, expected records, typed cases, and executable routes have
  the same ordered 169 IDs.
- The 631 actions use the closed 370-opcode action schema; Lab routes every case
  to one current handler/fold owner.
- View and resize actions preserve surface, authority, publication, accessibility,
  and event ordering. Transformer edits plan before a strict transaction and
  derive history depth from committed state.
- History recording uses the explicit `prepareRecord` and `commitPrepared`
  transaction boundary. Undo and redo move the cursor only after apply accepts.
- Replacement, interruption, destroy, async supersession, and lifecycle folds
  enforce their declared atomicity and publication rules.
- Geometry and relation freshness use `revisionLags.scene` from the domain tuple;
  no separate scene-lag projection participates in the contract.
- The standalone-radius and production-workload cleanup changes no interaction,
  history, lifecycle, relation-endpoint, or case-routing expectation.
- Verifier import-firewall coverage matches the current handler and fold registry.

## Reproduction

```sh
npm run verify:contract:gates
npm run verify:contract:decisions
npx vitest run --maxWorkers=2 tests/patch-map/history.test.ts tests/patch-map/engine-viewport.test.ts tests/patch-map/query-selection.test.ts tests/patch-map/contract-verifier-import-firewall.test.ts
```

Verdict: PASS
