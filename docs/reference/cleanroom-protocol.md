# PATCH MAP Clean-room Protocol

Status: active

## Roles

### Analysis owner

May read the reference source, tests, history, public documentation, and active
consumer code. Owns the compatibility contract, workload definitions, and
classification of observed behavior. Must not write replacement implementation
code.

### Oracle owner

Runs the published reference package and replacement against independently
authored inputs. Reports normalized outputs, screenshots, event traces, and
performance measurements. Must not explain reference algorithms or expose
reference source-derived code to the implementation owner.

### Implementation owner

Works in a fresh repository without the reference source, its Git history,
bundled output, source maps, or original tests. May use only the approved handoff
set and public third-party documentation. Owns replacement architecture and
code.

One person or model session must not hold both analysis-source context and
implementation responsibility. A session that has read reference source is
source-contaminated for the remainder of that session.

## Approved Handoff Set

- `README.md`, `README_KR.md`, and `LICENSE`
- `docs/reference/cleanroom-compatibility.md`
- `docs/reference/cleanroom-protocol.md`
- `docs/reference/conformance-matrix.md`
- `docs/reference/oracle-runbook.md`
- `docs/reference/performance-contract.md`
- `docs/reference/public-api-contract.md`
- independently authored synthetic performance harness files under
  `scripts/perf/`
- black-box fixtures and oracle reports explicitly marked clean-room safe
- official PixiJS, pixi-viewport, browser, and package-manager documentation

## Excluded Material

- `src/**` except independently authored handoff fixtures explicitly listed
  above
- `dist/**`, source maps, and unpacked package implementation bundles
- `.git/**` and commit/PR diffs
- original unit, browser, render, and benchmark test implementation
- notes containing reference function bodies, algorithms, private symbol names,
  or structural descriptions derived from source
- copied type declarations that expose private implementation rather than a
  separately written public contract

## Handoff Flow

1. Freeze the reference release, browser, Node version, fixtures, and target
   device profiles.
2. Complete the Level 1 and Level 2 behavior inventory.
3. Author black-box fixtures without copying reference test code.
4. Run the oracle and publish only normalized expected behavior.
5. Export the approved handoff set into a new directory or repository.
6. Start the implementation in a new task with no reference-source context.
7. Route compatibility questions to the oracle owner as behavior questions.
8. Record newly discovered behavior in the contract before the implementation
   owner acts on it.

## Question Format

Implementation questions must be phrased in observable terms, for example:

- valid: “After updating a hidden icon to `show: true`, when is it visible and
  which event fires?”
- invalid: “Which handler or renderer does the reference call for icon updates?”

Oracle answers must contain inputs, observable outputs, timing boundaries, and
classification. They must not contain source locations or implementation
explanations.

## Contamination Response

If excluded material enters the implementation environment, stop that
implementation session, record what was exposed, discard affected code unless a
review can prove independent provenance, and restart from the approved handoff.
Uncertainty is resolved by isolating more material, not by expanding the allowed
set.
