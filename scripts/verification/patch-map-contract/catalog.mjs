import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_EVIDENCE_ROOT = fileURLToPath(
  new URL('../../../contracts/patch-map/evidence/', import.meta.url),
);

const EVIDENCE_FILES = Object.freeze({
  manifest: 'catalog-evidence-manifest.v1.json',
  priorities: 'catalog-priorities.v1.json',
  profiles: 'catalog-fixture-profiles.v1.json',
  actions: 'catalog-action-schema.v1.json',
  observations: 'catalog-observation-schema.v1.json',
  reviews: 'catalog-review-registry.v1.json',
  fixtures: 'catalog-fixtures.v1.json',
});

export const EXECUTOR_EVIDENCE_FILES = Object.freeze(Object.values(EVIDENCE_FILES));

export const T1_CASE_IDS = Object.freeze([
  'LIF-001',
  'LIF-002',
  'LIF-003',
  'LIF-004',
  'LIF-005',
  'LIF-006',
  'DAT-001',
  'DAT-002',
  'DAT-003',
  'DAT-004',
  'DAT-005',
  'DAT-007',
  'DAT-008',
  'DET-001',
  'DET-002',
  'DET-003',
  'DET-004',
]);

export async function loadExecutorCatalog(options = {}) {
  const evidenceRoot = options.evidenceRoot ?? DEFAULT_EVIDENCE_ROOT;
  const files = await readExecutorEvidence(evidenceRoot);
  const manifest = files.manifest.document;
  const fixtures = files.fixtures.document;
  const actions = files.actions.document;
  const reviews = files.reviews.document;

  validateDocumentHeaders(files);
  validateFileBindings(manifest, fixtures, files);

  const actionDefinitions = validateActionDefinitions(actions);
  const cases = validateCases({ manifest, fixtures, reviews, actionDefinitions });
  const inventory = buildInventory(cases, actionDefinitions);
  validateInventory(manifest, reviews, inventory);

  return deepFreeze({
    $schema: 'patch-map-executor-catalog/1',
    contractRevision: manifest.contractRevision,
    observationRevision: manifest.observationRevision,
    manifestSha256: sha256(files.manifest.bytes),
    sourceFiles: [...EXECUTOR_EVIDENCE_FILES],
    opaqueBindings: {
      expectedFile: structuredClone(manifest.expectedFile),
      typedCaseFile: structuredClone(manifest.typedCaseFile),
    },
    inventory,
    tranches: { T1: [...T1_CASE_IDS] },
    actionDefinitions,
    cases,
  });
}

export function selectCatalogCases(catalog, selection = {}) {
  assert(catalog && Array.isArray(catalog.cases), 'selection requires an executor catalog');
  assert(selection && typeof selection === 'object' && !Array.isArray(selection), 'selection must be an object');

  const hasTranche = selection.tranche !== undefined;
  const hasCaseIds = selection.caseIds !== undefined;
  assert(!(hasTranche && hasCaseIds), 'select either tranche or case IDs, not both');

  let selectedIds;
  if (hasCaseIds) {
    selectedIds = validateRequestedCaseIds(selection.caseIds);
  } else if (!hasTranche || selection.tranche === 'all') {
    selectedIds = catalog.cases.map((record) => record.id);
  } else {
    assert(selection.tranche === 'T1', `unknown tranche ${String(selection.tranche)}`);
    selectedIds = [...T1_CASE_IDS];
  }

  const casesById = new Map(catalog.cases.map((record) => [record.id, record]));
  return Object.freeze(selectedIds.map((id) => {
    const record = casesById.get(id);
    assert(record !== undefined, `unknown case ID ${id}`);
    return record;
  }));
}

export function assertExecutorEvidenceFileAllowed(fileName) {
  assert(
    typeof fileName === 'string' && EXECUTOR_EVIDENCE_FILES.includes(fileName),
    `executor evidence read is not allowed: ${String(fileName)}`,
  );
  return fileName;
}

async function readExecutorEvidence(evidenceRoot) {
  assert(typeof evidenceRoot === 'string' && evidenceRoot.length > 0, 'evidence root must be a path');
  const entries = await Promise.all(
    Object.entries(EVIDENCE_FILES).map(async ([key, fileName]) => [
      key,
      await readEvidenceFile(evidenceRoot, fileName),
    ]),
  );
  return Object.fromEntries(entries);
}

