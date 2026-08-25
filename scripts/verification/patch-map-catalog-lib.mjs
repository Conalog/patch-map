import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const contractRoot = 'contracts/patch-map/';
export const catalogFixturePath = `${contractRoot}evidence/catalog-fixtures.v1.json`;
export const catalogExpectedPath = `${contractRoot}evidence/catalog-normalized-expected.v1.json`;
export const catalogManifestPath = `${contractRoot}evidence/catalog-evidence-manifest.v1.json`;
export const catalogTypedCasePath = `${contractRoot}evidence/catalog-typed-cases.v1.json`;
export const catalogProfilePath = `${contractRoot}evidence/catalog-fixture-profiles.v1.json`;
export const catalogReviewPath = `${contractRoot}evidence/catalog-review-registry.v1.json`;
export const catalogActionSchemaPath = `${contractRoot}evidence/catalog-action-schema.v1.json`;
export const catalogObservationSchemaPath = `${contractRoot}evidence/catalog-observation-schema.v1.json`;

const scenarioRoot = `${contractRoot}scenarios/`;
const journeyPath = `${contractRoot}consumer-journeys.md`;
const priorityPath = `${contractRoot}evidence/catalog-priorities.v1.json`;

const setupFields = new Set(['Goal', 'User goal', 'Given', 'Setup', 'Environment', 'Workloads', 'Protocol']);
const actionFields = new Set(['When', 'Action', 'Measure', 'Automation', 'Protocol', 'Gate']);
const expectedFields = new Set([
  'Then',
  'Result',
  'Pass',
  'Rule',
  'Gate',
  'Edges',
  'Edge',
  'Environment',
  'Budget',
  'Raster',
  'Failure',
  'Default',
  'Performance',
]);

const observationDomainsByPrefix = Object.freeze({
  LIF: ['revisions', 'scene', 'outcome', 'resources'],
  DAT: ['scene', 'geometry', 'text', 'paint', 'outcome'],
  REN: ['scene', 'geometry', 'text', 'paint', 'resources'],
  LAY: ['scene', 'geometry', 'interaction'],
  AST: ['scene', 'paint', 'outcome', 'resources'],
  UPD: ['revisions', 'scene', 'geometry', 'text', 'paint', 'outcome'],
  ANI: ['revisions', 'scene', 'geometry', 'paint', 'events', 'outcome'],
  EVT: ['revisions', 'interaction', 'events', 'outcome'],
  QRY: ['scene', 'interaction', 'outcome'],
  SEL: ['scene', 'geometry', 'interaction', 'events'],
  VIE: ['revisions', 'geometry', 'interaction', 'events'],
  TRN: ['revisions', 'scene', 'geometry', 'interaction', 'events', 'history'],
  HIS: ['revisions', 'scene', 'interaction', 'events', 'history'],
  ERR: ['revisions', 'scene', 'outcome', 'resources'],
  DET: ['revisions', 'scene', 'geometry', 'text', 'paint', 'outcome'],
  PRF: ['revisions', 'scene', 'interaction', 'outcome', 'resources'],
  PIX: ['revisions', 'scene', 'paint', 'outcome', 'resources'],
  PKG: ['outcome', 'resources'],
  SEC: ['outcome', 'resources'],
  ACC: ['scene', 'geometry', 'interaction', 'events', 'accessibility'],
  OPS: ['revisions', 'events', 'outcome', 'resources'],
});

const fixtureProfilesByPrefix = Object.freeze({
  LIF: ['all-kinds-scene', 'lifecycle-generations'],
  DAT: ['dataset-schema-matrix'],
  REN: ['all-kinds-scene', 'rendering-specimens'],
  LAY: ['layout-geometry-matrix'],
  AST: ['asset-policy-matrix'],
  UPD: ['mutation-transaction-matrix'],
  ANI: ['deterministic-animation-clock'],
  EVT: ['input-device-and-gesture-matrix'],
  QRY: ['owner-qualified-scene-query'],
  SEL: ['selection-and-hit-matrix'],
  VIE: ['viewport-transform-matrix'],
  TRN: ['transformer-gesture-matrix'],
  HIS: ['history-and-companion-state'],
  ERR: ['diagnostic-and-rollback-matrix'],
  DET: ['fresh-session-semantic-snapshot'],
  PRF: ['synthetic-and-production-performance-matrix'],
  PIX: ['pixijs-public-integration-matrix'],
  PKG: ['packed-consumer-matrix'],
  SEC: ['hostile-asset-and-package-matrix'],
  ACC: ['logical-accessibility-tree'],
  OPS: ['bounded-diagnostics-matrix'],
});

const sharedProfileSources = Object.freeze({
  'all-kinds-scene': ['dataset-fixtures.md', 'dataset-schema-reference.md'],
  'lifecycle-generations': ['engine-boundary.md', 'scenarios/lifecycle-data.md'],
  'dataset-schema-matrix': ['dataset-fixtures.md', 'dataset-schema-reference.md'],
  'rendering-specimens': ['dataset-fixtures.md', 'scenarios/rendering-layout-assets.md'],
  'layout-geometry-matrix': ['semantic-observation.md', 'scenarios/rendering-layout-assets.md'],
  'asset-policy-matrix': ['production-readiness.md', 'scenarios/rendering-layout-assets.md'],
  'mutation-transaction-matrix': ['mutation-operation-schema.md', 'scenarios/updates-animation.md'],
  'deterministic-animation-clock': ['engine-boundary.md', 'scenarios/updates-animation.md'],
  'input-device-and-gesture-matrix': ['engine-boundary.md', 'scenarios/events-selection.md'],
  'owner-qualified-scene-query': ['semantic-observation.md', 'scenarios/events-selection.md'],
  'selection-and-hit-matrix': ['semantic-observation.md', 'scenarios/events-selection.md'],
  'viewport-transform-matrix': ['semantic-observation.md', 'scenarios/viewport-transformer.md'],
  'transformer-gesture-matrix': ['engine-boundary.md', 'scenarios/viewport-transformer.md'],
  'history-and-companion-state': ['engine-boundary.md', 'scenarios/history-errors-determinism-performance.md'],
  'diagnostic-and-rollback-matrix': ['semantic-observation.md', 'scenarios/history-errors-determinism-performance.md'],
  'fresh-session-semantic-snapshot': ['semantic-observation.md', 'scenarios/history-errors-determinism-performance.md'],
  'synthetic-and-production-performance-matrix': ['production-readiness.md', 'evidence/production-shaped-workload.v1.json'],
  'pixijs-public-integration-matrix': ['engine-boundary.md', 'scenarios/pixijs-package-integration.md'],
  'packed-consumer-matrix': ['production-readiness.md', 'scenarios/pixijs-package-integration.md'],
  'hostile-asset-and-package-matrix': ['production-readiness.md', 'scenarios/security-accessibility-operations.md'],
  'logical-accessibility-tree': ['semantic-observation.md', 'scenarios/security-accessibility-operations.md'],
  'bounded-diagnostics-matrix': ['semantic-observation.md', 'scenarios/security-accessibility-operations.md'],
  'packed-host-seam': ['consumer-journeys.md', 'engine-boundary.md', 'production-readiness.md'],
});

