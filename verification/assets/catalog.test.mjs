import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { ASSET_CATALOG, ASSET_PACKAGES, ASSET_SOURCE, assetConsumerPaths } from './catalog.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('catalog covers canonical files once and keeps generated outputs within their owning package', () => {
  const actual = readdirSync(resolve(root, ASSET_SOURCE), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile()).map((entry) => relative(resolve(root, ASSET_SOURCE), resolve(entry.parentPath, entry.name))).sort();
  assert.deepEqual(ASSET_CATALOG.map((entry) => entry.name).sort(), actual);
  const outputs = new Set();
  for (const asset of ASSET_CATALOG) {
    assert.ok(!isAbsolute(asset.name) && !asset.name.split('/').includes('..'));
    for (const [name, target] of Object.entries(asset.targets)) {
      assert.ok(Object.hasOwn(ASSET_PACKAGES, name));
      if (target === null) continue;
      assert.ok(!isAbsolute(target) && !target.split('/').includes('..'));
      assert.ok(target.startsWith(`${ASSET_PACKAGES[name]}/`));
      assert.equal(outputs.has(target), false, `duplicate output: ${target}`);
      outputs.add(target);
    }
  }
});

test('release ownership follows direct and generated consumers, with conservative unknown shared inputs', () => {
  for (const path of ['shared/assets/icons/object.svg', 'shared/assets/fonts/FiraCode-VF.woff2', 'shared/assets/fonts/LICENSE.txt']) {
    assert.deepEqual(assetConsumerPaths(path).sort(), ['packages/flutter', 'packages/javascript']);
  }
  for (const path of ['shared/assets/fonts/FiraCode-VF.ttf', 'shared/assets/fonts/provenance.json']) {
    assert.deepEqual(assetConsumerPaths(path), ['packages/flutter']);
  }
  for (const path of ['verification/assets/catalog.mjs', 'shared/assets/new.svg']) {
    assert.deepEqual(assetConsumerPaths(path).sort(), ['packages/flutter', 'packages/javascript']);
  }
  assert.deepEqual(assetConsumerPaths('shared/unrelated.json'), []);
});
