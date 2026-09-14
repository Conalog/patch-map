import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { verifyApiBindings } from './api-bindings.mjs';
import { classifyPublicApi } from './classify-api.mjs';

const inventory = JSON.parse(await readFile('conformance/public-api.json', 'utf8'));
const bindings = JSON.parse(await readFile('conformance/api-bindings/assets.json', 'utf8'));

test('asset binding locators preserve exact IDs while refusing execution claims', async () => {
  const result = await verifyApiBindings(process.cwd(), inventory, bindings);
  assert.equal(result.mappedCount, 91);
  assert.equal(result.qualified, false);
  assert.ok(result.unmappedCount > 0);
  assert.equal(result.pendingBindingCount, 0);
  const one = { ...bindings, bindings: [structuredClone(bindings.bindings[0])] };
  one.bindings[0].outcome = 'passed';
  await assert.rejects(verifyApiBindings(process.cwd(), inventory, one), /cannot claim execution/u);
  delete one.bindings[0].outcome;
  one.bindings[0].shapeSha256 = '0'.repeat(64);
  await assert.rejects(verifyApiBindings(process.cwd(), inventory, one), /Stale shape/u);
  one.bindings[0] = structuredClone(bindings.bindings[0]);
  one.bindings[0].witnesses[0].test = 'invented test title';
  await assert.rejects(verifyApiBindings(process.cwd(), inventory, one), /Missing test locator/u);
  one.bindings[0] = structuredClone(bindings.bindings[0]);
  one.bindings.push(one.bindings[0]);
  await assert.rejects(verifyApiBindings(process.cwd(), inventory, one), /duplicate binding/u);
});

test('AST classification distinguishes runtime methods, callback contracts and data', () => {
  const classified = classifyPublicApi(process.cwd(), inventory);
  assert.deepEqual(classified.map((row) => row.id), inventory.map((row) => row.id));
  const byId = new Map(classified.map((row) => [row.id, row]));
  assert.equal(byId.get('api.PatchMapAssetRuntime.type.attach').category, 'runtime-method');
  assert.equal(byId.get('api.PatchMapAssetBackend.load').category, 'callable-contract-member');
  assert.equal(byId.get('api.PatchMapAssetBackendRequest.key').category, 'data-contract-member');
  assert.equal(byId.get('api.PatchMapAssetRuntime.prototype').category, 'language-prototype-facet');
  assert.equal(byId.get('api.AssetSource').category, 'type-alias');
});
