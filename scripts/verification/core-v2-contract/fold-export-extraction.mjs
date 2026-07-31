import { cloneOptional as clone } from './value-atoms.mjs';

export const EXPORT_EXTRACTION_FOLD_REVISION =
  'core-v2-export-extraction-fold/1';

const OBSERVATION_REVISION = 'core-v2-semantic-observation/1';
const DOMAIN_NAMES = Object.freeze([
  'case',
  'provenance',
  'environment',
  'revisions',
  'scene',
  'geometry',
  'text',
  'paint',
  'interaction',
  'events',
  'history',
  'accessibility',
  'outcome',
  'resources',
]);
const CASE_ACTIONS = Object.freeze({
  'DET-004': Object.freeze([
    'load-dataset',
    'apply-transaction',
    'export-canonical-dataset',
    'load-export-fresh-instance',
  ]),
  'PIX-004': Object.freeze([
    'publish-revision-tuple',
    'extract-pixijs-scene',
    'restore-authoritative-canvas',
  ]),
  'PRF-008': Object.freeze([
    'load-dataset',
    'extract-published-tuple',
    'swap-image-and-restore-canvas',
  ]),
  'CSM-035': Object.freeze([
    'apply-merge',
    'export-canonical-dataset',
    'host-validate-and-upload',
    'host-validate-and-upload',
    'probe-declared-failure',
  ]),
  'CSM-038': Object.freeze([
    'load-scene',
    'extract-scene',
    'show-host-image',
    'restore-engine-canvas',
    'probe-declared-failure',
  ]),
});
const JOURNAL_EVENTS = new Set([
  'ready',
  'sceneCommitted',
  'drawComplete',
  'frame',
  'diagnostic',
  'destroyed',
]);

/** Fold only actual action deltas and public product probes. */
export function foldExportExtractionExecution(optionsValue) {
  const options = recordValue(optionsValue, 'fold options');
  const plan = validatePlan(options.casePlan);
  const execution = validateExecution(options.execution, plan);
  const final = actionActual(
    execution,
    execution.actionResults.length - 1,
    CASE_ACTIONS[plan.id].at(-1),
  );
  const product = recordValue(final.product, 'final product');
  const snapshot = recordValue(product.snapshot, 'final snapshot');
  const semantic = recordValue(product.semantic, 'final semantic');
  const runtimeState = recordValue(final.runtimeState, 'final runtime state');
  const resourceRuntime = recordValue(product.extraction, 'resource runtime');
  const actual = baseActual(
    options,
    plan,
    execution,
    product,
    snapshot,
    semantic,
    resourceRuntime,
  );

  if (plan.id === 'DET-004') {
    projectDeterministicExport(actual, execution, runtimeState);
  } else if (plan.id === 'PIX-004') {
    projectPixiExtraction(actual, execution, resourceRuntime);
  } else if (plan.id === 'PRF-008') {
    projectRepeatedExtraction(actual, execution, resourceRuntime);
  } else if (plan.id === 'CSM-035') {
    projectEditorSave(actual, runtimeState, snapshot);
  } else {
    projectReportExtraction(actual, execution, runtimeState, snapshot, resourceRuntime);
  }

  assert(
    DOMAIN_NAMES.every((domain) => isRecord(actual[domain])),
    'actual must contain fourteen object domains',
  );
  validateJson(actual, 'actual', new WeakSet());
  return deepFreeze({
    actual,
    fixtures: clone(recordValue(plan.fixture, 'case fixture').setup.params),
    captures: captureMap(execution),
  });
}

