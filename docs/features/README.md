# Patch-map Official Feature Contract

This directory fixes the official behavior that the clean-room rewrite must preserve.

The rewrite may replace the internal PixiJS scene graph, renderer layout, display object
classes, animation scheduler, indexing strategy, and patch-service optimization paths.
It must keep the public library behavior described here.

## Feature Documents

- [Public API](./public-api.md)
- [Data Schema](./data-schema.md)
- [Draw, Update, Selector](./draw-update-selector.md)
- [Rendering Semantics](./rendering-semantics.md)
- [Interaction, State, Transformer](./interaction-state-transformer.md)
- [Patch-service Compatibility](./patch-service-compatibility.md)
- [Performance Contracts](./performance-contracts.md)
- [Non-goals and Pixi Native Compatibility](./non-goals.md)

## Compatibility Principle

Patch-map is a map-rendering library built on PixiJS, not a general PixiJS
DisplayObject framework. Existing official APIs stay compatible. Direct user
mutation of internal Pixi DisplayObjects is not a design constraint for the new
engine unless the mutation is part of an official API listed in this directory.

