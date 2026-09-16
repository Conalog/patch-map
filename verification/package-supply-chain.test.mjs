import assert from 'node:assert/strict';
import test from 'node:test';
import { createDependencyLicenseInventory } from '../packages/javascript/verification/package/supply-chain.mjs';

test('npm inventory follows hoisted and nested dependency edges, excluding sibling verification tools', () => {
  const lock = { packages: {
    'packages/javascript': { devDependencies: { compiler: '1' }, peerDependencies: { renderer: '1' } },
    verification: { devDependencies: { releaseTool: '1' } },
    'node_modules/compiler': { version: '1', license: 'MIT', dependencies: { shared: '1' }, optionalDependencies: { absentPlatform: '1' } },
    'node_modules/compiler/node_modules/shared': { version: '1', license: 'MIT', peerDependencies: { renderer: '1' } },
    'node_modules/renderer': { version: '1', license: 'MIT', dependencies: { shared: '2' } },
    'node_modules/shared': { version: '2', license: 'MIT' },
    'node_modules/releaseTool': { version: '1', license: 'UNKNOWN' },
  } };
  const inventory = createDependencyLicenseInventory(lock, 'packages/javascript');
  assert.equal(inventory.packageCount, 4);
  assert.equal(inventory.unapprovedLicenseCount, 0);
  assert.deepEqual(inventory.packages.filter((entry) => entry.direct).map((entry) => entry.name), ['compiler', 'renderer']);
  assert.deepEqual(inventory.packages.filter((entry) => entry.name === 'shared').map((entry) => entry.version), ['1', '2']);
  lock.packages['node_modules/compiler/node_modules/shared'].license = 'UNKNOWN';
  assert.equal(createDependencyLicenseInventory(lock, 'packages/javascript').unapprovedLicenseCount, 1);
  delete lock.packages['node_modules/shared'];
  assert.throws(() => createDependencyLicenseInventory(lock, 'packages/javascript'), /unresolved dependency/u);
});

test('package inventory rejects missing workspace identity and cross-workspace production dependencies', () => {
  assert.throws(() => createDependencyLicenseInventory({ packages: {} }, 'packages/javascript'), /missing workspace/u);
  assert.throws(() => createDependencyLicenseInventory({ packages: {
    'packages/javascript': { dependencies: { privateTool: '*' } },
    'node_modules/privateTool': { link: true, resolved: 'verification' },
  } }, 'packages/javascript'), /workspace link/u);
});
