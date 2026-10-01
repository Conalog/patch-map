# SDK and release operations

Status: complete. Owner: current task.

## Objective

Make the recorded Flutter toolchains the SDK authority for local validation,
CI and Dart publishing, and complete the existing release operator guide.

## Completion criteria

- Workflow setup and installed SDK checks consume toolchains.json.
- FVM configuration is a checked, synchronizable derivative of the CI role.
- CI validates baseline and service SDKs; native builds use the baseline.
- Existing release owner explains bootstrap, channels, retries and partial success.
- Focused tooling, both SDK checks, workflow lint and independent review pass.

## Boundaries and restart

Preserve the prior preflight's 11 dirty paths. No runtime implementation,
qualification-policy change, credentials, remote writes or registry publication.
Initial state is recorded under ignored .artifacts/sdk-release-refactor/.
Completed: SDK authority and workflow callers, both-role CI, and release operations
are implemented and independently reviewed. Tooling (40 tests), lint/typecheck,
43 documentation files, actionlint and both SDK Flutter verification passed.
Both SDKs produced the same 21-file installed artifact. No native/runtime change
requires a new performance or device claim. Hosted CI and authenticated publishing
remain unexecuted because this task does not authorize pushing or publication.
SDK unit commit: 69140a99. Prior preflight changes remain uncommitted.
