# Flutter artifact verification

Use Node 22. Set `FLUTTER_BIN` to the pinned Flutter executable when it is not on PATH.

```sh
node verification/flutter/package.mjs
node --test verification/flutter/installed-consumer.test.mjs
node verification/flutter/installed-consumer.mjs
```

The installed-consumer runner first verifies repository import boundaries and
managed native assets. It archives only `lib`, `assets`, package metadata,
licenses and analysis configuration into deterministic `patch_map.tar.gz`.
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
false. No command publishes a package. `publish_to: none` remains the explicit
unqualified development state.

An installed artifact proves its recorded snapshot, not later worktree changes.
Full SDK qualification still requires the complete feature witnesses and both
OS reports with the same contract fingerprint. See the
[conformance design](../../docs/engineering/flutter-conformance-design.md) and
[native benchmark harness](benchmark.md).
