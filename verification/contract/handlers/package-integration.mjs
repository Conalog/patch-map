import { cloneOptional as clone, deepFreeze, createTypeSuffixValueAtoms } from '../value-atoms.mjs';

const { recordValue } = createTypeSuffixValueAtoms(assert);

export const PACKAGE_INTEGRATION_HANDLER_REVISION =
  'patch-map-package-integration-handlers/1';

export const PACKAGE_INTEGRATION_CASE_IDS = Object.freeze([
  'PKG-001',
  'PKG-002',
  'PKG-003',
  'PKG-004',
  'PKG-005',
]);

export const PACKAGE_INTEGRATION_ACTION_TYPES = Object.freeze([
  'build-package',
  'pack-package',
  'install-offline-consumer',
  'run-consumer-flow',
  'run-redesigned-host-adapter',
  'initialize-instances',
  'mutate-instance',
  'destroy-instance',
  'recreate-instance',
  'install-packed-artifact',
  'run-host-journey-matrix',
  'compile-public-examples',
  'run-public-examples',
  'validate-documentation-digest',
]);

const CASE_ACTIONS = Object.freeze({
  'PKG-001': Object.freeze([
    'build-package',
    'pack-package',
    'install-offline-consumer',
    'run-consumer-flow',
  ]),
  'PKG-002': Object.freeze([
    'run-redesigned-host-adapter',
  ]),
  'PKG-003': Object.freeze([
    'initialize-instances',
    'mutate-instance',
    'destroy-instance',
    'recreate-instance',
  ]),
  'PKG-004': Object.freeze([
    'install-packed-artifact',
    'run-host-journey-matrix',
  ]),
  'PKG-005': Object.freeze([
    'compile-public-examples',
    'run-public-examples',
    'validate-documentation-digest',
  ]),
});

/**
 * Expected-blind package actions. Package facts come from the committed
 * installed-consumer result. PKG-003 additionally exercises two live Engine
 * instances in the focused Lab without replacing the packed proof.
 */
export function createPackageIntegrationHandlerEntries(productValue) {
  const product = validateProduct(productValue);
  const states = new WeakMap();
  const implementations = Object.freeze({
    'build-package': buildPackageAction,
    'pack-package': packPackageAction,
    'install-offline-consumer': installOfflineConsumerAction,
    'run-consumer-flow': runConsumerFlowAction,
    'run-redesigned-host-adapter': runRedesignedHostAdapterAction,
    'initialize-instances': initializeInstancesAction,
    'mutate-instance': mutateInstanceAction,
    'destroy-instance': destroyInstanceAction,
    'recreate-instance': recreateInstanceAction,
    'install-packed-artifact': installPackedArtifactAction,
    'run-host-journey-matrix': runHostJourneyMatrixAction,
    'compile-public-examples': compilePublicExamplesAction,
    'run-public-examples': runPublicExamplesAction,
    'validate-documentation-digest': validateDocumentationDigestAction,
  });
  return Object.freeze(PACKAGE_INTEGRATION_ACTION_TYPES.map((type) => Object.freeze([
    `contract/${type}`,
    withState(product, states, implementations[type]),
  ])));
}

function withState(product, states, implementation) {
  return async (contextValue, actionValue) => {
    const context = validateContext(contextValue);
    const expectedTypes = CASE_ACTIONS[context.caseId];
    assert(expectedTypes !== undefined, `unsupported case ${String(context.caseId)}`);
    const action = recordValue(actionValue, 'action');
    assertExactKeys(action, ['index', 'operands', 'type'], 'action');
    assert(action.index === context.actionIndex, 'action index');
    assert(action.type === expectedTypes[context.actionIndex], 'action type');
    assert(!context.signal.aborted, 'action is aborted');
    let state = states.get(context.resolveDataset);
    if (state === undefined) {
      state = createState(context.caseId);
      states.set(context.resolveDataset, state);
    }
    assert(state.caseId === context.caseId, 'execution state case identity');
    const evidence = readEvidence(product, state);
    return implementation(state, evidence, context, action);
  };
}

function createState(caseId) {
  return {
    caseId,
    evidence: null,
    projection: {},
    liveInstances: new Map(),
    localBaselineB: null,
  };
}

