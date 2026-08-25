# Assets and capture

- Status: current
- Audience: package consumers and agents changing resource admission, image readiness, fonts, or PNG extraction
- Source: [`assets`](../../src/assets), [`asset-session-authority.ts`](../../src/engine/asset-session-authority.ts), [`capture-extraction-authority.ts`](../../src/engine/capture-extraction-authority.ts)

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
- `assets.register()` applies configured origin, response, MIME, size, and byte
  policy before admitting an external texture. A Pixi global-cache hit is not
  proof that admission ran.
- Each engine owns an asset session and releases only its leases. A shared
  `assetRuntime` deduplicates physical resources across engines and unloads a
  resource after its final lease. `assets.status(alias?)` reports session and
  runtime state; it is diagnostic, not a capture-readiness poll.
- `PatchMapAssetRuntime`, its backend contracts, and
  `createPatchMapPixiAssetBackend()` form the one intentional advanced asset
  extension. Use them only to share leases across mounted maps or to supply an
  equivalent resource backend; they do not expose renderer, scene, or Engine
  ownership. `createPatchMapAssetIngestionPolicy()` remains the supported
  admission-policy helper.
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

- Policy, fetch, decode, or upload failure is reported without borrowing a
  cached texture or painting a generic rectangle. Correct the reported source
  and register or replace it again.
- Superseded image completions never attach. A failed replacement retains the
  last resolved texture and its lease.
- Capture rejects on unreadable assets, security preflight failure, renderer
  loss, stale publication, canvas replacement, invalid readback, or destroy. It
  never returns pixels for a different scene tuple.
- Do not add a delay, frame loop, or `assets.status()` poll around capture.

## Verification map

| Claim | Implementation | Focused verification |
| --- | --- | --- |
| admission policy | [`ingestion-policy.ts`](../../src/assets/ingestion-policy.ts) | [`asset-ingestion-policy.test.ts`](../../tests/rendering/asset-ingestion-policy.test.ts) |
| sessions, leases, and cleanup | [`asset-session-authority.ts`](../../src/engine/asset-session-authority.ts) | [`engine-asset-lifecycle.test.ts`](../../tests/engine/engine-asset-lifecycle.test.ts) |
| built-in image projection | [`builtin-image-glyphs.ts`](../../src/assets/builtin-image-glyphs.ts) | [`component-assets-product.test.ts`](../../tests/rendering/component-assets-product.test.ts) |
| font leases and first-frame readiness | [`builtin-font-payload.ts`](../../src/assets/builtin-font-payload.ts) | [`asset-registry.test.ts`](../../tests/rendering/asset-registry.test.ts) |
| capture queue, freshness, resize, cleanup | [`capture-extraction-authority.ts`](../../src/engine/capture-extraction-authority.ts) | [`engine-capture-extraction-authority.test.ts`](../../tests/engine/engine-capture-extraction-authority.test.ts) |
| extraction security and PNG result | [`extraction-security-authority.ts`](../../src/operations/extraction-security-authority.ts) | [`engine-extraction.test.ts`](../../tests/engine/engine-extraction.test.ts) |
