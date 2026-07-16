import { readFile } from 'node:fs/promises';

import {
  buildCatalog,
  canonicalSha256,
  catalogExpectedPath,
  catalogFixturePath,
  catalogManifestPath,
  contractRoot,
  root,
  serialized,
  sha256,
} from './core-v2-catalog-lib.mjs';

const generated = await buildCatalog();
const stored = {
  fixtures: await readJson(catalogFixturePath),
  expected: await readJson(catalogExpectedPath),
  manifest: await readJson(catalogManifestPath),
};

for (const key of ['fixtures', 'expected', 'manifest']) {
  assert(serialized(stored[key]) === serialized(generated[key]), `${key} drift from canonical Markdown catalog`);
}

const { fixtures, expected, manifest } = stored;
assert(fixtures.$schema === 'core-v2-contract-catalog-fixtures/1', 'fixture schema');
assert(expected.$schema === 'core-v2-contract-catalog-normalized-expected/1', 'expected schema');
assert(manifest.$schema === 'core-v2-contract-catalog-evidence-manifest/1', 'manifest schema');
assert(fixtures.cases.length === 173, '173 fixtures');
assert(expected.cases.length === 173, '173 normalized expected records');
assert(manifest.cases.length === 173, '173 manifest records');
assert(manifest.sourceCatalog.capabilityCount === 135, '135 capability scenarios');
assert(manifest.sourceCatalog.consumerJourneyCount === 38, '38 consumer journeys');
assert(fixtures.profileFile.sha256 === manifest.profileFile.sha256, 'profile file binding');
assert(fixtures.typedCaseFile.sha256 === manifest.typedCaseFile.sha256, 'typed case file binding');
assert(fixtures.actionSchemaFile.sha256 === manifest.actionSchemaFile.sha256, 'action schema file binding');
assert(fixtures.observationSchemaFile.sha256 === manifest.observationSchemaFile.sha256, 'observation schema file binding');
assert(
  (await readJson(`${contractRoot}${manifest.actionSchemaFile.path}`)).$schema === 'core-v2-catalog-action-contract/1',
  'independent action contract schema',
);
assert(
  (await readJson(`${contractRoot}${manifest.observationSchemaFile.path}`)).$schema === 'core-v2-catalog-observation-contract/1',
  'independent observation contract schema',
);
assert((await readJson(`${contractRoot}${manifest.priorityFile.path}`)).$schema === 'core-v2-catalog-priorities/1', 'priority registry schema');
assert(
  sha256(await readFile(`${root}${contractRoot}${manifest.priorityFile.path}`)) === manifest.priorityFile.sha256,
  'priority file digest',
);

const fixtureById = uniqueById(fixtures.cases, 'fixture');
const expectedById = uniqueById(expected.cases, 'expected');
const manifestById = uniqueById(manifest.cases, 'manifest');
const labRoutes = new Set();

