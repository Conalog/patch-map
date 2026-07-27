export const DETERMINISM_LIFECYCLE_FOLD_REVISION =
  'core-v2-determinism-lifecycle-fold/1';

const OBSERVATION_REVISION = 'core-v2-semantic-observation/1';
const EXECUTION_REVISION = 'core-v2-contract-case-execution/1';
const DELTA_REVISION = 'core-v2-semantic-observation-delta/1';
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
  'DET-001': Object.freeze([
    'hash-caller-input',
    'load-dataset',
    'hash-caller-input',
    'mutate-caller-input',
    'hash-caller-input',
    'snapshot-scene',
  ]),
  'DET-002': Object.freeze([
    'run-fresh-session',
    'run-fresh-session',
    'compare-normalized-observation',
  ]),
  'DET-003': Object.freeze([
    'generate-seeded-scene',
    'advance-seeded-action',
    'regenerate-seeded-scene',
  ]),
  'ANI-003': Object.freeze([
    'patch',
    'advanceClock',
    'undo',
    'redo',
    'replaceDataset',
    'destroy',
    'advanceClock',
  ]),
  'LIF-006': Object.freeze([
    'loadDataset',
    'startAnimation',
    'startPendingAssetLoad',
    'startViewportDeceleration',
    'beginPointerGesture',
    'startExtraction',
    'setDocumentVisibility',
    'setDocumentVisibility',
    'publishFrame',
  ]),
});
const KNOWN_ENGINE_EVENTS = new Set([
  'ready',
  'sceneCommitted',
  'drawComplete',
  'frame',
  'selectionChanged',
  'diagnostic',
  'destroyed',
  'documentVisibilityChanged',
]);

/**
 * Pure expected-blind projection over action deltas and public Engine probes.
 * Approved expected evidence and comparison code are intentionally absent.
 */
