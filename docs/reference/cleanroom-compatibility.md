# PATCH MAP v0.10 Clean-room Compatibility Contract

Status: active  
Reference release: `@conalog/patch-map@0.10.0` (`0aaaa98`)

## Purpose

This document defines observable compatibility for an independent PATCH MAP
implementation. It is a behavioral contract, not an implementation guide. The
clean-room implementation must not infer architecture, data structures, or
algorithms from this document.

## Compatibility Levels

### Level 1: Normative public behavior

The replacement must provide these package exports:

- `Patchmap`
- `Transformer`
- `State` and `PROPAGATE_EVENT`
- `Command` and `UndoRedoManager`
- `selector`
- `convertLegacyData`
- `findIntersectObject`, `isMoved`, `intersectPoint`, and `uid`

`Patchmap` must preserve the documented lifecycle and behavior of `init`,
`destroy`, `draw`, `update`, `focus`, `fit`, `selector`, canvas events, view
rotation, view flip, state management, selection, transform handles, and
undo/redo. Public event names, event order, callback arguments, return values,
default values, validation failures, and no-op behavior are part of the
contract.

Supported map data consists of the seven element kinds `group`, `grid`, `item`,
`relations`, `image`, `text`, and `rect`, plus the four item component kinds
`background`, `bar`, `icon`, and `text`. The accepted schema, normalization,
default materialization, generated grid cell IDs, theme lookup, asset loading,
and `attrs` transform behavior are part of Level 1.

### Level 2: Active-product integration behavior

The compatibility adapter must cover the subset used by maintained Conalog
products:

- subclassing `Patchmap`, `State`, and `Command`;
- reading `app`, `viewport`, `world`, `transformer`, `stateManager`, and
  `undoRedoManager`;
- traversing `world.children` and element `parent`/`children`;
- reading element identity, type, props, transform, dimensions, visibility,
  bounds, and destroyed state;
- assigning and observing `transformer.elements`;
- using viewport zoom, center, coordinate conversion, plugin, and event APIs;
- using direct element references returned by `selector` as `update.elements`;
- evaluating currently used JSONPath expressions, including ID/type filters,
  parent filters, boolean expressions, string methods, and child projections.

Level 2 permits a facade or lazy materialization. Render objects do not need to
share the original internal class hierarchy or object identity as long as the
listed observations and mutations remain equivalent.

### Level 3: Non-contract internals

Private fields, undocumented renderer layers, mixin classes, handler ordering
internals, cache layouts, scene indexes, generated private asset aliases, and
exact constructor names are not compatibility requirements. Direct dependency
on these details must be migrated instead of reproduced.

## User-visible Invariants

- Rendering style, geometry, text layout, stacking, visibility, and assets must
  remain equivalent within the conformance tolerances.
- Click, double-click, right-click, hover, box selection, paint selection,
  drill-down, deep selection, and drag selection must preserve target and event
  behavior.
- Resize and rotation handles must preserve selection, locked-element behavior,
  snapping, ratio rules, history grouping, and visible geometry.
- Rotation, flip, focus, and fit must preserve visible bounds and upright-content
  behavior.
- An editor update must change the observable element state before `update()`
  returns and appear on the next rendered frame. It must not require blur, save,
  or an unrelated interaction.
- Performance work must not change selection styling, drag-selection results, or
  state-dependent UI behavior.

## Conformance Evidence

The analysis/oracle side owns tests that compare the reference package and the
replacement through public behavior. A comparison may normalize volatile IDs,
timestamps, floating-point noise, and browser-specific raster differences, but
must not normalize semantic differences.

Each compatibility area needs one or more of:

- normalized data and scene snapshots;
- return-value and thrown-error snapshots;
- ordered event traces;
- geometry and bounds snapshots;
- pixel comparison after fonts and assets settle;
- pointer/keyboard interaction traces;
- lifecycle and stale-async-result checks.

Reference source code and original implementation-following tests are not
handoff artifacts. The implementation team receives only this contract,
independently authored black-box fixtures, oracle results, and public package
documentation.

## Version Boundary

Compatibility targets v0.10.0 and maintained consumers. Historical behavior
from older package versions is included only when an active persisted payload or
maintained consumer requires it. New behavior discovered during conformance work
must be classified into Level 1, Level 2, or Level 3 before implementation.
