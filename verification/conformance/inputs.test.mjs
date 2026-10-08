import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { contractFingerprint } from './compare.mjs';

test('contract digest covers executable inputs but not Markdown guidance', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'patch-map-contract-digest-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'conformance'));
  await writeFile(join(root, 'conformance/manifest.json'), '{}');
  const before = await contractFingerprint(root);
  await writeFile(join(root, 'conformance/README.md'), '# guidance');
  assert.equal(await contractFingerprint(root), before);
  await writeFile(join(root, 'conformance/manifest.json'), '{"changed":true}');
  assert.notEqual(await contractFingerprint(root), before);
});
