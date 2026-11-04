# Changelog

## [1.0.0-alpha.2](https://github.com/Conalog/patch-map/compare/dart-v1.0.0-alpha.1...dart-v1.0.0-alpha.2) (2026-11-04)


### Added

* qualify Flutter renderer for pub.dev ([#269](https://github.com/Conalog/patch-map/issues/269)) ([b258769](https://github.com/Conalog/patch-map/commit/b258769b0cf5ffe15cac45e24c7fde66ad38e4d5))

## 1.0.0-alpha.1 (2026-11-04)


### Added

* add Flutter package foundation and independent peer releases ([#246](https://github.com/Conalog/patch-map/issues/246)) ([1c0e439](https://github.com/Conalog/patch-map/commit/1c0e439564d99da5f2f2b925b6d64db05a348b5e))
* expose PatchMap viewport focus and align focus/fit behavior ([#258](https://github.com/Conalog/patch-map/issues/258)) ([d39550e](https://github.com/Conalog/patch-map/commit/d39550ea21b9ed4fbb0fd7352ea040e00b31a486))
* implement native Flutter PatchMap rendering and interaction ([#266](https://github.com/Conalog/patch-map/issues/266)) ([607e520](https://github.com/Conalog/patch-map/commit/607e520dd64b06e237fa9cbcba0e1b5bc6875709))


### Fixed

* isolate JavaScript and Dart release and verification ownership ([#254](https://github.com/Conalog/patch-map/issues/254)) ([624dea3](https://github.com/Conalog/patch-map/commit/624dea3c30129249bec528cc2c6dc549ee34892a))

## Changelog

## Unreleased

- Prevent pending long press from capturing a slow two-finger pinch during updates.
- Default long press to 300ms and expose per-press duration configuration.
- Expose immutable published object positions, bounds and corners by ID.
- Prepare independent native package version 1.0.0-alpha.1.
- Add managed icons, Fira Code assets and extracted artifact verification.
- Add widget-owned native rendering, controller commands, retained presentation
  updates, geometry/input/selection and shared text/image resources.
- Convert the 10,000-panel experiment host to a public package consumer.
- Keep publication blocked while runtime performance and consumer/platform
  qualification remain in progress.
