import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { compareObservations, compareRuns, qualify } from './compare.mjs';
import { CONTRACT_REVISION, readFixtures, validateFixture } from './fixtures.mjs';
import { dartImportViolations } from '../flutter/package.mjs';
import { dartString } from '../flutter/prepare-fixtures.mjs';
import { inventoryPublicApi } from './inventory.mjs';
import { verifyCodecPayloads } from './codecs.mjs';

test('shared gallery inventories every element and component and all fixture envelopes validate', async () => {
  const fixtures = await readFixtures();
  const schema = JSON.parse(await readFile('conformance/schema/fixture.schema.json', 'utf8'));
  const operations = schema.properties.commands.items.properties.op.enum;
  for (const fixture of fixtures) for (const command of fixture.commands) {
    assert.ok(operations.includes(command.op), `schema missing command ${command.op}`);
  }
  assert.deepEqual(fixtures.map((item) => item.id), ['alpha-parity', 'binding-fields', 'codecs', 'controller', 'editor-lifecycle', 'editor', 'gallery', 'structural', 'transform-geometry', 'updates']);
  const gallery = fixtures.find((item) => item.id === 'gallery');
  assert.equal(gallery.expected.elementTypes.length, 7);
  assert.equal(gallery.expected.componentTypes.length, 4);
  assert.throws(() => validateFixture({ ...gallery, schemaRevision: 'future' }), /revision/);
  assert.throws(() => validateFixture({ ...gallery, commands: [{ id: 'code', op: 'eval' }] }), /unsupported/);
  assert.throws(() => validateFixture({ ...gallery, dataset: [NaN] }), /finite/);
  assert.throws(() => validateFixture({ ...gallery, commands: [{ id: 'same', op: 'update' }, { id: 'same', op: 'update' }] }), /duplicate/);
});

test('comparison preserves missing/null, array order and exact finite values', () => {
  compareObservations({ a: [1, null], b: true }, { b: true, a: [1, null] });
  assert.throws(() => compareObservations({}, { field: null }), /keys/);
  assert.throws(() => compareObservations([1, 2], [2, 1]), /differ/);
  assert.throws(() => compareObservations(1, 1.000001), /differ/);
  assert.throws(() => compareObservations({ field: NaN }, { field: NaN }), /non-finite/);
});

test('trace comparison refuses missing, duplicate, extra and empty fixture observations', () => {
  const run = { schemaRevision: CONTRACT_REVISION, observations: [{ fixtureId: 'a', dataset: [] }] };
  assert.deepEqual(compareRuns(run, structuredClone(run), ['a']), { comparedFixtures: 1 });
  assert.throws(() => compareRuns(run, { ...run, observations: [] }, ['a']), /array shape/);
  assert.throws(() => compareRuns(run, { ...run, observations: [...run.observations, ...run.observations] }, ['a']), /duplicate/);
  assert.throws(() => compareRuns(run, { ...run, observations: [{ fixtureId: 'a' }] }, ['a']), /Empty/);
  assert.throws(() => compareRuns(run, run, ['a', 'b']), /array shape/);
});

test('qualification requires every semantic/API witness and both installed and platform evidence', () => {
  const manifest = { schemaRevision: CONTRACT_REVISION, requirements: [{ id: 'meaning', required: true, cases: ['gallery'] }], requiredPlatforms: ['android', 'ios'] };
  const inventory = [{ id: 'api.PatchMap' }];
  const runtime = { artifactSha256: 'a'.repeat(64), installedConsumer: true, witnesses: [
    { id: 'meaning', outcome: 'passed', assertions: ['actual public output matches expected'] },
    { id: 'api.PatchMap', outcome: 'passed', assertions: ['installed public declaration has mapped Dart binding'] },
  ] };
  const platform = { outcome: 'passed', rendering: true, input: true, lifecycle: true, assets: true, accessibility: true, capture: true };
  const evidence = { schemaRevision: CONTRACT_REVISION, contractFingerprint: 'digest', runtimes: { npm: runtime, dart: structuredClone(runtime) }, platforms: { android: platform, ios: structuredClone(platform) } };
  assert.equal(qualify(manifest, inventory, evidence, 'digest').qualified, true);
  const skipped = structuredClone(evidence); skipped.runtimes.dart.witnesses[0].outcome = 'skipped';
  assert.equal(qualify(manifest, inventory, skipped, 'digest').qualified, false);
  const missing = structuredClone(evidence); missing.runtimes.dart.witnesses.pop();
  assert.equal(qualify(manifest, inventory, missing, 'digest').qualified, false);
  const uninstalled = structuredClone(evidence); uninstalled.runtimes.dart.installedConsumer = false;
  assert.equal(qualify(manifest, inventory, uninstalled, 'digest').qualified, false);
  const emptyCase = structuredClone(manifest); emptyCase.requirements[0].cases = [];
  assert.equal(qualify(emptyCase, inventory, evidence, 'digest').qualified, false);
  const platformGap = structuredClone(evidence); platformGap.platforms.ios.capture = false;
  assert.equal(qualify(manifest, inventory, platformGap, 'digest').qualified, false);
  assert.throws(() => qualify(manifest, inventory, evidence, 'stale'), /stale/);
  const duplicate = structuredClone(evidence); duplicate.runtimes.dart.witnesses.push(duplicate.runtimes.dart.witnesses[0]);
  assert.throws(() => qualify(manifest, inventory, duplicate, 'digest'), /duplicate/);
});

