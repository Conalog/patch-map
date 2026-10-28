# Flutter runtime implementation

Status: runtime and public playground integrated; release qualification pending.

This is the implementation owner for the native package. Start with
[architecture](architecture.md), then [contracts](contracts.md) and
[delivery coverage](coverage.md).
The historical decision inventory is [decisions.json](decisions.json); it
records the approved discussion's source headings and hashes, not implemented
features. Later decisions supersede earlier discussion proposals.

The [offscreen preparation experiment](offscreen-preparation-checkpoint.md) records
response/CPU benefits; the [fit raster diagnosis](fit-raster-diagnosis.md) explains
the first-fit buffer-allocation sensitivity. The measured output-projection/matrix
deferral is adopted; validation, local geometry and publication remain unchanged.

Package setup and SDK gates remain in [Flutter environment](../flutter-package.md).
JavaScript remains the schema reference, except for explicitly approved Flutter
differences in the contracts. Shared fixtures are inputs, not proof of native
compatibility. Existing JavaScript qualification must not be weakened to match
the narrower Flutter first release.

Keyed alpha effects are owned by [presentation layers](presentation-layers.md).
The [mobile replay](mobile-replay.md) records consumer inputs, host mappings and
concrete integration differences without modifying patch-mobile.

## Delivery sequence

| Step | Independently reviewable outcome | Required evidence |
| --- | --- | --- |
| 1 | Accepted contracts, ownership/dependency design, source decision inventory | Contradiction/coverage review; no runtime claim |
| 2 | Detached dataset admission and shared geometry | Representative schema/default/identity/layout fixtures; atomic rejection |
| 3 | Widget/controller and end-to-end replacement/update/publication lifecycle | Widget tests: first paint, invalid final entry, reset merge, generations, inactivity, removal |
| 4 | Retained rendering and approved text/bar/SVG optimizations | Output/order checks and focused profile comparisons against the experiment |
| 5 | Complete interaction, network images, failures and lifecycle | Representative input gestures and injected asynchronous failure/late completion checks |
| 6 | Package-consuming playground and platform/consumer qualification | Same-workload 10,000-item profiles, extracted consumer, Android/iOS and WebView evidence |

Each step adds to the real package; the playground must not acquire a parallel
renderer. Resource teardown and measurement seams start in step 3, not after
optimization. Step 4 and step 5 may be implemented in smaller dependency-ordered
units. A missing supported element must be listed as unfinished, not silently
converted into a narrower product scope.

## Verification cadence

Use the smallest changed-owner tests while implementing. Run a comparable
profile checkpoint when an integrated hot path changes, not after every file
edit. Preserve the optimized October 19 manual app and its source/artifact
identity as the experimental baseline. Do not compare profile results to debug
or historical results from another device. Profile SDK is 3.47.6; declared
consumer/CI/service SDK support remains separately owned and verified.

The playground covers regular/random 10,000-item layouts; 0%, 1%, and 100%
changes; number/bar/mixed updates; overview and zoom+pan; normal consumer cadence
and separately labelled rapid stress; replacement and removal. Measure full
input admission through submitted revision, CPU, matched frame timing, logical
resources and physical/native/graphics memory. A synthetic Flutter run does not
qualify the deployed WebView or iOS. Run expensive platform matrices at coherent
milestones, and only repeat affected cases after a change.

Cross-request dimension-string validation and parsed-coefficient sharing are
[deferred](dimension-sharing-checkpoint.md); the existing package implementation
remains in use.

The [resolver-owned record copy checkpoint](record-copy-checkpoint.md) reduced
copy-specific CPU samples but did not establish end-to-end improvement; that
candidate is not adopted.