function baseActual(
  options,
  plan,
  execution,
  product,
  snapshot,
  semantic,
  resourceRuntime,
) {
  const revisions = recordValue(snapshot.revisions, 'snapshot revisions');
  const semanticInteraction = recordValue(semantic.interaction, 'semantic interaction');
  const dataset = arrayValue(product.dataset, 'product dataset');
  const history = recordValue(product.history, 'product history');
  const resources = recordValue(snapshot.resources, 'snapshot resources');
  const environment = clone(recordValue(options.environment, 'environment'));
  if (
    (plan.id === 'PRF-008' || plan.id === 'CSM-038')
    && environment.runtimeResourceIds === undefined
  ) {
    environment.runtimeResourceIds = [];
  }
  return {
    $schema: OBSERVATION_REVISION,
    case: {
      id: plan.id,
      caseType: plan.caseType,
      rootTestId: plan.rootTestId,
      fixtureSha256: plan.fixtureSha256,
      executionStatus: execution.status,
    },
    provenance: clone(recordValue(options.provenance, 'provenance')),
    environment,
    revisions: {
      lifecycle: {
        generation: finiteNumber(
          revisions.lifecycleGeneration,
          'lifecycle generation',
        ),
      },
      scene: finiteNumber(revisions.sceneRevision, 'scene revision'),
      view: finiteNumber(revisions.viewRevision, 'view revision'),
      interaction: finiteNumber(
        revisions.interactionRevision,
        'interaction revision',
      ),
      valuesFinite: allNumbersFinite(revisions),
    },
    scene: {
      revision: finiteNumber(revisions.sceneRevision, 'scene revision'),
      rootIds: stringArray(snapshot.rootIds, 'root IDs'),
      semanticHash: nullableString(snapshot.semanticHash, 'semantic hash'),
      invalidNodeCount: invalidNodeCount(dataset),
    },
    geometry: {
      nonFiniteCount: countNonFinite([product.geometry, dataset]),
    },
    text: {
      unpairedSurrogates: countUnpairedSurrogates(dataset),
    },
    paint: {
      unresolvedIntentCount: countUnresolvedIntent(dataset),
    },
    interaction: {
      selectedTargets: stringArray(snapshot.selectionIds, 'selection IDs'),
      staleGestureCount:
        nonNegativeInteger(
          semanticInteraction.activeGestureCount ?? 0,
          'active gesture count',
        ),
    },
    events: {
      unclassifiedCount: execution.eventJournal.filter((entry) => (
        !JOURNAL_EVENTS.has(recordValue(entry, 'event journal entry').event)
      )).length,
      journalCount: execution.eventJournal.length,
    },
    history: {
      depth: historyDepth(history),
      corruptEntryCount: corruptHistoryEntryCount(history),
    },
    accessibility: {
      _availability: { exercised: false },
    },
    outcome: {
      recorded: true,
      actionResults: execution.actionResults.map(({ index, type, status }) => ({
        index,
        type,
        status,
      })),
    },
    resources: {
      initialCanvasIdentity: stringValue(
        resourceRuntime.initialCanvasIdentity,
        'initial canvas identity',
      ),
      canvasIdentity: stringValue(
        resourceRuntime.canvasIdentity,
        'canvas identity',
      ),
      temporaryImages: nonNegativeInteger(
        resourceRuntime.temporaryImages,
        'temporary image count',
      ),
      renderTextures: nonNegativeInteger(
        resourceRuntime.renderTextures,
        'render texture count',
      ),
      pendingWork: nonNegativeInteger(snapshot.pendingWork, 'pending work'),
      dom: {
        canvasCount: nonNegativeInteger(resources.canvasCount, 'canvas count'),
      },
      leakDelta: cleanupLeakDelta(execution.cleanup),
      cleanup: clone(execution.cleanup),
    },
  };
}

function projectDeterministicExport(actual, execution, runtimeState) {
  const exported = actionActual(execution, 2, 'export-canonical-dataset');
  const exportValidation = recordValue(exported.export, 'DET-004 export');
  const preExportSemanticHash = stringValue(
    runtimeState.preExportSemanticHash,
    'pre-export semantic hash',
  );
  const roundtripSemanticHash = stringValue(
    runtimeState.roundtripSemanticHash,
    'roundtrip semantic hash',
  );
  actual.outcome.export = {
    rootKind: stringValue(exportValidation.rootKind, 'export root kind'),
    schemaValid: exportValidation.schemaValid === true,
    transientRendererFields: nonNegativeInteger(
      exportValidation.transientFieldCount,
      'transient renderer fields',
    ),
  };
  actual.scene.preExport = { semanticHash: preExportSemanticHash };
  actual.scene.roundtrip = { semanticHash: roundtripSemanticHash };
}