for (const record of manifest.cases) {
  const fixture = fixtureById.get(record.id);
  const normalized = expectedById.get(record.id);
  assert(fixture && normalized, `${record.id} paired records`);
  assert(fixture.caseType === normalized.caseType && fixture.caseType === record.caseType, `${record.id} case type`);
  assert(fixture.fixtureState === 'canonical', `${record.id} canonical fixture`);
  assert(fixture.rootTestId === `scenario-${record.id.toLowerCase()}`, `${record.id} stable root test ID`);
  assert(fixture.automationOwner === `core-v2-contract/${record.id}`, `${record.id} automation owner`);
  assert(Array.isArray(fixture.actionTrace) && fixture.actionTrace.length > 0, `${record.id} action trace`);
  assert(Array.isArray(fixture.cleanupTrace) && fixture.cleanupTrace.length === 1, `${record.id} cleanup trace`);
  assert(Array.isArray(fixture.requiredObservationDomains) && fixture.requiredObservationDomains.length > 0, `${record.id} observation domains`);
  assert(fixture.fixtureProfiles.every((binding) => fixtures.sharedProfiles[binding.id]?.sha256 === binding.sha256), `${record.id} digest-bound fixture profiles`);
  assert(fixture.actionTrace.every((action) => typeof action.type === 'string' && action.type !== 'exercise-capability-clause' && isPlainObject(action.operands)), `${record.id} typed actions`);
  assert(Array.isArray(normalized.expected.assertions) && normalized.expected.assertions.length > 0, `${record.id} typed assertions`);
  for (const assertion of normalized.expected.assertions) {
    assert(typeof assertion.path === 'string' && /^\/[a-z][a-zA-Z0-9]*(?:\/|$)/.test(assertion.path), `${record.id} assertion path`);
    assert(['eq', 'orderedEq', 'finite', 'lte', 'gte', 'unchanged', 'zero', 'contains', 'sameIdentity', 'noLeak'].includes(assertion.operator), `${record.id} closed assertion operator`);
    assert(!['eq', 'orderedEq', 'lte', 'gte', 'contains'].includes(assertion.operator) || Object.hasOwn(assertion, 'value'), `${record.id} assertion operand`);
  }
  for (const domain of fixture.requiredObservationDomains) {
    assert(normalized.expected.assertions.some((assertion) => assertion.path === `/${domain}` || assertion.path.startsWith(`/${domain}/`)), `${record.id} ${domain} assertion coverage`);
  }
  assert(record.contractReview.status === 'analysis-owner-contract-approved', `${record.id} independent analysis-owner approval`);
  assert(record.contractReview.expectedEvidenceSha256 === canonicalSha256(normalized), `${record.id} approved expected digest`);
  assert(record.fixtureSha256 === canonicalSha256(fixture), `${record.id} fixture digest`);
  assert(record.expectedRecordSha256 === canonicalSha256(normalized), `${record.id} expected record digest`);
  assert(record.execution.status === 'not-run', `${record.id} execution status`);
  assert(record.readinessLevel === 'spec-ready', `${record.id} readiness`);
  assert(!labRoutes.has(record.labRoute), `${record.id} unique Lab route`);
  labRoutes.add(record.labRoute);
  if (record.caseType === 'consumer-journey') {
    assert(fixture.hostEngineSeam !== undefined, `${record.id} host/engine seam`);
    for (const key of ['hostSupplies', 'engineActions', 'engineReturns', 'failureRollback', 'finalState']) {
      assert(isPlainObject(fixture.hostEngineSeam[key]) || Array.isArray(fixture.hostEngineSeam[key]), `${record.id} concrete ${key} seam`);
      assert(Object.keys(fixture.hostEngineSeam[key]).length > 0, `${record.id} non-empty ${key} seam`);
    }
    for (const section of ['engineReturns', 'failureRollback', 'finalState']) {
      for (const leafPath of seamLeafPaths(fixture.hostEngineSeam[section])) {
        assert(
          normalized.expected.assertions.some((entry) => entry.path === `/outcome/hostEngineSeam/${section}${leafPath}`),
          `${record.id} normalized ${section}${leafPath}`,
        );
      }
    }
    const failureProbes = fixture.actionTrace.filter((action) => action.type === 'probe-declared-failure');
    assert(failureProbes.length === 1, `${record.id} exact executable failure rollback probe`);
    assert(
      JSON.stringify(failureProbes[0].operands.expectedRollback) === JSON.stringify(fixture.hostEngineSeam.failureRollback),
      `${record.id} failure rollback probe binding`,
    );
  }
}

assert(manifestById.size === 173 && labRoutes.size === 173, 'complete unique catalog');
assert(manifest.reviewSummary.contractApproved === 173, 'all contract records reviewed');
assert(manifest.reviewSummary.pendingReview === 0, 'no pending analysis-owner review');
assert(typeof manifest.reviewFile.sha256 === 'string' && manifest.reviewFile.sha256.length === 64, 'independent review registry digest');
assert(
  sha256(serialized(fixtures)) === manifest.fixtureFile.sha256,
  'fixture file digest',
);
assert(
  sha256(serialized(expected)) === manifest.expectedFile.sha256,
  'expected file digest',
);

console.log('Core v2 contract catalog verified: 135 capabilities + 38 journeys = 173 approved records');

async function readJson(relativePath) {
  return JSON.parse(await readFile(`${root}${relativePath}`, 'utf8'));
}

function uniqueById(records, label) {
  const result = new Map();
  for (const record of records) {
    assert(typeof record.id === 'string' && record.id.length > 0, `${label} ID`);
    assert(!result.has(record.id), `${label} duplicate ${record.id}`);
    result.set(record.id, record);
  }
  return result;
}

function assert(condition, message) {
  if (!condition) throw new Error(`Core v2 catalog verification failed: ${message}`);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function seamLeafPaths(value, prefix = '') {
  if (Array.isArray(value) || value === null || typeof value !== 'object') return [prefix];
  return Object.entries(value).flatMap(([key, nested]) =>
    seamLeafPaths(nested, `${prefix}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`),
  );
}
