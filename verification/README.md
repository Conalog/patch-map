# Verification

This root owns deterministic repository and release gates that are not unit
tests or performance measurements.

| Owner | Purpose | Command |
| --- | --- | --- |
| `package/` | Build, pack, install, audit, and exercise the public package | `npm run verify:package` |
| `docs/` | Check documentation links, named paths, and page budgets | `npm run verify:docs` |
| `browser-launch.mjs` | Shared Chromium launch option parsing for executable gates | imported by package and performance runners |

Product behavior belongs in `tests/`; measurements and lifecycle resource
budgets belong in `performance/`. Generated output stays under ignored
`.artifacts/` or an explicitly configured release artifact directory.
