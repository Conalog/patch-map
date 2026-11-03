# Flutter runtime implementation

The native runtime and package-consuming playground are implemented. Current
verification coverage and remaining release qualification are tracked in
[delivery coverage](coverage.md); passing CI is not full platform equivalence.
Consumer setup and public API usage belong to the
[package README](../../../packages/flutter/README.md).

## Find the owner

| Work | Existing owner |
| --- | --- |
| Internal structure and dependency boundaries | [Architecture](architecture.md) |
| Approved first-release behavior and scope | [Contracts F01–F17, F30–F35](contracts.md) |
| Rendering, text, SVG and raster resource policies | [Rendering contracts F18–F29](rendering-contracts.md) |
| Admission, pending updates, publication, inactivity and retirement | [Session and resource lifetime](lifecycle.md) |
| Schema defaults and approved JavaScript differences | [Compatibility findings](compatibility.md) |
| Independent keyed alpha effects | [Presentation layers](presentation-layers.md) |
| Camera observations and rotation travel | [Camera observation](camera-observation.md), [rotation animation](rotation-animation.md) |
| Touch permissions, thresholds and zoom limits | [Gesture options](gesture-options.md) |
| Published object positions and bounds | [Object geometry](object-geometry.md) |
| Selection decoration | [Selection style](selection-style.md) |
| Consumer input mapping and completion handling | [Mobile replay](mobile-replay.md), [mobile synchronization](mobile-sync.md) |
| Executed checks, historical measurements and unresolved risks | [Delivery coverage](coverage.md) |

Package setup, SDK identities and CI commands remain in the
[Flutter environment](../flutter-package.md). Choose changed-risk checks through
[verification policy](../verification.md). Workload definitions, controls and
measurement commands belong to the [example README](../../../packages/flutter/example/README.md).

## Decision and evidence history

[decisions.json](decisions.json) preserves the approved discussion's source
headings and hashes, not a list of implemented features. The current contracts
supersede earlier proposals. Checkpoint and diagnosis pages preserve their dated
source, input, environment, findings and limits; follow-up links record later
adoption or deferral. They do not redefine current API behavior or qualify a
later package revision automatically.

JavaScript remains the schema reference except for approved Flutter differences.
Shared fixtures are inputs, not native compatibility evidence. Keep JavaScript
qualification intact and distinguish bounded native smoke/profile results from
release qualification.
