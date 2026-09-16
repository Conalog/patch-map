import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseVersion, requireForwardVersion, pubspecField, releaseMetadata } from './release-metadata.mjs';

test('release channels support independent future versions without backward movement', () => {
  for (const [target, previous] of [['1.0.0-alpha.10', '1.0.0-alpha.9'], ['2.0.0-alpha.1', '1.9.0-rc.99'], ['0.1.0-alpha.2', '0.1.0-alpha.1'], ['1.0.0', '0.10.0'], ['1.0.0', '1.0.0-rc.9']]) {
    requireForwardVersion(target, previous);
    assert.throws(() => requireForwardVersion(previous, target), /backward/u);
    assert.throws(() => requireForwardVersion(target, target), /backward/u);
  }
  for (const version of ['01.0.0', '1.0.0-alpha.01', '1.0.0-dev.1', '1.0.0+build', '1.0.0\n']) assert.throws(() => parseVersion(version));
  assert.equal(parseVersion('2.1.0').stable, true);
  assert.equal(parseVersion('0.1.0-alpha.1').stable, false);
  assert.throws(() => pubspecField('version: 1.0.0\nversion: 2.0.0', 'version'));
});

test('publisher requires the exact package, namespace and merged release manifest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'patch-map-release-'));
  try {
    await mkdir(join(root, 'packages/javascript'), { recursive: true });
    await mkdir(join(root, 'packages/flutter'), { recursive: true });
    await writeFile(join(root, 'packages/javascript/package.json'), JSON.stringify({ name: '@conalog/patch-map', version: '1.1.0' }));
    await writeFile(join(root, 'packages/flutter/pubspec.yaml'), 'name: patch_map\nversion: 0.1.0-alpha.1\n');
    const manifest = { 'packages/javascript': '1.1.0', 'packages/flutter': '0.1.0-alpha.1' };
    const save = () => writeFile(join(root, '.release-please-manifest.json'), JSON.stringify(manifest));
    await save();
    assert.equal(releaseMetadata('npm', 'v1.1.0', root)['dist-tag'], 'latest');
    assert.equal(releaseMetadata('dart', 'dart-v0.1.0-alpha.1', root)['release-kind'], 'prerelease');
    for (const [runtime, tag] of [['npm', 'dart-v1.1.0'], ['dart', 'v0.1.0-alpha.1'], ['dart', 'dart-v0.1.0-alpha.2']]) assert.throws(() => releaseMetadata(runtime, tag, root));
    delete manifest['packages/flutter'];
    await save();
    assert.throws(() => releaseMetadata('dart', 'dart-v0.1.0-alpha.1', root), /must match/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});
