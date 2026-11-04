import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { copySdkWorkspace } from './sdk-workspace.mjs';

test('isolated SDK workspace preserves fixture paths and keeps resolution local', (t) => {
  const sandbox = mkdtempSync(join(tmpdir(), 'patch-map-sdk-test-'));
  t.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const source = join(sandbox, 'source');
  const workspace = join(sandbox, 'workspace');
  const packagePath = 'packages/flutter';
  const lock = 'example/pubspec.lock';
  const fixtures = [
    '../../conformance/fixtures/gallery.json',
    '../javascript/tests/fixtures/large-grid-scene.json',
  ];
  const localState = ['.dart_tool', '.fvm', 'build', 'example/ios/.symlinks'];

  function writeSource(path, contents) {
    const file = join(source, packagePath, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, contents);
  }
  writeSource(lock, 'baseline');
  for (const fixture of fixtures) writeSource(fixture, fixture);
  for (const directory of localState) writeSource(join(directory, 'stale'), 'local state');
  writeSource('../javascript/package.json', 'unrelated JavaScript input');

  const copiedPackage = copySdkWorkspace(source, workspace);
  for (const fixture of fixtures) {
    assert.equal(readFileSync(join(copiedPackage, fixture), 'utf8'), fixture);
  }
  for (const directory of localState) assert.ok(!existsSync(join(copiedPackage, directory)));
  assert.ok(!existsSync(join(copiedPackage, '../javascript/package.json')));
  assert.equal(readFileSync(join(copiedPackage, lock), 'utf8'), 'baseline');
  writeFileSync(join(copiedPackage, lock), 'service');
  assert.equal(readFileSync(join(source, packagePath, lock), 'utf8'), 'baseline');
});
