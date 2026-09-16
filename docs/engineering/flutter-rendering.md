# Native rendering retention

This page owns internal Dart rendering retention. Public behavior stays in the
shared contracts; [architecture](flutter-implementation-plan.md) owns dependency
boundaries and the single transaction/publication path.

Text layouts use a controller-local LRU of 8,192 immutable inputs; strings over
64 characters bypass it. Native paragraphs retain active entries plus 8,192
inactive entries. Asset invalidation and destroy clear both caches.

Alias-only icon instance batches replace dirty primitives/paint slots, preserving
bounds/order and existing history semantics. Unsupported edits use general
transactions. New asset topology forces admission despite retained geometry;
explicit registration also forces admission, including late fonts. Resource
completion preserves meshes unless intrinsic image dimensions change.

Repeated SVG icons share resolution-bucketed raster images: at most 32 variants,
4,194,304 pixels, and 2,048 pixels per axis. Overflow/failure uses vectors;
standalone images remain vector-rendered. Zoom/DPR changes refresh image commands
only. Asset refresh, rebuild and dispose release derived images. Tint, opacity
and readable orientation remain unchanged. The
[native checkpoint](../../verification/flutter/benchmark.md) owns latency and
whole-process memory evidence.

Readable orientation buckets share the semantic half-plane epsilon, including
near-90/270-degree boundaries. This invalidates retained bar/icon commands when
the semantic readable transform flips.

## Verification boundary

Use the existing `panel_text_performance_test.dart` integration target for service
text/icon latency. Keep semantic updates atomic, snapshot/query bounds stable,
paint order/readable orientation correct, and old asset bindings available until
replacement settles. Rasterized SVG edges may differ slightly from vectors.
Do not turn publication acknowledgements into GPU completion claims.

Focused witnesses are `text_layout_cache_test.dart`, `icon_projection_test.dart`,
`asset_refresh_test.dart`, `icon_raster_test.dart`, the existing Canvas renderer
and asset binding/runtime tests, and shared public conformance. Changes to cache
capacity also require whole-process RSS observations. Performance and lifecycle
checks have different purposes: a bounded cache is not evidence that overall
RSS is small, and faster commit is not evidence of faster raster.
