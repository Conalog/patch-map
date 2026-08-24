# PATCH MAP PatchMap

PatchMap is the PixiJS WebGL implementation published from
`@conalog/patch-map`. It accepts PATCH MAP v0.10 JSON directly and
provides a redesigned engine API; it does not emulate the previous package API.

## Start here

- [API and dataset boundary](./api-and-dataset.md)
- [Host integration and ownership](./host-integration.md)
- [Migration from an older host adapter](./migration.md)
- [Tested compatibility matrix and release policy](./compatibility.md)
- [Troubleshooting and support ownership](./troubleshooting.md)
- [Package font assets and provenance](./font-assets.md)

Runnable TypeScript examples are packaged in `examples/patch-map`:
`minimal`, `dashboard`, `editor`, and `report`. The compile-checked
`presentation.ts` snippet shows both application-specific focus and neutral
search layers. All runnable examples use the preferred
`PatchMap.mount()` and domain APIs. `host-adapter.ts` composes the same public
surface for migration-oriented hosts; it does not implement rendering,
selection, transformation, history, or extraction semantics itself.

Package-owned PATCH MAP v0.10 icon aliases retain their original 72×72 source
canvas and transparent padding. Public icon `size` is the source draw-box size,
not an automatically trimmed visible-artwork size; direct and host-registered
sources retain their authored view boxes as well.

The default PATCH MAP font is package-owned Fira Code. PatchMap prepares exact
Light, Regular, Medium, SemiBold, and Bold faces before the first text raster;
legacy `FiraCode` family spelling continues to work without host registration.

## Release identity

The package is identified by its package name, version, and SHA-256 of the
opaque `npm pack` artifact. The release verifier writes that digest and the
result of compiling and running these packaged examples to
`package-consumer.json`. Documentation evidence is valid only when its
`documentationDigest` equals that exact packed-package SHA-256. The digest is
deliberately not embedded in the tarball because doing so would change the
tarball being identified.

Source maps, contract evidence, fixtures, tests, and reference implementation
material are excluded from the published artifact.