function buildPackageAction(state, evidence, _context, action) {
  const operands = exactOperands(action, ['sourceMap', 'sourceRevision']);
  assert(
    stringValue(operands.sourceRevision, 'source revision') === 'provenance.codeCommit',
    'build source revision binding',
  );
  assert(typeof operands.sourceMap === 'boolean', 'build sourceMap flag');
  const productionBuild = recordValue(evidence.productionBuild, 'production build');
  const artifact = recordValue(evidence.artifact, 'artifact');
  state.projection.build = {
    codeCommit: stringValue(
      recordValue(evidence.provenance, 'provenance').codeCommit,
      'code commit',
    ),
    requestedSourceMap: operands.sourceMap,
    producedSourceMap: productionBuild.sourceMap === true,
    sourceMapCount: nonNegativeInteger(artifact.sourceMapCount, 'source map count'),
  };
  return actionOutput(state, evidence, { build: state.projection.build });
}

function packPackageAction(state, evidence, _context, action) {
  const operands = exactOperands(action, ['repeat']);
  const artifact = recordValue(evidence.artifact, 'artifact');
  state.projection.package = {
    repeat: positiveInteger(operands.repeat, 'pack repeat'),
    sha256: digestValue(artifact.sha256, 'artifact digest'),
    filename: stringValue(artifact.filename, 'artifact filename'),
    fileCount: nonNegativeInteger(artifact.fileCount, 'artifact file count'),
    sourceMapCount: nonNegativeInteger(artifact.sourceMapCount, 'source map count'),
    restrictedEvidenceCount: nonNegativeInteger(
      artifact.restrictedEvidenceCount,
      'restricted evidence count',
    ),
  };
  return actionOutput(state, evidence, { package: state.projection.package });
}

function installOfflineConsumerAction(state, evidence, _context, action) {
  const operands = exactOperands(action, ['moduleTargets', 'strictTypeScript']);
  const moduleTargets = stringArray(operands.moduleTargets, 'module targets');
  assert(typeof operands.strictTypeScript === 'boolean', 'strict TypeScript flag');
  const passed = moduleTargets.filter((target) => moduleTargetPassed(
    evidence,
    target,
    operands.strictTypeScript,
  ));
  state.projection.moduleTargetsPassed = passed;
  return actionOutput(state, evidence, {
    moduleTargets,
    moduleTargetsPassed: passed,
  });
}

function runConsumerFlowAction(state, evidence, _context, action) {
  const operands = exactOperands(action, ['steps']);
  const steps = stringArray(operands.steps, 'consumer steps');
  const esm = recordValue(evidence.esm, 'ESM consumer result');
  const examples = recordValue(evidence.examples, 'examples result');
  const packageMatrix = recordValue(evidence.packageMatrix, 'package matrix');
  const checks = {
    initialize: esm.backend === 'webgl',
    load: esm.immutable === true
      && positiveInteger(esm.rootCount, 'loaded root count') > 0,
    update: esm.updateStatus === 'committed'
      && esm.transactionStatus === 'committed',
    destroy:
      esm.destroyed === true
      && nonNegativeInteger(esm.canvasCountAfterDestroy, 'ESM terminal canvas count') === 0
      && nonNegativeInteger(examples.remainingCanvasCount, 'example terminal canvas count') === 0
      && nonNegativeInteger(
        packageMatrix.remainingCanvasCount,
        'matrix terminal canvas count',
      ) === 0,
  };
  state.projection.consumerFlowPassed =
    steps.length > 0 && steps.every((step) => checks[step] === true);
  state.projection.afterDestroy =
    nonNegativeInteger(esm.canvasCountAfterDestroy, 'ESM terminal canvas count')
    + nonNegativeInteger(examples.remainingCanvasCount, 'example terminal canvas count')
    + nonNegativeInteger(
      packageMatrix.remainingCanvasCount,
      'matrix terminal canvas count',
    );
  return actionOutput(state, evidence, {
    steps,
    checks,
    consumerFlowPassed: state.projection.consumerFlowPassed,
    afterDestroy: state.projection.afterDestroy,
  });
}

