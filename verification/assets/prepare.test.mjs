import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { prepareAssets, readSharedAssets, verifyPreparedFlutterAssets } from './prepare.mjs';
import { snapshotNativeSources, validateNativeSources, snapshotSources } from '../conformance/collect-evidence.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'patch-map-assets-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(new URL('../../shared/assets/', import.meta.url), join(root, 'shared/assets'), { recursive: true });
  return root;
}

test('fresh preparation copies exact bytes, keeps canonical files intact and skips unchanged writes', (t) => {
  const root = fixture(t), before = readSharedAssets(root);
  prepareAssets({ root });
  assert.equal(verifyPreparedFlutterAssets(root), 9);
  assert.deepEqual(readSharedAssets(root), before);
  const generated = [...before.keys()].map((name) => join(root, 'packages/flutter/assets', name));
  generated.push(join(root, 'packages/javascript/docs/assets/fira-code-6.2-license.txt'));
  const times = generated.map((path) => statSync(path, { bigint: true }).mtimeNs);
  prepareAssets({ root });
  assert.deepEqual(generated.map((path) => statSync(path, { bigint: true }).mtimeNs), times);
  assert.deepEqual(readFileSync(generated.at(-1)), before.get('fonts/LICENSE.txt'));
});

test('preparation repairs changed copies and removes stale assets before packaging', (t) => {
  const root = fixture(t);
  prepareAssets({ root, packageName: 'flutter' });
  const icon = join(root, 'packages/flutter/assets/icons/object.svg');
  writeFileSync(icon, 'corrupt');
  const obsolete = join(root, 'packages/flutter/assets/icons/inverter.svg');
  writeFileSync(obsolete, 'obsolete');
  assert.throws(() => verifyPreparedFlutterAssets(root), /inventory mismatch/u);
  prepareAssets({ root, packageName: 'flutter' });
  assert.equal(verifyPreparedFlutterAssets(root), 9);
  assert.deepEqual(readFileSync(icon), readSharedAssets(root).get('icons/object.svg'));
  assert.throws(() => readFileSync(obsolete), { code: 'ENOENT' });
});

test('unreviewed source inventory or native font changes fail before generating outputs', (t) => {
  const root = fixture(t), font = join(root, 'shared/assets/fonts/FiraCode-VF.ttf');
  const bytes = readFileSync(font);
  writeFileSync(font, 'corrupt');
  assert.throws(() => prepareAssets({ root }), /provenance drift/u);
  writeFileSync(font, bytes);
  writeFileSync(join(root, 'shared/assets/icons/unreviewed.svg'), '<svg/>');
  assert.throws(() => prepareAssets({ root }), /inventory mismatch/u);
  assert.throws(() => statSync(join(root, 'packages')), { code: 'ENOENT' });
});

test('source links and generated-directory links cannot read, overwrite or delete external assets', (t) => {
  const root = fixture(t), external = join(root, 'external');
  mkdirSync(external);
  const sentinel = join(external, 'sentinel.svg');
  writeFileSync(sentinel, 'keep');
  mkdirSync(join(root, 'packages/flutter'), { recursive: true });
  symlinkSync(external, join(root, 'packages/flutter/assets'));
  assert.throws(() => prepareAssets({ root, packageName: 'flutter' }), /symlink/u);
  assert.equal(readFileSync(sentinel, 'utf8'), 'keep');
  const source = join(root, 'shared/assets/icons/object.svg');
  rmSync(source); symlinkSync(sentinel, source);
  assert.throws(() => prepareAssets({ root, packageName: 'javascript' }), /regular file/u);
});

test('per-package preparation does not generate the other package and verifies copy drift', (t) => {
  const root = fixture(t);
  prepareAssets({ root, packageName: 'javascript' });
  assert.throws(() => statSync(join(root, 'packages/flutter/assets')), { code: 'ENOENT' });
  prepareAssets({ root, packageName: 'flutter' });
  writeFileSync(join(root, 'packages/flutter/assets/icons/object.svg'), 'corrupt');
  assert.throws(() => verifyPreparedFlutterAssets(root), /asset drift/u);
  assert.throws(() => prepareAssets({ root, packageName: 'unknown' }), /usage/u);
});

test('native build snapshots pin actual prepared files and refuse stale assets without repairing them', async (t) => {
  const root = fixture(t);
  prepareAssets({ root, packageName: 'flutter' });
  const snapshot = await snapshotNativeSources(root);
  validateNativeSources(await snapshotSources(root), snapshot.files, 'android');
  const icon = join(root, 'packages/flutter/assets/icons/object.svg');
  writeFileSync(icon, 'stale');
  await assert.rejects(snapshotNativeSources(root), /asset drift/u);
  assert.equal(readFileSync(icon, 'utf8'), 'stale');
});