async function readEvidenceFile(evidenceRoot, fileName) {
  assertExecutorEvidenceFileAllowed(fileName);
  const bytes = await readFile(path.join(evidenceRoot, fileName), 'utf8');
  try {
    return { bytes, document: JSON.parse(bytes), fileName };
  } catch (error) {
    throw new Error(`PatchMap executor catalog invalid: ${fileName} is not JSON`, { cause: error });
  }
}

function validateDocumentHeaders(files) {
  const expectedSchemas = {
    manifest: 'patch-map-contract-catalog-evidence-manifest/1',
    priorities: 'patch-map-catalog-priorities/1',
    profiles: 'patch-map-catalog-fixture-profiles/1',
    actions: 'patch-map-catalog-action-contract/1',
    observations: 'patch-map-catalog-observation-contract/1',
    reviews: 'patch-map-catalog-review-registry/1',
    fixtures: 'patch-map-contract-catalog-fixtures/1',
  };
  for (const [key, schema] of Object.entries(expectedSchemas)) {
    assert(files[key].document?.$schema === schema, `${files[key].fileName} schema`);
  }

  const revision = files.manifest.document.contractRevision;
  for (const key of ['priorities', 'profiles', 'reviews', 'fixtures']) {
    assert(files[key].document.contractRevision === revision, `${files[key].fileName} contract revision`);
  }
  assert(
    files.observations.document.observationRevision === files.manifest.document.observationRevision,
    'observation schema revision',
  );
}

function validateFileBindings(manifest, fixtures, files) {
  const checks = [
    ['priorityFile', EVIDENCE_FILES.priorities, files.priorities],
    ['profileFile', EVIDENCE_FILES.profiles, files.profiles],
    ['actionSchemaFile', EVIDENCE_FILES.actions, files.actions],
    ['observationSchemaFile', EVIDENCE_FILES.observations, files.observations],
    ['reviewFile', EVIDENCE_FILES.reviews, files.reviews],
    ['fixtureFile', EVIDENCE_FILES.fixtures, files.fixtures],
  ];
  for (const [field, fileName, file] of checks) {
    validateBinding(manifest[field], fileName, sha256(file.bytes), `manifest ${field}`);
  }

  for (const field of ['profileFile', 'typedCaseFile', 'actionSchemaFile', 'observationSchemaFile']) {
    assert(sameBinding(fixtures[field], manifest[field]), `fixture ${field} binding`);
  }
  validateOpaqueBinding(manifest.typedCaseFile, 'typed case');
  validateOpaqueBinding(manifest.expectedFile, 'expected record');
}

function validateActionDefinitions(actions) {
  assert(Array.isArray(actions.definitions), 'action definitions array');
  const types = new Set();
  const handlerIds = new Set();
  const definitions = actions.definitions.map((definition) => {
    assert(definition && typeof definition === 'object' && !Array.isArray(definition), 'action definition object');
    assert(typeof definition.type === 'string' && definition.type.length > 0, 'action definition type');
    assert(definition.handlerId === `contract/${definition.type}`, `${definition.type} exact handler ID`);
    assert(!types.has(definition.type), `duplicate action type ${definition.type}`);
    assert(!handlerIds.has(definition.handlerId), `duplicate handler ID ${definition.handlerId}`);
    types.add(definition.type);
    handlerIds.add(definition.handlerId);
    return structuredClone(definition);
  });
  return definitions;
}