function projectPixiExtraction(actual, execution, resourceRuntime) {
  const extracted = recordValue(
    actionActual(execution, 1, 'extract-pixijs-scene').extraction,
    'PIX-004 extraction',
  );
  actual.outcome.capturedTuple = clone(recordValue(
    extracted.capturedTuple,
    'captured tuple',
  ));
  actual.outcome.cssSize = numberPair(extracted.cssSize, 'extracted CSS size');
  actual.resources.canvasIdentity = stringValue(
    resourceRuntime.canvasIdentity,
    'restored canvas identity',
  );
}

function projectRepeatedExtraction(actual, execution, resourceRuntime) {
  const extracted = recordValue(
    actionActual(execution, 1, 'extract-published-tuple').extraction,
    'PRF-008 extraction',
  );
  actual.outcome.successCount = nonNegativeInteger(
    extracted.successCount,
    'extraction success count',
  );
  actual.outcome.capturedTuples = clone(arrayValue(
    extracted.capturedTuples,
    'captured tuples',
  ));
  actual.outcome.rawTimingSamples = clone(arrayValue(
    extracted.rawTimingSamples,
    'raw extraction timings',
  ));
  actual.resources.canvasIdentity = stringValue(
    resourceRuntime.canvasIdentity,
    'restored canvas identity',
  );
}

function projectEditorSave(actual, runtimeState, snapshot) {
  const exportValidation = recordValue(runtimeState.export, 'CSM-035 export');
  const failure = recordValue(runtimeState.failureRollback, 'save failure rollback');
  const selectionIds = stringArray(snapshot.selectionIds, 'save selection IDs');
  const mode = stringValue(runtimeState.mode, 'save mode');
  const retryMutationCount = nonNegativeInteger(
    runtimeState.retryMutationCount,
    'retry mutation count',
  );
  actual.outcome.export = {
    rootKind: stringValue(exportValidation.rootKind, 'export root kind'),
    schemaValid: exportValidation.schemaValid === true,
    transientFieldCount: nonNegativeInteger(
      exportValidation.transientFieldCount,
      'export transient field count',
    ),
  };
  actual.outcome.retryMutationCount = retryMutationCount;
  actual.outcome.hostEngineSeam = {
    engineReturns: {
      exportRoot: stringValue(exportValidation.rootKind, 'engine export root'),
      schemaValid: exportValidation.schemaValid === true,
      transientFieldCount: nonNegativeInteger(
        exportValidation.transientFieldCount,
        'engine transient field count',
      ),
      semanticMutationCount: nonNegativeInteger(
        runtimeState.semanticMutationCount,
        'semantic mutation count',
      ),
      uploadAttempts: nonNegativeInteger(
        runtimeState.uploadAttempts,
        'upload attempts',
      ),
    },
    failureRollback: {
      invalidExportBlocksUpload:
        failure.invalidExportBlocksUpload === true,
      retryMutationCount: nonNegativeInteger(
        failure.retryMutationCount,
        'failure retry mutation count',
      ),
      priorExportRetainedOnUploadFailure:
        failure.priorExportRetainedOnUploadFailure === true,
    },
    finalState: {
      selectedIds: selectionIds,
      mode,
      dirty: runtimeState.dirty === true,
      canonicalDatasetRoot: stringValue(
        exportValidation.rootKind,
        'canonical dataset root',
      ),
    },
  };
}

