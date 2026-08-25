# Contributing to PatchMap

## Setup

The package supports Node.js 20 or newer. Use Node.js 22 for local repository
work, matching `.nvmrc`. Release CI currently runs Node.js 24:

```sh
nvm use
npm ci
```

Start the Korean manual Lab with `npm run lab`.

## Find the owner

Start with the [engineering fast path](docs/engineering/README.md). Its
[system map](docs/engineering/system-map.md) routes each feature to the narrow
source owner and focused tests. The [verification policy](docs/engineering/verification.md)
selects final gates by changed risk.

## Pull requests

Keep pull requests focused. Describe the owned boundary, invariants preserved,
and checks run. Public behavior changes update the owning page under `docs/` in
the same change.
