# Contributing to PatchMap

## Setup

The package supports Node.js 20 or newer. Use Node.js 22 for local repository
work, matching `.nvmrc`. Release CI currently runs Node.js 24:

```sh
nvm use
npm ci
```

## Find the owner

Flutter package work uses the [Flutter package workflow](docs/engineering/flutter-package.md).
Its SDK pin and checks are independent of the npm package. Both packages use
the [independent release operations](docs/engineering/releases.md).

Start with the [engineering fast path](docs/engineering/README.md). Its
[system map](docs/engineering/system-map.md) routes each feature to the narrow
source owner and focused tests. The [verification policy](docs/engineering/verification.md)
selects final gates by changed risk.

## Pull requests

Keep pull requests focused. Describe the owned boundary, invariants preserved,
and checks run. JavaScript behavior changes update the owning page under
`packages/javascript/docs/` in the same change. Flutter consumer changes update
its package README; runtime contracts will be added with implemented capabilities.
