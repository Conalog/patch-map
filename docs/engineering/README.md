# Engineering fast path

JavaScript source paths and focused commands below are relative to
`packages/javascript/`. Root commands use the `js:` prefix.

Use this directory to find the current code owner and the smallest credible
verification set. JavaScript usage belongs in the [package docs](../../packages/javascript/docs/README.md);
Flutter consumer setup belongs in its [package README](../../packages/flutter/README.md).
This directory owns internal structure, engineering policy and release operations.

## Start here

For the native Flutter package baseline, read [Flutter development environment](flutter-package.md).
For npm or Dart versioning and publication, read [Independent release operations](releases.md).

1. Find the feature row in [System map](system-map.md).
2. Read the owning public API page when behavior, ordering, or failure meaning
   changes; exported TypeScript types remain the exact shape authority.
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
             -> changed-risk gates -> documentation check
```

Prefer a narrow port into an existing owner over a second state machine. Keep
`engine/index.ts` and `core/index.ts` as orchestration boundaries: move cohesive lifecycle or
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
