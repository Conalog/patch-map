# Resolver-owned record copy checkpoint

Outcome: **not adopted**, October 28, 2026. The targeted copy cost decreased,
but the physical-device checkpoint did not establish an end-to-end improvement.
The candidate was removed; the existing resolver and update contract remain.

The candidate retained the private backing Map behind resolver-created read-only
records. Copying that Map through the public `Map.of` API allowed the tested Dart
VM to copy its existing storage instead of reinserting and rehashing every key.
It still allocated independent storage for a changed record; previous records
remained immutable. Dimension caches, scheduling, validation and other proposed
optimizations were unchanged.

SM-S936N, Flutter 3.47.6 profile, 10,000-panel mixed changes during drag and pinch:
baseline → candidate → candidate → baseline, with a fresh process each time.
The table gives the two runs separately, in milliseconds. Response ends at
engine submission. Process CPU includes input, data generation and rendering;
CPU per request is not isolated update-function time.

| Metric | Baseline runs | Candidate runs |
| --- | --- | --- |
| Drag response median | 156.0 / 204.6 | 235.0 / 206.8 |
| Pinch response median | 296.9 / 272.8 | 257.8 / 294.7 |
| Drag process CPU/request | 401.2 / 497.9 | 530.0 / 469.3 |
| Pinch process CPU/request | 596.2 / 592.3 | 575.4 / 645.8 |
| Drag maximum frame-start gap | 298.9 / 274.8 | 451.8 / 266.1 |
| Pinch maximum frame-start gap | 751.3 / 685.5 | 749.7 / 739.2 |

Frame-start gaps use successive Flutter `FrameTiming.buildStart` timestamps.

Within retained validation, copy-inclusive CPU samples per request fell from
14.0–16.8 to 3.8–4.9; no copy-rehash samples were observed in the candidate.
This is sampled evidence for the local mechanism, not a percentage reduction
in total CPU time. Neither overall CPU, GC pause time nor input/frame gaps
improved consistently. Identical-baseline response varied substantially and
device temperature differed, so a causal end-to-end regression is also
unproven. This checkpoint does not resolve long synchronous admission blocking
input and earlier frame submission.

The candidate passed 68 focused tests covering immutable snapshots, nested
changes/reset, rejection, rebasing and retained-versus-fresh output, plus focused
static analysis. Prepared-map pixels matched between all four runs. The native
stress runs completed every admitted update; they are not a full final-value
oracle. Heap snapshots were taken without forced GC and do not qualify retained
memory or GPU usage.

Raw profiles, source/APK identities, candidate patch, failed ADB installation
attempts, restoration and the Korean report are retained under
`.artifacts/performance/flutter/record-copy3476-device-20261028/`. Interrupted
setup attempts produced no valid measurements. The final baseline run completed
after reconnection; the original manual app was restored afterward.