function validateCases({ manifest, fixtures, reviews, actionDefinitions }) {
  assert(Array.isArray(manifest.cases), 'manifest cases array');
  assert(Array.isArray(fixtures.cases), 'fixture cases array');
  assert(Array.isArray(reviews.reviews), 'review cases array');

  const fixtureById = uniqueById(fixtures.cases, 'fixture');
  const reviewById = uniqueById(reviews.reviews, 'review');
  const definitionByType = new Map(actionDefinitions.map((definition) => [definition.type, definition]));
  const usedActionTypes = new Set();
  const routes = new Set();
  const rootTestIds = new Set();

  const cases = manifest.cases.map((record, index) => {
    const fixture = fixtureById.get(record.id);
    const review = reviewById.get(record.id);
    assert(fixture !== undefined, `${record.id} fixture exists`);
    assert(review !== undefined, `${record.id} review exists`);
    validateCaseBindings({ record, fixture, review, fixtures, manifest, index });

    assert(!routes.has(record.labRoute), `${record.id} unique Lab route`);
    assert(!rootTestIds.has(fixture.rootTestId), `${record.id} unique root test ID`);
    routes.add(record.labRoute);
    rootTestIds.add(fixture.rootTestId);

    assert(Array.isArray(fixture.actionTrace) && fixture.actionTrace.length > 0, `${record.id} action trace`);
    for (const [actionIndex, action] of fixture.actionTrace.entries()) {
      assert(action.index === actionIndex, `${record.id} action index ${actionIndex}`);
      assert(definitionByType.has(action.type), `${record.id} unknown action ${action.type}`);
      assert(action.operands && typeof action.operands === 'object' && !Array.isArray(action.operands), `${record.id} action operands ${actionIndex}`);
      usedActionTypes.add(action.type);
    }

    return {
      id: record.id,
      caseType: record.caseType,
      title: fixture.title,
      priority: fixture.priority,
      capabilities: structuredClone(record.capabilities),
      labRoute: record.labRoute,
      labInstruction: fixture.lab.instruction,
      rootTestId: fixture.rootTestId,
      fixtureSha256: record.fixtureSha256,
      expected: {
        ref: record.expectedRef,
        sha256: record.expectedRecordSha256,
      },
      fixture: structuredClone(fixture),
    };
  });

  assert(fixtureById.size === manifest.cases.length, 'fixture/manifest case parity');
  assert(reviewById.size === manifest.cases.length, 'review/manifest case parity');
  assert(usedActionTypes.size === actionDefinitions.length, 'every action definition is used');
  for (const definition of actionDefinitions) {
    assert(usedActionTypes.has(definition.type), `unused action definition ${definition.type}`);
  }
  return cases;
}

function validateCaseBindings({ record, fixture, review, fixtures, manifest, index }) {
  assert(record.id === fixture.id && record.id === review.id, `${record.id} case identity`);
  assert(record.caseType === fixture.caseType, `${record.id} case type`);
  assert(record.fixtureRef === `${fixtures.$schema}#/cases/${index}`, `${record.id} fixture ref`);
  assert(
    typeof record.expectedRef === 'string' && record.expectedRef.endsWith(`#/cases/${index}`),
    `${record.id} opaque expected ref`,
  );
  assert(isSha256(record.fixtureSha256), `${record.id} fixture digest`);
  assert(isSha256(record.expectedRecordSha256), `${record.id} expected digest`);
  assert(canonicalSha256(fixture) === record.fixtureSha256, `${record.id} canonical fixture digest`);
  assert(record.contractReview?.status === 'analysis-owner-contract-approved', `${record.id} approved review`);
  assert(record.contractReview.expectedEvidenceSha256 === record.expectedRecordSha256, `${record.id} approved expected digest`);

  const expectedRoute = `/lab/patch-map?scenario=${record.id}&size=<SIZE>&seed=<SEED>`;
  assert(record.labRoute === expectedRoute && fixture.lab.route === expectedRoute, `${record.id} canonical Lab route`);
  assert(fixture.rootTestId === `scenario-${record.id.toLowerCase()}`, `${record.id} canonical root test ID`);
  assert(fixture.fixtureState === 'canonical', `${record.id} canonical fixture state`);
  assert(fixture.automationOwner === `patch-map-contract/${record.id}`, `${record.id} automation owner`);

  assert(review.contractRevision === manifest.contractRevision, `${record.id} review revision`);
  assert(review.fixtureSha256 === record.fixtureSha256, `${record.id} reviewed fixture digest`);
  assert(review.expectedRecordSha256 === record.expectedRecordSha256, `${record.id} reviewed expected digest`);
  assert(review.profileFileSha256 === manifest.profileFile.sha256, `${record.id} reviewed profile digest`);
  assert(review.typedCaseFileSha256 === manifest.typedCaseFile.sha256, `${record.id} reviewed typed-case digest`);
  assert(review.actionSchemaFileSha256 === manifest.actionSchemaFile.sha256, `${record.id} reviewed action digest`);
  assert(review.observationSchemaFileSha256 === manifest.observationSchemaFile.sha256, `${record.id} reviewed observation digest`);

  assert(Array.isArray(fixture.fixtureProfiles) && fixture.fixtureProfiles.length > 0, `${record.id} fixture profiles`);
  for (const profile of fixture.fixtureProfiles) {
    assert(fixtures.sharedProfiles[profile.id]?.sha256 === profile.sha256, `${record.id} profile ${profile.id}`);
  }
}