function runRedesignedHostAdapterAction(state, evidence, _context, action) {
  const operands = exactOperands(action, ['capabilities']);
  const requestedCapabilities = stringArray(operands.capabilities, 'adapter capabilities');
  const packageMatrix = recordValue(evidence.packageMatrix, 'package matrix');
  const hostAdapter = recordValue(packageMatrix.hostAdapter, 'host adapter result');
  const audit = recordValue(evidence.hostAdapterAudit, 'host adapter audit');
  state.projection.hostAdapter = {
    requestedCapabilities,
    reachedCapabilities: stringArray(
      hostAdapter.reachedCapabilities,
      'reached capabilities',
    ),
    restrictedImportCount: nonNegativeInteger(
      audit.restrictedImportCount,
      'restricted import count',
    ),
    adapterReimplementedEngineBehaviorCount: nonNegativeInteger(
      audit.adapterReimplementedEngineBehaviorCount,
      'adapter reimplementation count',
    ),
    invalidNodeCount: nonNegativeInteger(hostAdapter.invalidNodeCount, 'invalid node count'),
    staleGestureCount: nonNegativeInteger(
      hostAdapter.staleGestureCount,
      'stale gesture count',
    ),
    corruptEntryCount: nonNegativeInteger(
      hostAdapter.corruptEntryCount,
      'corrupt entry count',
    ),
    leakDelta: nonNegativeInteger(hostAdapter.leakDelta, 'adapter leak delta'),
  };
  return actionOutput(state, evidence, { hostAdapter: state.projection.hostAdapter });
}

async function initializeInstancesAction(state, evidence, context, action) {
  const operands = exactOperands(action, ['ids']);
  const ids = stringArray(operands.ids, 'instance IDs');
  assert(ids.length === 2 && new Set(ids).size === 2, 'two unique instance IDs');
  const instanceDefinitions = instanceDefinitionsById(context.fixtureParams);
  for (const id of ids) {
    const definition = instanceDefinitions.get(id);
    assert(definition !== undefined, `fixture instance ${id}`);
    const engine = await createLiveInstance(
      state,
      context,
      id,
      stringValue(definition.datasetRef, `${id} datasetRef`),
    );
    state.liveInstances.set(id, engine);
  }
  const localB = instanceProbe(currentInstance(state, ids[1]));
  state.localBaselineB = localB.semanticHash;
  const multiple = multipleInstanceEvidence(evidence);
  const baselineB = recordValue(multiple.baselineB, 'packed baseline B');
  state.projection.multipleInstances = {
    baselineB: clone(baselineB),
    local: {
      baselineBSemanticHash: localB.semanticHash,
      liveCanvasCount: liveCanvasCount(state),
    },
  };
  return actionOutput(
    state,
    evidence,
    { instances: clone(state.projection.multipleInstances) },
    {
      assetLeaseCount: nonNegativeInteger(
        baselineB.assetLeaseCount,
        'packed baseline B asset lease count',
      ),
      sceneSemanticHash: stringValue(
        baselineB.sceneSemanticHash,
        'packed baseline B semantic hash',
      ),
    },
  );
}

function mutateInstanceAction(state, evidence, _context, action) {
  const operands = exactOperands(action, ['changes', 'instanceId', 'target']);
  const changes = recordValue(operands.changes, 'instance changes');
  assertExactKeys(changes, ['show'], 'instance changes');
  assert(typeof changes.show === 'boolean', 'instance visibility');
  const instanceId = stringValue(operands.instanceId, 'mutated instance ID');
  const engine = currentInstance(state, instanceId);
  const result = callSync(engine, 'transact', {
    strict: true,
    actionId: `package-integration-${instanceId}-visibility`,
    operations: [{
      op: 'merge',
      target: {
        kind: 'element',
        id: stringValue(operands.target, 'mutation target'),
      },
      changes: [{ path: ['show'], value: changes.show }],
    }],
  });
  assert(recordValue(result, 'instance transaction').status === 'committed', 'instance mutation');
  callSync(engine, 'publishFrame', 32);
  assertLocalBStable(state);
  state.projection.multipleInstances.local.afterMutation = {
    instanceId,
    transactionStatus: result.status,
    liveCanvasCount: liveCanvasCount(state),
  };
  return actionOutput(state, evidence, {
    mutation: clone(state.projection.multipleInstances.local.afterMutation),
  });
}

