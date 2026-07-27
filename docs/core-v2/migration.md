# Migration to the redesigned Core v2 API

Core v2 is a replacement engine boundary, not an API-compatible wrapper.
Remove imports of Original classes, live nodes, selectors, command objects,
and per-entity rendering hooks.

| Host responsibility | Core v2 replacement |
| --- | --- |
| create/mount a map | `new CoreV2Engine()` then `initialize()` |
| set PATCH MAP JSON | `loadDataset()` / `loadDatasetAsync()` or the host compatibility materializer |
| find stable logical targets | `queryScene()` or `resolveTarget()` |
| update many targets | `bulkPatch()` or `transact()` |
| selection | `applySelection()` and selection host publication |
| move/resize/rotate | transformer edit methods |
| pan/zoom/fit | viewport methods |
| undo/redo | engine history methods |
| validate a save | `prepareCoreV2PersistenceExport()` then semantic-hash roundtrip |
| inspect state | detached snapshots and semantic probes |
| capture a report | `extractPublishedScene()` |
| unmount | dispose host handles, then await `destroy()` |

## Dataset cutover boundary

The engine keeps the unversioned PATCH MAP array schema strict. A host that
must bridge the pinned pre-cutover shape can call
`materializeCoreV2CompatibilityDataset()` before `loadDataset()`.

| Input | Status and interpretation |
| --- | --- |
| PATCH MAP array | supported; detached, validated, and materialized without mutating the caller |
| one `{ kind: "generic-item" }` object | supported only by the compatibility materializer; `id`, `width`, and `height` are required, `x`/`y` default to zero, and `label` is optional |
| any other object root or unknown legacy field | rejected as `INVALID_LEGACY_ROOT` at the exact input path |
| persistence array | supported through `prepareCoreV2PersistenceExport()`; strict duplicate/reference validation is on by default |
| non-array persistence root | rejected as `INVALID_EXPORT_ROOT` before any host write |
| cyclic, sparse, accessor-backed, non-plain, symbol-keyed, non-finite, or non-JSON value | rejected as `NON_SERIALIZABLE_VALUE` at the exact input path |

The compatibility result identifies its `sourceKind`, owns a deeply detached
canonical array, and preserves stable IDs and component identity through the
normal materializer. A host commits `serialized` only after the persistence
guard succeeds. After reloading it, call `assertCoreV2SemanticRoundtrip()` on
the two semantic hashes; a mismatch is `SEMANTIC_MISMATCH` and blocks save or
promotion. No rejected branch performs a persistence write.

## Canary and rollback

`CoreV2MigrationAuthority` is instance-local host orchestration, not a second
renderer. It pins exactly one authoritative engine for a mounted session.
Optional `comparison` or `previous` shadow work is explicitly read-only, owns
no canvas, and suppresses selection, command, history, persistence, callback,
and analytics publication.

Promotion uses the fixed `1% -> 10% -> 50% -> 100%` cohorts. A semantic
mismatch, runtime error, performance-budget failure, or cleanup-budget failure
stops promotion. Rollback changes the desired engine only for the next
remount: it never hot-swaps the active session, clears in-flight gesture
ownership, and never replays a gesture.

The package does not bundle or emulate the frozen prior engine. The production
host supplies its own prior-engine factory at the `previous` selection seam.
The focused Lab and packed verifier exercise session choice, guarded
persistence, teardown, and remount with a Core v2 engine standing in at that
host seam; they do not claim to execute the prior implementation.

Migration order:

1. keep the existing PATCH MAP v0.10 JSON boundary unchanged;
2. put legacy-object admission and persistence writes behind the explicit
   compatibility and save guards;
3. replace live-node lookup with stable logical IDs and detached query
   snapshots;
4. move mutations behind transactions and stop editing caller input;
5. move renderer/event/history behavior out of the host adapter;
6. make frame publication and teardown explicit;
7. run the minimal, Dashboard, Editor, and Report examples against the packed
   artifact before promotion.

There is no compatibility alias for an Original name. An unsupported host
behavior must be reported as a migration gap instead of being recreated
inside the adapter.
