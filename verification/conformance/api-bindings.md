# Public API binding evidence

The exported TypeScript inventory remains the required shape authority. Its
865 entries include nominal type containers, aliases, constructor/instance and
prototype facets, JSON fields, callbacks and SDK operations. A runtime trace
cannot establish all of these shapes, and compiling a declaration cannot prove
its behavior. The existing qualification gate remains closed until both kinds
of evidence have been joined for every required ID.

`classify-api.mjs` classifies the real TypeScript export graph and emits one row
for every inventory ID. It does not guess input/output direction from names.
Callable interface members can be host callbacks or SDK methods; each binding
must state its direction. Data declarations can be used in both directions.

`conformance/api-bindings/assets.json` demonstrates the reviewed binding format:

- `id` and `shapeSha256` pin one exact inventory declaration, including optional
  fields, signatures and constructor shapes.
- `role` distinguishes runtime, input, output, bidirectional, host protocol and
  language adaptation.
- `dart` names the exact public binding, owning source locator and language
  adaptation. A locator is navigational evidence, not an analyzer result.
- `probe` points to a unique marker in a Dart analyzer fixture importing only
  `package:conalog_patch_map/conalog_patch_map.dart`. JSON key probes prove map acceptance;
  runtime assertions must verify required keys and value semantics.
- `witnesses` names exact npm/Dart tests and the specific assertion relevant to
  this binding. One test may substantiate several fields when it explicitly
  compares the entire output object. Mere execution of a shared broad test is
  insufficient to qualify an unrelated option.
- `pendingAssertions` preserves missing behavior assertions. Empty lists do not
  imply that the linked test has run or that platform evidence is complete.

Run `node verification/conformance/api-bindings.mjs` to reject stale shapes,
unknown/duplicate IDs, missing source/probe/test locators and claimed outcomes.
It always returns `qualified: false`. Run the Dart probe analyzer and the exact
focused tests separately. The fixture source initially referenced the private
`JsonMap` alias; analyzer caught this assumption. The reviewed native public
binding is `Map<String, dynamic>` and needs no additional production export.

To issue a qualification witness, a future evidence join must match the exact
binding ID and shape hash, compiler probe marker and successful compiler run,
test file/title/assertion and successful machine test result, source/artifact
hashes, and contract fingerprint. Containers require all member bindings;
unions require their admitted variants and rejected invalid branches. Missing
IDs or pending assertions remain failures. Static mappings must never be
transformed wholesale into `outcome: passed` records.

The factory binding is deliberately `createPatchMapNativeAssetBackend` in Dart
and `createPatchMapPixiAssetBackend` in npm. Backend resources and physical keys
are platform representations; shared admission, identity, lease and cleanup
semantics still need runtime evidence. TypeScript prototype facets map to Dart
nominal instance types, not JavaScript reflection operations.