export async function buildCatalog({ reviewRegistryOverride } = {}) {
  const priorityRegistry = await readPriorityRegistry();
  const capabilitySources = await readCapabilitySources(priorityRegistry.byId);
  const journeySources = await readJourneySources();
  const sources = [...capabilitySources, ...journeySources];
  const typedRegistry = await readTypedRegistry(sources);
  const profileRegistry = await readProfileRegistry();
  const actionSchemaRegistry = await readActionSchemaRegistry();
  const observationSchemaRegistry = await readObservationSchemaRegistry();
  validateTypedAssertions(typedRegistry.document.cases, observationSchemaRegistry.document);
  validateActionContract(typedRegistry.document.cases, actionSchemaRegistry.document);
  validateExecutionBindings(
    typedRegistry.document,
    profileRegistry.document,
    actionSchemaRegistry.document,
  );
  const reviewRegistry = reviewRegistryOverride ?? await readReviewRegistry();
  const sharedProfiles = await buildSharedProfiles(profileRegistry.document.profiles);
  const fixtures = {
    $schema: 'patch-map-contract-catalog-fixtures/1',
    contractRevision: 'patch-map-contract/1',
    observationRevision: 'patch-map-semantic-observation/1',
    mutationRevision: 'patch-map-mutation-transaction/1',
    generatedFrom: {
      capabilityRoot: 'scenarios/',
      consumerJourneys: 'consumer-journeys.md',
      extractionRevision: 'patch-map-contract-catalog-extractor/1',
    },
    rules: {
      callerInput: 'immutable',
      actionOrder: 'array order is normative',
      fixtureBindings: 'named profiles are defined by the sanitized functional contract',
      expectedOwnership: 'analysis-owner; implementation output cannot rewrite these records',
      execution: 'not run by catalog generation',
    },
    sharedProfiles,
    profileFile: { path: 'evidence/catalog-fixture-profiles.v1.json', sha256: profileRegistry.sha256 },
    typedCaseFile: { path: 'evidence/catalog-typed-cases.v1.json', sha256: typedRegistry.sha256 },
    actionSchemaFile: { path: 'evidence/catalog-action-schema.v1.json', sha256: actionSchemaRegistry.sha256 },
    observationSchemaFile: { path: 'evidence/catalog-observation-schema.v1.json', sha256: observationSchemaRegistry.sha256 },
    cases: sources.map((source) => toFixture(source, typedRegistry.byId.get(source.id), sharedProfiles)),
  };
  const expected = {
    $schema: 'patch-map-contract-catalog-normalized-expected/1',
    contractRevision: fixtures.contractRevision,
    observationRevision: fixtures.observationRevision,
    assertionLanguage: 'normalized-contract-clauses/1',
    matching: {
      clauses: 'all ordered clauses are normative',
      geometryToleranceWorld: 0.000001,
      geometryToleranceScreenCssPx: 0.0001,
      screenshots: 'non-normative',
      undeclaredVolatileFields: 'reject',
    },
    cases: sources.map((source) => toExpected(source, typedRegistry.byId.get(source.id))),
  };
  const manifest = toManifest(
    sources,
    fixtures,
    expected,
    priorityRegistry,
    profileRegistry,
    typedRegistry,
    actionSchemaRegistry,
    observationSchemaRegistry,
    reviewRegistry,
  );
  return { sources, fixtures, expected, manifest };
}

async function readTypedRegistry(sources) {
  const bytes = await readFile(`${root}${catalogTypedCasePath}`);
  const document = JSON.parse(bytes);
  assert(document.$schema === 'patch-map-typed-case-contracts/1', 'typed case registry schema');
  const byId = new Map();
  for (const record of document.cases) {
    assert(!byId.has(record.id), `duplicate typed case ${record.id}`);
    byId.set(record.id, record);
  }
  assert(byId.size === sources.length && sources.every((source) => byId.has(source.id)), 'typed registry exact catalog set');
  return { document, byId, sha256: sha256(bytes) };
}

async function readActionSchemaRegistry() {
  const bytes = await readFile(`${root}${catalogActionSchemaPath}`);
  const document = JSON.parse(bytes);
  assert(document.$schema === 'patch-map-catalog-action-contract/1', 'independent action contract schema');
  return { document, sha256: sha256(bytes) };
}

async function readObservationSchemaRegistry() {
  const bytes = await readFile(`${root}${catalogObservationSchemaPath}`);
  const document = JSON.parse(bytes);
  assert(document.$schema === 'patch-map-catalog-observation-contract/1', 'independent observation contract schema');
  return { document, sha256: sha256(bytes) };
}