async function destroyInstanceAction(state, evidence, context, action) {
  const operands = exactOperands(action, ['instanceId']);
  const instanceId = stringValue(operands.instanceId, 'destroyed instance ID');
  const engine = currentInstance(state, instanceId);
  const release = await context.releaseEngine(engine, `package-instance-destroy:${instanceId}`);
  state.liveInstances.delete(instanceId);
  assertLocalBStable(state);
  state.projection.multipleInstances.local.afterDestroy = {
    instanceId,
    release: clone(release),
    liveCanvasCount: liveCanvasCount(state),
  };
  return actionOutput(state, evidence, {
    destroy: clone(state.projection.multipleInstances.local.afterDestroy),
  });
}

async function recreateInstanceAction(state, evidence, context, action) {
  const operands = exactOperands(action, ['hostSlot', 'instanceId']);
  const instanceId = stringValue(operands.instanceId, 'recreated instance ID');
  const hostSlot = stringValue(operands.hostSlot, 'recreated host slot');
  const definitions = instanceDefinitionsById(context.fixtureParams);
  const slotDefinition = definitions.get(hostSlot);
  assert(slotDefinition !== undefined, `host slot ${hostSlot}`);
  const engine = await createLiveInstance(
    state,
    context,
    instanceId,
    stringValue(slotDefinition.datasetRef, `${hostSlot} datasetRef`),
  );
  state.liveInstances.set(instanceId, engine);
  assertLocalBStable(state);
  const multiple = multipleInstanceEvidence(evidence);
  state.projection.multipleInstances = {
    ...state.projection.multipleInstances,
    B: clone(recordValue(multiple.B, 'packed instance B')),
    hostSlots: clone(recordValue(multiple.hostSlots, 'packed host slots')),
    unclassifiedErrorCount: nonNegativeInteger(
      multiple.unclassifiedErrorCount,
      'unclassified instance error count',
    ),
    local: {
      ...state.projection.multipleInstances.local,
      afterRecreate: {
        instanceId,
        hostSlot,
        liveCanvasCount: liveCanvasCount(state),
        B: instanceProbe(currentInstance(state, 'B')),
      },
    },
  };
  return actionOutput(state, evidence, {
    instances: clone(state.projection.multipleInstances),
  });
}

function installPackedArtifactAction(state, evidence, _context, action) {
  const operands = exactOperands(
    action,
    ['packageDigest', 'productionBundler', 'strictTypeScript'],
  );
  assert(
    stringValue(operands.packageDigest, 'package digest binding')
      === 'provenance.packedPackageSha256',
    'packed artifact digest binding',
  );
  assert(typeof operands.productionBundler === 'boolean', 'production bundler flag');
  assert(typeof operands.strictTypeScript === 'boolean', 'strict TypeScript flag');
  const artifact = recordValue(evidence.artifact, 'artifact');
  const types = recordValue(evidence.types, 'types result');
  const build = recordValue(evidence.productionBuild, 'production build');
  state.projection.install = {
    packageDigest: digestValue(artifact.sha256, 'artifact digest'),
    strictTypeScript:
      operands.strictTypeScript
      && types.strict === true
      && nonNegativeInteger(types.exitCode, 'types exit code') === 0,
    productionBundler:
      operands.productionBundler
      && typeof build.productionBundler === 'string'
      && build.productionBundler.length > 0,
  };
  return actionOutput(state, evidence, { install: state.projection.install });
}

