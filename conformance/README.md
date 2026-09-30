# Shared behavior targets

This directory carries language-neutral inputs and required behavior targets from
the referenced experiment. Current JavaScript declaration identities are recorded
in `public-api.json`. Existing API pages under `docs/` remain the meaning authority.

`manifest.json` has `implementationStatus: foundation`. Flutter public runtime,
API bindings, executed witnesses and Android/iOS functional evidence are pending.
The referenced implementation's Dart binding locators and test index are not
transferred as current evidence. Fixtures, reviewed expected observations and
codec payloads are target inputs, not execution reports or support claims.

```sh
node verification/conformance/inventory.mjs
node --test verification/conformance/*.test.mjs
node verification/conformance/compare.mjs npm.json dart.json
node verification/conformance/qualify.mjs collected-evidence.json
```

The comparator accepts exact matching finite observations. Qualification requires
every semantic/API assertion, exact installed artifact identities and both native
platforms' rendering, input, lifecycle, assets, accessibility and capture evidence.
It always refuses the foundation stage. See [environment and release ownership](../docs/engineering/flutter-package.md).

Fixtures and model/text expectations are committed targets. Run reports live
under ignored `.artifacts/`. Implementing runners, bindings and executable
witnesses is part of the future runtime work and requires representative consumer
inputs. Managed package assets belong to `packages/flutter/assets/`, separately
from codec and scene test inputs here.