function operandShape(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array<${[...new Set(value.map(operandShape))].sort().join('|') || 'empty'}>`;
  if (typeof value !== 'object') return typeof value;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${operandShape(value[key])}`).join(',')}}`;
}

export function validateActionContract(cases, contract) {
  assert(contract.owner === 'analysis-owner', 'action contract owner');
  assert(
    serialized(Object.keys(contract.targetReferences).sort()) === serialized(['byOpcode', 'pathSyntax', 'resolution']),
    'exact target reference contract fields',
  );
  assert(isPlainObject(contract.targetReferences.byOpcode), 'target reference opcode registry');
  assert(
    serialized(Object.keys(contract.fixtureReferences).sort()) === serialized(['datasets', 'generators', 'resolution']),
    'exact fixture reference contract fields',
  );
  for (const kind of ['datasets', 'generators']) {
    const reference = contract.fixtureReferences[kind];
    assert(
      serialized(Object.keys(reference).sort()) === serialized(['collectionKeys', 'scalarKeys']),
      `${kind} exact reference key fields`,
    );
    assert(Array.isArray(reference.scalarKeys) && new Set(reference.scalarKeys).size === reference.scalarKeys.length, `${kind} scalar reference keys`);
    assert(Array.isArray(reference.collectionKeys) && new Set(reference.collectionKeys).size === reference.collectionKeys.length, `${kind} collection reference keys`);
  }
  const definitions = new Map();
  const handlers = new Set();
  for (const definition of contract.definitions) {
    assert(
      serialized(Object.keys(definition).sort()) === serialized(['binding', 'handlerId', 'lifecycleEffect', 'operandShapes', 'output', 'type']),
      `${definition.type} exact action definition fields`,
    );
    assert(!definitions.has(definition.type), `duplicate action contract ${definition.type}`);
    assert(/^[a-z][A-Za-z0-9]*(?:-[a-z0-9]+)*$/.test(definition.type), `action contract type ${definition.type}`);
    assert(definition.handlerId === `contract/${definition.type}`, `${definition.type} handler ID`);
    assert(!handlers.has(definition.handlerId), `${definition.type} duplicate handler ID`);
    assert(Array.isArray(definition.operandShapes) && definition.operandShapes.length > 0, `${definition.type} operand shapes`);
    assert(new Set(definition.operandShapes).size === definition.operandShapes.length, `${definition.type} unique operand shapes`);
    assert(
      serialized(Object.keys(definition.binding).sort()) === serialized(['capturePaths', 'consumesFields', 'producesFields', 'staleUseRequires']),
      `${definition.type} exact binding metadata`,
    );
    assert(Array.isArray(definition.binding.producesFields), `${definition.type} binding producers`);
    assert(Array.isArray(definition.binding.consumesFields), `${definition.type} binding consumers`);
    assert(Array.isArray(definition.binding.capturePaths), `${definition.type} binding capture paths`);
    assert(
      serialized(definition.binding.staleUseRequires) === serialized(['allowStale=true', 'expectedCode=STALE_TARGET']),
      `${definition.type} stale binding contract`,
    );
    assert(['same-generation', 'new-generation'].includes(definition.lifecycleEffect), `${definition.type} lifecycle effect`);
    assert(
      serialized(definition.output) === serialized({
        schema: 'patch-map-semantic-observation-delta/1',
        checkpointPolicy: 'action-index-and-declared-binding',
      }),
      `${definition.type} exact output metadata`,
    );
    handlers.add(definition.handlerId);
    definitions.set(definition.type, definition);
  }
  for (const [opcode, reference] of Object.entries(contract.targetReferences.byOpcode)) {
    assert(definitions.has(opcode), `target reference opcode ${opcode}`);
    assert(
      serialized(Object.keys(reference).sort()) === serialized(['consumedPaths', 'producedPaths', 'removedPaths']),
      `${opcode} exact target reference fields`,
    );
    for (const kind of ['consumedPaths', 'producedPaths', 'removedPaths']) {
      assert(Array.isArray(reference[kind]), `${opcode} ${kind}`);
      assert(new Set(reference[kind]).size === reference[kind].length, `${opcode} unique ${kind}`);
      for (const path of reference[kind]) {
        assert(
          typeof path === 'string' && (path === '$' || /^(?:[A-Za-z][A-Za-z0-9]*)(?:\[\])?(?:\.(?:[A-Za-z][A-Za-z0-9]*)(?:\[\])?)*$/.test(path)),
          `${opcode} canonical target path ${path}`,
        );
      }
    }
  }
  assert(
    serialized(Object.keys(contract.datasetTransitions).sort()) === serialized(['byOpcode', 'resolution']),
    'exact dataset transition contract fields',
  );
  assert(isPlainObject(contract.datasetTransitions.byOpcode), 'dataset transition opcode registry');
  for (const [opcode, transition] of Object.entries(contract.datasetTransitions.byOpcode)) {
    assert(definitions.has(opcode), `dataset transition opcode ${opcode}`);
    assert(
      serialized(Object.keys(transition).sort()) === serialized(['datasetPaths', 'mode']),
      `${opcode} exact dataset transition fields`,
    );
    assert(transition.mode === 'replace', `${opcode} dataset transition mode`);
    assert(Array.isArray(transition.datasetPaths) && transition.datasetPaths.length > 0, `${opcode} dataset transition paths`);
    assert(new Set(transition.datasetPaths).size === transition.datasetPaths.length, `${opcode} unique dataset transition paths`);
    for (const path of transition.datasetPaths) {
      assert(/^[A-Za-z][A-Za-z0-9]*$/.test(path), `${opcode} canonical dataset transition path ${path}`);
    }
  }
  const used = new Set();
  const usedBindingFields = new Map();
  for (const record of cases) {
    for (const action of record.actions) {
      assert(/^[a-z][A-Za-z0-9]*(?:-[a-z0-9]+)*$/.test(action.type), `${record.id} action discriminator grammar`);
      assert(isPlainObject(action.operands), `${record.id} action operand object`);
      const definition = definitions.get(action.type);
      assert(definition !== undefined, `${record.id} unknown action ${action.type}`);
      assert(definition.operandShapes.includes(operandShape(action.operands)), `${record.id} ${action.type} operand contract`);
      const fields = usedBindingFields.get(action.type) ?? { produces: new Set(), consumes: new Set() };
      for (const field of ['as', 'bindAs']) if (Object.hasOwn(action.operands, field)) fields.produces.add(field);
      for (const field of ['targetRef', 'binding']) if (Object.hasOwn(action.operands, field)) fields.consumes.add(field);
      usedBindingFields.set(action.type, fields);
      used.add(action.type);
    }
  }
  assert(used.size === definitions.size && [...definitions.keys()].every((type) => used.has(type)), 'action contract has no unused or missing handlers');
  for (const [type, definition] of definitions) {
    const fields = usedBindingFields.get(type);
    assert(serialized([...fields.produces].sort()) === serialized([...definition.binding.producesFields].sort()), `${type} producer metadata parity`);
    assert(serialized([...fields.consumes].sort()) === serialized([...definition.binding.consumesFields].sort()), `${type} consumer metadata parity`);
  }
}

export function validateTypedAssertions(cases, observationContract) {
  const operators = new Set(Object.keys(observationContract.operators));
  assert(observationContract.owner === 'analysis-owner', 'observation contract owner');
  assert([...semanticDomains].every((domain) => Object.hasOwn(observationContract.domains, domain)), 'observation domain contract');
  for (const record of cases) {
    for (const assertion of record.expected.assertions) {
      canonicalDomain(assertion.path);
      assert(operators.has(assertion.operator), `${record.id} assertion operator`);
      const hasValue = Object.hasOwn(assertion, 'value');
      if (['eq', 'orderedEq', 'lte', 'gte', 'contains', 'sameIdentity', 'unchanged'].includes(assertion.operator)) {
        assert(hasValue, `${record.id} ${assertion.operator} operand`);
      }
      if (assertion.operator === 'zero' && hasValue) assert(assertion.value === 0, `${record.id} zero operand`);
      if (assertion.operator === 'finite' && hasValue) assert(assertion.value === true, `${record.id} finite operand`);
      if (assertion.operator === 'noLeak' && hasValue) assert(isZeroBudget(assertion.value), `${record.id} noLeak budget`);
      if (['sameIdentity', 'unchanged'].includes(assertion.operator)) {
        assert(isReference(assertion.value), `${record.id} explicit ${assertion.operator} reference`);
      }
      if (
        typeof assertion.value === 'string' &&
        /^[a-z][\w-]*(?:\.[\w-]+)+$/.test(assertion.value) &&
        assertion.value !== 'pixi.js-v8'
      ) assert(false, `${record.id} symbolic observation must use $ref`);
      const operandKind = assertionOperandKind(assertion);
      assert(
        observationContract.operators[assertion.operator].operandKinds.includes(operandKind),
        `${record.id} ${assertion.operator} operand kind ${operandKind}`,
      );
      validateReferences(assertion.value, record.id);
    }
  }
}

function assertionOperandKind(assertion) {
  if (!Object.hasOwn(assertion, 'value')) return 'absent';
  if (isReference(assertion.value)) return 'reference';
  if (assertion.value === null) return 'null';
  if (assertion.value === true && assertion.operator === 'finite') return 'boolean-true';
  if (assertion.value === 0 && assertion.operator === 'zero') return 'number-zero';
  if (assertion.operator === 'noLeak' && isZeroBudget(assertion.value)) return 'recursive-zero-budget';
  if (Array.isArray(assertion.value)) return 'array';
  if (isPlainObject(assertion.value)) return 'object';
  return typeof assertion.value;
}

function isZeroBudget(value) {
  if (value === 0) return true;
  if (!isPlainObject(value)) return false;
  return Object.values(value).every(isZeroBudget);
}

function validateReferences(value, id) {
  if (Array.isArray(value)) return value.forEach((entry) => validateReferences(entry, id));
  if (!isPlainObject(value)) return;
  if (Object.hasOwn(value, '$ref')) {
    assert(Object.keys(value).length === 1 && typeof value.$ref === 'string', `${id} reference union`);
    assert(/^\/(?:captures|fixtures|case|provenance|environment|revisions|scene|geometry|text|paint|interaction|events|history|accessibility|outcome|resources)(?:\/(?:[^~/*]|~[01])*)*$/.test(value.$ref), `${id} RFC6901 reference namespace`);
    return;
  }
  for (const nested of Object.values(value)) validateReferences(nested, id);
}

function isReference(value) {
  return isPlainObject(value) && Object.keys(value).length === 1 && typeof value.$ref === 'string';
}

async function readProfileRegistry() {
  const bytes = await readFile(`${root}${catalogProfilePath}`);
  const document = JSON.parse(bytes);
  assert(document.$schema === 'patch-map-catalog-fixture-profiles/1', 'fixture profile registry schema');
  return { document, sha256: sha256(bytes) };
}

export function validateExecutionBindings(typedDocument, profileDocument, actionContract) {
  const datasetIds = new Set(Object.keys(profileDocument.datasets));
  const generatorIds = new Set(Object.keys(profileDocument.generators));
  const actionDefinitions = new Map(actionContract.definitions.map((definition) => [definition.type, definition]));
  const relationEndpoints = [];
  const entitiesByDataset = new Map();
  const componentsByDataset = new Map();
  for (const [datasetId, dataset] of Object.entries(profileDocument.datasets)) {
    const entityIds = new Set();
    const componentRefs = new Set();
    indexDataset(dataset, datasetId, entityIds, componentRefs, relationEndpoints);
    entitiesByDataset.set(datasetId, entityIds);
    componentsByDataset.set(datasetId, componentRefs);
  }
  for (const { datasetId, relationId, endpointId } of relationEndpoints) {
    assert(entitiesByDataset.get(datasetId).has(endpointId), `${datasetId} relation ${relationId} endpoint ${endpointId}`);
  }
  for (const [profileId, profile] of Object.entries(profileDocument.profiles)) {
    validateResourceReferences(`profile ${profileId}`, profile, actionContract.fixtureReferences, datasetIds, generatorIds);
  }

  for (const record of typedDocument.cases) {
    const producedBindings = new Map();
    const initialDatasetIds = new Set();
    const referencedDatasetIds = new Set();
    let lifecycleGeneration = 0;
    for (const profileId of record.fixture.profiles) {
      const datasetRef = profileDocument.profiles[profileId]?.datasetRef;
      if (typeof datasetRef === 'string') {
        initialDatasetIds.add(datasetRef);
        referencedDatasetIds.add(datasetRef);
      }
    }
    validateResourceReferences(
      record.id,
      record,
      actionContract.fixtureReferences,
      datasetIds,
      generatorIds,
      referencedDatasetIds,
    );
    visit(record, (key, value) => {
      if (key === 'valueRef' && typeof value === 'string') assert(Object.hasOwn(record.fixture.params, value), `${record.id} valueRef ${value}`);
    });
    const validEntities = new Set([
      ...record.fixture.params.declaredTargetIds ?? [],
      ...[...initialDatasetIds].flatMap((datasetId) => [...entitiesByDataset.get(datasetId) ?? []]),
    ]);
    const validComponents = new Set(
      [...initialDatasetIds].flatMap((datasetId) => [...componentsByDataset.get(datasetId) ?? []]),
    );
    const inlineEntities = new Set();
    const inlineComponents = new Set();
    const inlineRelations = [];
    for (const [label, dataset] of [
      ['fixture.params.dataset', record.fixture.params.dataset],
      ['hostEngineSeam.hostSupplies.dataset', record.hostEngineSeam?.hostSupplies?.dataset],
    ]) {
      if (!Array.isArray(dataset)) continue;
      indexDataset(dataset, `${record.id}:${label}`, inlineEntities, inlineComponents, inlineRelations);
    }
    for (const endpoint of inlineRelations) {
      assert(inlineEntities.has(endpoint.endpointId), `${record.id} inline relation ${endpoint.relationId} endpoint ${endpoint.endpointId}`);
    }
    for (const id of inlineEntities) validEntities.add(id);
    for (const id of inlineComponents) validComponents.add(id);
    const allowedMissingTargets = new Set(record.fixture.params.allowedMissingTargetIds ?? []);
    visit(record, (key, value, owner) => {
      if (key !== 'id' || typeof value !== 'string' || typeof owner.ownerId !== 'string') return;
      const componentRef = `${owner.ownerId}/${value}`;
      assert(
        inlineComponents.has(componentRef) || [...referencedDatasetIds].some((datasetId) => componentsByDataset.get(datasetId)?.has(componentRef)),
        `${record.id} component ${componentRef} in bound dataset`,
      );
    });
    validateFixtureReferences(record);
    let failureProbeCount = 0;
    for (const [actionIndex, action] of record.actions.entries()) {
      const definition = actionDefinitions.get(action.type);
      assert(definition !== undefined, `${record.id} action definition ${action.type}`);
      validateTargetReferences(
        record.id,
        actionIndex,
        action,
        actionContract.targetReferences,
        validEntities,
        validComponents,
        allowedMissingTargets,
      );
      applyDatasetTransition(
        record.id,
        actionIndex,
        action,
        actionContract.datasetTransitions,
        datasetIds,
        entitiesByDataset,
        componentsByDataset,
        validEntities,
        validComponents,
      );
      if (definition.lifecycleEffect === 'new-generation') lifecycleGeneration += 1;

      const consumed = [];
      const produced = [];
      visit(action.operands, (key, value) => {
        if ((key === 'targetRef' || key === 'binding') && typeof value === 'string') consumed.push(value);
        if ((key === 'as' || key === 'bindAs') && typeof value === 'string') produced.push(value);
      });
      for (const binding of consumed) {
        const bindingRecord = producedBindings.get(binding);
        assert(bindingRecord !== undefined, `${record.id} action ${actionIndex} forward or missing binding ${binding}`);
        if (bindingRecord.generation !== lifecycleGeneration) {
          assert(action.operands.allowStale === true, `${record.id} action ${actionIndex} stale binding ${binding} acknowledgement`);
          assert(action.operands.expectedCode === 'STALE_TARGET', `${record.id} action ${actionIndex} stale binding ${binding} diagnostic`);
        }
      }
      for (const binding of produced) {
        assert(!producedBindings.has(binding), `${record.id} duplicate binding ${binding}`);
        producedBindings.set(binding, { generation: lifecycleGeneration, action, definition });
      }
      if (action.type === 'probe-declared-failure') {
        failureProbeCount += 1;
        assert(record.id.startsWith('CSM-'), `${record.id} failure probe scope`);
        assert(action.operands.journeyId === record.id, `${record.id} failure probe identity`);
        assert(
          serialized(action.operands.expectedRollback) === serialized(record.hostEngineSeam.failureRollback),
          `${record.id} failure probe rollback binding`,
        );
      }
    }
    if (record.id.startsWith('CSM-')) assert(failureProbeCount === 1, `${record.id} exact failure probe`);
    validateCaptureReferences(record, producedBindings);
  }
}

function validateCaptureReferences(record, producedBindings) {
  const checkpoints = new Map();
  for (const checkpoint of record.fixture.captureCheckpoints ?? []) {
    assert(!checkpoints.has(checkpoint.id), `${record.id} duplicate capture checkpoint ${checkpoint.id}`);
    assert(['before-actions', 'after-action'].includes(checkpoint.phase), `${record.id} capture phase ${checkpoint.id}`);
    assert(Number.isInteger(checkpoint.afterActionIndex), `${record.id} capture index ${checkpoint.id}`);
    assert(checkpoint.afterActionIndex >= -1 && checkpoint.afterActionIndex < record.actions.length, `${record.id} capture range ${checkpoint.id}`);
    assert((checkpoint.phase === 'before-actions') === (checkpoint.afterActionIndex === -1), `${record.id} capture phase/index ${checkpoint.id}`);
    assert(Array.isArray(checkpoint.paths) && checkpoint.paths.length > 0, `${record.id} capture paths ${checkpoint.id}`);
    assert(new Set(checkpoint.paths).size === checkpoint.paths.length, `${record.id} unique capture paths ${checkpoint.id}`);
    if (checkpoint.expected !== undefined) {
      assert(isPlainObject(checkpoint.expected), `${record.id} capture expected object ${checkpoint.id}`);
      assert(
        serialized(Object.keys(checkpoint.expected).sort()) === serialized([...checkpoint.paths].sort()),
        `${record.id} capture expected path parity ${checkpoint.id}`,
      );
      for (const [capturePath, expectedValue] of Object.entries(checkpoint.expected)) {
        const [domain, ...segments] = capturePath.split('/');
        assert(semanticDomains.has(domain) && segments.length > 0, `${record.id} canonical capture path ${checkpoint.id}/${capturePath}`);
        const assertionPath = `/${domain}/${checkpoint.id}/${segments.join('/')}`;
        const assertion = record.expected.assertions.find((entry) => normalizeAssertionPath(entry.path) === assertionPath);
        assert(assertion !== undefined, `${record.id} capture assertion ${assertionPath}`);
        assert(assertion.operator === (Array.isArray(expectedValue) ? 'orderedEq' : 'eq'), `${record.id} capture assertion operator ${assertionPath}`);
        assert(serialized(assertion.value) === serialized(expectedValue), `${record.id} capture assertion value ${assertionPath}`);
      }
    }
    checkpoints.set(checkpoint.id, new Set(checkpoint.paths));
  }

  const referencedCheckpoints = new Set();
  for (const checkpoint of record.fixture.captureCheckpoints ?? []) {
    if (checkpoint.expected !== undefined) referencedCheckpoints.add(checkpoint.id);
  }
  visit(record.expected, (key, value) => {
    if (key !== '$ref' || typeof value !== 'string' || !value.startsWith('/captures/')) return;
    const [, , checkpointId, ...pathSegments] = value.split('/');
    const capturePath = pathSegments.map(decodePointerSegment).join('/');
    const binding = producedBindings.get(checkpointId);
    if (binding !== undefined) {
      const declared = binding.definition.binding.capturePaths.includes('$operands.paths')
        ? binding.action.operands.paths
        : binding.definition.binding.capturePaths;
      assert(declared.includes(capturePath), `${record.id} binding capture path ${value}`);
      return;
    }
    const paths = checkpoints.get(checkpointId);
    assert(paths?.has(capturePath), `${record.id} undeclared capture reference ${value}`);
    referencedCheckpoints.add(checkpointId);
  });
  assert(referencedCheckpoints.size === checkpoints.size, `${record.id} no unused capture checkpoints`);
}

function validateResourceReferences(
  label,
  value,
  contract,
  datasetIds,
  generatorIds,
  boundDatasetIds = new Set(),
) {
  validateKind(contract.datasets, datasetIds, 'dataset', true);
  validateKind(contract.generators, generatorIds, 'generator', false);

  function validateKind(reference, validIds, kind, bindDataset) {
    const scalarKeys = new Set(reference.scalarKeys);
    const collectionKeys = new Set(reference.collectionKeys);
    visit(value, (key, nested) => {
      if (scalarKeys.has(key) && typeof nested === 'string') validate(nested, key);
      if (collectionKeys.has(key) && Array.isArray(nested)) {
        for (const entry of nested) {
          assert(typeof entry === 'string', `${label} ${key} string ${kind} reference`);
          validate(entry, key);
        }
      }
    });
    function validate(id, key) {
      assert(validIds.has(id), `${label} unresolved ${key} ${kind} ${id}`);
      if (bindDataset) boundDatasetIds.add(id);
    }
  }
}

function validateTargetReferences(
  recordId,
  actionIndex,
  action,
  targetContract,
  validEntities,
  validComponents,
  allowedMissingTargets,
) {
  const reference = targetContract.byOpcode[action.type];
  if (reference === undefined) return;
  const consumed = reference.consumedPaths.flatMap((path) => targetValuesAtPath(action.operands, path, recordId, actionIndex));
  const removed = reference.removedPaths.flatMap((path) => targetValuesAtPath(action.operands, path, recordId, actionIndex));
  const produced = reference.producedPaths.flatMap((path) => targetValuesAtPath(action.operands, path, recordId, actionIndex));

  for (const entry of consumed) {
    if (entry.value !== null) validateTarget(entry.value, entry.path);
  }
  for (const entry of removed) removeTarget(entry.value, entry.path);
  for (const entry of produced) produceTarget(entry.value, entry.path);

  function validateTarget(value, key) {
    const { component, normalized } = normalizeTarget(value, key);
    const resolved = component ? validComponents.has(normalized) : validEntities.has(normalized) || validComponents.has(normalized);
    assert(
      resolved || allowedMissingTargets.has(normalized),
      `${recordId} action ${actionIndex} unresolved ${key} target ${value}`,
    );
  }

  function removeTarget(value, key) {
    const { component, normalized } = normalizeTarget(value, key);
    validateTarget(value, key);
    if (component) validComponents.delete(normalized);
    else validEntities.delete(normalized);
  }

  function produceTarget(value, key) {
    const { component, normalized } = normalizeTarget(value, key);
    assert(!allowedMissingTargets.has(normalized), `${recordId} action ${actionIndex} cannot produce allowed-missing ${key} target ${normalized}`);
    if (component) validComponents.add(normalized);
    else validEntities.add(normalized);
  }

  function normalizeTarget(value, key) {
    if (typeof value === 'string') {
      const component = value.startsWith('component:');
      const normalized = value.replace(/^element:/, '').replace(/^component:/, '');
      assert(normalized.length > 0, `${recordId} action ${actionIndex} empty ${key} target`);
      return { component, normalized };
    }
    assert(isPlainObject(value), `${recordId} action ${actionIndex} ${key} target descriptor`);
    if (typeof value.ownerId === 'string' && typeof value.componentId === 'string') {
      return { component: true, normalized: `${value.ownerId}/${value.componentId}` };
    }
    if (typeof value.targetId === 'string' && typeof value.componentId === 'string') {
      return { component: true, normalized: `${value.targetId}/${value.componentId}` };
    }
    assert(typeof value.id === 'string' && value.id.length > 0, `${recordId} action ${actionIndex} ${key} target descriptor ID`);
    if (typeof value.ownerId === 'string') return { component: true, normalized: `${value.ownerId}/${value.id}` };
    return { component: false, normalized: value.id };
  }
}

function applyDatasetTransition(
  recordId,
  actionIndex,
  action,
  transitionContract,
  datasetIds,
  entitiesByDataset,
  componentsByDataset,
  validEntities,
  validComponents,
) {
  const transition = transitionContract.byOpcode[action.type];
  if (transition === undefined) return;
  const values = transition.datasetPaths.flatMap((path) =>
    targetValuesAtPath(action.operands, path, recordId, actionIndex).map((entry) => entry.value),
  );
  if (values.length === 0) return;
  assert(values.length === 1 && typeof values[0] === 'string', `${recordId} action ${actionIndex} exact dataset transition`);
  const datasetId = values[0];
  assert(datasetIds.has(datasetId), `${recordId} action ${actionIndex} unresolved transition dataset ${datasetId}`);
  validEntities.clear();
  validComponents.clear();
  for (const id of entitiesByDataset.get(datasetId) ?? []) validEntities.add(id);
  for (const id of componentsByDataset.get(datasetId) ?? []) validComponents.add(id);
}

function targetValuesAtPath(operands, path, recordId, actionIndex) {
  if (path === '$') return [{ value: operands, path: '$operands' }];
  let values = [{ value: operands, path: '$operands' }];
  for (const rawSegment of path.split('.')) {
    const expandsArray = rawSegment.endsWith('[]');
    const key = expandsArray ? rawSegment.slice(0, -2) : rawSegment;
    const next = [];
    for (const entry of values) {
      if (!isPlainObject(entry.value) || !Object.hasOwn(entry.value, key)) continue;
      const nested = entry.value[key];
      const nestedPath = `${entry.path}.${key}`;
      if (expandsArray) {
        assert(Array.isArray(nested), `${recordId} action ${actionIndex} target path ${nestedPath} array`);
        nested.forEach((value, index) => next.push({ value, path: `${nestedPath}[${index}]` }));
      } else {
        next.push({ value: nested, path: nestedPath });
      }
    }
    values = next;
  }
  return values;
}

function validateFixtureReferences(record) {
  visit(record, (key, value) => {
    if (key !== '$ref' || typeof value !== 'string') return;
    const match = value.match(/^\/(fixtures|case\/params)\/([^/]+)/);
    if (!match) return;
    const parameterName = decodePointerSegment(match[2]);
    assert(Object.hasOwn(record.fixture.params, parameterName), `${record.id} unresolved fixture reference ${value}`);
  });
}

function decodePointerSegment(value) {
  return value.replaceAll('~1', '/').replaceAll('~0', '~');
}

function indexDataset(dataset, datasetId, entityIds, componentRefs, relationEndpoints) {
  if (!Array.isArray(dataset)) return;
  for (const element of dataset) {
    if (!isPlainObject(element)) continue;
    if (typeof element.id === 'string') {
      assert(!entityIds.has(element.id), `${datasetId} duplicate entity ID ${element.id}`);
      entityIds.add(element.id);
    }
    if (Array.isArray(element.components)) {
      for (const component of element.components) {
        if (typeof component.id === 'string') {
          const ref = `${element.id}/${component.id}`;
          assert(!componentRefs.has(ref), `${datasetId} duplicate component ${ref}`);
          componentRefs.add(ref);
        }
      }
    }
    if (Array.isArray(element.children)) indexDataset(element.children, datasetId, entityIds, componentRefs, relationEndpoints);
    if (element.type === 'grid' && Array.isArray(element.cells)) {
      element.cells.forEach((row, rowIndex) => row.forEach((cell, columnIndex) => {
        if (cell !== 0) entityIds.add(`${element.id}.${rowIndex}.${columnIndex}`);
      }));
    }
    if (element.type === 'relations' && Array.isArray(element.links)) {
      for (const link of element.links) {
        relationEndpoints.push({ datasetId, relationId: element.id, endpointId: link.source });
        relationEndpoints.push({ datasetId, relationId: element.id, endpointId: link.target });
      }
    }
  }
}

function visit(value, callback) {
  if (Array.isArray(value)) return value.forEach((entry) => visit(entry, callback));
  if (!isPlainObject(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    callback(key, nested, value);
    visit(nested, callback);
  }
}

async function readReviewRegistry() {
  try {
    const bytes = await readFile(`${root}${catalogReviewPath}`);
    const document = JSON.parse(bytes);
    assert(document.$schema === 'patch-map-catalog-review-registry/1', 'review registry schema');
    assert(Array.isArray(document.reviewEvidence) && document.reviewEvidence.length === 3, 'three independent review evidence records');
    assert(
      serialized(document.reviewEvidence.map((entry) => entry.domain).sort()) ===
        serialized(['data-rendering', 'interaction-history', 'release-dsl']),
      'exact independent review evidence domains',
    );
    for (const entry of document.reviewEvidence) {
      assert(
        serialized(Object.keys(entry).sort()) === serialized(['domain', 'reportPath', 'sha256']),
        `${entry.domain} exact review evidence fields`,
      );
      assert(entry.reportPath === `evidence/reviews/catalog-review-${entry.domain}.md`, `${entry.domain} stable review evidence path`);
      const reportBytes = await readFile(`${root}${contractRoot}${entry.reportPath}`);
      assert(sha256(reportBytes) === entry.sha256, `${entry.domain} review evidence digest`);
      assert(/^Verdict:\s*PASS\s*$/m.test(reportBytes.toString('utf8')), `${entry.domain} review evidence PASS verdict`);
    }
    return { document, sha256: sha256(bytes), byId: new Map(document.reviews.map((record) => [record.id, record])) };
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return { document: null, sha256: null, byId: new Map() };
  }
}

async function buildSharedProfiles(profiles) {
  assert(
    Object.keys(profiles).length === Object.keys(sharedProfileSources).length &&
      Object.keys(profiles).every((id) => sharedProfileSources[id] !== undefined),
    'every fixture profile has one declared source binding',
  );
  const result = {};
  for (const [id, paths] of Object.entries(sharedProfileSources)) {
    const profile = profiles[id];
    assert(profile !== undefined, `missing source-bound profile ${id}`);
    const bound = {
      ...profile,
      actionIndexStartsAt: 0,
      sourceRefs: await Promise.all(paths.map(async (path) => ({
        path,
        sha256: sha256(await readFile(`${root}${contractRoot}${path}`)),
      }))),
    };
    result[id] = { sha256: canonicalSha256(bound), ...bound };
  }
  return result;
}

async function readCapabilitySources(priorityRegistry) {
  const absoluteRoot = `${root}${scenarioRoot}`;
  const files = (await readdir(absoluteRoot)).filter((name) => name.endsWith('.md')).sort();
  const result = [];
  for (const file of files) {
    const sourcePath = `scenarios/${file}`;
    const text = await readFile(`${absoluteRoot}${file}`, 'utf8');
    const sections = text.split(/^## /m).slice(1);
    for (const section of sections) {
      const heading = section.match(/^([A-Z]{3}-\d{3}) — ([^\n]+)/);
      if (!heading) continue;
      const fields = parseBoldFields(section);
      const lab = routeFor(heading[1]);
      assert(fields.Lab, `${heading[1]} Lab instruction`);
      const fixtureProfiles = profilesFor([heading[1]]);
      const setupClauses = selectClauses(fields, setupFields);
      if (setupClauses.length === 0) setupClauses.push(`Use the canonical ${fixtureProfiles.join(', ')} fixture profile.`);
      const actionClauses = selectClauses(fields, actionFields);
      const expectedClauses = selectClauses(fields, expectedFields);
      assert(setupClauses.length > 0, `${heading[1]} setup clauses`);
      assert(actionClauses.length > 0, `${heading[1]} action clauses`);
      assert(expectedClauses.length > 0, `${heading[1]} expected clauses`);
      assert(priorityRegistry.has(heading[1]), `${heading[1]} priority registry entry`);
      if (fields.Priority !== undefined) assert(priorityRegistry.get(heading[1]) === fields.Priority, `${heading[1]} explicit priority parity`);
      result.push({
        id: heading[1],
        caseType: 'capability',
        title: normalizeText(heading[2]),
        sourcePath,
        sourceDigest: canonicalSha256({ heading: heading[0], fields }),
        priority: priorityRegistry.get(heading[1]),
        lab,
        labInstruction: fields.Lab,
        setupClauses,
        actionClauses,
        expectedClauses,
        capabilities: [heading[1]],
        observationDomains: domainsFor([heading[1]]),
        fixtureProfiles,
      });
    }
  }
  assert(result.length === priorityRegistry.size, 'priority registry exact capability set');
  return result;
}

async function readPriorityRegistry() {
  const bytes = await readFile(`${root}${priorityPath}`);
  const document = JSON.parse(bytes);
  assert(document.$schema === 'patch-map-catalog-priorities/1', 'priority registry schema');
  const result = new Map();
  for (const priority of ['P0', 'P1', 'P2']) {
    assert(Array.isArray(document.priorities[priority]), `${priority} priority array`);
    for (const id of document.priorities[priority]) {
      assert(!result.has(id), `duplicate priority ${id}`);
      result.set(id, priority);
    }
  }
  return { byId: result, bytes };
}

async function readJourneySources() {
  const text = await readFile(`${root}${journeyPath}`, 'utf8');
  let section = 'Uncategorized';
  const result = [];
  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^## (.+)$/);
    if (heading && !['Host Boundary'].includes(heading[1])) section = heading[1];
    const cells = parseTableCells(line);
    if (cells.length !== 4 || !/^CSM-\d{3}$/.test(cells[0])) continue;
    const capabilities = expandCapabilityRefs(cells[2]);
    const lab = routeFor(cells[0]);
    assert(capabilities.length > 0, `${cells[0]} capabilities`);
    assert(lab, `${cells[0]} Lab route`);
    result.push({
      id: cells[0],
      caseType: 'consumer-journey',
      title: normalizeText(cells[1]),
      sourcePath: 'consumer-journeys.md',
      sourceDigest: canonicalSha256({ section, row: cells }),
      priority: 'P0',
      lab,
      labInstruction: cells[3],
      setupClauses: [
        `Host presents the ${section} journey through the approved adapter.`,
        `Host supplies the dataset, stable IDs, predicates, companion state, and policy required by: ${normalizeText(cells[1])}`,
      ],
      actionClauses: [normalizeText(cells[1])],
      expectedClauses: [
        normalizeText(cells[1]),
        'Core-owned state and host-owned companion state publish one coherent semantic outcome or roll back together.',
        'The final observation records canonical export, selected IDs, interaction mode, revisions, classified diagnostics, and resource counts.',
      ],
      capabilities,
      observationDomains: domainsFor(capabilities),
      fixtureProfiles: [...new Set(['packed-host-seam', ...profilesFor(capabilities)])],
      consumerSection: section,
    });
  }
  return result;
}

function toFixture(source, typed, sharedProfiles) {
  assert(typed.id === source.id, `${source.id} typed identity`);
  assert(Array.isArray(typed.fixture?.profiles) && typed.fixture.profiles.length > 0, `${source.id} concrete profiles`);
  assert(typed.fixture.profiles.every((id) => sharedProfiles[id] !== undefined), `${source.id} known profiles`);
  assert(Array.isArray(typed.actions) && typed.actions.length > 0, `${source.id} typed actions`);
  assert(typed.actions.every((action) => typeof action.type === 'string' && isPlainObject(action.operands)), `${source.id} typed action operands`);
  assert(Array.isArray(typed.requiredObservationDomains) && typed.requiredObservationDomains.length > 0, `${source.id} typed observation domains`);
  const base = {
    id: source.id,
    caseType: source.caseType,
    title: source.title,
    source: { path: source.sourcePath, sha256: source.sourceDigest },
    priority: source.priority,
    lab: { route: source.lab, instruction: source.labInstruction },
    automationOwner: `patch-map-contract/${source.id}`,
    rootTestId: `scenario-${source.id.toLowerCase()}`,
    fixtureState: 'canonical',
    fixtureProfiles: typed.fixture.profiles.map((id) => ({ id, sha256: sharedProfiles[id].sha256 })),
    setup: { params: typed.fixture.params ?? {} },
    captureCheckpoints: typed.fixture.captureCheckpoints ?? [],
    actionTrace: typed.actions.map((action, index) => ({ index, type: action.type, operands: action.operands })),
    cleanupTrace: [{ type: 'destroy-case', operands: { expectedResourceDelta: 0 } }],
    requiredObservationDomains: [...new Set(typed.requiredObservationDomains.map(canonicalDomain))],
  };
  if (source.caseType === 'consumer-journey') {
    assert(isPlainObject(typed.hostEngineSeam), `${source.id} journey-specific seam`);
    base.hostEngineSeam = typed.hostEngineSeam;
  }
  return base;
}

function toExpected(source, typed) {
  assert(Array.isArray(typed.expected?.assertions) && typed.expected.assertions.length > 0, `${source.id} typed assertions`);
  const observationDomains = [...new Set(typed.requiredObservationDomains.map(canonicalDomain))];
  const assertions = typed.expected.assertions.map((assertion) => ({ ...assertion, path: normalizeAssertionPath(assertion.path) }));
  if (source.caseType === 'consumer-journey') {
    assertions.push(...hostEngineSeamAssertions(typed.hostEngineSeam));
  }
  for (const domain of observationDomains) {
    if (!assertions.some((assertion) => assertion.path === `/${domain}` || assertion.path.startsWith(`/${domain}/`))) {
      assertions.push(domainClosureAssertion(domain, source.id));
    }
  }
  return {
    id: source.id,
    caseType: source.caseType,
    expected: {
      assertions,
      observationDomains,
      semanticObservationRevision: 'patch-map-semantic-observation/1',
      implementationNeutral: true,
    },
    volatileFields: volatileFieldsFor(source),
  };
}

function hostEngineSeamAssertions(seam) {
  const assertions = [];
  for (const section of ['engineReturns', 'failureRollback', 'finalState']) {
    for (const { path, value } of flattenLeaves(seam[section])) {
      assertions.push({
        path: `/outcome/hostEngineSeam/${section}${path}`,
        operator: Array.isArray(value) ? 'orderedEq' : 'eq',
        value,
      });
    }
  }
  return assertions;
}

function flattenLeaves(value, prefix = '') {
  if (Array.isArray(value) || value === null || typeof value !== 'object') return [{ path: prefix, value }];
  const result = [];
  for (const [key, nested] of Object.entries(value)) {
    result.push(...flattenLeaves(nested, `${prefix}/${escapeJsonPointer(key)}`));
  }
  return result;
}

function escapeJsonPointer(value) {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

function domainClosureAssertion(domain, id) {
  const assertions = {
    case: { path: '/case/id', operator: 'eq', value: id },
    provenance: { path: '/provenance/expectedEvidenceBound', operator: 'eq', value: true },
    environment: { path: '/environment/contractProfileBound', operator: 'eq', value: true },
    revisions: { path: '/revisions/valuesFinite', operator: 'eq', value: true },
    scene: { path: '/scene/invalidNodeCount', operator: 'zero' },
    geometry: { path: '/geometry/nonFiniteCount', operator: 'zero' },
    text: { path: '/text/unpairedSurrogates', operator: 'zero' },
    paint: { path: '/paint/unresolvedIntentCount', operator: 'zero' },
    interaction: { path: '/interaction/staleGestureCount', operator: 'zero' },
    events: { path: '/events/unclassifiedCount', operator: 'zero' },
    history: { path: '/history/corruptEntryCount', operator: 'zero' },
    accessibility: { path: '/accessibility/invalidNodeCount', operator: 'zero' },
    outcome: { path: '/outcome/unclassifiedErrorCount', operator: 'zero' },
    resources: { path: '/resources/leakDelta', operator: 'zero' },
  };
  return assertions[domain];
}

function toManifest(
  sources,
  fixtures,
  expected,
  priorityRegistry,
  profileRegistry,
  typedRegistry,
  actionSchemaRegistry,
  observationSchemaRegistry,
  reviewRegistry,
) {
  const fixtureBytes = `${JSON.stringify(fixtures, null, 2)}\n`;
  const expectedBytes = `${JSON.stringify(expected, null, 2)}\n`;
  const cases = fixtures.cases.map((fixture, index) => {
    const normalized = expected.cases[index];
    assert(fixture.id === normalized.id, `${fixture.id} pair identity`);
    const expectedRecordSha256 = canonicalSha256(normalized);
    const review = reviewRegistry.byId.get(fixture.id);
    const approved = review !== undefined &&
      review.fixtureSha256 === canonicalSha256(fixture) &&
      review.expectedRecordSha256 === expectedRecordSha256 &&
      review.profileFileSha256 === profileRegistry.sha256 &&
      review.typedCaseFileSha256 === typedRegistry.sha256 &&
      review.actionSchemaFileSha256 === actionSchemaRegistry.sha256 &&
      review.observationSchemaFileSha256 === observationSchemaRegistry.sha256 &&
      review.contractRevision === fixtures.contractRevision;
    return {
      id: fixture.id,
      caseType: fixture.caseType,
      source: fixture.source,
      capabilities: sources[index].capabilities,
      labRoute: fixture.lab.route,
      fixtureRef: `${fixtures.$schema}#/cases/${index}`,
      expectedRef: `${expected.$schema}#/cases/${index}`,
      fixtureSha256: canonicalSha256(fixture),
      expectedRecordSha256,
      contractReview: {
        status: approved ? 'analysis-owner-contract-approved' : 'analysis-owner-pending-review',
        reviewerRole: approved ? review.reviewerRole : null,
        reviewedAt: approved ? review.reviewedAt : null,
        expectedEvidenceSha256: approved ? expectedRecordSha256 : null,
      },
      execution: { status: 'not-run', actualEvidenceSha256: null },
      executionReview: { status: 'not-reviewed' },
      readinessLevel: 'spec-ready',
      automationStatus: 'not-implemented',
      labStatus: 'specified-not-implemented',
      implementationStatus: 'unassessed',
    };
  });
  const capabilityCount = sources.filter((entry) => entry.caseType === 'capability').length;
  const journeyCount = sources.length - capabilityCount;
  return {
    $schema: 'patch-map-contract-catalog-evidence-manifest/1',
    contractRevision: fixtures.contractRevision,
    observationRevision: fixtures.observationRevision,
    generatedAt: '2026-08-25',
    scope: 'all PatchMap capability scenarios and consumer journeys; contract evidence only',
    sourceCatalog: {
      capabilityRoot: 'scenarios/',
      consumerJourneys: 'consumer-journeys.md',
      capabilityCount,
      consumerJourneyCount: journeyCount,
      totalCount: sources.length,
    },
    priorityFile: { path: 'evidence/catalog-priorities.v1.json', sha256: sha256(priorityRegistry.bytes) },
    profileFile: { path: 'evidence/catalog-fixture-profiles.v1.json', sha256: profileRegistry.sha256 },
    typedCaseFile: { path: 'evidence/catalog-typed-cases.v1.json', sha256: typedRegistry.sha256 },
    actionSchemaFile: { path: 'evidence/catalog-action-schema.v1.json', sha256: actionSchemaRegistry.sha256 },
    observationSchemaFile: { path: 'evidence/catalog-observation-schema.v1.json', sha256: observationSchemaRegistry.sha256 },
    reviewFile: { path: 'evidence/catalog-review-registry.v1.json', sha256: reviewRegistry.sha256 },
    fixtureFile: { path: 'evidence/catalog-fixtures.v1.json', sha256: sha256(fixtureBytes) },
    expectedFile: { path: 'evidence/catalog-normalized-expected.v1.json', sha256: sha256(expectedBytes) },
    reviewSummary: {
      contractApproved: cases.filter((record) => record.contractReview.status === 'analysis-owner-contract-approved').length,
      pendingReview: cases.filter((record) => record.contractReview.status !== 'analysis-owner-contract-approved').length,
      executionStatus: 'not-run',
      readinessLevel: 'spec-ready',
    },
    statusRules: {
      contractReview: 'approves implementation-neutral fixture/action/expected semantics only',
      execution: 'runner result; never inferred from contract review',
      executionReview: 'digest and provenance review of actual evidence',
      implementationStatus: 'must be updated only from package-bound execution evidence',
    },
    cases,
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const semanticDomains = new Set(['case', 'provenance', 'environment', 'revisions', 'scene', 'geometry', 'text', 'paint', 'interaction', 'events', 'history', 'accessibility', 'outcome', 'resources']);
const domainAliases = Object.freeze({
  lifecycle: 'revisions', frame: 'revisions', revision: 'revisions', viewport: 'interaction', selection: 'interaction', transform: 'interaction', gesture: 'interaction',
  hierarchy: 'scene', query: 'scene', dataset: 'scene', input: 'outcome', render: 'paint', renderer: 'resources', dom: 'resources', subscriptions: 'resources', facilities: 'resources',
  diagnostics: 'outcome', result: 'outcome', callback: 'events', callbacks: 'events', animation: 'paint', assets: 'resources', package: 'resources', security: 'outcome', performance: 'outcome',
  bounds: 'geometry', coordinateProbe: 'geometry', textLayout: 'text', fonts: 'text', overflow: 'text', color: 'paint', bar: 'paint', presentation: 'paint',
  hitTest: 'interaction', gestures: 'interaction', modeChange: 'interaction', event: 'events', publication: 'revisions', published: 'revisions',
  cache: 'resources', canvas: 'resources', images: 'resources', postDestroy: 'resources', afterDestroy: 'resources', accessibilityTree: 'accessibility',
  A: 'scene', B: 'scene', accepted: 'outcome', before: 'scene', beforeDestroy: 'resources', after: 'scene', afterAbsolute: 'scene', afterCycles: 'scene', afterKind: 'scene', afterMove: 'scene', afterPatch: 'scene', afterRect: 'scene', afterRedo: 'scene', afterRelative: 'scene', afterResize: 'scene', afterUndo: 'scene', afterUngroup: 'scene',
  aliasConflict: 'outcome', animations: 'paint', at200: 'paint', background: 'paint', backwardTime: 'outcome', builtins: 'paint', cells: 'scene', cleared: 'scene', components: 'scene', currentTarget: 'scene', cycle: 'outcome', dependentGeometry: 'geometry', destroy: 'resources', destroyed: 'resources', duplicateOrderedPair: 'outcome',
  empty: 'outcome', emptyPatch: 'scene', first: 'outcome', 'follow-item': 'geometry', grid: 'scene', headlessRaster: 'paint', hidden: 'scene', hide: 'scene', highlight: 'paint', hostCompanion: 'history', icon: 'paint', initial: 'scene', invalid: 'outcome', invalidCases: 'outcome', invalidCrossScope: 'outcome', item: 'scene', locked: 'scene', malformed: 'outcome', matrix: 'outcome',
  overflowText: 'text', 'overflow-text': 'text', permissiveMissing: 'scene', permissiveMixed: 'scene', persisted: 'scene', placements: 'geometry', rect: 'scene', refresh: 'scene', relations: 'scene', removed: 'scene', replacement: 'scene', requiredFailure: 'outcome', resume: 'outcome', retarget: 'outcome', returnState: 'outcome', reversePair: 'outcome', rotated: 'geometry',
  schedule0: 'paint', schedule1: 'paint', selfLink: 'outcome', semantic: 'outcome', session1: 'outcome', sessions: 'outcome', settledEvents: 'events', shown: 'scene', stalePatch: 'outcome', staleTarget: 'outcome', strictMixed: 'scene', superseded: 'outcome', target: 'scene', texts: 'text', transparentInteractive: 'scene', 'transparent-interactive': 'scene', upright: 'text', valid: 'outcome', validation: 'outcome', zeroSize: 'geometry', 'zero-size': 'geometry',
});

function canonicalDomain(value) {
  const normalized = value.replace(/^\//, '').split(/[/.]/)[0];
  const resolved = semanticDomains.has(normalized) ? normalized : domainAliases[normalized];
  assert(resolved !== undefined, `unknown semantic observation root ${normalized}`);
  return resolved;
}

function normalizeAssertionPath(path) {
  assert(typeof path === 'string' && path.length > 0, 'assertion path string');
  const segments = path.replace(/^\//, '').split(/[/.]/).filter(Boolean);
  const original = segments.shift();
  const domain = canonicalDomain(original);
  if (domain !== original) segments.unshift(original);
  return `/${[domain, ...segments].join('/')}`;
}

function parseBoldFields(section) {
  const fields = {};
  let active = null;
  for (const rawLine of section.split(/\r?\n/).slice(1)) {
    const field = rawLine.match(/^- \*\*([^:*]+):\*\*\s*(.*)$/);
    if (field) {
      active = field[1];
      assert(fields[active] === undefined, `duplicate field ${active}`);
      fields[active] = normalizeText(field[2]);
      continue;
    }
    if (active && /^\s{2,}\S/.test(rawLine)) fields[active] = normalizeText(`${fields[active]} ${rawLine.trim()}`);
    else if (rawLine.trim() === '') active = null;
  }
  return fields;
}

function selectClauses(fields, names) {
  return Object.entries(fields).filter(([name]) => names.has(name)).map(([, value]) => value).filter(Boolean);
}

function parseTableCells(line) {
  if (!line.startsWith('|')) return [];
  return line.slice(1, -1).split('|').map((value) => value.trim());
}

function expandCapabilityRefs(value) {
  const result = [];
  const pattern = /([A-Z]{3})-(\d{3})(?:[–-](\d{3}))?((?:\/\d{3})*)/g;
  for (const match of value.matchAll(pattern)) {
    const prefix = match[1];
    const start = Number(match[2]);
    const end = match[3] ? Number(match[3]) : start;
    for (let current = start; current <= end; current += 1) result.push(`${prefix}-${String(current).padStart(3, '0')}`);
    for (const suffix of match[4].split('/').filter(Boolean)) result.push(`${prefix}-${suffix}`);
  }
  return [...new Set(result)];
}

function domainsFor(capabilities) {
  return [...new Set(capabilities.flatMap((id) => observationDomainsByPrefix[id.slice(0, 3)] ?? ['outcome']))];
}

function profilesFor(capabilities) {
  return [...new Set(capabilities.flatMap((id) => fixtureProfilesByPrefix[id.slice(0, 3)] ?? ['contract-defined-fixture']))];
}

function volatileFieldsFor(source) {
  const result = ['provenance.codeCommit', 'provenance.packedPackageSha256', 'environment.browserVersion'];
  if (source.id.startsWith('PRF-') || source.capabilities.some((id) => id.startsWith('PRF-'))) {
    result.push('environment.runtimeResourceIds', 'outcome.rawTimingSamples');
  }
  return result;
}

function routeFor(id) {
  return `/lab/patch-map?scenario=${id}&size=<SIZE>&seed=<SEED>`;
}

function normalizeText(value = '') {
  return value.replace(/\s+/g, ' ').trim();
}

export function canonicalSha256(value) {
  return sha256(JSON.stringify(sortKeys(value)));
}

export function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function serialized(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function assert(condition, message) {
  if (!condition) throw new Error(`PatchMap catalog extraction failed: ${message}`);
}