export function foldDeterminismLifecycleExecution(optionsValue) {
  const options = exactRecord(
    optionsValue,
    ['casePlan', 'environment', 'execution', 'provenance'],
    'fold options',
  );
  const plan = validatePlan(options.casePlan);
  const execution = validateExecution(options.execution, plan);
  const product = terminalProduct(plan.id, execution);
  const actual = baseActual(options, plan, execution, product);

  if (plan.id === 'DET-001') projectInputImmutability(actual, execution);
  else if (plan.id === 'DET-002') projectFreshDeterminism(actual, execution);
  else if (plan.id === 'DET-003') projectSeededScenes(actual, execution);
  else if (plan.id === 'ANI-003') projectAnimationBoundary(actual, execution);
  else projectPageLifecycle(actual, execution);

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

function terminalProduct(caseId, execution) {
  if (caseId === 'DET-002') {
    return productRecord(
      actionActual(execution, 1, 'run-fresh-session').product,
      'DET-002 second fresh product',
    );
  }
  if (caseId === 'ANI-003') {
    return productRecord(
      actionActual(execution, 5, 'destroy').product,
      'ANI-003 destroyed product',
    );
  }
  const index = CASE_ACTIONS[caseId].length - 1;
  return productRecord(
    actionActual(execution, index, CASE_ACTIONS[caseId][index]).product,
    `${caseId} terminal product`,
  );
}

function baseActual(options, plan, execution, product) {
  const snapshot = recordValue(product.snapshot, 'product snapshot');
  const semantic = recordValue(product.semantic, 'product semantic');
  const revisions = recordValue(snapshot.revisions, 'snapshot revisions');
  const resources = recordValue(snapshot.resources, 'snapshot resources');
  const dataset = arrayValue(product.dataset, 'product dataset');
  const history = nullableRecord(product.history, 'product history');
  const pointer = recordValue(product.pointer, 'pointer probe');
  const page = recordValue(product.pageLifecycle, 'page lifecycle probe');
  const provenance = clone(recordValue(options.provenance, 'provenance'));
  const environment = clone(recordValue(options.environment, 'environment'));
  provenance.expectedEvidenceBound =
    provenance.fixtureSha256 === undefined
    || provenance.fixtureSha256 === plan.fixtureSha256;
  environment.contractProfileBound =
    environment.backend === 'webgl2'
    && Object.keys(recordValue(plan.fixtureProfiles, 'fixture profiles')).length > 0;
  if (environment.runtimeResourceIds === undefined) {
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
    provenance,
    environment,
    revisions: {
      lifecycle: {
        generation: finiteNumber(
          revisions.lifecycleGeneration,
          'lifecycle generation',
        ),
      },
      scene: {
        revision: finiteNumber(revisions.sceneRevision, 'scene revision'),
      },
      frame: {
        revision: finiteNumber(snapshot.frameRevision, 'frame revision'),
      },
      valuesFinite: allNumbersFinite({
        revisions,
        frameRevision: snapshot.frameRevision,
        page,
      }),
    },
    scene: {
      revision: finiteNumber(revisions.sceneRevision, 'scene revision'),
      rootIds: stringArray(snapshot.rootIds, 'root IDs'),
      invalidNodeCount: countInvalidNodes(dataset),
    },
    geometry: {
      nonFiniteCount: countNonFinite(product.geometry),
    },
    text: {
      unpairedSurrogates: countUnpairedSurrogates(dataset),
    },
    paint: {
      unresolvedIntentCount: countKeyedStatus(
        semantic,
        /unresolved|unsupported/iu,
      ),
      animation: {
        activeCount: nonNegativeInteger(
          page.activeAnimationCount,
          'active animation count',
        ),
      },
    },
    interaction: {
      staleGestureCount: nonNegativeInteger(
        pointer.staleGestureCount ?? 0,
        'stale gesture count',
      ),
      activeGestureCount: nonNegativeInteger(
        page.activeGestureCount,
        'active gesture count',
      ),
      pointerCaptureCount: nonNegativeInteger(
        page.pointerCaptureCount,
        'pointer capture count',
      ),
      decelerationActive: booleanValue(
        page.decelerationActive,
        'deceleration active',
      ),
    },
    events: {
      totalCount: execution.eventJournal.length,
      unclassifiedCount: execution.eventJournal.filter((entryValue) => {
        const entry = recordValue(entryValue, 'event journal entry');
        return !KNOWN_ENGINE_EVENTS.has(entry.event);
      }).length,
      duplicates: duplicateSequenceCount(execution.eventJournal),
      journal: clone(execution.eventJournal),
    },
    history: {
      depth: nonNegativeInteger(snapshot.historyDepth, 'history depth'),
      corruptEntryCount: historyCorruptCount(history),
    },
    accessibility: notExercised(
      'determinism-lifecycle-tranche-does-not-observe-accessibility',
    ),
    outcome: {
      recorded: true,
      actionResults: execution.actionResults.map(({ index, type, status }) => ({
        index,
        type,
        status,
      })),
    },
    resources: {
      canvasCount: nonNegativeInteger(resources.canvasCount, 'canvas count'),
      pendingAssetCount: nonNegativeInteger(
        page.pendingAssetCount,
        'pending asset count',
      ),
      pendingExtractionCount: nonNegativeInteger(
        page.pendingExtractionCount,
        'pending extraction count',
      ),
      obsoleteCompletionCount: nonNegativeInteger(
        page.obsoleteCompletionCount,
        'obsolete completion count',
      ),
      cleanup: clone(execution.cleanup),
    },
  };
}

function projectInputImmutability(actual, execution) {
  const before = actionActual(execution, 0, 'hash-caller-input');
  const afterEngine = actionActual(execution, 2, 'hash-caller-input');
  const afterCaller = actionActual(execution, 4, 'hash-caller-input');
  const snapshot = actionActual(execution, 5, 'snapshot-scene');
  const product = productRecord(snapshot.product, 'DET-001 snapshot product');
  const label = recordValue(product.labelText, 'DET-001 label text');
  const semantic = recordValue(label.semantic, 'DET-001 label semantic');
  const beforeHash = stringValue(before.hash, 'DET-001 before hash');
  const afterEngineHash = stringValue(
    afterEngine.hash,
    'DET-001 after engine hash',
  );
  const afterCallerHash = stringValue(
    afterCaller.hash,
    'DET-001 after caller hash',
  );

  actual.outcome.inputHashBefore = beforeHash;
  actual.outcome.inputHashAfterEngineWork = afterEngineHash;
  actual.outcome.inputHashChangedAfterCallerMutation =
    afterCallerHash !== beforeHash;
  actual.text.targets = {
    'item-a': {
      label: {
        source: stringValue(semantic.source, 'DET-001 label source'),
      },
    },
  };
  actual.scene.snapshot = {
    mutable: !booleanValue(
      product.datasetDeepFrozen,
      'DET-001 dataset deep frozen',
    ),
  };
}

function projectFreshDeterminism(actual, execution) {
  const comparison = actionActual(
    execution,
    2,
    'compare-normalized-observation',
  );
  actual.outcome.semanticDiffCount = nonNegativeInteger(
    comparison.semanticDiffCount,
    'DET-002 semantic diff count',
  );
  actual.revisions.publishedTupleOrder = stringArray(
    comparison.publishedTupleOrder,
    'DET-002 published tuple order',
  );
  actual.outcome.freshSessions = clone(
    arrayValue(comparison.sessions, 'DET-002 fresh sessions'),
  );
}

function projectSeededScenes(actual, execution) {
  const generated = actionActual(execution, 0, 'generate-seeded-scene');
  const advanced = actionActual(execution, 1, 'advance-seeded-action');
  const regenerated = actionActual(execution, 2, 'regenerate-seeded-scene');
  const advancedRows = arrayValue(advanced.results, 'DET-003 advanced rows');
  const generatedHashes = [
    nullableString(generated.semanticHash, 'DET-003 generated hash'),
    ...advancedRows.map((rowValue, index) => nullableString(
      recordValue(rowValue, `DET-003 advanced row ${index}`).semanticHash,
      `DET-003 advanced hash ${index}`,
    )),
  ];
  actual.scene.generated = { semanticHash: generatedHashes };
  actual.scene.regenerated = {
    semanticHash: [
      nullableString(regenerated.semanticHash, 'DET-003 regenerated hash'),
    ],
  };
  actual.outcome.seed = uint32(regenerated.seed, 'DET-003 seed');
  actual.outcome.actionIndices = numberArray(
    regenerated.actionIndices,
    'DET-003 action indices',
  ).map((value) => nonNegativeInteger(value, 'DET-003 action index'));
}

function projectAnimationBoundary(actual, execution) {
  const afterPatch = productRecord(
    actionActual(execution, 0, 'patch').product,
    'ANI-003 patch product',
  );
  const afterAdvance = productRecord(
    actionActual(execution, 1, 'advanceClock').product,
    'ANI-003 advance product',
  );
  const afterUndo = productRecord(
    actionActual(execution, 2, 'undo').product,
    'ANI-003 undo product',
  );
  const afterRedo = productRecord(
    actionActual(execution, 3, 'redo').product,
    'ANI-003 redo product',
  );
  const replacement = productRecord(
    actionActual(execution, 4, 'replaceDataset').product,
    'ANI-003 replacement product',
  );
  const destroyed = productRecord(
    actionActual(execution, 5, 'destroy').product,
    'ANI-003 destroyed product',
  );
  const postDestroy = actionActual(execution, 6, 'advanceClock');
  const patchDepth = snapshotHistoryDepth(afterPatch, 'ANI-003 patch history');
  const advanceDepth = snapshotHistoryDepth(
    afterAdvance,
    'ANI-003 advance history',
  );
  const replacementSnapshot = recordValue(
    replacement.snapshot,
    'ANI-003 replacement snapshot',
  );
  const destroyedSnapshot = recordValue(
    destroyed.snapshot,
    'ANI-003 destroyed snapshot',
  );
  const destroyedResources = recordValue(
    destroyedSnapshot.resources,
    'ANI-003 destroyed resources',
  );
  const subscriptions = recordValue(
    destroyedResources.subscriptions,
    'ANI-003 destroyed subscriptions',
  );
  const replacementPage = recordValue(
    replacement.pageLifecycle,
    'ANI-003 replacement page lifecycle',
  );
  const patchHistory = recordValue(
    afterPatch.history,
    'ANI-003 patch history inspection',
  );
  const patchCommands = arrayValue(
    patchHistory.commands,
    'ANI-003 patch history commands',
  );

  actual.scene.afterPatch = {
    semanticHeight: productSemanticHeight(afterPatch, 'ANI-003 patch height'),
  };
  actual.scene.afterUndo = {
    semanticHeight: productSemanticHeight(afterUndo, 'ANI-003 undo height'),
  };
  actual.scene.afterRedo = {
    semanticHeight: productSemanticHeight(afterRedo, 'ANI-003 redo height'),
  };
  actual.scene.replacement = {
    rootIds: stringArray(replacementSnapshot.rootIds, 'replacement root IDs'),
    oldAnimations: nonNegativeInteger(
      replacementPage.activeAnimationCount,
      'replacement old animations',
    ),
  };
  actual.history.depth = {
    afterPatch: patchDepth,
  };
  actual.history.actionIdAfterPatch = stringValue(
    recordValue(patchCommands.at(-1), 'ANI-003 patch history command').id,
    'ANI-003 patch history action ID',
  );
  actual.history.intermediateEntries = Math.max(0, advanceDepth - patchDepth);
  actual.resources.postDestroy = {
    callbacks: nonNegativeInteger(
      subscriptions.active,
      'post-destroy callbacks',
    ),
    publications: nonNegativeInteger(
      postDestroy.publicationDelta,
      'post-destroy publications',
    ),
  };
  actual.paint.animation.activeCount = nonNegativeInteger(
    recordValue(destroyed.pageLifecycle, 'destroyed page lifecycle')
      .activeAnimationCount,
    'destroyed active animations',
  );
  actual.revisions.frame.revision = finiteNumber(
    destroyedSnapshot.frameRevision,
    'destroyed frame revision',
  );
}

function projectPageLifecycle(actual, execution) {
  const preSuspendProduct = productRecord(
    actionActual(execution, 5, 'startExtraction').product,
    'LIF-006 pre-suspend product',
  );
  const finalProduct = productRecord(
    actionActual(execution, 8, 'publishFrame').product,
    'LIF-006 final product',
  );
  const pre = lifecycleProjection(preSuspendProduct, 'LIF-006 pre-suspend');
  const final = lifecycleProjection(finalProduct, 'LIF-006 final');
  const finalPage = recordValue(
    finalProduct.pageLifecycle,
    'LIF-006 final lifecycle',
  );

  actual.resources.preSuspend = {
    pendingAssetCount: pre.resources.pendingAssetCount,
    pendingExtractionCount: pre.resources.pendingExtractionCount,
  };
  actual.scene.preSuspend = {
    activeAnimationCount: pre.scene.activeAnimationCount,
  };
  actual.interaction.preSuspend = clone(pre.interaction);
  actual.resources.pendingAssetCount = final.resources.pendingAssetCount;
  actual.resources.pendingExtractionCount =
    final.resources.pendingExtractionCount;
  actual.resources.obsoleteCompletionCount = nonNegativeInteger(
    finalPage.obsoleteCompletionCount,
    'LIF-006 obsolete completion count',
  );
  actual.scene.activeAnimationCount = final.scene.activeAnimationCount;
  actual.interaction.pointerCaptureCount =
    final.interaction.pointerCaptureCount;
  actual.interaction.activeGestureCount = final.interaction.activeGestureCount;
  actual.interaction.decelerationActive =
    final.interaction.decelerationActive;
  actual.geometry.targets = {
    'item-a': {
      components: {
        bar: {
          size: {
            height: final.geometry.barHeight,
          },
        },
      },
    },
  };
  actual.outcome.resume = {
    publishedFrameCount: nonNegativeInteger(
      finalPage.resumePublishedFrameCount,
      'LIF-006 resumed frame count',
    ),
  };
  actual.revisions.valuesFinite =
    actual.revisions.valuesFinite && allNumbersFinite({ pre, final });
}

function lifecycleProjection(product, label) {
  const page = recordValue(product.pageLifecycle, `${label} page lifecycle`);
  const bar = nullableRecord(product.bar, `${label} bar`);
  const barGeometry = bar === null
    ? null
    : nullableRecord(bar.geometry, `${label} bar geometry`);
  const barSemantic = bar === null
    ? null
    : nullableRecord(bar.semantic, `${label} bar semantic`);
  const localBounds = barGeometry === null
    ? null
    : boundsTuple(barGeometry.localBounds, `${label} bar bounds`);
  return {
    resources: {
      pendingAssetCount: nonNegativeInteger(
        page.pendingAssetCount,
        `${label} pending assets`,
      ),
      pendingExtractionCount: nonNegativeInteger(
        page.pendingExtractionCount,
        `${label} pending extractions`,
      ),
    },
    scene: {
      activeAnimationCount: nonNegativeInteger(
        page.activeAnimationCount,
        `${label} active animations`,
      ),
    },
    geometry: {
      barHeight: localBounds === null
        ? componentSemanticHeight(barSemantic, `${label} semantic height`)
        : localBounds[3],
    },
    interaction: {
      decelerationActive: booleanValue(
        page.decelerationActive,
        `${label} deceleration`,
      ),
      activeGestureCount: nonNegativeInteger(
        page.activeGestureCount,
        `${label} active gestures`,
      ),
      pointerCaptureCount: nonNegativeInteger(
        page.pointerCaptureCount,
        `${label} pointer capture`,
      ),
    },
  };
}

function productSemanticHeight(product, label) {
  const presentation = nullableRecord(
    product.barPresentation,
    `${label} bar presentation`,
  );
  if (presentation !== null) {
    return finiteNumber(presentation.semanticHeight, label);
  }
  const bar = recordValue(product.bar, `${label} bar`);
  return componentSemanticHeight(
    nullableRecord(bar.semantic, `${label} bar semantic`),
    label,
  );
}

function componentSemanticHeight(semantic, label) {
  assert(semantic !== null, `${label} semantic available`);
  const size = semantic.authoredSize;
  if (typeof size === 'number') return finiteNumber(size, label);
  const record = recordValue(size, `${label} authored size`);
  return finiteNumber(record.height, label);
}

function snapshotHistoryDepth(product, label) {
  const snapshot = recordValue(product.snapshot, `${label} snapshot`);
  return nonNegativeInteger(snapshot.historyDepth, label);
}

function validatePlan(value) {
  const plan = recordValue(value, 'case plan');
  assert(CASE_ACTIONS[plan.id] !== undefined, 'supported case plan');
  assert(Array.isArray(plan.actionTrace), 'case action trace');
  assert(
    sameArray(
      plan.actionTrace.map((actionValue) =>
        recordValue(actionValue, 'plan action').type),
      CASE_ACTIONS[plan.id],
    ),
    'case action trace identity',
  );
  return plan;
}

function validateExecution(value, plan) {
  const execution = recordValue(value, 'execution');
  assert(execution.$schema === EXECUTION_REVISION, 'execution schema');
  assert(execution.status === 'completed', 'execution completed');
  assert(execution.caseId === plan.id, 'execution case identity');
  assert(Array.isArray(execution.actionResults), 'execution action results');
  assert(
    execution.actionResults.length === CASE_ACTIONS[plan.id].length,
    'action result count',
  );
  execution.actionResults.forEach((resultValue, index) => {
    const result = recordValue(resultValue, `action ${index}`);
    assert(result.index === index, `action ${index} index`);
    assert(result.type === CASE_ACTIONS[plan.id][index], `action ${index} type`);
    assert(
      result.handlerId === `contract/${result.type}`,
      `action ${index} handler identity`,
    );
    assert(result.status === 'completed', `action ${index} status`);
    const delta = recordValue(result.delta, `action ${index} delta`);
    assert(delta.$schema === DELTA_REVISION, `action ${index} delta schema`);
    assert(delta.caseId === plan.id, `action ${index} delta case`);
    assert(delta.actionIndex === index, `action ${index} delta index`);
    recordValue(delta.actual, `action ${index} actual`);
  });
  assert(Array.isArray(execution.eventJournal), 'execution event journal');
  assert(Array.isArray(execution.eventJournalFailures), 'event journal failures');
  assert(execution.eventJournalFailures.length === 0, 'event journal failure count');
  assert(Array.isArray(execution.captures), 'execution captures');
  const cleanup = recordValue(execution.cleanup, 'execution cleanup');
  assert(cleanup.status === 'completed', 'execution cleanup status');
  assert(
    Array.isArray(cleanup.errors) && cleanup.errors.length === 0,
    'execution cleanup errors',
  );
  const productResources = recordValue(
    cleanup.productResources,
    'cleanup product resources',
  );
  const runtimeCounts = recordValue(
    productResources.runtimeCounts,
    'cleanup runtime counts',
  );
  assert(
    Object.values(runtimeCounts).every((count) => count === 0),
    'runtime ownership released',
  );
  return execution;
}

function actionActual(execution, index, type) {
  const result = recordValue(execution.actionResults[index], `action ${index}`);
  assert(result.type === type, `action ${index} expected ${type}`);
  return recordValue(
    recordValue(result.delta, `action ${index} delta`).actual,
    `action ${index} actual`,
  );
}

function captureMap(execution) {
  const captures = isRecord(execution.bindings)
    ? clone(execution.bindings)
    : {};
  for (const entryValue of execution.captures) {
    const entry = recordValue(entryValue, 'capture');
    const id = stringValue(entry.id, 'capture ID');
    assert(!Object.hasOwn(captures, id), `capture ${id} uniqueness`);
    captures[id] = clone(recordValue(entry.values, `capture ${id} values`));
  }
  return captures;
}

function duplicateSequenceCount(journal) {
  const seen = new Set();
  let duplicates = 0;
  for (const [index, entryValue] of journal.entries()) {
    const entry = recordValue(entryValue, `event journal ${index}`);
    const sequence = positiveInteger(entry.sequence, `event journal ${index} sequence`);
    if (seen.has(sequence)) duplicates += 1;
    seen.add(sequence);
  }
  return duplicates;
}

function countInvalidNodes(dataset) {
  let count = 0;
  const visit = (values) => {
    for (const value of values) {
      if (!isRecord(value)) {
        count += 1;
        continue;
      }
      if (typeof value.id !== 'string' || value.id.length === 0) count += 1;
      if (Array.isArray(value.children)) visit(value.children);
    }
  };
  visit(dataset);
  return count;
}

function countKeyedStatus(value, pattern, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return 0;
  seen.add(value);
  let count = 0;
  for (const [key, nested] of Object.entries(value)) {
    if (
      pattern.test(key)
      && ((typeof nested === 'number' && nested > 0) || nested === true)
    ) {
      count += typeof nested === 'number' ? nested : 1;
    } else {
      count += countKeyedStatus(nested, pattern, seen);
    }
  }
  return count;
}

function countNonFinite(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? 0 : 1;
  if (typeof value !== 'object' || seen.has(value)) return 0;
  seen.add(value);
  return Object.values(value).reduce(
    (count, nested) => count + countNonFinite(nested, seen),
    0,
  );
}

function countUnpairedSurrogates(value, seen = new WeakSet()) {
  if (typeof value === 'string') {
    let count = 0;
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = value.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) index += 1;
        else count += 1;
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        count += 1;
      }
    }
    return count;
  }
  if (value === null || typeof value !== 'object' || seen.has(value)) return 0;
  seen.add(value);
  return Object.values(value).reduce(
    (count, nested) => count + countUnpairedSurrogates(nested, seen),
    0,
  );
}