function projectReportExtraction(
  actual,
  execution,
  runtimeState,
  snapshot,
  resourceRuntime,
) {
  const extracted = recordValue(
    actionActual(execution, 1, 'extract-scene').extraction,
    'CSM-038 extraction',
  );
  const capturedTuple = clone(recordValue(
    extracted.capturedTuple,
    'report captured tuple',
  ));
  const cssSize = numberPair(extracted.cssSize, 'report CSS size');
  const failure = recordValue(runtimeState.failureRollback, 'report failure rollback');
  const canvasIdentity = stringValue(
    resourceRuntime.canvasIdentity,
    'report canvas identity',
  );
  const successCount = nonNegativeInteger(
    extracted.successCount,
    'report success count',
  );
  actual.outcome.successCount = successCount;
  actual.outcome.capturedTuple = capturedTuple;
  actual.outcome.cssSize = cssSize;
  actual.outcome.rawTimingSamples = clone(arrayValue(
    extracted.rawTimingSamples,
    'report extraction timings',
  ));
  actual.outcome.hostEngineSeam = {
    engineReturns: {
      successCount,
      capturedTuple,
      cssSize,
      canvasIdentity,
    },
    failureRollback: {
      onFailureKeepCanvasVisible:
        failure.onFailureKeepCanvasVisible === true,
      blankReportAccepted: failure.blankReportAccepted === true,
      retryDoesNotDuplicateResources:
        failure.retryDoesNotDuplicateResources === true,
    },
    finalState: {
      sceneRevision: finiteNumber(
        recordValue(snapshot.revisions, 'report revisions').sceneRevision,
        'report scene revision',
      ),
      selectedIds: stringArray(snapshot.selectionIds, 'report selection IDs'),
      mode: stringValue(runtimeState.mode, 'report mode'),
      canvasIdentity,
      temporaryImageCount: nonNegativeInteger(
        resourceRuntime.temporaryImages,
        'report temporary image count',
      ),
    },
  };
}

function validatePlan(value) {
  const plan = recordValue(value, 'case plan');
  const actions = CASE_ACTIONS[plan.id];
  assert(actions !== undefined, `unsupported case ${String(plan.id)}`);
  assert(Array.isArray(plan.actionTrace), 'plan action trace');
  assert(
    plan.actionTrace.length === actions.length
      && plan.actionTrace.every((action, index) => (
        recordValue(action, `plan action ${index}`).type === actions[index]
      )),
    `${plan.id} exact action trace`,
  );
  assert(!Object.hasOwn(plan, 'expected'), 'case plan must remain expected-blind');
  return plan;
}

function validateExecution(value, plan) {
  const execution = recordValue(value, 'execution');
  assert(execution.status === 'completed', `${plan.id} execution status`);
  assert(Array.isArray(execution.actionResults), 'execution action results');
  assert(execution.actionResults.length === CASE_ACTIONS[plan.id].length, 'action count');
  assert(Array.isArray(execution.eventJournal), 'event journal');
  assert(recordValue(execution.cleanup, 'execution cleanup').status === 'completed', 'cleanup');
  return execution;
}

function actionActual(execution, index, type) {
  const result = recordValue(execution.actionResults[index], `action ${index}`);
  assert(result.index === index, `action ${index} index`);
  assert(result.type === type, `action ${index} type`);
  assert(result.status === 'completed', `action ${index} completion`);
  return recordValue(
    recordValue(result.delta, `action ${index} delta`).actual,
    `action ${index} actual`,
  );
}

function captureMap(execution) {
  const captures = {};
  for (const capture of arrayValue(execution.captures, 'execution captures')) {
    const record = recordValue(capture, 'capture');
    captures[stringValue(record.id, 'capture ID')] = clone(record.values);
  }
  return captures;
}

function cleanupLeakDelta(value) {
  const cleanup = recordValue(value, 'execution cleanup');
  if (cleanup.status !== 'completed') return 1;
  if (!Array.isArray(cleanup.errors) || cleanup.errors.length > 0) return 1;
  const product = recordValue(cleanup.productResources, 'product cleanup');
  if (
    nonNegativeInteger(product.retainedDataUrlCount, 'retained data URL count') !== 0
    || nonNegativeInteger(product.temporaryImageCount, 'cleanup temporary images') !== 0
    || nonNegativeInteger(product.renderTextureCount, 'cleanup render textures') !== 0
  ) return 1;
  const runtimeCounts = recordValue(product.runtimeCounts, 'cleanup runtime counts');
  return Object.values(runtimeCounts).some((count) => count !== 0) ? 1 : 0;
}

