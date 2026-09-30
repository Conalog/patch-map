# Flutter package foundation correction

Status: complete (foundation environment). Owner: current task; reference worktree is read-only.

## Objective

Replace the generic foundation with the peer package and independent release
structure verified in the referenced experiment, while preserving release
1.0.0-alpha.9 JavaScript behavior and building Flutter runtime afresh.

## Completion criteria

- Private root with JavaScript and verification npm workspace owners.
- Flutter SDK consumer bounds, CI baseline and actual service SDK recorded separately.
- Managed assets, extracted installed consumer and exact artifact checks.
- Independent js-v/dart-v planning and guarded publication, with foundation blocked.
- Relevant package/tooling/docs/native host checks and independent review recorded.

## Boundaries

No experiment renderer, AVIF source exclusion, registry upload or peer worktree edit.
The Flutter public runtime and Android/iOS functional conformance remain future work.
Reference: d509 at 8bcbf494; baseline: release/1.0 at 6986c632.

## Verification and remaining scope

- JS source 286 files/examples 6 byte-identical; typecheck/lint/build and 1157 tests passed.
- Packed JS consumer, audit (0 vulnerabilities), capture/lifecycle and performance smoke passed.
- Shared tooling: typecheck/lint and 34 Node tests passed; public API inventory 865 verified.
- Flutter 3.41.4 and service 3.44.9: analysis, example tests and extracted import/SVG/font passed.
- Both SDKs verified identical Dart artifact bytes with exact current contract fingerprint.
- Android debug APK built; iOS simulator build blocked by absent Xcode iOS 26.2 platform.
- Independent review resolved fresh-checkout docs dependency; 40 docs pass without build outputs.
- Workflow lint passed with only unsupported queue syntax ignored in actionlint 1.7.12;
  queue: max is documented by GitHub and preserves release events.
- No registry writes, branch pushes, release tags or external account changes performed.

The public Flutter runtime and device functional qualification remain a separate
implementation scope. Full SDK parity is blocked by the foundation manifest.