function historyCorruptCount(history) {
  if (history === null) return 0;
  if (Array.isArray(history.corruptEntries)) return history.corruptEntries.length;
  if (typeof history.corruptEntryCount === 'number') {
    return nonNegativeInteger(history.corruptEntryCount, 'history corrupt entries');
  }
  return 0;
}

function allNumbersFinite(value, seen = new WeakSet()) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (value === null || typeof value !== 'object' || seen.has(value)) return true;
  seen.add(value);
  return Object.values(value).every((nested) => allNumbersFinite(nested, seen));
}

function notExercised(reason) {
  return { _availability: { status: 'not-exercised', reason } };
}

function exactRecord(value, keys, label) {
  const record = recordValue(value, label);
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  assert(
    actual.length === expected.length
      && actual.every((key, index) => key === expected[index]),
    `${label} keys`,
  );
  return record;
}

function productRecord(value, label) {
  return recordValue(value, label);
}

function recordValue(value, label) {
  assert(isRecord(value), `${label} object`);
  return value;
}

function nullableRecord(value, label) {
  return value === null ? null : recordValue(value, label);
}

function arrayValue(value, label) {
  assert(Array.isArray(value), `${label} array`);
  return value;
}

function stringArray(value, label) {
  assert(
    Array.isArray(value)
      && value.every((entry) => typeof entry === 'string'),
    `${label} string array`,
  );
  return [...value];
}