test('Dart package boundaries exclude runtime fixtures, upper-layer semantics and concrete engine adapters', () => {
  const root = '/repo/packages/flutter';
  assert.deepEqual(dartImportViolations("import 'dart:typed_data';", `${root}/lib/src/semantic/geometry.dart`, root), []);
  assert.match(dartImportViolations("import 'package:flutter/widgets.dart';", `${root}/lib/src/semantic/geometry.dart`, root).join(), /Dart core/);
  assert.match(dartImportViolations("import '../rendering/painter.dart';", `${root}/lib/src/engine/controller.dart`, root).join(), /concrete/);
  assert.match(dartImportViolations("import '../../../test/fixtures.dart';", `${root}/lib/src/model/dataset.dart`, root).join(), /outside lib/);
  assert.match(dartImportViolations("import '../engine/controller.dart';", `${root}/lib/src/model/dataset.dart`, root).join(), /upper layer/);
});

test('generated Dart fixture strings preserve JSON bytes and escape interpolation', () => {
  const value = '한글 $height ${unsafe}\n"quote" \\ path';
  const literal = dartString(value);
  assert.equal(JSON.parse(literal.replaceAll('\\$', '$')), value);
  assert.ok(literal.includes('\\$height'));
  assert.ok(literal.includes('\\${unsafe}'));
});

test('codec fixture contains genuine attributed containers and every format is displayed/acquired', async () => {
  const codec = (await readFixtures()).find((fixture) => fixture.id === 'codecs');
  assert.deepEqual(verifyCodecPayloads(codec), { imageFormats: 6, fontFormats: 4 });
  const malformed = structuredClone(codec);
  malformed.assets[0].descriptor.src = malformed.assets[1].descriptor.src;
  assert.throws(() => verifyCodecPayloads(malformed), /provenance/);
  const unacquired = structuredClone(codec); unacquired.requiredAssets.pop();
  assert.throws(() => verifyCodecPayloads(unacquired), /Every codec/);
});


test('public inventory distinguishes merged values, type facets and constructor signatures', () => {
  const entries = inventoryPublicApi();
  assert.ok(entries.some((entry) => entry.id === 'api.PatchMap.mount'));
  assert.ok(entries.some((entry) => entry.id === 'api.PatchMap.type.update'));
  assert.ok(entries.find((entry) => entry.id === 'api.PatchMapError').constructors.length > 0);
  assert.ok(!JSON.stringify(entries).includes(process.cwd()));
});


test('static witness index resolves exact executable cases without manufacturing outcomes', async () => {
  const manifest = JSON.parse(await readFile('conformance/manifest.json', 'utf8'));
  const index = JSON.parse(await readFile(`conformance/${manifest.witnessIndex}`, 'utf8'));
  assert.equal(index.schemaRevision, 'patch-map-witness-index/1');
  const cases = new Map();
  for (const witness of index.cases) {
    assert.equal(cases.has(witness.id), false, `duplicate witness ${witness.id}`);
    cases.set(witness.id, witness);
    assert.equal(Object.hasOwn(witness, 'outcome'), false, 'a static index is not execution evidence');
    assert.ok(witness.assertions.length > 0 && witness.scope.length > 0);
    const source = await readFile(witness.file, 'utf8');
    if (witness.kind === 'shared-fixture') {
      assert.deepEqual(witness.commands, JSON.parse(source).commands.map((command) => command.id));
    } else {
      assert.equal(witness.kind, 'focused-test');
      if (witness.parameterSource) {
        const parameter = witness.parameterSource;
        assert.ok(source.includes(parameter.titlePrefix));
        const data = JSON.parse(await readFile(parameter.file, 'utf8'));
        assert.ok(data.some((entry) => entry.id === parameter.caseId));
        assert.equal(witness.test, parameter.titlePrefix + parameter.caseId);
      } else {
        assert.ok(source.includes(witness.test), `${witness.file}: missing exact test title ${witness.test}`);
      }
    }
  }
  for (const requirement of manifest.requirements) {
    for (const id of requirement.cases) assert.ok(cases.has(id), `${requirement.id}: unknown witness ${id}`);
  }
});


test('rotation round-off is limited to named calculated geometry fields', () => {
  for (const field of ['observation.viewport.centerWorld[1]', 'result.viewport.centerWorld[0]',
    'result.worldBounds[2]', 'result.contributors[0].worldBounds[3]']) {
    const path = `$.alpha-parity.steps[0].${field}`;
    compareObservations(140, 140 + 1e-13, path);
    assert.throws(() => compareObservations(140, 140 + 1e-8, path), /differ/);
    assert.throws(() => compareObservations(Infinity, Infinity, path), /non-finite/);
  }
  assert.throws(() => compareObservations(140, 140 + 1e-13,
    '$.alpha-parity.steps[0].observation.dataset[0].attrs.y'), /differ/);
  assert.throws(() => compareObservations(140, 140 + 1e-13,
    '$.gallery.steps[0].observation.viewport.centerWorld[1]'), /differ/);
});
