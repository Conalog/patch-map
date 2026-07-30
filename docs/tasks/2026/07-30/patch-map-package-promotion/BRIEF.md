# Goal

- Ship the completed aggregate PixiJS implementation as the sole
  `@conalog/patch-map` product and finish a clean PR-ready branch without
  changing approved contract evidence.

# Scope

- Preserve PATCH MAP v0.10 JSON compatibility, caller immutability, stable
  IDs/component identity, atomic failure, aggregate rendering, and explicit
  lifecycle/resource ownership.
- Keep the canonical 38-decision/173-case corpus and retained digest-bound
  evidence immutable. Windows-native and qualified WebGPU results remain
  pending until measured on those targets.

# Current Facts

- `src/patch-map` is the only shipping implementation; `PatchMap` is the root
  package class and `/lab/patch-map/` is the single Korean manual Lab.
- The Lab exposes all 173 manually operable routes, seeded scenes through
  10,000 records, and the user-supplied 605-root actual-production JSON.
- Repeated 5,000-bar retargeting is improved, but the preserved 2+7 proxy
  checkpoint still honestly fails its predeclared outlier budgets. This
  remains independent from the actual-production compatibility fix.

# Current State

- Actual-production rendering now projects `attrs.alpha` multiplicatively
  through group/grid/item/component/direct/relation hierarchies instead of
  preserving it without rendering.
- Authored standalone images keep the approved Sprite-center contract by
  default; v0.10 producer records marked `attrs.display: "image"` use the
  legacy top-left pivot so same-transform site imagery and overlays align.
- Standalone root images use a dedicated aggregate underlay container, while
  component background/content assets keep their own lanes. The production
  image therefore renders behind the authored overlay without moving item
  icons behind their frames.
- The manual Lab installs an explicit allowlisted ingestion profile for
  `https://images.conalog.com`; the default product security boundary remains
  deny-by-default. Async image settlement wakes the package-owned frame loop,
  so resolved textures publish without a host-authored extra frame.
- Verification passes: typecheck, full lint, 148 files/1,457 unit tests,
  package and Lab builds, canonical 38/173 contract, 173-route headless Lab
  192/192, actual-production headless load/pan/destroy with zero browser
  errors, packed ESM/CJS/types plus 38 journeys, and 2+7 lifecycle memory over
  5,099 entities. The changed memory run reported a 94,087-byte retained-heap
  median and complete DOM/scheduler/renderer release; immutable historical
  evidence was not overwritten.

# Next Step

- Record the completed tranche in the worklog, commit implementation and
  verification/docs by intent, perform the final clean-worktree review, and
  prepare the PR. Version bumping remains post-merge work.
