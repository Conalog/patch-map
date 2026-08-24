## What changed

Describe the product behavior or ownership boundary changed by this PR.

## Contract and compatibility

- [ ] PATCH MAP v0.10 input compatibility is preserved or the approved change is linked.
- [ ] Caller immutability, stable IDs/component identity, and atomic failure are preserved.
- [ ] Approved fixtures, normalized expected observations, and review evidence are unchanged.
- [ ] WebGL remains the production baseline; WebGPU/external cells are reported separately.

## Verification

- [ ] Focused tests, lint, and typecheck
- [ ] Full unit, package/Lab build, and canonical contract gate when a tranche completed
- [ ] Headless Lab when renderer, interaction, lifecycle, or route behavior changed
- [ ] Packed consumer when exports, dependencies, examples, or package contents changed
- [ ] 2+7 memory when renderer/resource/destroy ownership changed
- [ ] Performance checkpoint when a measured hot path changed

List the exact commands and results. For every unchecked expensive gate, state
why its code or ownership path did not change.

## Remaining risk

Record unfavorable results and pending Windows-native, qualified WebGPU, or
other external measurements. Do not bump the package version in this PR.
