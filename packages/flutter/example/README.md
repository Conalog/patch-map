# PatchMap development host

This independent Android/iOS app resolves the local `conalog_patch_map`
package. It currently displays the package's development status; it does not
render a map. Do not use this host's startup time as renderer performance evidence.

```sh
flutter pub get
flutter test
flutter run
```

Future scenarios should use recorded inputs and request timing, without service
network dependencies. Preserve overlapping calls, cancellation, selection and
camera state when reproducing consumer behavior. Qualify visual correctness
and the final requested state alongside timing before integrating with an app.