function buildInventory(cases, actionDefinitions) {
  const actionSteps = cases.reduce((total, record) => total + record.fixture.actionTrace.length, 0);
  return {
    cases: cases.length,
    capabilityCases: cases.filter((record) => record.caseType === 'capability').length,
    consumerJourneys: cases.filter((record) => record.caseType === 'consumer-journey').length,
    priorities: {
      P0: cases.filter((record) => record.priority === 'P0').length,
      P1: cases.filter((record) => record.priority === 'P1').length,
    },
    actionDefinitions: actionDefinitions.length,
    actionSteps,
    routes: new Set(cases.map((record) => record.labRoute)).size,
    rootTestIds: new Set(cases.map((record) => record.rootTestId)).size,
  };
}

function validateInventory(manifest, reviews, inventory) {
  assert(inventory.cases > 0, 'inventory cases must not be empty');
  assert(inventory.actionDefinitions > 0, 'inventory action definitions must not be empty');
  assert(inventory.actionSteps > 0, 'inventory action steps must not be empty');
  assert(inventory.routes === inventory.cases, 'inventory routes must cover every case');
  assert(inventory.rootTestIds === inventory.cases, 'inventory root test IDs must cover every case');
  assert(inventory.capabilityCases === manifest.sourceCatalog.capabilityCount, 'inventory capability cases');
  assert(inventory.consumerJourneys === manifest.sourceCatalog.consumerJourneyCount, 'inventory consumer journeys');
  assert(inventory.priorities.P0 + inventory.priorities.P1 === inventory.cases, 'inventory priorities');
  assert(manifest.sourceCatalog.totalCount === inventory.cases, 'manifest total case count');
  assert(manifest.reviewSummary.contractApproved === inventory.cases, 'manifest approved count');
  assert(manifest.reviewSummary.pendingReview === 0, 'manifest pending review count');
  assert(reviews.reviews.length === inventory.cases, 'review count');
}

function validateRequestedCaseIds(caseIds) {
  assert(Array.isArray(caseIds) && caseIds.length > 0, 'case IDs must be a non-empty array');
  const seen = new Set();
  return caseIds.map((id) => {
    assert(typeof id === 'string' && /^[A-Z]{3}-\d{3}$/.test(id), `invalid case ID ${String(id)}`);
    assert(!seen.has(id), `duplicate case ID ${id}`);
    seen.add(id);
    return id;
  });
}

function uniqueById(records, label) {
  const result = new Map();
  for (const record of records) {
    assert(typeof record.id === 'string' && record.id.length > 0, `${label} ID`);
    assert(!result.has(record.id), `duplicate ${label} ID ${record.id}`);
    result.set(record.id, record);
  }
  return result;
}

function validateBinding(binding, fileName, digest, label) {
  assert(binding?.path === `evidence/${fileName}`, `${label} path`);
  assert(binding.sha256 === digest, `${label} digest`);
}

function validateOpaqueBinding(binding, label) {
  assert(binding && typeof binding.path === 'string' && binding.path.startsWith('evidence/'), `${label} path`);
  assert(isSha256(binding.sha256), `${label} digest`);
}

function sameBinding(left, right) {
  return left?.path === right?.path && left?.sha256 === right?.sha256;
}

function canonicalSha256(value) {
  return sha256(JSON.stringify(sortKeys(value)));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`PatchMap executor catalog invalid: ${message}`);
}
