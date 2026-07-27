export const EDITOR_WORKFLOW_FOLD_REVISION =
  'core-v2-editor-workflow-fold/1';

const OBSERVATION_REVISION = 'core-v2-semantic-observation/1';
const EXECUTION_REVISION = 'core-v2-contract-case-execution/1';
const CASE_IDS = new Set([
  'CSM-025',
  'CSM-026',
  'CSM-027',
  'CSM-033',
  'CSM-034',
]);
const CLASSIFIED_ENGINE_EVENTS = new Set([
  'ready',
  'sceneCommitted',
  'drawComplete',
  'frame',
  'diagnostic',
  'destroyed',
]);
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

/**
 * Project five editor workflows from actual product deltas only.
 *
 * The normalized expected catalog is intentionally not an input. Approved
 * assertions remain isolated in the independent comparison stage.
 */
export function foldEditorWorkflowExecution(optionsValue) {
  const options = validateOptions(optionsValue);
  const plan = validatePlan(options.casePlan);
  const execution = validateExecution(options.execution, plan);
  const projected = projectCase(plan.id, execution);
  const final = productValue(
    actionActual(
      execution,
      plan.actionTrace.length - 1,
      'probe-declared-failure',
    ).final,
    'editor final product',
  );
  const snapshot = recordValue(final.snapshot, 'final snapshot');
  const semantic = recordValue(final.semantic, 'final semantic');
  const semanticScene = recordValue(semantic.scene, 'semantic scene');
  const semanticGeometry = recordValue(semantic.geometry, 'semantic geometry');
  const semanticText = recordValue(semantic.text, 'semantic text');
  const semanticPaint = recordValue(semantic.paint, 'semantic paint');
  const semanticInteraction = recordValue(
    semantic.interaction,
    'semantic interaction',
  );
  const semanticHistory = recordValue(semantic.history, 'semantic history');

  const actual = {
    $schema: OBSERVATION_REVISION,
    case: {
      id: plan.id,
      type: plan.caseType,
      route: plan.route,
      rootTestId: plan.rootTestId,
      executionStatus: execution.status,
    },
    provenance: cloneRecord(options.provenance, 'provenance'),
    environment: cloneRecord(options.environment, 'environment'),
    revisions: {
      _availability: { publicProductProbes: 'available' },
      ...cloneRecord(snapshot.revisions, 'snapshot revisions'),
      frameRevision: finiteNumber(snapshot.frameRevision, 'frame revision'),
      valuesFinite: allFiniteNumbers(snapshot.revisions)
        && allFiniteNumbers(snapshot.frameRevision),
      ...projected.revisions,
    },
    scene: {
      _availability: { semanticProbe: 'available' },
      invalidNodeCount: invalidNodeCount(semanticScene),
      ...projected.scene,
    },
    geometry: {
      _availability: { semanticProbe: 'available' },
      nonFiniteCount: nonNegativeInteger(
        semanticGeometry.nonFiniteValueCount,
        'semantic non-finite count',
      ),
      ...projected.geometry,
    },
    text: {
      _availability: { semanticProbe: 'available' },
      unpairedSurrogates: nonNegativeInteger(
        semanticText.unpairedSurrogateCount,
        'semantic unpaired surrogate count',
      ),
      ...projected.text,
    },
    paint: {
      _availability: { semanticProbe: 'available' },
      unresolvedIntentCount: nonNegativeInteger(
        semanticPaint.unresolvedCount,
        'semantic unresolved paint count',
      ),
      ...projected.paint,
    },
    interaction: {
      _availability: { publicProductProbes: 'available' },
      staleGestureCount: nonNegativeInteger(
        semanticInteraction.activeGestureCount ?? 0,
        'semantic active gesture count',
      ),
      ...projected.interaction,
    },
    events: {
      _availability: { executorJournal: 'available' },
      unclassifiedCount: unclassifiedEventCount(execution),
      ...projected.events,
    },
    history: {
      _availability: { semanticProbe: 'available' },
      corruptEntryCount: nonNegativeInteger(
        semanticHistory.corruptCount ?? 0,
        'semantic history corrupt count',
      ),
      ...projected.history,
    },
    accessibility: notExercised(
      'editor-workflow-accessibility-is-owned-by-the-accessibility-tranche',
    ),
    outcome: {
      _availability: { actualActionResults: 'available' },
      ...projected.outcome,
    },
    resources: {
      _availability: {
        executorCleanup: 'available',
        productCleanup: 'available',
      },
      leakDelta: cleanupLeakDelta(execution.cleanup),
      ...projected.resources,
    },
  };

  assert(
    DOMAIN_NAMES.every((domain) => isRecord(actual[domain])),
    'actual contains fourteen domains',
  );
  validateJson(actual, 'actual', new WeakSet());
  return deepFreeze({
    actual,
    fixtures: cloneRecord(plan.fixture.setup.params, 'fixture params'),
    captures: projectCaptures(execution),
  });
}

