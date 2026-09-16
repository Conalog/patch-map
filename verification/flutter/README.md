# Flutter artifact verification

Use Node 22. Set `FLUTTER_BIN` to the pinned Flutter executable when it is not on PATH.

```sh
node verification/flutter/package.mjs
node --test verification/flutter/installed-consumer.test.mjs
node verification/flutter/installed-consumer.mjs
```

The installed-consumer runner first verifies repository import boundaries and
managed native assets. It archives only `lib`, `assets`, package metadata,
licenses and analysis configuration into deterministic `conalog_patch_map.tar.gz`.
Examples, tests, tooling, lockfiles and generated host metadata are excluded by
both the inventory and `.pubignore`. Unknown publication inputs fail review.
The runner extracts that archive into a fresh directory, checks every file hash,
then installs it into a separate Flutter consumer using a path to the extracted
package. Production files never import the repository or verification sources.

The consumer runs offline `flutter pub get`, analyzes its public import, and
executes two ordinary asynchronous tests: actual shipped SVG/font decoding, and
public creation/query/pre-attachment mutation refusal/empty history/destruction.
A detached controller correctly refuses a mutation requiring an attached
surface. This check does not claim mounted rendering, input or capture parity;
those require the Android/iOS consumers and focused host tests.

Each run writes `.artifacts/flutter/installed-consumer-*/report.json` with archive
SHA-256, per-file sizes/hashes, content digest, contract fingerprint, exact
consumer source hash, dependency lock hash, toolchain facts, stage logs and
executed assertion names. `installedConsumer` is true only after both tests pass.
Use `--prepare-only` for packaging without Flutter execution; its report remains
false. These verification commands never publish a package. Registry publication follows
the explicit enablement and full qualification gates in
[Independent package releases](../../docs/engineering/releases.md).

An installed artifact proves its recorded snapshot, not later worktree changes.
Full SDK qualification still requires the complete feature witnesses and both
OS reports with the same contract fingerprint. See the
[conformance design](../../docs/engineering/flutter-conformance-design.md) and
[native benchmark harness](benchmark.md).


## Native/browser demo comparison

The npm demo runs at `/verification/conformance/web/`; Flutter uses the same
fixtures in `packages/flutter/example/lib/main.dart` on Android/iOS. Flutter web
is outside the supported scope. Both demos expose fixture selection, step,
height update, history, rotation, fit and capture controls. `alpha-parity` adds
mirroring, upright/follow content, fit contribution and overlay reset cases.

From `packages/flutter/example`, the actual native demo controls can be checked
with `flutter drive --profile -d DEVICE_ID
--driver=test_driver/native_contract_driver.dart
--target=integration_test/comparison_demo_test.dart`, setting
`PATCHMAP_CONTRACT_OUTPUT` to an absolute JSON path. Use `--debug` for the iOS
simulator. The report includes per-command authored data/hash, selection,
history, editor, viewport and rotation plus PNG captures at 0° and 90°. Compare
these fields with `.artifacts/flutter/public-ci/npm-public.json` produced by
`npm run verify:conformance`; calculated rotation/fit fields use the named
1e-9 tolerance in the conformance comparator. Native raster and gesture checks
remain separate from semantic trace equality. Run the [performance checks](benchmark.md)
sequentially after closing active comparison scenes.
