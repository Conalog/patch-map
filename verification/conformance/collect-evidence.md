# Collecting finite conformance evidence

`collect-evidence.mjs` joins already executed reports. It does not run the SDK or
convert static mappings directly into passed results. Its output is accepted
only after the existing `qualify` gate succeeds unchanged.

Every API ID needs a reviewed binding with no pending assertions, a successful
analyzer selecting its actual public probe path, and exact file/test or fixture
command observations in both runtimes. Every semantic requirement needs actual
named witnesses in both runtimes. Failed tests or incomplete reports reject the
collection. An unreferenced opt-in skipped test is retained as skipped; a skipped
test can never serve as a witness. Supplementary machine reports are listed in
chronological order; the latest record for an exact file/full test name wins.

Produce the public browser/Dart comparison with:

```sh
node verification/conformance/run-public.mjs
```

This runner needs Playwright Chromium installed (`npx playwright install
chromium`). `DART_BIN` and `FLUTTER_BIN` override the local toolchain paths. It
compares all manifest fixtures and command IDs, rejects command failures and
records the two report hashes. Native rendering and installed artifacts remain
separate evidence.

Create a source snapshot after sources have stabilized:

```sh
node verification/conformance/collect-evidence.mjs --snapshot .artifacts/flutter/evidence-source.json
node verification/conformance/collect-evidence.mjs .artifacts/flutter/evidence-inputs.json .artifacts/flutter/qualified-evidence.json
```

The source snapshot covers production, tests/probes, owning docs, native fixture
and integration producers, and installed-consumer tooling. A snapshot captured
after execution is current-state verification; mark `sourceSnapshotPhase` as
`after-run-verification`. Never label it a historical pre-run capture. Native
artifacts additionally reference the actual retained build-source snapshot,
revision, successful driver log, report path and artifact receipt. If a producer
was omitted from the original snapshot, a separately labelled later verification
records its hash and the operator's unchanged-source confirmation. The old
snapshot remains intact.

An input config uses this structure (all `path` references also require a real
`sha256`; every command receipt has actual `exitCode: 0`, the current reviewed
`sourceFingerprint` and `contractFingerprint`):

```json
{
  "schemaRevision": "patch-map-evidence-inputs/1",
  "contractFingerprint": "<current contract SHA>",
  "sourceSnapshotPhase": "after-run-verification",
  "sourceSnapshot": {"path": ".artifacts/flutter/evidence-source.json", "sha256": "<SHA>"},
  "bindings": ["conformance/api-bindings/assets.json", "conformance/api-bindings/engine.json", "conformance/api-bindings/host.json", "conformance/api-bindings/model.json"],
  "unit": {"npm": [{"report": {"path": "<Vitest JSON>", "sha256": "<SHA>"}}], "dart": [{"report": {"path": "<Dart JSONL>", "sha256": "<SHA>"}}]},
  "analyzers": [{"command": ["flutter", "analyze", "--no-pub", "lib", "test"], "workingDirectory": "packages/patch_map", "probes": ["<exact probe paths>"], "log": {"path": "<analyzer log>", "sha256": "<SHA>"}}],
  "traces": {"npm": {"report": {"path": "<npm public JSON>", "sha256": "<SHA>"}}, "dart": {"report": {"path": "<Dart public JSON>", "sha256": "<SHA>"}}},
  "oracles": [{"id": "model", "report": {"path": "<npm model JSON>", "sha256": "<SHA>"}, "expected": "conformance/model/expected.json", "cases": "conformance/model/cases.json", "runner": {"file": "verification/conformance/run-model.mjs", "test": "compareObservations(observations,expected"}}],
  "installed": {"npm": {"report": {"path": "<package-consumer.json>", "sha256": "<SHA>"}, "artifact": {"path": "<tgz>", "sha256": "<SHA>"}}, "dart": {"report": {"path": "<installed Dart report.json>", "sha256": "<SHA>"}, "artifact": {"path": "<tar.gz>", "sha256": "<SHA>"}}},
  "platforms": {"android": {"report": {"path": "<native report>", "sha256": "<SHA>"}, "artifact": {"path": "<APK>", "sha256": "<SHA>"}, "artifactReceipt": {"path": "<artifact receipt>", "sha256": "<SHA>"}, "log": {"path": "<driver log>", "sha256": "<SHA>"}, "sourceSnapshot": {"path": "<original native build snapshot>", "sha256": "<SHA>"}, "revision": "<actual build revision>", "assertions": {"rendering": ["<exact observed assertion>"]}}}
}
```

The abbreviated example is intentionally not runnable: add the successful
receipt fields, the required `text` oracle, `ios` platform, and each platform's
`input`, `lifecycle`, `assets`, `accessibility` and `capture` assertion references.
Each category must reference strings present in the actual native report.
Hashes, driver-log report paths and preserved binary identities are checked;
the tool does not require an impossible binary self-hash.

The qualified envelope records the finite assertion scope and original inputs.
It does not claim exhaustive input-space or pixel-identical rendering proof.
Any source/contract/report drift requires review and fresh affected evidence.
