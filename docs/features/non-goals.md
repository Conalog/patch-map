# Non-goals and Pixi Native Compatibility

## Non-goals

The clean-room rewrite does not need to preserve arbitrary user mutation of
internal Pixi DisplayObjects.

Not official compatibility requirements:

- Users adding/removing arbitrary children under internal element containers.
- Users depending on specific Pixi subclasses for item/background/bar/icon/text.
- Users depending on exact internal layer child counts.
- Users mutating internal `Particle`, `Graphics`, `Sprite`, `Text`, or
  `NineSliceSprite` instances directly.
- Users depending on private fields such as aggregate renderer internals, except
  where tests temporarily inspect them for benchmark/contract validation.

## Compatibility Still Required

The following remain official:

- `patchmap.app` exists after init.
- `patchmap.viewport` exists and supports documented viewport plugin operations.
- `patchmap.world` exists as selector root and event/focus/fit compatibility
  root.
- Objects returned from `selector()` and callbacks expose documented fields and
  can be passed back to `update({ elements })`, transformer selection, focus/fit
  where supported.
- Public events and callbacks receive compatible target objects.

## Design Consequence

The rewrite may introduce logical node wrappers and render IR records. PixiJS can
be treated as an output backend, not the source of truth for library state.

