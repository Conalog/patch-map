# Core v2 Main Parity Policy

## Intent

- Compare the user-visible behavior of `performance/core-v2` with the current
  `main` product and repair meaningful Core v2 differences.
- Treat small renderer-specific raster differences as non-normative while
  requiring equivalent geometry, content, color intent, hierarchy,
  interaction, animation, viewport, history, lifecycle, and error behavior.

## Narrow main access exception

- The user's 2026-07-29 instruction explicitly authorizes `main` as a
  read-only behavioral oracle for this task.
- Run `main` only from a disposable detached worktree. Do not modify it,
  commit to it, or retain its generated files after the comparison finishes.
- Do not inspect or search `main` implementation source. Operational manifests,
  public fixtures, runtime HTML/DOM/accessibility output, canvas captures, and
  browser-observable state are allowed only as needed to launch and exercise
  the product.
- Do not copy implementation details from `main`. Diagnose and implement every
  repair from the PATCH MAP input contract, observed behavior, Core v2
  architecture, official PixiJS APIs, and Core v2 tests.

## Comparison firewall

- Feed both products the same caller-owned PATCH MAP v0.10 JSON and the same
  deterministic action traces.
- Capture actual observations independently before comparison. Do not expose
  one product's observations, approved expected files, or comparator output to
  the other product runtime.
- Preserve input immutability, stable element/component identity, atomic
  failure, and explicit unsupported diagnostics.
- Existing approved fixtures, normalized expected, review evidence, Core v1,
  clean-room, and engine-comparison artifacts remain immutable.

## Visual and functional judgment

- Normalize viewport, device scale, font readiness, clock, seed, and asset
  readiness before capture.
- Compare semantic geometry, text content and bounds, fill/stroke intent,
  visibility, ordering, selection, transformer handles, relations, and
  animation anchors numerically.
- Use image comparison to find missed visible differences, then classify
  antialiasing, glyph rasterization, subpixel blending, and backend-specific
  sampling as tolerated only when they do not change perceived content,
  placement, size, state, or interaction.
- Every accepted difference and every repaired mismatch must have a durable
  classification and reproducible evidence.

## Mutation and completion boundary

- Modify only Core v2-owned source, tests, Lab, verification, and this task's
  documentation on `performance/core-v2`.
- Close all comparison browsers, temporary servers, and the detached `main`
  worktree after checkpoints. Keep only the intentionally user-facing Core v2
  Lab server when requested.
- Finish with targeted and tranche gates, then full browser, package, memory,
  performance, deterministic fresh-session, and independent parity review.
- Native Windows remains pending until measured on actual target hardware.
