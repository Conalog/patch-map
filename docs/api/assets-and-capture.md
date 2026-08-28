# Assets and capture

- Status: current
- Audience: package consumers and agents changing resource admission, image readiness, fonts, or PNG extraction
- Source: `src/assets`, `src/engine/asset-session-authority.ts`, `src/engine/capture-extraction-authority.ts`

## Scope

This page owns image registration and leasing, built-in image provenance,
visible image readiness, package font leases/readiness, and PNG capture.
Text layout and family matching are owned by [`text.md`](text.md).
Font byte identity and licensing are owned by [`fonts.md`](../assets/fonts.md).

## Contract

- Mount registers `object`, `inverter`, `combiner`, `device`, `edge`, `loading`,
  `warning`, and `wifi`. Each is white monochrome artwork on its original
  transparent `0 0 72 72` SVG canvas; icon size addresses that canvas without
  trimming visible artwork.
- Built-in registration is not eager image loading. Mount acquires distinct
  bindings used by the initial presentation and publishes them in the first
  completed frame. Source changes retain the last resolved texture until the new
  binding is ready; a leaf with no resolved texture contributes no placeholder
  pixels while its geometry and diagnostics remain live.
- Direct URL and descriptor sources are eligible without an origin allowlist,
  matching the v0.10 source contract. Host assets always use anonymous fetches
  (`credentials: 'omit'`) and reject redirects; callers cannot override those
  network rules.
- The package admits only `image/svg+xml`, `image/png`, `image/jpeg`,
  `image/webp`, `image/avif`, `image/gif`, `font/woff`, `font/woff2`,
  `font/ttf`, `font/otf`, and legacy `application/font-woff` responses;
  generic `application/octet-stream` is rejected. An SVG parser must agree with
  an `image/svg+xml` response, and unsafe SVG content is rejected. A Pixi
  global-cache hit is not admission evidence, so host assets always pass through
  package-owned fetch and validation.
- `assetPolicy` is the extensible per-instance admission configuration. It
  currently accepts `maxEncodedBytes`, `maxDecodedWidth`, and
  `maxDecodedHeight`; defaults are 20 MiB and 8192×8192. For example,
  `PatchMap.mount({ ..., assetPolicy: { maxEncodedBytes: 5 * 1024 * 1024 } })`
  tightens one instance while retaining the default decoded dimensions. For SVG
  textures, decoded dimensions mean the raster canvas after optional
  `source.data.width`, `source.data.height`, and `source.data.resolution` are
  applied.
- Each engine owns an asset session and releases only its leases. A shared
  `assetRuntime` deduplicates physical resources across engines and unloads a
  resource after its final lease. `assets.status(alias?)` reports session and
  runtime state; it is diagnostic, not a capture-readiness poll.
- `PatchMapAssetRuntime`, its backend contracts, and
  `createPatchMapPixiAssetBackend()` form the one intentional advanced asset
  extension. Use them only to share leases across mounted maps or to supply an
  equivalent resource backend; they do not expose renderer, scene, or Engine
  ownership. Custom runtimes receive the normalized policy on each backend request.
- The package eagerly acquires the five Fira Code weights documented in
  [`fonts.md`](../assets/fonts.md)
  before creating text objects. The payload is an async package chunk shared by
  mounted instances; destroy releases instance leases.

`await capture.png()` is the visible-readiness barrier. Captures are serialized;
each request publishes pending work, waits the active image bindings for its
scene tuple, pauses the managed frame loop, validates the authoritative canvas,
and reads PNG at the current CSS size. Host resize is deferred during capture;
the latest deferred size is applied before the frame loop resumes. The result is
`{ dataUrl, mime: 'image/png', size: [width, height] }`.

## Failure semantics

- Admission, fetch, decode, or upload failure is reported without borrowing a
  cached texture or painting a generic rectangle. Correct the reported source
  and register or replace it again.
- Superseded image completions never attach. A failed replacement retains the
  last resolved texture and its lease.
- Capture rejects on unreadable assets, security preflight failure, renderer
  loss, stale publication, canvas replacement, invalid readback, or destroy. It
  never returns pixels for a different scene tuple.
- Do not add a delay, frame loop, or `assets.status()` poll around capture.

Runnable capture reference: [`examples/report.ts`](../../examples/report.ts).

## Verification map

| Claim | Implementation | Focused verification |
| --- | --- | --- |
| fixed admission and configurable policy | `src/assets/ingestion-policy.ts` | `tests/rendering/asset-ingestion-policy.test.ts` |
| sessions, leases, and cleanup | `src/engine/asset-session-authority.ts` | `tests/engine/engine-asset-lifecycle.test.ts` |
| built-in image projection | `src/assets/builtin-image-glyphs.ts` | `tests/rendering/component-assets-product.test.ts` |
| font leases and first-frame readiness | `src/assets/builtin-font-payload.ts` | `tests/rendering/asset-registry.test.ts` |
| capture queue, freshness, resize, cleanup | `src/engine/capture-extraction-authority.ts` | `tests/engine/engine-capture-extraction-authority.test.ts` |
| extraction security and PNG result | `src/operations/extraction-security-authority.ts` | `tests/engine/engine-extraction.test.ts` |
