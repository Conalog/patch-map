import { clone, deepFreeze } from './value-atoms.mjs';

export const REPLACEMENT_RECOVERY_FOLD_REVISION =
  'core-v2-replacement-recovery-fold/1';

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
  'ERR-002': Object.freeze([
    'load-dataset',
    'snapshot-observation',
    'query-target',
    'merge-target',
    'replace-scene',
    'snapshot-observation',
    'merge-target',
    'snapshot-observation',
  ]),
  'ERR-005': Object.freeze([
    'submit-scene-revision',
    'submit-scene-revision',
    'complete-request',
    'complete-request',
  ]),
  'LIF-003': Object.freeze([
    'loadDataset',
    'select',
    'seed-replacement-stale-state',
    'startAnimation',
    'replaceDataset',
    'replaceDataset',
    'replaceDataset',
    'replaceDataset',
    'replaceDataset',
    'replaceDataset',
  ]),
  'CSM-002': Object.freeze([
    'load-scene',
    'select-targets',
    'replace-scene',
    'query-stale-target',
    'probe-declared-failure',
  ]),
  'CSM-004': Object.freeze([
    'load-scene',
    'submit-async-revision',
    'submit-async-revision',
    'complete-async-revision',
    'complete-async-revision',
    'probe-declared-failure',
  ]),
  'CSM-037': Object.freeze([
    'load-scene',
    'replace-scene',
    'apply-presentation-overlay',
    'fit-view',
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

/** Fold only action deltas and public Engine probes; approved expected is never imported. */
export function foldReplacementRecoveryExecution(optionsValue) {
  const options = recordValue(optionsValue, 'fold options');
  const plan = validatePlan(options.casePlan);
  const execution = validateExecution(options.execution, plan);
  const finalAction = actionActual(
    execution,
    execution.actionResults.length - 1,
    CASE_ACTIONS[plan.id].at(-1),
  );
  const product = productRecord(finalAction.product, `${plan.id} final product`);
  const snapshot = recordValue(product.snapshot, 'final snapshot');
  const semantic = recordValue(product.semantic, 'final semantic');
  const semanticInteraction = recordValue(semantic.interaction, 'semantic interaction');
  const runtimeState = recordValue(finalAction.runtimeState, 'final runtime state');
  const actual = baseActual(options, plan, execution, product, snapshot, semantic);

  if (plan.id === 'LIF-003') {
    projectLifecycleReplacement(actual, execution, product, semanticInteraction, runtimeState);
  } else if (plan.id === 'ERR-002') {
    projectTargetErrors(actual, execution, product, runtimeState);
  } else if (plan.id === 'ERR-005') {
    projectRevisionErrors(actual, execution, product);
  } else if (plan.id === 'CSM-002') {
    projectReplacementJourney(actual, execution, product, runtimeState);
  } else if (plan.id === 'CSM-004') {
    projectAsyncJourney(actual, execution, product, runtimeState);
  } else {
    projectReportJourney(actual, execution, product, runtimeState);
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

function baseActual(options, plan, execution, product, snapshot, semantic) {
  const revisions = recordValue(snapshot.revisions, 'snapshot revisions');
  const interaction = recordValue(semantic.interaction, 'semantic interaction');
  const history = recordValue(product.history, 'history state');
  const resources = recordValue(snapshot.resources, 'snapshot resources');
  const runtime = recordValue(product.runtime, 'runtime probe');
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
    environment: clone(recordValue(options.environment, 'environment')),
    revisions: {
      lifecycle: {
        generation: finiteNumber(
          revisions.lifecycleGeneration,
          'lifecycle generation',
        ),
      },
      scene: finiteNumber(revisions.sceneRevision, 'scene revision'),
      valuesFinite: allNumbersFinite(revisions),
    },
    scene: {
      revision: finiteNumber(revisions.sceneRevision, 'scene revision'),
      rootIds: stringArray(snapshot.rootIds, 'root IDs'),
      semanticHash: nullableString(snapshot.semanticHash, 'semantic hash'),
      authoritativeDatasetRef: nullableString(snapshot.datasetRef, 'dataset ref'),
      targets: {},
    },
    geometry: {
      nonFiniteCount: countNonFinite(product.geometry),
    },
    text: {
      unpairedSurrogates: countUnpairedSurrogates(product.dataset),
      targets: {},
    },
    paint: {
      unresolvedIntentCount: unresolvedPresentationIntentCount(product.presentation),
      animations: {
        activeCount: nonNegativeInteger(
          interaction.activeAnimationCount ?? 0,
          'active animation count',
        ),
      },
      targets: {},
    },
    interaction: {
      selectedTargets: stringArray(snapshot.selectionIds, 'selection IDs'),
      selection: { ids: stringArray(snapshot.selectionIds, 'selection IDs') },
      transformerSelection: selectionVisualIds(product.selectionVisual),
      activeGestureCount: activeGestureCount(interaction, product.hostInteraction),
    },
    events: {
      unclassifiedCount: execution.eventJournal.filter((entry) => (
        !JOURNAL_EVENTS.has(recordValue(entry, 'event journal entry').event)
      )).length,
      journalCount: execution.eventJournal.length,
    },
    history: {
      depth: nonNegativeInteger(history.depth, 'history depth'),
      corruptEntryCount: historyCorruptEntryCount(history),
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
      pendingWork: nonNegativeInteger(snapshot.pendingWork, 'pending work'),
      dom: {
        canvasCount: nonNegativeInteger(resources.canvasCount, 'canvas count'),
      },
      unmanagedOverlayCount: nonNegativeInteger(
        runtime.unmanagedOverlayCount,
        'unmanaged overlay count',
      ),
      leakDelta: cleanupLeakDelta(execution.cleanup),
      cleanup: clone(execution.cleanup),
    },
  };
}

function projectLifecycleReplacement(actual, execution, product, interaction, runtimeState) {
  const capture = captureValues(execution, 'preReplacement');
  actual.events.preReplacement = {
    bindingCount: nonNegativeInteger(
      capture['events/bindingCount'],
      'pre-replacement binding count',
    ),
  };
  actual.interaction.preReplacement = {
    selection: stringArray(
      capture['interaction/selection'],
      'pre-replacement selection',
    ),
    transformerSelection: stringArray(
      capture['interaction/transformerSelection'],
      'pre-replacement transformer selection',
    ),
  };
  actual.history.preReplacement = {
    depth: nonNegativeInteger(
      capture['history/depth'],
      'pre-replacement history depth',
    ),
  };
  actual.resources.preReplacement = {
    unmanagedOverlayCount: nonNegativeInteger(
      capture['resources/unmanagedOverlayCount'],
      'pre-replacement overlay count',
    ),
  };
  actual.paint.preReplacement = {
    animations: {
      activeCount: nonNegativeInteger(
        capture['paint/animations/activeCount'],
        'pre-replacement active animation count',
      ),
    },
  };
  const snapshot = recordValue(product.snapshot, 'LIF-003 product snapshot');
  const runtime = recordValue(product.runtime, 'LIF-003 runtime');
  actual.scene.authoritativeDatasetId = nullableString(
    snapshot.datasetRef,
    'authoritative dataset ID',
  );
  actual.scene.query = {
    'item-z': { count: countDatasetId(product.dataset, 'item-z') },
  };
  actual.paint.animations.activeCount = nonNegativeInteger(
    interaction.activeAnimationCount ?? 0,
    'final active animation count',
  );
  actual.events.staleBindingsInvoked = nonNegativeInteger(
    runtimeState.staleBindingsInvoked,
    'stale bindings invoked',
  );
  actual.resources.unmanagedOverlayCount = nonNegativeInteger(
    runtime.unmanagedOverlayCount,
    'final unmanaged overlay count',
  );
  actual.resources.replacementCycleCount = nonNegativeInteger(
    runtime.replacementCycleCount,
    'replacement cycle count',
  );
  actual.resources.replacementCycles = clone(recordValue(
    runtime.replacementCycles,
    'replacement cycles',
  ));
}

function projectTargetErrors(actual, execution, product, runtimeState) {
  const empty = productRecord(
    actionActual(execution, 1, 'snapshot-observation').product,
    'ERR-002 empty product',
  );
  const before = productRecord(
    actionActual(execution, 5, 'snapshot-observation').product,
    'ERR-002 before-stale product',
  );
  const after = productRecord(
    actionActual(execution, 7, 'snapshot-observation').product,
    'ERR-002 after-stale product',
  );
  const query = actionActual(execution, 2, 'query-target');
  const missing = recordValue(
    actionActual(execution, 3, 'merge-target').result,
    'missing result',
  );
  const stale = recordValue(
    actionActual(execution, 6, 'merge-target').result,
    'stale result',
  );
  actual.scene.phases = {
    empty: {
      rootIds: stringArray(
        recordValue(empty.snapshot, 'empty snapshot').rootIds,
        'empty root IDs',
      ),
    },
    'before-stale': {
      semanticHash: nullableString(
        recordValue(before.snapshot, 'before snapshot').semanticHash,
        'before semantic hash',
      ),
    },
    'after-stale': {
      semanticHash: nullableString(
        recordValue(after.snapshot, 'after snapshot').semanticHash,
        'after semantic hash',
      ),
    },
  };
  actual.outcome.query = { result: clone(query.result) };
  actual.outcome.missing = {
    code: diagnosticCode(missing, 'missing diagnostic'),
  };
  actual.outcome.stale = {
    code: diagnosticCode(stale, 'stale diagnostic'),
  };
  actual.interaction.phases = {
    'before-stale': interactionPhase(before),
    'after-stale': interactionPhase(after),
  };
  actual.history.phases = {
    'after-stale': {
      depth: nonNegativeInteger(
        recordValue(after.history, 'after history').depth,
        'after history depth',
      ),
    },
  };
  actual.events.invalidOperationsPublished = nonNegativeInteger(
    runtimeState.invalidOperationsPublished,
    'invalid operations published',
  );
  actual.scene.rootIds = stringArray(
    recordValue(product.snapshot, 'final snapshot').rootIds,
    'final root IDs',
  );
}

function projectRevisionErrors(actual, execution, product) {
  const rejected = recordValue(
    actionActual(execution, 2, 'complete-request').result,
    'ERR-005 request A',
  );
  const accepted = recordValue(
    actionActual(execution, 3, 'complete-request').result,
    'ERR-005 request B',
  );
  actual.outcome.requests = {
    A: { code: requestCode(rejected) },
    B: { code: requestCode(accepted) },
  };
  actual.scene.publication = {
    partialRevisionCount: nonNegativeInteger(
      actionActual(execution, 3, 'complete-request').partialRevisionCount,
      'partial revision count',
    ),
  };
  actual.resources.pendingWork = nonNegativeInteger(
    recordValue(product.snapshot, 'ERR-005 snapshot').pendingWork,
    'ERR-005 pending work',
  );
}

function projectReplacementJourney(actual, execution, product, runtimeState) {
  const stale = actionActual(execution, 3, 'query-stale-target');
  const failure = actionActual(execution, 4, 'probe-declared-failure');
  const snapshot = recordValue(product.snapshot, 'CSM-002 snapshot');
  const selectedIds = stringArray(snapshot.selectionIds, 'CSM-002 selection');
  const staleRelationCount = staleRelationCountFromProbe(product.relations);
  const staleCode = nullableString(stale.staleTargetCode, 'stale target code');
  actual.interaction.selectedTargets = selectedIds;
  actual.outcome.staleTarget = { code: staleCode };
  actual.scene.staleRelationCount = staleRelationCount;
  actual.outcome.hostEngineSeam = {
    engineReturns: {
      sceneRevision: finiteNumber(
        recordValue(snapshot.revisions, 'CSM-002 revisions').sceneRevision,
        'CSM-002 scene revision',
      ),
      staleTargetCode: staleCode,
      selectedIds,
      staleHitCount: staleRelationCount,
    },
    failureRollback: clone(recordValue(failure.rollback, 'CSM-002 rollback')),
    finalState: {
      sceneRevision: finiteNumber(
        recordValue(snapshot.revisions, 'CSM-002 revisions').sceneRevision,
        'CSM-002 final scene revision',
      ),
      selectedIds,
      tooltipTarget: runtimeState.tooltipTarget ?? null,
      updateGeneration: nonNegativeInteger(
        runtimeState.hostRevision,
        'CSM-002 update generation',
      ),
    },
  };
}

function projectAsyncJourney(actual, execution, product, runtimeState) {
  const failure = actionActual(execution, 5, 'probe-declared-failure');
  const snapshot = recordValue(product.snapshot, 'CSM-004 snapshot');
  const requestResults = recordValue(runtimeState.requestResults, 'request results');
  const baseCode = nullableString(requestResults['base-A'], 'base-A result');
  const overlayCode = requestResults['overlay-B'] === null
    ? null
    : nullableString(requestResults['overlay-B'], 'overlay-B result');
  const partialPublicationCount = nonNegativeInteger(
    actionActual(execution, 4, 'complete-async-revision').partialPublicationCount,
    'CSM-004 partial publication count',
  );
  const selectedIds = stringArray(snapshot.selectionIds, 'CSM-004 selection');
  actual.outcome.requests = {
    'base-A': { code: baseCode },
    'overlay-B': { code: overlayCode },
  };
  actual.scene.partialPublicationCount = partialPublicationCount;
  actual.outcome.hostEngineSeam = {
    engineReturns: {
      requestResults: {
        'base-A': baseCode,
        'overlay-B': overlayCode === null ? 'accepted' : overlayCode,
      },
      sceneRevision: finiteNumber(
        recordValue(snapshot.revisions, 'CSM-004 revisions').sceneRevision,
        'CSM-004 scene revision',
      ),
    },
    failureRollback: clone(recordValue(failure.rollback, 'CSM-004 rollback')),
    finalState: {
      sceneRevision: finiteNumber(
        recordValue(snapshot.revisions, 'CSM-004 revisions').sceneRevision,
        'CSM-004 final scene revision',
      ),
      hostRevision: nonNegativeInteger(
        runtimeState.hostRevision,
        'CSM-004 host revision',
      ),
      selectedIds,
    },
  };
  actual.interaction.staleGestureCount = activeGestureCount(
    recordValue(product.semantic, 'CSM-004 semantic').interaction,
    product.hostInteraction,
  );
}

function projectReportJourney(actual, execution, product, runtimeState) {
  const snapshot = recordValue(product.snapshot, 'CSM-037 snapshot');
  const presentation = recordValue(product.presentation, 'CSM-037 presentation');
  const entities = arrayValue(presentation.entities, 'presentation entities');
  const links = entities.find((entry) => recordValue(entry, 'presentation entity').id === 'links');
  const fillOverrides = arrayValue(
    presentation.fillOverrides,
    'presentation fill overrides',
  );
  const itemFill = fillOverrides.find((entry) => (
    recordValue(entry, 'fill override').id === 'item-a'
  ));
  assert(links !== undefined, 'links presentation entity');
  assert(itemFill !== undefined, 'item-a fill override');
  const fit = actionActual(execution, 3, 'fit-view');
  const failure = actionActual(execution, 4, 'probe-declared-failure');
  const fitContributorIds = stringArray(
    fit.fitContributorIds,
    'fit contributor IDs',
  );
  const bar = recordValue(product.bar, 'item-a bar probe');
  const authoredSize = recordValue(
    recordValue(bar.semantic, 'bar semantic').authoredSize,
    'bar authored size',
  );
  const reportText = recordValue(product.reportText, 'report text probe');
  const reportSource = stringValue(
    recordValue(reportText.semantic, 'report text semantic').source,
    'report text source',
  );
  const item = findDatasetId(product.dataset, 'item-a');
  const hiddenRelationIds = stringArray(
    runtimeState.hiddenRelationIds,
    'hidden relation IDs',
  );
  const sceneRevision = finiteNumber(
    recordValue(snapshot.revisions, 'CSM-037 revisions').sceneRevision,
    'CSM-037 scene revision',
  );
  const selectedIds = stringArray(snapshot.selectionIds, 'CSM-037 selection');
  const datasetRef = nullableString(snapshot.datasetRef, 'report dataset ref');
  const barHeight = finiteNumber(authoredSize.height, 'report bar height');

  actual.scene.targets.links = {
    visible: Boolean(recordValue(links, 'links presentation').visible),
  };
  actual.paint.targets['item-a'] = {
    fill: packedRgba(recordValue(itemFill, 'item fill').packedColor),
  };
  actual.interaction.fitContributors = fitContributorIds;
  actual.scene.authoritativeDatasetRef = datasetRef;
  actual.geometry.targets = {
    'item-a': {
      components: {
        bar: { size: { height: barHeight } },
      },
    },
  };
  actual.text.targets = {
    'text-c': { content: reportSource },
  };
  actual.scene.targets['item-a'] = {
    label: stringValue(item.label, 'report item label'),
  };
  actual.outcome.hostEngineSeam = {
    engineReturns: {
      acceptedHostRevision: nonNegativeInteger(
        runtimeState.hostRevision,
        'accepted host revision',
      ),
      hiddenRelationIds,
      fitContributorIds,
      authoritativeDatasetRef: datasetRef,
      barHeight,
      reportText: reportSource,
    },
    failureRollback: clone(recordValue(failure.rollback, 'CSM-037 rollback')),
    finalState: {
      sceneRevision,
      selectedIds,
      mode: stringValue(runtimeState.mode, 'report mode'),
      relationPresentationHidden: hiddenRelationIds,
    },
  };
}

function interactionPhase(product) {
  const snapshot = recordValue(product.snapshot, 'phase snapshot');
  return {
    view: clone(product.viewport ?? snapshot.viewport),
    selectedIds: stringArray(snapshot.selectionIds, 'phase selected IDs'),
  };
}

function validatePlan(value) {
  const plan = recordValue(value, 'case plan');
  assert(CASE_ACTIONS[plan.id] !== undefined, 'supported case plan');
  assert(Array.isArray(plan.actionTrace), 'case action trace');
  assert(
    sameArray(plan.actionTrace.map((action) => recordValue(action, 'plan action').type), CASE_ACTIONS[plan.id]),
    'case action trace identity',
  );
  return plan;
}

function validateExecution(value, plan) {
  const execution = recordValue(value, 'execution');
  assert(execution.status === 'completed', 'execution completed');
  assert(execution.caseId === plan.id, 'execution case identity');
  assert(Array.isArray(execution.actionResults), 'execution action results');
  assert(execution.actionResults.length === CASE_ACTIONS[plan.id].length, 'action result count');
  assert(Array.isArray(execution.eventJournal), 'event journal');
  assert(Array.isArray(execution.captures), 'captures');
  recordValue(execution.cleanup, 'execution cleanup');
  validateProductCleanup(execution.cleanup);
  return execution;
}

function validateProductCleanup(cleanupValue) {
  const cleanup = recordValue(cleanupValue, 'cleanup');
  assert(cleanup.status === 'completed', 'cleanup status');
  const productResources = cleanup.productResources;
  if (productResources === undefined) return;
  const probe = recordValue(productResources, 'cleanup product resources');
  const counts = recordValue(probe.runtimeCounts, 'cleanup runtime counts');
  assert(Object.values(counts).every((value) => value === 0), 'runtime cleanup counts');
  assert(probe.retainedOverlayCount === 0, 'retained overlay count');
}

function actionActual(execution, index, type) {
  const result = recordValue(execution.actionResults[index], `action ${index}`);
  assert(result.index === index, `action ${index} index`);
  assert(result.type === type, `action ${index} type`);
  assert(result.status === 'completed', `action ${index} status`);
  const delta = recordValue(result.delta, `action ${index} delta`);
  return recordValue(delta.actual, `action ${index} actual`);
}

function productRecord(value, label) {
  return recordValue(value, label);
}

function captureMap(execution) {
  return Object.fromEntries(execution.captures.map((entryValue) => {
    const entry = recordValue(entryValue, 'capture');
    return [
      stringValue(entry.id, 'capture ID'),
      clone(recordValue(entry.values, 'capture values')),
    ];
  }));
}

function captureValues(execution, id) {
  const entry = execution.captures.find((candidate) => (
    recordValue(candidate, 'capture').id === id
  ));
  assert(entry !== undefined, `capture ${id}`);
  return recordValue(recordValue(entry, `capture ${id}`).values, `${id} values`);
}

function diagnosticCode(result, label) {
  return stringValue(
    recordValue(result.diagnostic, label).code,
    `${label} code`,
  );
}

function requestCode(result) {
  return result.status === 'committed'
    ? null
    : stringValue(recordValue(result.diagnostic, 'request diagnostic').code, 'request code');
}

function unresolvedPresentationIntentCount(value) {
  if (!isRecord(value)) return 0;
  const overrides = Array.isArray(value.fillOverrides) ? value.fillOverrides : [];
  const entities = Array.isArray(value.entities) ? value.entities : [];
  return overrides.filter((overrideValue) => {
    const override = recordValue(overrideValue, 'presentation override');
    const entity = entities.find((entityValue) => (
      recordValue(entityValue, 'presentation entity').id === override.id
    ));
    if (entity === undefined) return true;
    const fills = recordValue(entity, 'presentation entity').packedFills;
    return Array.isArray(fills) && fills.length > 0
      ? !fills.includes(override.packedColor)
      : false;
  }).length;
}

function staleRelationCountFromProbe(value) {
  if (!isRecord(value)) return 0;
  return Array.isArray(value.omittedRelations) ? value.omittedRelations.length : 0;
}

function cleanupLeakDelta(value) {
  const cleanup = recordValue(value, 'cleanup');
  const releases = arrayValue(cleanup.releases, 'cleanup releases');
  let total = 0;
  for (const releaseValue of releases) {
    const release = recordValue(releaseValue, 'cleanup release');
    const remaining = release.remainingResources;
    if (!isRecord(remaining)) continue;
    for (const field of ['canvasCount', 'subscriptions', 'pendingWork']) {
      const count = remaining[field];
      if (typeof count === 'number' && Number.isFinite(count)) total += Math.abs(count);
    }
  }
  return total;
}

function historyCorruptEntryCount(value) {
  const state = recordValue(value, 'history state');
  const depth = nonNegativeInteger(state.depth, 'history depth');
  const cursor = nonNegativeInteger(state.cursor, 'history cursor');
  const undoDepth = nonNegativeInteger(state.undoDepth, 'history undo depth');
  const redoDepth = nonNegativeInteger(state.redoDepth, 'history redo depth');
  return Number(
    cursor > depth
    || undoDepth !== cursor
    || redoDepth !== depth - cursor
    || state.canUndo !== (!state.destroyed && cursor > 0)
    || state.canRedo !== (!state.destroyed && cursor < depth),
  );
}

function activeGestureCount(interactionValue, hostValue) {
  const interaction = recordValue(interactionValue, 'semantic interaction');
  if (interaction.activeGestureCount !== undefined) {
    return nonNegativeInteger(interaction.activeGestureCount, 'active gesture count');
  }
  if (!isRecord(hostValue) || !isRecord(hostValue.mode)) return 0;
  return nonNegativeInteger(hostValue.mode.captureCount ?? 0, 'host capture count');
}

function selectionVisualIds(value) {
  if (!isRecord(value) || !Array.isArray(value.overlayTargets)) return [];
  return value.overlayTargets.map((entry, index) => stringValue(
    recordValue(entry, `selection visual ${index}`).selectionId,
    `selection visual ${index} ID`,
  ));
}

function packedRgba(value) {
  const packed = nonNegativeInteger(value, 'packed RGBA');
  assert(packed <= 0xffffffff, 'packed RGBA range');
  return `#${packed.toString(16).padStart(8, '0')}`;
}

function countDatasetId(value, id) {
  let count = 0;
  visitDataset(value, (entry) => {
    if (entry.id === id) count += 1;
  });
  return count;
}

function findDatasetId(value, id) {
  let found = null;
  visitDataset(value, (entry) => {
    if (entry.id === id) found = entry;
  });
  assert(found !== null, `dataset target ${id}`);
  return found;
}

function visitDataset(value, visitor) {
  const elements = arrayValue(value, 'dataset');
  const visit = (entries) => {
    for (const entryValue of entries) {
      const entry = recordValue(entryValue, 'dataset element');
      visitor(entry);
      if (entry.type === 'item' && Array.isArray(entry.elements)) visit(entry.elements);
      if (entry.type === 'grid' && Array.isArray(entry.elements)) {
        for (const row of entry.elements) {
          if (Array.isArray(row)) visit(row);
        }
      }
    }
  };
  visit(elements);
}

function countNonFinite(value, seen = new WeakSet()) {
  if (typeof value === 'number') return Number.isFinite(value) ? 0 : 1;
  if (value === null || typeof value !== 'object' || seen.has(value)) return 0;
  seen.add(value);
  let count = 0;
  for (const nested of Object.values(value)) count += countNonFinite(nested, seen);
  return count;
}

function allNumbersFinite(value, seen = new WeakSet()) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (value === null || typeof value !== 'object' || seen.has(value)) return true;
  seen.add(value);
  return Object.values(value).every((nested) => allNumbersFinite(nested, seen));
}

function countUnpairedSurrogates(value, seen = new WeakSet()) {
  if (typeof value === 'string') {
    let count = 0;
    for (let index = 0; index < value.length; index += 1) {
      const unit = value.charCodeAt(index);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        const next = value.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) index += 1;
        else count += 1;
      } else if (unit >= 0xdc00 && unit <= 0xdfff) {
        count += 1;
      }
    }
    return count;
  }
  if (value === null || typeof value !== 'object' || seen.has(value)) return 0;
  seen.add(value);
  return Object.values(value).reduce(
    (total, nested) => total + countUnpairedSurrogates(nested, seen),
    0,
  );
}

function validateJson(value, path, ancestors) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    assert(Number.isFinite(value) && !Object.is(value, -0), `${path} finite JSON number`);
    return;
  }
  assert(typeof value === 'object', `${path} JSON type`);
  assert(!ancestors.has(value), `${path} acyclic`);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => validateJson(entry, `${path}[${index}]`, ancestors));
    } else {
      for (const [key, nested] of Object.entries(value)) {
        validateJson(nested, `${path}.${key}`, ancestors);
      }
    }
  } finally {
    ancestors.delete(value);
  }
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function nullableString(value, label) {
  assert(value === null || typeof value === 'string', label);
  return value;
}

function stringArray(value, label) {
  assert(Array.isArray(value), label);
  return value.map((entry, index) => stringValue(entry, `${label}[${index}]`));
}

function arrayValue(value, label) {
  assert(Array.isArray(value), label);
  return value;
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, label);
  return value;
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), label);
  return Object.is(value, -0) ? 0 : value;
}

function nonNegativeInteger(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0, label);
  return value;
}

function recordValue(value, label) {
  assert(isRecord(value), label);
  return value;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}


function assert(condition, message) {
  if (!condition) {
    throw new Error(`Invalid Core v2 replacement/recovery fold: ${message}`);
  }
}