function projectCase(caseId, execution) {
  switch (caseId) {
    case 'CSM-025':
      return projectGrid(execution);
    case 'CSM-026':
      return projectRelations(execution);
    case 'CSM-027':
      return projectText(execution);
    case 'CSM-033':
      return projectDelete(execution);
    case 'CSM-034':
      return projectMatrix(execution);
    default:
      throw new Error(`Unsupported Core v2 editor fold case ${String(caseId)}`);
  }
}

function projectGrid(execution) {
  const entered = actionActual(execution, 0, 'enter-grid-edit');
  const applied = actionActual(execution, 3, 'set-grid-cell-active');
  const rejected = actionActual(execution, 4, 'set-grid-cell-active');
  const exited = actionActual(execution, 5, 'exit-grid-edit');
  const failure = actionActual(execution, 7, 'probe-declared-failure');
  const appliedResult = recordValue(applied.result, 'applied grid result');
  const rejectedResult = recordValue(rejected.result, 'rejected grid result');
  const rollback = recordValue(failure.rollback, 'grid rollback');
  const final = productValue(failure.final, 'grid final');
  const grid = datasetRecord(final, 'grid');
  const cells = arrayValue(grid.cells, 'grid cells');
  const gridTargets = cells.map((rowValue) =>
    arrayValue(rowValue, 'grid row').map((value) => ({
      active: value !== 0,
      value: clone(value),
    })));
  const appliedCells = resultStringArrayFact(
    appliedResult,
    'appliedCells',
    'applied grid cells',
  );
  const rejectedCells = rejectedResult.status === 'rejected'
    ? [
        stringValue(
          recordValue(
            recordValue(rejectedResult.plan, 'rejected grid plan').action,
            'rejected grid action',
          ).target,
          'rejected grid target',
        ),
      ]
    : [];
  const depthDelta =
    productHistoryDepth(exited.after, 'grid committed history')
    - productHistoryDepth(entered.before, 'grid baseline history');
  const finalSnapshot = recordValue(final.snapshot, 'grid final snapshot');

  return domains({
    scene: {
      targets: {
        grid: gridTargets,
      },
    },
    history: { depthDelta },
    outcome: {
      rejectedCells,
      rejectedCode: nullableString(rejectedResult.code, 'grid rejected code'),
      hostEngineSeam: {
        engineReturns: {
          appliedCells,
          rejectedCells,
          rejectedCode: nullableString(
            rejectedResult.code,
            'grid seam rejected code',
          ),
          historyDepthDelta: depthDelta,
        },
        failureRollback: {
          strictLinkedCellReject: booleanValue(
            rollback.strictLinkedCellReject,
            'strict linked rejection',
          ),
          linkedCellActive: booleanValue(
            rollback.linkedCellActive,
            'linked cell active',
          ),
          transactionStateBeforeRejectedAction: stringValue(
            rollback.transactionStateBeforeRejectedAction,
            'linked rejection state',
          ),
        },
        finalState: {
          mode: productMode(final, 'grid final mode'),
          selectedIds: stringArray(
            finalSnapshot.selectionIds,
            'grid final selection',
          ),
          gridShapeAfterUndo: {
            rows: cells.length,
            columns: cells.length === 0
              ? 0
              : arrayValue(cells[0], 'grid first row').length,
          },
        },
      },
      inputUnchanged: booleanValue(failure.inputUnchanged, 'grid input unchanged'),
    },
  });
}

