# Mobile completion synchronization replay

The bounded example `example/lib/mobile_sync_main.dart` exercises the public
package with two map-linked app rows. Run from `packages/flutter/example`:

```sh
flutter run -t lib/mobile_sync_main.dart -d DEVICE_ID
flutter test --no-pub test/mobile_sync_test.dart test/mobile_replay_test.dart
```

The four buttons start from the same fixture baseline. Package results are real,
not mocked: an unsupported SVG `foreignObject` causes item preparation failure;
back-to-back updates cause field supersession; accepted draw B interrupts A.
The existing [consumer fixture and input adaptations](mobile-replay.md) apply.
No patch-mobile or package runtime code changes are involved.

## Required host interpretation

| Result | Map state | Map-linked app publication |
| --- | --- | --- |
| `applied`, no other flags | Accepted values submitted to Flutter | Publish after matching app data is also ready |
| `unchanged`, no other flags | Values already submitted | Also satisfies the map barrier; no extra paint required |
| `partialFailure` | Successful items advance; every field of a failed item retains its previous value | Advance successful rows, retain and mark failed rows; no whole-batch fresh marker |
| `superseded:true` | Only overwritten field claims are superseded; earlier companion fields may survive | Do not publish the old payload wholesale; settle the current request window and use the actual merged values |
| `interrupted/replaced` | Accepted replacement owns the map; old work cannot publish | Clear old map-linked display, await new draw/values/app data; ignore old callbacks |

`outcome`, `superseded`, `failures` and `interruption` are independent facts.
The experiment proves that partial failure and supersession can coexist: a newer
successful text update does not erase a failed item in the earlier request.
Likewise, superseded text `111` replaced by `222` can coexist with the earlier
request's successfully retained bar height `45%`.

## Example ownership and limits

`mobile_replay/sync_replay.dart` is the only owner of this experiment's commands,
diagram epoch, pending operations and displayed rows. It clears rows at a known
valid fixture replacement, and checks the epoch before changing pending counts,
failure state or publication. This is not an admission protocol for arbitrary
invalid replacements. During a pending window, the UI withholds its stored old
rows rather than label them as current. Every current-window map operation and
app-data readiness signal must settle before displaying the merged projection.

At that barrier it reads **only the two linked item rows** through `getValue`.
This avoids treating an old/new request payload as the committed map snapshot.
It does not perform a diagram-wide readback or use package internals. A production
adapter can instead retain its staged values and field ownership where needed;
the experiment does not implement full Registry transactions or prescribe a
whole-scene reread for every refresh. Raw fetched domain data may be cached
separately; only UI represented as synchronized with the map needs this barrier.

Failure marks accumulate conservatively inside one overlapping request window;
buttons reset to a fresh baseline. Automatic recovery across arbitrary later
partial retries is outside this bounded replay. Rejection, unconfirmed completion
and unexpected Future errors never produce the full-ready marker.

`getValue` reflects published target state, not a captured physical display.
Reading is safe here after all owned current-window operations submit. Map pixels
can become visible before app data arrives; the host displays waiting meanwhile.
This does not promise atomic presentation of map and app widgets in one physical
frame, animation completion, or image readiness. Initial images remain asynchronous
and report later failures separately, under the existing runtime contract.

## Consumer evidence and verification

Read-only mobile owners: `dashboard/bridge/metrics_refresh_commit_barrier.dart`
and `dashboard_monitoring_coordinator.dart` under the detail feature, plus
`tabs/patch_map/registry_refresh_coordinator.dart`. Their resource/request ticket
and dual-ready publication motivate the host barrier; native results replace a
simple bridge success acknowledgement and must preserve partial/superseded facts.
Consumer revisions and fixture provenance remain in the mobile replay checkpoint.

Focused Flutter widget checks cover normal/unchanged completion, both ready
orders, partial item rollback, field supersession, combined partial/superseded,
delayed old callbacks after replacement and interactive partial-state display.
The earlier replay helper also refuses full-success handling of superseded or
interrupted results and checks its generation before logging metric success.
No runtime hot path changed: device timing, CPU benchmarks, network transport,
full Registry projection and cross-platform qualification are not claimed.
