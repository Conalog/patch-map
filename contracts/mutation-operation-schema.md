# Versioned Mutation Operation Contract

## Authority and Envelope

This document is the mechanically implementable mutation language for PatchMap. The
schema identifier is `patch-map-mutation-transaction/1`; it is carried by the host port
or fixture manifest rather than persisted inside the dataset.

A transaction contains an ordered `operations` array, `strict: boolean`, optional
non-empty `actionId`, optional history companion data, and a conflict policy of
`reject`, `cancel-active`, or `queue-after`. Unknown keys, empty operation arrays,
non-finite numbers, unsafe path segments, and unsupported operation discriminators
fail validation before any staged state is published.

A logical target is `{kind, id, ownerId?}` where `kind` is `element` or `component` and
`id` is the authored/materialized stable ID. Element IDs are scene-global and omit
`ownerId`; component IDs are owner-local and require the owning item ID. Generated grid
cells use deterministic composite element IDs. No implementation may pick an arbitrary
duplicate.

## Path Grammar and Values

A field path is a non-empty array of string property or nonnegative integer array
segments. Empty strings, negative/fractional indices, `__proto__`, `prototype`, and
`constructor` are rejected. Paths are relative to the targeted complete record and
cannot address `type` or `id`; discriminator changes use `replace`, while identity
changes use an explicit remove+add transaction.

Values are caller-owned and copied before staging. A merge uses recursive fieldwise
merge for strict plain records, scalar replacement for scalar leaves, and whole-array
replacement for arrays. `null` is a value only where the dataset schema permits it and
never means delete. Optional field deletion uses `unset`.

Within one operation, duplicate paths or prefix-overlapping paths such as `style` and
`style.fill` fail with `OVERLAPPING_PATH`. Within a transaction, operations execute in
supplied order against staged state, so overlap across distinct operations is legal and
the later operation sees the earlier result. Any strict failure rolls back the whole
transaction, including selection/history reconciliation and resource acquisition.

## Closed Operation Shapes

| `op` | Required content | Normative result |
| --- | --- | --- |
| `add` | `parent: target\|null`, `collection: children\|components`, finite `index`, complete `value` | inserts one validated record at the declared index; invalid parent/collection/index fails |
| `merge` | `target`, ordered `changes: {path,value}[]` | applies recursive record/scalar/array rules only to named paths |
| `unset` | `target`, ordered `paths` | removes optional fields; required/discriminator/ID paths fail |
| `replace` | `target`, complete `value` | validates one complete same-scope record; target ID is preserved and a supplied ID must equal it; omitted optional fields become absent/default |
| `reconcile-components` | item `target`, complete ordered `components` | matches unique authored IDs, creates every absent-ID record as new, removes unmatched old records, and publishes supplied order |
| `move` | element `target`, `parent: element\|null`, finite `index` | changes parent/order atomically; self/descendant cycles fail |
| `group` | ordered non-empty element `targets`, complete group `value` | inserts one group at the first target's scene position, reparents targets in scene order, preserves world geometry/relations, selects the group, and creates one history action |
| `ungroup` | group `target` | removes the group, splices children into its parent in order with rebased local transforms preserving world geometry, preserves relations, selects the children, and creates one history action |
| `remove` | `target`, explicit `cascade: reject\|subtree` | removes exactly the target policy; affected relations follow their declared validation policy |
| `refresh` | `targets: target[]\|all`, `domains` | recomputes named asset/text/bounds/relation/render domains without changing export meaning |

`index` must be an integer in the inclusive insertion range. Reconciliation rejects
duplicate component IDs in either side. An authored-ID match with a different
component discriminator is a replacement. A matching discriminator recursively merges
the supplied complete component over the old component only when the operation also
declares `matchMode: merge`; the default `matchMode: replace` makes the supplied list
authoritative. No absent-ID component preserves old live identity by array position.
`refresh.domains` is a non-empty unique subset of `assets`, `text`, `bounds`,
`relations`, and `render`; dependency closure may add downstream work but cannot alter
persisted dataset meaning.

### Group and ungroup closure

`group.targets` must be unique unlocked element targets with the same current parent;
an ancestor/descendant pair or cross-parent set fails atomically. `value` is a complete
new group base with a new scene-global ID and no caller-supplied children. The group is
inserted at the lowest selected sibling index, selected nodes become children in prior
sibling order, and their local transforms are rebased so world geometry is unchanged.
References to those elements remain valid. Selection becomes the new group.

`ungroup.target` may contain zero or more children. Children replace the group at its
current sibling index in existing order and are rebased to preserve world geometry;
selection becomes those children. Relations to descendants remain valid. A relation
whose endpoint is the group itself fails by default with `RELATION_DEPENDENCY`; explicit
`relationPolicy: remove` removes only those dependent links in the same transaction.
Locked target/ancestor, stale identity, ID collision, transform overflow, or any
dependent failure rolls back hierarchy, relations, selection, host companion state,
resources, and history. Each successful operation is one history action.

## Result, Failure, and Fixtures

Success returns the transaction/action identity, previous and current complete
revision stamps, ordered unique `applied`, `missing`, and `unchanged` logical target
tuples (`{kind,id,ownerId?}`),
history action identity/depth change, publication state, and optional queued action
identity. A strict missing target fails with `MISSING_TARGET`; permissive mode records
it in `missing`. Invalid records, paths, conflicts, and reconciliation fail through the
closed diagnostic registry and return no partial success counts.

Canonical fixtures cover every operation plus: caller-input mutation after submission,
nested record merge versus array replacement, unset/default restoration, duplicate and
overlapping paths, sequential overlaps, missing strict/permissive targets, component
ID/discriminator matching, index boundaries, cycles, atomic late failure, active
gesture/text conflict policies, and exact returned revisions/counts. The runtime
validator, TypeScript declarations, generated docs, and fixture schemas must derive
from or mechanically cross-check one source of truth.