function projectRelations(execution) {
  const entered = actionActual(execution, 0, 'enter-relation-edit');
  const duplicate = actionActual(execution, 3, 'add-relation-link');
  const committed = actionActual(execution, 4, 'exit-relation-edit');
  const failure = actionActual(execution, 6, 'probe-declared-failure');
  const duplicateResult = recordValue(duplicate.result, 'duplicate relation result');
  const committedProduct = productValue(committed.after, 'committed relation product');
  const final = productValue(failure.final, 'relation final');
  const rollback = recordValue(failure.rollback, 'relation rollback');
  const linksAfterCommit = relationLinks(committedProduct, 'links');
  const linksAfterUndo = relationLinks(final, 'links');
  const depthDelta =
    productHistoryDepth(committedProduct, 'relation committed history')
    - productHistoryDepth(entered.before, 'relation baseline history');
  const finalSnapshot = recordValue(final.snapshot, 'relation final snapshot');

  return domains({
    scene: {
      targets: {
        links: { links: linksAfterUndo },
      },
    },
    history: { depthDelta },
    outcome: {
      duplicateCode: nullableString(
        duplicateResult.code,
        'duplicate relation code',
      ),
      hostEngineSeam: {
        engineReturns: {
          linksAfterCommit,
          duplicateCode: nullableString(
            duplicateResult.code,
            'relation seam duplicate code',
          ),
          historyDepthDelta: depthDelta,
        },
        failureRollback: {
          invalidEndpointCode: nullableString(
            rollback.invalidEndpointCode,
            'invalid endpoint code',
          ),
          emptyRelationRemovedOnExit: booleanValue(
            rollback.emptyRelationRemovedOnExit,
            'empty relation removal',
          ),
          transactionAtomic: booleanValue(
            rollback.transactionAtomic,
            'relation transaction atomicity',
          ),
        },
        finalState: {
          mode: productMode(final, 'relation final mode'),
          selectedIds: stringArray(
            finalSnapshot.selectionIds,
            'relation final selection',
          ),
          linksAfterUndo,
        },
      },
      inputUnchanged: booleanValue(
        failure.inputUnchanged,
        'relation input unchanged',
      ),
    },
  });
}

