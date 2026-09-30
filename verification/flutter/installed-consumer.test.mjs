import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { publicationFiles } from './installed-consumer.mjs';

test('Dart artifact inventory excludes examples, tests and generated metadata', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'patch-map-artifact-test-'));
  try {
    for (const [path, value] of Object.entries({
      'pubspec.yaml': 'name: conalog_patch_map', 'README.md': 'Consumer quickstart',
      'INTEGRATION.md': 'Consumer agent instructions', 'lib/conalog_patch_map.dart': 'library;',
      'assets/icons/object.svg': '<svg/>', 'example/lib/main.dart': 'private example',
      'test/a_test.dart': 'private test', '.dart_tool/package_config.json': '{}',
      '.flutter-plugins-dependencies': '{}', '.fvmrc': '{}', 'toolchains.json': '{}',
    })) {
      await mkdir(resolve(directory, path, '..'), { recursive: true });
      await writeFile(resolve(directory, path), value);
    }
    assert.deepEqual(await publicationFiles(directory), ['INTEGRATION.md', 'README.md', 'assets/icons/object.svg', 'lib/conalog_patch_map.dart', 'pubspec.yaml']);
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
