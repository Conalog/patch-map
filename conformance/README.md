# Shared behavior targets

This directory owns language-neutral inputs and required behavior targets.
Current JavaScript declaration identities are recorded in `public-api.json`.
The [JavaScript API docs](../packages/javascript/docs/README.md) remain the current
JavaScript meaning authority; these targets do not establish Flutter support.

`manifest.json` has `implementationStatus: foundation`. Flutter public runtime,
API bindings, executed witnesses and Android/iOS functional evidence are pending.
Fixtures, reviewed expected observations and codec payloads are target inputs,
not execution reports or support claims. Collection of executed reports belongs
to the [evidence collector](../verification/conformance/collect-evidence.md).

```sh
node verification/conformance/inventory.mjs
node --test verification/conformance/*.test.mjs
node verification/conformance/compare.mjs npm.json dart.json
node verification/conformance/qualify.mjs collected-evidence.json
```

The comparator accepts exact matching finite observations. Qualification requires
every semantic/API assertion, exact installed artifact identities and both native
platforms' rendering, input, lifecycle, assets, accessibility and capture evidence.
It always refuses the foundation stage. See [release operations](../docs/engineering/releases.md).

Fixtures and model/text expectations are committed targets. Run reports live
under ignored `.artifacts/`. Implementing runners, bindings and executable
witnesses is part of the future runtime work and requires representative consumer
inputs. Managed package assets belong to `packages/flutter/assets/`, separately
from codec and scene test inputs here.
