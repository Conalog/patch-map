import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { publicationFiles, installedConsumerAssertions, REQUIRED_INSTALLED_ASSERTIONS } from './installed-consumer.mjs';

test('Dart artifact inventory excludes examples, tests and generated metadata', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'patch-map-artifact-test-'));
  try {
    for (const [path, value] of Object.entries({
      'pubspec.yaml': 'name: conalog_patch_map', 'README.md': 'Consumer quickstart',
      'lib/conalog_patch_map.dart': 'library;',
      'assets/icons/object.svg': '<svg/>', 'example/lib/main.dart': 'private example',
      'test/a_test.dart': 'private test', '.dart_tool/package_config.json': '{}',
      '.flutter-plugins-dependencies': '{}', '.fvmrc': '{}', 'toolchains.json': '{}',
      '.fvm/config.json': '{}',
    })) {
      await mkdir(resolve(directory, path, '..'), { recursive: true });
      await writeFile(resolve(directory, path), value);
    }
    await symlink('/tmp', resolve(directory, '.fvm/flutter_sdk'));
    assert.deepEqual(await publicationFiles(directory), ['README.md', 'assets/icons/object.svg', 'lib/conalog_patch_map.dart', 'pubspec.yaml']);
    await writeFile(resolve(directory, 'unreviewed.json'), '{}');
    await assert.rejects(publicationFiles(directory), /Unreviewed Dart publication input/u);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('Dart artifact rejects symlinked product sources', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'patch-map-artifact-test-'));
  try {
    await mkdir(resolve(directory, 'lib'));
    await symlink('/tmp', resolve(directory, 'lib/external'));
    await assert.rejects(publicationFiles(directory), /cannot contain symlinks/u);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Dart product imports cannot escape installed lib or use host file URIs', async () => {
  const { dartImportViolations } = await import('./package.mjs');
  const root = '/tmp/installed/package';
  const source = "export '../../repository/private.dart'; import 'file:///tmp/private.dart'; part 'package:conalog_patch_map/../../repository.dart';";
  assert.equal(dartImportViolations(source, `${root}/lib/main.dart`, root).length, 3);
  assert.equal(dartImportViolations("import 'safe.dart' if (dart.library.io) '../../private.dart';", `${root}/lib/main.dart`, root).length, 1);
  assert.deepEqual(dartImportViolations("export 'src/a.dart'; import 'package:flutter/widgets.dart';", `${root}/lib/main.dart`, root), []);
});

function machineEvents(names = REQUIRED_INSTALLED_ASSERTIONS) {
  return [
    { type: 'testStart', test: { id: 0, name: 'loading installed_consumer_test.dart' } },
    { type: 'testDone', testID: 0, result: 'success', hidden: true, skipped: false },
    ...names.flatMap((name, index) => [
      { type: 'testStart', test: { id: index + 1, name } },
      { type: 'testDone', testID: index + 1, result: 'success', hidden: false, skipped: false },
    ]),
    { type: 'done', success: true },
  ];
}
const machineOutput = (events) => `${events.map((event) => JSON.stringify(event)).join('\n')}\n`;

test('installed consumer requires both exact asset and public runtime test witnesses', () => {
  assert.deepEqual(installedConsumerAssertions(machineOutput(machineEvents())), REQUIRED_INSTALLED_ASSERTIONS);
  for (const names of [
    [REQUIRED_INSTALLED_ASSERTIONS[0]],
    [REQUIRED_INSTALLED_ASSERTIONS[1]],
    [...REQUIRED_INSTALLED_ASSERTIONS].reverse(),
    [...REQUIRED_INSTALLED_ASSERTIONS, 'unreviewed extra scenario'],
    [...REQUIRED_INSTALLED_ASSERTIONS, REQUIRED_INSTALLED_ASSERTIONS[1]],
  ]) {
    assert.throws(() => installedConsumerAssertions(machineOutput(machineEvents(names))), /required bundled asset and public runtime assertions/u);
  }
});

test('skipped, hidden, failed or missing-final runtime witnesses cannot pass installed verification', () => {
  for (const override of [
    { skipped: true }, { hidden: true }, { result: 'failure' }, { testID: 99 },
  ]) {
    const events = machineEvents();
    Object.assign(events[5], override);
    assert.throws(() => installedConsumerAssertions(machineOutput(events)), /required bundled asset and public runtime assertions/u);
  }
  for (const final of [null, { type: 'done', success: false }, { type: 'print', message: 'not completed' }]) {
    const events = machineEvents();
    events.pop();
    if (final !== null) events.push(final);
    assert.throws(() => installedConsumerAssertions(machineOutput(events)), /required bundled asset and public runtime assertions/u);
  }
});

test('installed consumer template uses only the extracted public PatchMap entry point', async () => {
  const source = await readFile(new URL('./installed-consumer.dart', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/import '([^']+)';/gu)].map((match) => match[1]);
  assert.deepEqual(imports.filter((specifier) => specifier.startsWith('package:conalog_patch_map/')), [
    'package:conalog_patch_map/conalog_patch_map.dart',
  ]);
  for (const name of REQUIRED_INSTALLED_ASSERTIONS) assert.ok(source.includes(`'${name}'`), name);
});