function projectText(execution) {
  const opened = actionActual(execution, 0, 'open-text-editor');
  const applied = actionActual(execution, 3, 'commit-text-edit');
  const unchanged = actionActual(execution, 4, 'commit-text-edit');
  const failure = actionActual(execution, 5, 'probe-declared-failure');
  const main = productValue(failure.main, 'text main');
  const final = productValue(failure.final, 'text final');
  const appliedResult = recordValue(applied.result, 'applied text result');
  const unchangedResult = recordValue(unchanged.result, 'unchanged text result');
  const rollback = recordValue(failure.rollback, 'text rollback');
  const source = stringValue(datasetRecord(main, 'text-c').text, 'text source');
  const normalizedLines = source.split(/\r\n|\r|\n/u);
  const appliedCount = resultNonNegativeIntegerFact(
    appliedResult,
    'appliedCount',
    'text applied count',
  );
  const unchangedCount = resultNonNegativeIntegerFact(
    unchangedResult,
    'unchangedCount',
    'text unchanged count',
  );
  const depthDelta =
    productHistoryDepth(unchanged.after, 'text committed history')
    - productHistoryDepth(opened.before, 'text baseline history');
  const bounds = cloneRecord(failure.screenBoundsCss, 'text screen bounds');
  const finalSnapshot = recordValue(final.snapshot, 'text final snapshot');

  return domains({
    text: {
      targets: {
        'text-c': {
          source,
          normalizedLines,
        },
      },
    },
    history: { depthDelta },
    outcome: {
      appliedCount,
      unchangedCount,
      hostEngineSeam: {
        engineReturns: {
          screenBoundsCss: {
            x: finiteNumber(bounds.x, 'text bounds x'),
            y: finiteNumber(bounds.y, 'text bounds y'),
            width: finiteNumber(bounds.width, 'text bounds width'),
            height: finiteNumber(bounds.height, 'text bounds height'),
          },
          appliedCount,
          unchangedCount,
          selectedIds: stringArray(
            recordValue(main.snapshot, 'text main snapshot').selectionIds,
            'text main selection',
          ),
        },
        failureRollback: {
          cancelRestoresOriginal: booleanValue(
            rollback.cancelRestoresOriginal,
            'text cancel rollback',
          ),
          emptyDeletesTarget: booleanValue(
            rollback.emptyDeletesTarget,
            'text empty deletion',
          ),
          missingAfterReplaceCode: nullableString(
            rollback.missingAfterReplaceCode,
            'text missing code',
          ),
        },
        finalState: {
          mode: productMode(final, 'text final mode'),
          selectedIds: stringArray(
            finalSnapshot.selectionIds,
            'text final selection',
          ),
          sourceText: stringValue(
            datasetRecord(final, 'text-c').text,
            'text final source',
          ),
          historyDepthDelta: depthDelta,
        },
      },
      inputUnchanged: booleanValue(failure.inputUnchanged, 'text input unchanged'),
    },
  });
}

function projectDelete(execution) {
  const selected = actionActual(execution, 0, 'select-targets');
  const planned = actionActual(execution, 1, 'request-delete-plan');
  const deleted = actionActual(execution, 3, 'delete-transaction');
  const restored = actionActual(execution, 4, 'undo');
  const failure = actionActual(execution, 5, 'probe-declared-failure');
  const planResult = recordValue(planned.result, 'delete plan result');
  const deleteResult = recordValue(deleted.result, 'delete result');
  const deletePlan = resultStringArrayFact(
    planResult,
    'deletePlan',
    'delete plan',
  );
  const deletedIds = resultStringArrayFact(
    deleteResult,
    'deletedIds',
    'deleted IDs',
  );
  const restoredProduct = productValue(restored.after, 'delete restored product');
  const restoredIds = deletedIds.filter((id) =>
    findDatasetRecord(restoredProduct.dataset, id) !== null);
  const rollback = recordValue(failure.rollback, 'delete rollback');
  const final = productValue(failure.final, 'delete final');
  const finalSnapshot = recordValue(final.snapshot, 'delete final snapshot');
  const depthDelta =
    productHistoryDepth(deleted.after, 'delete committed history')
    - productHistoryDepth(selected.before, 'delete baseline history');

  return domains({
    scene: { restoredIdsAfterUndo: restoredIds },
    history: { depthDelta },
    outcome: {
      deletedIds,
      hostEngineSeam: {
        engineReturns: {
          deletePlan,
          deletedIds,
          historyDepthDelta: depthDelta,
          restoredIdsAfterUndo: restoredIds,
        },
        failureRollback: {
          confirmationFalseAppliesNothing: booleanValue(
            rollback.confirmationFalseAppliesNothing,
            'delete false confirmation',
          ),
          registryLoadingBlocksDelete: booleanValue(
            rollback.registryLoadingBlocksDelete,
            'delete registry loading',
          ),
          transactionAtomic: booleanValue(
            rollback.transactionAtomic,
            'delete transaction atomicity',
          ),
        },
        finalState: {
          selectedIds: stringArray(
            finalSnapshot.selectionIds,
            'delete final selection',
          ),
          mode: productMode(final, 'delete final mode'),
          restoredIds,
        },
      },
      inputUnchanged: booleanValue(
        failure.inputUnchanged,
        'delete input unchanged',
      ),
    },
  });
}