function runHostJourneyMatrixAction(state, evidence, _context, action) {
  const operands = exactOperands(action, ['journeyIds', 'mountMode']);
  const journeyIds = stringArray(operands.journeyIds, 'journey IDs');
  assert(
    stringValue(operands.mountMode, 'journey mount mode') === 'production-layout',
    'journey production mount mode',
  );
  const matrix = recordValue(evidence.journeyMatrix, 'journey matrix');
  const rows = recordArray(matrix.rows, 'journey rows');
  const observedJourneyIds = stringArray(matrix.journeyIds, 'observed journey IDs');
  assert(sameArray(journeyIds, observedJourneyIds), 'journey ID coverage');
  const hostAdapter = recordValue(
    recordValue(evidence.packageMatrix, 'package matrix').hostAdapter,
    'host adapter result',
  );
  const audit = recordValue(evidence.hostAdapterAudit, 'host adapter audit');
  const errors = evidenceErrorCount(evidence);
  state.projection.journeyMatrix = {
    journeyCount: nonNegativeInteger(matrix.journeyCount, 'journey count'),
    passedJourneyCount: nonNegativeInteger(
      matrix.passedJourneyCount,
      'passed journey count',
    ),
    packageDigestAcrossJourneys: nullableDigest(
      matrix.packageDigestAcrossJourneys,
      'journey package digest',
    ),
    cleanupFailureCount: nonNegativeInteger(
      matrix.cleanupFailureCount,
      'journey cleanup failure count',
    ),
    adapterReimplementedEngineBehaviorCount: nonNegativeInteger(
      audit.adapterReimplementedEngineBehaviorCount,
      'adapter reimplementation count',
    ),
    invalidNodeCount: nonNegativeInteger(hostAdapter.invalidNodeCount, 'invalid node count'),
    staleGestureCount: nonNegativeInteger(
      hostAdapter.staleGestureCount,
      'stale gesture count',
    ),
    corruptEntryCount: nonNegativeInteger(
      hostAdapter.corruptEntryCount,
      'corrupt history entry count',
    ),
    unclassifiedCount:
      errors
      + rows.filter((row) => (
        row.status !== 'pass'
        || row.digestBound !== true
        || row.exactDeclaredConflicts !== true
      )).length,
  };
  return actionOutput(state, evidence, {
    journeyMatrix: state.projection.journeyMatrix,
  });
}

function compilePublicExamplesAction(state, evidence, _context, action) {
  const operands = exactOperands(action, ['examples', 'strictTypeScript']);
  const examples = stringArray(operands.examples, 'requested examples');
  assert(typeof operands.strictTypeScript === 'boolean', 'strict TypeScript flag');
  const actual = recordValue(evidence.examples, 'examples result');
  const types = recordValue(evidence.types, 'types result');
  state.projection.compiledExamples = stringArray(
    actual.compiledExamples,
    'compiled examples',
  );
  state.projection.compileProof = {
    requested: examples,
    strict:
      operands.strictTypeScript
      && types.strict === true
      && nonNegativeInteger(types.exitCode, 'types exit code') === 0,
  };
  return actionOutput(state, evidence, {
    compiledExamples: state.projection.compiledExamples,
    compileProof: state.projection.compileProof,
  });
}

function runPublicExamplesAction(state, evidence, _context, action) {
  const operands = exactOperands(action, ['examples']);
  const requested = stringArray(operands.examples, 'requested examples');
  const actual = recordValue(evidence.examples, 'examples result');
  state.projection.executedExamples = stringArray(
    actual.executedExamples,
    'executed examples',
  );
  state.projection.exampleResults = recordArray(actual.results, 'example results').map(
    (result) => ({
      name: stringValue(result.name, 'example result name'),
      status: stringValue(result.status, 'example result status'),
    }),
  );
  return actionOutput(state, evidence, {
    requested,
    executedExamples: state.projection.executedExamples,
    results: state.projection.exampleResults,
  });
}

function validateDocumentationDigestAction(state, evidence, _context, action) {
  const operands = exactOperands(action, ['expectedPackageDigest']);
  assert(
    stringValue(operands.expectedPackageDigest, 'documentation digest binding')
      === 'provenance.packedPackageSha256',
    'documentation digest binding',
  );
  const artifact = recordValue(evidence.artifact, 'artifact');
  const examples = recordValue(evidence.examples, 'examples result');
  const types = recordValue(evidence.types, 'types result');
  const missingDocs = arrayValue(artifact.missingDocs, 'missing docs');
  const unexpectedDocs = arrayValue(
    artifact.unexpectedDocs ?? [],
    'unexpected docs',
  );
  const publicDocs = stringArray(artifact.publicDocs, 'public docs');
  const compiled = stringArray(examples.compiledExamples, 'compiled examples');
  const executed = stringArray(examples.executedExamples, 'executed examples');
  const results = recordArray(examples.results, 'example results');
  state.projection.documentationDigest =
    missingDocs.length === 0
      && unexpectedDocs.length === 0
      && publicDocs.length > 0
      ? digestValue(artifact.sha256, 'documentation artifact digest')
      : null;
  state.projection.declarationRuntimeDriftCount =
    Number(types.strict !== true)
    + Number(types.exactOptionalPropertyTypes !== true)
    + Number(nonNegativeInteger(types.exitCode, 'types exit code') !== 0)
    + symmetricDifferenceCount(compiled, executed)
    + results.filter(({ status }) => status !== 'pass').length
    + arrayValue(artifact.missingExamples, 'missing examples').length;
  return actionOutput(state, evidence, {
    documentationDigest: state.projection.documentationDigest,
    declarationRuntimeDriftCount: state.projection.declarationRuntimeDriftCount,
  });
}

