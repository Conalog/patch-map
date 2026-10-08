import assert from 'node:assert/strict';
import test from 'node:test';
import { dependencyClosure, dependencyGraphChanged } from './closure.mjs';
import { createDependencyLicenseInventory } from '../../packages/javascript/verification/package/supply-chain.mjs';

const js = 'packages/javascript';
function lock() {
  return { lockfileVersion: 3, packages: {
    [js]: { name: '@conalog/patch-map', version: '1.0.0', dependencies: { a: '1' }, devDependencies: { build: '1' } },
    verification: { name: '@patch-map/verification', devDependencies: { tool: '1' } },
    'node_modules/a': { version: '1', license: 'MIT', dependencies: { b: '1' }, peerDependencies: { absent: '*' }, peerDependenciesMeta: { absent: { optional: true } } },
    'node_modules/b': { version: '1', license: 'MIT', dependencies: { a: '1' } },
    'node_modules/build': { version: '1', license: 'ISC' },
    'node_modules/tool': { version: '1', license: 'MIT' },
  } };
}
test('one closure includes build dependencies, handles cycles and excludes private tools', () => {
  const value = lock();
  assert.deepEqual([...dependencyClosure(value, js).packages.keys()], ['node_modules/a', 'node_modules/b', 'node_modules/build']);
  assert.equal(createDependencyLicenseInventory(value, js).packageCount, 3);
  assert.deepEqual(createDependencyLicenseInventory(value, js).packages.filter((entry) => entry.direct).map((entry) => entry.name), ['a', 'build']);
});
test('transitive bytes and build changes belong to JS; private tools and its version do not', () => {
  const before = lock(), after = structuredClone(before);
  after.packages[js].version = '1.0.1';
  after.packages['node_modules/tool'].version = '2';
  assert.equal(dependencyGraphChanged(before, after, js), false);
  assert.equal(dependencyGraphChanged(before, after, 'verification'), true);
  after.packages['node_modules/b'].integrity = 'changed';
  assert.equal(dependencyGraphChanged(before, after, js), true);
});
test('nearest nested dependency takes ownership rather than an unrelated hoisted record', () => {
  const before = lock();
  before.packages['node_modules/a/node_modules/b'] = { version: '2', license: 'MIT' };
  const after = structuredClone(before);
  after.packages['node_modules/b'].version = '3';
  assert.equal(dependencyGraphChanged(before, after, js), false);
  after.packages['node_modules/a/node_modules/b'].version = '3';
  assert.equal(dependencyGraphChanged(before, after, js), true);
});
test('unresolved mandatory dependencies, unsupported locks and workspace links fail closed', () => {
  const missing = lock(); delete missing.packages['node_modules/b'];
  assert.throws(() => dependencyClosure(missing, js), /unresolved dependency/);
  const linked = lock(); linked.packages['node_modules/a'].link = true;
  assert.throws(() => dependencyClosure(linked, js), /workspace link/);
  assert.throws(() => dependencyClosure({ ...lock(), lockfileVersion: 2 }, js), /Invalid workspace/);
});
