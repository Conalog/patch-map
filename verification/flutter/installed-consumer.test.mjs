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
      'pubspec.yaml': 'name: patch_map', 'lib/patch_map.dart': 'library;',
      'assets/icons/object.svg': '<svg/>', 'example/lib/main.dart': 'private example',
      'test/a_test.dart': 'private test', '.dart_tool/package_config.json': '{}',
      '.flutter-plugins-dependencies': '{}',
    })) {
      await mkdir(resolve(directory, path, '..'), { recursive: true });
      await writeFile(resolve(directory, path), value);
    }
    assert.deepEqual(await publicationFiles(directory), ['assets/icons/object.svg', 'lib/patch_map.dart', 'pubspec.yaml']);
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