async function createLiveInstance(state, context, instanceId, datasetRef) {
  assert(!state.liveInstances.has(instanceId), `duplicate live instance ${instanceId}`);
  const record = await context.createEngine(`package-instance:${instanceId}`);
  const engine = recordValue(record, `${instanceId} engine record`).engine;
  assert(isRecord(engine), `${instanceId} engine`);
  await engine.initialize({
    instanceId: `pkg-003-${instanceId.toLowerCase()}`,
    width: 360,
    height: 220,
    pixelRatio: 1,
    backend: 'webgl2',
    strategy: 'mesh',
  });
  const dataset = await context.resolveDataset(datasetRef);
  const fingerprint = context.fingerprint(dataset);
  callSync(engine, 'loadDataset', structuredClone(dataset), {
    datasetRef: `${datasetRef}:${instanceId}`,
  });
  callSync(engine, 'publishFrame', context.clock.now());
  assert(context.fingerprint(dataset) === fingerprint, `${instanceId} dataset immutability`);
  return engine;
}

function currentInstance(state, instanceId) {
  const engine = state.liveInstances.get(instanceId);
  assert(engine !== undefined, `live instance ${instanceId}`);
  return engine;
}

function assertLocalBStable(state) {
  assert(state.localBaselineB !== null, 'local B baseline');
  assert(
    instanceProbe(currentInstance(state, 'B')).semanticHash === state.localBaselineB,
    'local B semantic isolation',
  );
}

function instanceProbe(engine) {
  const snapshot = recordValue(callSync(engine, 'snapshot'), 'instance snapshot');
  const resources = recordValue(snapshot.resources, 'instance resources');
  return {
    semanticHash: stringValue(snapshot.semanticHash, 'instance semantic hash'),
    canvasCount: nonNegativeInteger(resources.canvasCount, 'instance canvas count'),
  };
}

function liveCanvasCount(state) {
  let count = 0;
  for (const engine of state.liveInstances.values()) {
    count += instanceProbe(engine).canvasCount;
  }
  return count;
}

function instanceDefinitionsById(fixtureParams) {
  const instances = recordArray(
    recordValue(fixtureParams, 'fixture params').instances,
    'fixture instances',
  );
  return new Map(instances.map((instance) => [
    stringValue(instance.id, 'fixture instance ID'),
    instance,
  ]));
}

function multipleInstanceEvidence(evidence) {
  return recordValue(
    recordValue(evidence.packageMatrix, 'package matrix').multipleInstances,
    'multiple instance result',
  );
}

function moduleTargetPassed(evidence, target, strictTypeScript) {
  if (target === 'esm') {
    const result = recordValue(evidence.esm, 'ESM consumer result');
    return result.immutable === true
      && positiveInteger(result.rootCount, 'ESM root count') > 0
      && result.destroyed === true
      && result.backend === 'webgl'
      && nonNegativeInteger(result.canvasCountAfterDestroy, 'ESM terminal canvas count') === 0;
  }
  if (target === 'cjs') {
    const result = recordValue(evidence.cjs, 'CJS consumer result');
    return result.mountType === 'function'
      && result.internalExportsAbsent === true
      && result.constructorRejected === true;
  }
  if (target === 'types') {
    const result = recordValue(evidence.types, 'types result');
    return strictTypeScript
      && result.strict === true
      && nonNegativeInteger(result.exitCode, 'types exit code') === 0;
  }
  return false;
}

function actionOutput(state, evidence, actual, captureSource) {
  const output = {
    actual: {
      ...clone(actual),
      evidenceBinding: evidenceBinding(evidence),
      runtimeState: {
        caseId: state.caseId,
        projection: clone(state.projection),
      },
    },
  };
  if (captureSource !== undefined) output.captureSource = clone(captureSource);
  return deepFreeze(output);
}

