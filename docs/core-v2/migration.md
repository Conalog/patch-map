# Migration to the redesigned Core v2 API

Core v2 is a replacement engine boundary, not an API-compatible wrapper.
Remove imports of Original classes, live nodes, selectors, command objects,
and per-entity rendering hooks.

| Host responsibility | Core v2 replacement |
| --- | --- |
| create/mount a map | `new CoreV2Engine()` then `initialize()` |
| set PATCH MAP JSON | `loadDataset()` / `loadDatasetAsync()` |
| find stable logical targets | `queryScene()` or `resolveTarget()` |
| update many targets | `bulkPatch()` or `transact()` |
| selection | `applySelection()` and selection host publication |
| move/resize/rotate | transformer edit methods |
| pan/zoom/fit | viewport methods |
| undo/redo | engine history methods |
| inspect state | detached snapshots and semantic probes |
| capture a report | `extractPublishedScene()` |
| unmount | dispose host handles, then await `destroy()` |

Migration order:

1. keep the existing PATCH MAP v0.10 JSON boundary unchanged;
2. replace live-node lookup with stable logical IDs and detached query
   snapshots;
3. move mutations behind transactions and stop editing caller input;
4. move renderer/event/history behavior out of the host adapter;
5. make frame publication and teardown explicit;
6. run the minimal, Dashboard, Editor, and Report examples against the packed
   artifact before promotion.

There is no compatibility alias for an Original name. An unsupported host
behavior must be reported as a migration gap instead of being recreated
inside the adapter.
