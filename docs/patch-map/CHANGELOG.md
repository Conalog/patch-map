# PatchMap changelog

## Unreleased

- Promoted the PixiJS WebGL PatchMap runtime to the package root with direct
  PATCH MAP v0.10 JSON input.
- Added dense scene transactions, stable logical queries, selection,
  transformer, viewport, history, asset, extraction, and lifecycle APIs.
- Added packaged minimal, Dashboard, Editor, and Report examples plus a
  consumer-owned host adapter.
- Added explicit canonical/legacy input materialization and guarded persistence
  roundtrip APIs, with host-owned guidance for canary rollout, shadowing, and
  next-remount rollback.
- Added strict ESM/CJS/types, package hygiene, multi-instance, host journey,
  documentation, and digest-bound release verification.
- Restored the canonical default palette and wired partial, instance-local
  `PatchMap.mount({ theme })` overrides through authored and overlay rendering.
- Added stable hover and pointer-selection projections plus package-owned,
  policy-filtered drag box selection with root pointer capture and cleanup.
- Added an explicit Shift-only box activation policy so ordinary primary drag
  remains viewport pan, and restored the exact filled 72×72 PATCH MAP v0.10
  built-in SVG catalog without changing host-injected alias ownership. Built-in
  Pixi cache identities now include the exact SVG content so an older glyph
  cannot satisfy the same public alias after an artifact replacement. Runtime
  view boxes remove only the catalog artwork's transparent outer padding, so
  public icon `size` describes its visible glyph bounds.

WebGPU and native headed Windows release measurements remain separately
reported experimental/pending evidence; they are not implied by this entry.