function evidenceBinding(evidence) {
  const provenance = recordValue(evidence.provenance, 'provenance');
  const environment = recordValue(evidence.environment, 'environment');
  const artifact = recordValue(evidence.artifact, 'artifact');
  return {
    schemaVersion: nonNegativeInteger(evidence.schemaVersion, 'evidence schema version'),
    status: stringValue(evidence.status, 'evidence status'),
    packageName: stringValue(evidence.package, 'package name'),
    pixiVersion: stringValue(evidence.pixi, 'Pixi version'),
    provenance: clone(provenance),
    environment: clone(environment),
    artifact: {
      sha256: digestValue(artifact.sha256, 'artifact digest'),
      sourceMapCount: nonNegativeInteger(artifact.sourceMapCount, 'source map count'),
      restrictedEvidenceCount: nonNegativeInteger(
        artifact.restrictedEvidenceCount,
        'restricted evidence count',
      ),
    },
    errorCount: evidenceErrorCount(evidence),
  };
}

function readEvidence(product, state) {
  if (state.evidence !== null) return state.evidence;
  const evidence = recordValue(
    product.readPackedConsumerEvidence(),
    'packed consumer evidence',
  );
  assert(evidence.schemaVersion === 2, 'packed consumer evidence schema');
  assert(evidence.status === 'pass', 'packed consumer evidence status');
  assert(arrayValue(evidence.failures, 'packed consumer failures').length === 0, 'packed consumer failures');
  const provenance = recordValue(evidence.provenance, 'packed provenance');
  const artifact = recordValue(evidence.artifact, 'packed artifact');
  const packedDigest = digestValue(
    provenance.packedPackageSha256,
    'packed package digest',
  );
  assert(
    digestValue(artifact.sha256, 'packed artifact digest') === packedDigest,
    'packed artifact digest cohesion',
  );
  state.evidence = deepFreeze(clone(evidence));
  return state.evidence;
}

function evidenceErrorCount(evidence) {
  const errors = recordValue(evidence.errors, 'browser errors');
  return arrayValue(errors.console, 'console errors').length
    + arrayValue(errors.page, 'page errors').length
    + arrayValue(errors.network, 'network errors').length;
}

function validateProduct(value) {
  const product = recordValue(value, 'package product');
  assert(
    typeof product.readPackedConsumerEvidence === 'function',
    'package product readPackedConsumerEvidence()',
  );
  return product;
}

function validateContext(value) {
  const context = recordValue(value, 'handler context');
  for (const name of [
    'createEngine',
    'releaseEngine',
    'resolveDataset',
    'fingerprint',
  ]) {
    assert(typeof context[name] === 'function', `context ${name}`);
  }
  assert(typeof context.caseId === 'string', 'context case ID');
  assert(Number.isInteger(context.actionIndex), 'context action index');
  assert(isRecord(context.fixtureParams), 'context fixture params');
  assert(isRecord(context.signal), 'context signal');
  assert(isRecord(context.clock) && typeof context.clock.now === 'function', 'context clock');
  return context;
}

function exactOperands(action, keys) {
  const operands = recordValue(action.operands, `${action.type} operands`);
  assertExactKeys(operands, keys, `${action.type} operands`);
  return operands;
}

function callSync(target, method, ...args) {
  assert(isRecord(target) && typeof target[method] === 'function', `product ${method}()`);
  return target[method](...args);
}

function sameArray(left, right) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function symmetricDifferenceCount(left, right) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value)).length
    + right.filter((value) => !leftSet.has(value)).length;
}

function digestValue(value, label) {
  assert(typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value), label);
  return value;
}

function nullableDigest(value, label) {
  assert(value === null || (typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)), label);
  return value;
}

function positiveInteger(value, label) {
  assert(Number.isSafeInteger(value) && value > 0, label);
  return value;
}

function nonNegativeInteger(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0, label);
  return value;
}

function stringArray(value, label) {
  const array = arrayValue(value, label);
  return array.map((entry, index) => stringValue(entry, `${label}[${index}]`));
}

function recordArray(value, label) {
  const array = arrayValue(value, label);
  return array.map((entry, index) => recordValue(entry, `${label}[${index}]`));
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, label);
  return value;
}

function arrayValue(value, label) {
  assert(Array.isArray(value), label);
  return value;
}

function assertExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  assert(
    actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]),
    `${label} keys`,
  );
}


function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}


function assert(condition, message) {
  if (!condition) throw new Error(`PatchMap package handler invalid: ${message}`);
}