function numberArray(value, label) {
  assert(
    Array.isArray(value)
      && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry)),
    `${label} number array`,
  );
  return [...value];
}

function boundsTuple(value, label) {
  const values = numberArray(value, label);
  assert(values.length === 4, `${label} bounds`);
  return values;
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} string`);
  return value;
}

function nullableString(value, label) {
  assert(value === null || typeof value === 'string', `${label} nullable string`);
  return value;
}

function booleanValue(value, label) {
  assert(typeof value === 'boolean', `${label} boolean`);
  return value;
}

function positiveInteger(value, label) {
  assert(Number.isSafeInteger(value) && value > 0, `${label} positive integer`);
  return value;
}

function nonNegativeInteger(value, label) {
  assert(
    Number.isSafeInteger(value) && value >= 0,
    `${label} non-negative integer`,
  );
  return value;
}

function uint32(value, label) {
  const number = nonNegativeInteger(value, label);
  assert(number <= 0xffff_ffff, `${label} uint32`);
  return number;
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} finite`);
  return value;
}

function clone(value) {
  return structuredClone(value);
}

function sameArray(left, right) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function validateJson(value, path, ancestors) {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) return;
  if (typeof value === 'number') {
    assert(Number.isFinite(value), `${path} finite number`);
    assert(!Object.is(value, -0), `${path} not negative zero`);
    return;
  }
  assert(typeof value === 'object', `${path} JSON value`);
  assert(!ancestors.has(value), `${path} no cycle`);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      value.forEach((nested, index) =>
        validateJson(nested, `${path}[${index}]`, ancestors));
      return;
    }
    assert(isRecord(value), `${path} object`);
    for (const [key, nested] of Object.entries(value)) {
      validateJson(nested, `${path}.${key}`, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Core v2 determinism/lifecycle fold invalid: ${message}`);
  }
}
