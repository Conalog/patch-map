# Representative public model contract cases

`cases.json` owns finite authored inputs and expected admission decisions for the
current v1 alpha model. It covers named inherited fields, all element/component
kinds, length/radius/spacing unions, ten placements, relation compatibility,
legacy transform metadata, and critical field/type/range errors.

`expected.json` records reviewed npm normalization outputs and exact error codes
and paths. `node verification/conformance/run-model.mjs` compares the current npm
owner against this fixed baseline. Flutter `test/model/public_fields_test.dart`
compares the same inputs against the same outputs and verifies caller immutability
and normalized round trips. The runner does not update the baseline.

These observations close representative model input assertions. They do not
stand for actual assets, raster output, gestures, installed package or native OS
execution. `api-bindings/model.json` maps declaration identities and shape hashes
to these finite assertions; release execution outcomes remain separate.