function projectMatrix(execution) {
  const matrix = actionActual(execution, 0, 'run-editor-mutation-matrix');
  const undone = actionActual(execution, 1, 'undo-all');
  const redone = actionActual(execution, 2, 'redo-all');
  const failure = actionActual(execution, 3, 'probe-declared-failure');
  const matrixResult = recordValue(matrix.result, 'matrix result');
  const executedCount = nonNegativeInteger(
    matrixResult.executedCount,
    'matrix executed count',
  );
  const undoneCount = committedHistoryCount(undone.results, 'matrix undo');
  const redoneCount = committedHistoryCount(redone.results, 'matrix redo');
  const final = productValue(failure.final, 'matrix final');
  const finalSnapshot = recordValue(final.snapshot, 'matrix final snapshot');
  const companion = recordValue(final.companion, 'matrix companion');
  const hostCompanion = recordValue(
    companion.hostCompanion,
    'matrix host companion',
  );
  const rollback = recordValue(failure.rollback, 'matrix rollback');
  const companionRestored =
    matrixResult.companionRestored === true
    && sameJson(hostCompanion, matrix.companion);

  return domains({
    history: {
      executedCount,
      undoneCount,
      redoneCount,
    },
    outcome: {
      companionRestored,
      hostEngineSeam: {
        engineReturns: {
          executedCount,
          undoneCount,
          redoneCount,
          companionRestored,
        },
        failureRollback: {
          failedActionHistoryDelta: nonNegativeInteger(
            rollback.failedActionHistoryDelta,
            'failed matrix history delta',
          ),
          unavailableActionNoop: booleanValue(
            rollback.unavailableActionNoop,
            'unavailable matrix no-op',
          ),
          redoBranchDiscardedAfterNewAction: booleanValue(
            rollback.redoBranchDiscardedAfterNewAction,
            'matrix redo branch',
          ),
        },
        finalState: {
          selectedIds: stringArray(
            finalSnapshot.selectionIds,
            'matrix final selection',
          ),
          mode: productMode(final, 'matrix final mode'),
          transformerTargets: stringArray(
            hostCompanion.transformerTargets,
            'matrix transformer targets',
          ),
          hostMetadata: cloneRecord(
            hostCompanion.hostMetadata,
            'matrix host metadata',
          ),
        },
      },
      inputUnchanged: booleanValue(
        failure.inputUnchanged,
        'matrix input unchanged',
      ),
    },
  });
}

function domains(value) {
  return {
    revisions: value.revisions ?? {},
    scene: value.scene ?? {},
    geometry: value.geometry ?? {},
    text: value.text ?? {},
    paint: value.paint ?? {},
    interaction: value.interaction ?? {},
    events: value.events ?? {},
    history: value.history ?? {},
    outcome: value.outcome ?? {},
    resources: value.resources ?? {},
  };
}

function productValue(value, label) {
  const product = recordValue(value, label);
  recordValue(product.snapshot, `${label} snapshot`);
  recordValue(product.semantic, `${label} semantic`);
  assert(Array.isArray(product.dataset), `${label} dataset`);
  return product;
}

function productHistoryDepth(productValueInput, label) {
  const product = productValue(productValueInput, label);
  return nonNegativeInteger(
    recordValue(product.snapshot, `${label} snapshot`).historyDepth,
    label,
  );
}

function productMode(product, label) {
  return stringValue(
    recordValue(
      recordValue(product.semantic, `${label} semantic`).interaction,
      `${label} interaction`,
    ).mode,
    label,
  );
}

function relationLinks(product, id) {
  const relation = datasetRecord(product, id);
  return arrayValue(relation.links, `${id} links`).map((value, index) => {
    const link = recordValue(value, `${id} link ${index}`);
    return {
      source: stringValue(link.source, `${id} link source`),
      target: stringValue(link.target, `${id} link target`),
    };
  });
}

function datasetRecord(product, id) {
  const found = findDatasetRecord(product.dataset, id);
  assert(found !== null, `dataset record ${id}`);
  return found;
}

