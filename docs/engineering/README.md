# Engineering fast path

Use this directory to find the current code owner and the smallest credible
verification set. Product usage belongs in [`docs/`](../README.md); this
directory owns internal structure and engineering policy.

## Start here

1. Find the feature row in [System map](system-map.md).
2. When behavior or failure meaning is exact, follow the
   [PatchMap contract router](../../contracts/patch-map/README.md) to its owning
   schema or executable scenario.
3. Read the owning source before its callers. Keep state with the named
   authority or coordinator.
4. Check [Architecture](architecture.md) before adding an import, cache,
   listener, timer, frame callback, or publication path.
5. Run the focused tests from the system map while editing.
6. Select the final gates from [Verification](verification.md) by changed risk,
   not by file count.
7. Update the owning public document when behavior, ordering, failure meaning,
   support, or package contents change.

## Default change loop

```text
locate owner -> state invariant -> focused test -> implementation
             -> typecheck + lint -> risk gates -> documentation check
```

Prefer a narrow port into an existing owner over a second state machine. Keep
`engine.ts` and `core.ts` as composition boundaries: move cohesive lifecycle or
transaction ownership into their support modules, while leaving public methods
as delegates.

## Stop and widen the review when

- more than one module can advance the same revision or lifecycle;
- a candidate can partially publish before validation finishes;
- cleanup depends on success-only control flow;
- renderer code begins deciding product semantics;
- Engine or Core support imports the concrete PixiJS adapter;
- a new listener, timer, ticker, RAF, cache, or retained resource lacks one
  explicit cleanup owner;
- a hot path adds traversal, allocation, readback, or async settlement.