function invalidNodeCount(dataset) {
  let count = 0;
  visitDataset(dataset, (record) => {
    if (typeof record.id !== 'string' || record.id.length === 0) count += 1;
    if (typeof record.type !== 'string' || record.type.length === 0) count += 1;
  });
  return count;
}

function countUnresolvedIntent(value) {
  let count = 0;
  visitValue(value, (nested) => {
    if (nested === 'unresolved' || nested === 'invalid-paint') count += 1;
  });
  return count;
}

function historyDepth(history) {
  if (Number.isSafeInteger(history.undoDepth)) return history.undoDepth;
  if (Number.isSafeInteger(history.depth)) return history.depth;
  return 0;
}

function corruptHistoryEntryCount(history) {
  if (!allNumbersFinite(history)) return 1;
  return 0;
}

function countNonFinite(value, seen = new WeakSet()) {
  let count = 0;
  visitValue(value, (nested) => {
    if (typeof nested === 'number' && !Number.isFinite(nested)) count += 1;
  }, seen);
  return count;
}

function allNumbersFinite(value, seen = new WeakSet()) {
  let valid = true;
  visitValue(value, (nested) => {
    if (typeof nested === 'number' && !Number.isFinite(nested)) valid = false;
  }, seen);
  return valid;
}

function countUnpairedSurrogates(value, seen = new WeakSet()) {
  let count = 0;
  visitValue(value, (nested) => {
    if (typeof nested !== 'string') return;
    for (let index = 0; index < nested.length; index += 1) {
      const code = nested.charCodeAt(index);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = nested.charCodeAt(index + 1);
        if (!(next >= 0xdc00 && next <= 0xdfff)) count += 1;
        else index += 1;
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        count += 1;
      }
    }
  }, seen);
  return count;
}

function visitDataset(value, visitor) {
  if (!Array.isArray(value)) return;
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    visitor(entry);
    if (Array.isArray(entry.children)) visitDataset(entry.children, visitor);
    if (Array.isArray(entry.components)) {
      for (const component of entry.components) {
        if (isRecord(component)) visitor(component);
      }
    }
  }
}

function visitValue(value, visitor, seen = new WeakSet()) {
  visitor(value);
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const nested of value) visitValue(nested, visitor, seen);
    return;
  }
  for (const nested of Object.values(value)) visitValue(nested, visitor, seen);
}

function numberPair(value, label) {
  const pair = arrayValue(value, label);
  assert(pair.length === 2, `${label} length`);
  return [
    finiteNumber(pair[0], `${label}[0]`),
    finiteNumber(pair[1], `${label}[1]`),
  ];
}

function validateJson(value, path, ancestors) {
  if (value === null) return;
  const kind = typeof value;
  assert(
    kind === 'string' || kind === 'number' || kind === 'boolean' || kind === 'object',
    `${path} JSON value`,
  );
  if (kind !== 'object') return;
  assert(!ancestors.has(value), `${path} cyclic value`);
  ancestors.add(value);
  if (Array.isArray(value)) {
    value.forEach((nested, index) => validateJson(nested, `${path}[${index}]`, ancestors));
  } else {
    for (const [key, nested] of Object.entries(value)) {
      validateJson(nested, `${path}.${key}`, ancestors);
    }
  }
  ancestors.delete(value);
}

function stringArray(value, label) {
  const array = arrayValue(value, label);
  assert(array.every((entry) => typeof entry === 'string'), label);
  return [...array];
}

function nullableString(value, label) {
  assert(value === null || typeof value === 'string', label);
  return value;
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, label);
  return value;
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), label);
  return value;
}

function nonNegativeInteger(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0, label);
  return value;
}

function arrayValue(value, label) {
  assert(Array.isArray(value), label);
  return value;
}

function recordValue(value, label) {
  assert(isRecord(value), label);
  return value;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid Core v2 export/extraction fold: ${message}`);
}