function findDatasetRecord(datasetValue, id) {
  for (const value of arrayValue(datasetValue, 'dataset records')) {
    if (!isRecord(value)) continue;
    if (value.id === id) return value;
    if (Array.isArray(value.children)) {
      const nested = findDatasetRecord(value.children, id);
      if (nested !== null) return nested;
    }
  }
  return null;
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

function resultStringArrayFact(result, key, label) {
  return stringArray(
    recordValue(result.facts, `${label} facts`)[key],
    label,
  );
}

function resultNonNegativeIntegerFact(result, key, label) {
  return nonNegativeInteger(
    recordValue(result.facts, `${label} facts`)[key],
    label,
  );
}

function committedHistoryCount(value, label) {
  return arrayValue(value, label).filter((entry, index) =>
    recordValue(entry, `${label} ${index}`).status === 'committed').length;
}

function invalidNodeCount(scene) {
  const nodes = arrayValue(scene.nodes, 'semantic nodes');
  const identities = new Set();
  let invalid = 0;
  for (const nodeValue of nodes) {
    if (!isRecord(nodeValue) || !isRecord(nodeValue.target)) {
      invalid += 1;
      continue;
    }
    const target = nodeValue.target;
    if (
      (target.kind !== 'element' && target.kind !== 'component')
      || typeof target.id !== 'string'
      || target.id.length === 0
      || (
        target.kind === 'component'
        && (typeof target.ownerId !== 'string' || target.ownerId.length === 0)
      )
    ) {
      invalid += 1;
      continue;
    }
    const identity = target.kind === 'element'
      ? `element:${target.id}`
      : `component:${target.ownerId}:${target.id}`;
    if (identities.has(identity)) invalid += 1;
    identities.add(identity);
  }
  return invalid;
}

function unclassifiedEventCount(execution) {
  return execution.eventJournal.filter(({ event }) =>
    typeof event !== 'string' || !CLASSIFIED_ENGINE_EVENTS.has(event)).length;
}

function cleanupLeakDelta(cleanupValue) {
  const cleanup = recordValue(cleanupValue, 'execution cleanup');
  let total = cleanup.status === 'completed' ? 0 : 1;
  for (const releaseValue of arrayValue(cleanup.releases, 'cleanup releases')) {
    const release = recordValue(releaseValue, 'cleanup release');
    const remaining = recordValue(
      release.remainingResources,
      'cleanup remaining resources',
    );
    total += resourceCount(remaining.canvasCount);
    total += resourceCount(remaining.subscriptions);
    total += resourceCount(remaining.pendingWork);
  }
  const product = recordValue(cleanup.productResources, 'product cleanup');
  const runtimeCounts = recordValue(
    product.runtimeCounts,
    'product runtime counts',
  );
  total += Object.values(runtimeCounts).reduce(
    (sum, value) => sum + resourceCount(value),
    0,
  );
  return total;
}

function resourceCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 1;
}

function projectCaptures(execution) {
  const captures = {};
  for (const captureValue of execution.captures) {
    const capture = recordValue(captureValue, 'capture');
    captures[stringValue(capture.id, 'capture ID')] = clone(capture.values);
  }
  return captures;
}

function validateOptions(value) {
  const options = recordValue(value, 'fold options');
  assertExactKeys(
    options,
    ['casePlan', 'environment', 'execution', 'provenance'],
    'fold options',
  );
  recordValue(options.provenance, 'fold provenance');
  recordValue(options.environment, 'fold environment');
  return options;
}

function validatePlan(value) {
  const plan = recordValue(value, 'case plan');
  assert(CASE_IDS.has(plan.id), 'editor fold case identity');
  assert(plan.caseType === 'consumer-journey', 'editor fold case type');
  assert(typeof plan.route === 'string' && plan.route.length > 0, 'case route');
  assert(
    typeof plan.rootTestId === 'string' && plan.rootTestId.length > 0,
    'case root identity',
  );
  assert(Array.isArray(plan.actionTrace), 'case action trace');
  const fixture = recordValue(plan.fixture, 'case fixture');
  recordValue(fixture.setup, 'case fixture setup');
  assert(Array.isArray(fixture.captureCheckpoints), 'case capture checkpoints');
  return plan;
}

function validateExecution(value, plan) {
  const execution = recordValue(value, 'execution');
  assert(execution.$schema === EXECUTION_REVISION, 'execution revision');
  assert(execution.caseId === plan.id, 'execution case identity');
  assert(execution.status === 'completed', 'execution completed');
  assert(Array.isArray(execution.actionResults), 'execution action results');
  assert(
    execution.actionResults.length === plan.actionTrace.length,
    'execution action count',
  );
  execution.actionResults.forEach((resultValue, index) => {
    const result = recordValue(resultValue, `execution action ${index}`);
    assert(result.index === index, `execution action ${index} index`);
    assert(
      result.type === plan.actionTrace[index].type,
      `execution action ${index} type`,
    );
    assert(result.status === 'completed', `execution action ${index} status`);
  });
  assert(Array.isArray(execution.eventJournal), 'execution event journal');
  assert(
    Array.isArray(execution.eventJournalFailures)
      && execution.eventJournalFailures.length === 0,
    'execution event journal failures',
  );
  assert(Array.isArray(execution.captures), 'execution captures');
  const cleanup = recordValue(execution.cleanup, 'execution cleanup');
  assert(cleanup.status === 'completed', 'execution cleanup completed');
  assert(
    Array.isArray(cleanup.errors) && cleanup.errors.length === 0,
    'execution cleanup errors',
  );
  const product = recordValue(cleanup.productResources, 'product cleanup');
  assert(product.caseId === plan.id, 'product cleanup case identity');
  const runtimeCounts = recordValue(
    product.runtimeCounts,
    'product cleanup runtime counts',
  );
  assert(
    Object.values(runtimeCounts).every((count) =>
      Number.isSafeInteger(count) && count === 0),
    'product cleanup zero ownership',
  );
  return execution;
}

function notExercised(reason) {
  return {
    _availability: {
      status: 'not-exercised',
      reason,
    },
  };
}

function allFiniteNumbers(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(allFiniteNumbers);
  if (isRecord(value)) return Object.values(value).every(allFiniteNumbers);
  return true;
}

function nullableString(value, label) {
  assert(value === null || typeof value === 'string', label);
  return value;
}

function stringValue(value, label) {
  assert(typeof value === 'string', label);
  return value;
}

function booleanValue(value, label) {
  assert(typeof value === 'boolean', label);
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

function stringArray(value, label) {
  const values = arrayValue(value, label);
  assert(
    values.every((entry) => typeof entry === 'string' && entry.length > 0),
    label,
  );
  return values.map((entry) => entry);
}

function arrayValue(value, label) {
  assert(Array.isArray(value), label);
  return value;
}

function cloneRecord(value, label) {
  return clone(recordValue(value, label));
}

function recordValue(value, label) {
  assert(isRecord(value), label);
  return value;
}

function assertExactKeys(value, keys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(
    actual.length === expected.length
      && actual.every((key, index) => key === expected[index]),
    `${label} keys`,
  );
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function clone(value) {
  return structuredClone(value);
}

function validateJson(value, path, ancestors) {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) return;
  if (typeof value === 'number') {
    assert(Number.isFinite(value) && !Object.is(value, -0), `${path} finite number`);
    return;
  }
  assert(typeof value === 'object', `${path} JSON value`);
  assert(!ancestors.has(value), `${path} JSON cycle`);
  ancestors.add(value);
  if (Array.isArray(value)) {
    assert(Object.keys(value).length === value.length, `${path} dense array`);
    value.forEach((entry, index) =>
      validateJson(entry, `${path}[${index}]`, ancestors));
  } else {
    assert(isRecord(value), `${path} JSON record`);
    for (const [key, nested] of Object.entries(value)) {
      validateJson(nested, `${path}.${key}`, ancestors);
    }
  }
  ancestors.delete(value);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid Core v2 editor workflow fold: ${message}`);
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
