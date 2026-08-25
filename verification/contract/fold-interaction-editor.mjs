import { clone, deepFreeze, createTypeSuffixValueAtoms } from './value-atoms.mjs';

const {
  arrayValue,
  stringValue,
  booleanValue,
} = createTypeSuffixValueAtoms(assert);

export const INTERACTION_EDITOR_FOLD_REVISION =
  'patch-map-interaction-editor-fold/1';

const OBSERVATION_REVISION = 'patch-map-semantic-observation/1';
const EXECUTION_REVISION = 'patch-map-contract-case-execution/1';
const CASE_IDS = Object.freeze([
  'CSM-013',
  'CSM-018',
  'CSM-022',
  'CSM-023',
  'CSM-024',
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

/** Fold five expected-blind editor/interaction executions into actual evidence. */
export function foldInteractionEditorExecution(optionsValue) {
  const options = validateOptions(optionsValue);
  const plan = validatePlan(options.casePlan);
  const execution = validateExecution(options.execution, plan);
  const snapshot = recordValue(execution.terminalSnapshot, 'terminal snapshot');
  const semantic = recordValue(execution.terminalSemanticProbe, 'terminal semantic');
  const projected = projectCase(plan.id, execution);
  const semanticText = recordValue(semantic.text, 'semantic text');
  const semanticPaint = recordValue(semantic.paint, 'semantic paint');
  const semanticHistory = recordValue(semantic.history, 'semantic history');
  const semanticInteraction = recordValue(semantic.interaction, 'semantic interaction');

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
      ...projectRevisions(snapshot),
      valuesFinite: actionRevisionValuesFinite(execution),
      ...projected.revisions,
    },
    scene: {
      _availability: { semanticProbe: 'available' },
      invalidNodeCount: invalidNodeCount(semantic),
      ...projected.scene,
    },
    geometry: {
      _availability: { semanticProbe: 'available' },
      nonFiniteCount: nonNegativeInteger(
        recordValue(semantic.geometry, 'semantic geometry').nonFiniteValueCount,
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
    },
    paint: {
      _availability: { semanticProbe: 'available' },
      unresolvedIntentCount: nonNegativeInteger(
        semanticPaint.unresolvedCount,
        'semantic unresolved paint count',
      ),
    },
    interaction: {
      _availability: { publicInteractionAuthorities: 'available' },
      staleGestureCount: nonNegativeInteger(
        semanticInteraction.activeGestureCount ?? 0,
        'semantic active gesture count',
      ),
      ...projected.interaction,
    },
    events: {
      _availability: { executorJournal: 'available' },
      journal: clone(execution.eventJournal),
      unclassifiedCount: unclassifiedEventCount(execution),
      ...projected.events,
    },
    history: {
      _availability: { semanticProbe: 'available' },
      corruptEntryCount: semanticHistory.corruptCount === undefined
        ? 0
        : nonNegativeInteger(semanticHistory.corruptCount, 'history corrupt count'),
      ...projected.history,
    },
    accessibility: notExercised('editor-accessibility-is-owned-by-the-accessibility-tranche'),
    outcome: {
      _availability: { actualActionResults: 'available' },
      unclassifiedErrorCount: unclassifiedErrorCount(execution),
      actionResults: execution.actionResults.map(({ index, type, status }) => ({
        index,
        type,
        status,
      })),
      ...projected.outcome,
    },
    resources: {
      _availability: { executorCleanup: 'available' },
      leakDelta: cleanupLeakDelta(execution.cleanup),
      cleanup: cloneRecord(execution.cleanup, 'execution cleanup'),
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
    case 'CSM-013': {
      const hover = actionActual(execution, 0, 'hover-target');
      const pin = actionActual(execution, 1, 'secondary-click-target');
      const destroy = actionActual(execution, 4, 'destroy-engine');
      const failure = actionActual(execution, 5, 'probe-declared-failure');
      const bounds = numberArray(hover.boundsCss, 'CSM-013 tooltip bounds');
      const destroyTooltip = recordValue(destroy.tooltip, 'CSM-013 destroy tooltip');
      const pointer = recordValue(destroy.pointerGesture, 'CSM-013 pointer');
      return domains({
        geometry: {
          tooltipBoundsCss: bounds[2] * bounds[3],
        },
        interaction: {
          tooltipPinnedAfterSecondaryClick: booleanValue(
            pin.pinned,
            'CSM-013 pinned',
          ),
          tooltipTargetAfterDestroy: nullableString(
            destroyTooltip.targetId,
            'CSM-013 destroy target',
          ),
        },
        events: {
          hover: {
            targetId: nullableString(hover.targetId, 'CSM-013 hover target'),
          },
        },
        outcome: {
          hostEngineSeam: {
            engineReturns: {
              hoverTarget: nullableString(hover.targetId, 'CSM-013 seam target'),
              tooltipAnchorCss: numberArray(
                hover.anchorCss,
                'CSM-013 tooltip anchor',
              ),
              clampedTooltipBoundsCss: bounds,
              pinned: booleanValue(pin.pinned, 'CSM-013 seam pinned'),
            },
            failureRollback: cloneRecord(
              failure.rollback,
              'CSM-013 failure rollback',
            ),
            finalState: {
              tooltipTarget: nullableString(
                destroyTooltip.targetId,
                'CSM-013 final tooltip target',
              ),
              pinned: booleanValue(
                destroyTooltip.pinned,
                'CSM-013 final pinned',
              ),
              activeGesture:
                nonNegativeInteger(
                  pointer.activeGestureCount,
                  'CSM-013 active gesture count',
                ) === 0
                  ? null
                  : clone(pointer.activeOwnedGesture),
            },
          },
        },
      });
    }
    case 'CSM-018': {
      const policies = actionActual(execution, 2, 'enable-editor-policies');
      const blocked = actionActual(execution, 3, 'attempt-blocked-plant-mount');
      const failure = actionActual(execution, 4, 'probe-declared-failure');
      const product = actionProduct(failure, 'CSM-018');
      const productSnapshot = recordValue(product.snapshot, 'CSM-018 snapshot');
      const mode = productMode(product, 'CSM-018');
      const selectedIds = stringArray(productSnapshot.selectionIds, 'CSM-018 selection');
      return domains({
        scene: {
          inactiveCellVisibleCount: nonNegativeInteger(
            policies.inactiveCellVisibleCount,
            'CSM-018 inactive visible count',
          ),
        },
        interaction: { mode },
        outcome: {
          blockedPlantCanvasCount: nonNegativeInteger(
            blocked.blockedPlantCanvasCount,
            'CSM-018 blocked canvas count',
          ),
          hostEngineSeam: {
            engineReturns: {
              lifecycle: stringValue(productSnapshot.lifecycle, 'CSM-018 lifecycle'),
              mode,
              inactiveCellPixels: finiteNumber(
                policies.inactiveCellPixels,
                'CSM-018 inactive pixels',
              ),
              blockedPlantCanvasCount: nonNegativeInteger(
                blocked.blockedPlantCanvasCount,
                'CSM-018 seam blocked canvas count',
              ),
            },
            failureRollback: cloneRecord(
              failure.rollback,
              'CSM-018 failure rollback',
            ),
            finalState: {
              mode,
              selectedIds,
              transformerTargets: selectionVisualTargets(product, 'CSM-018'),
              activeCanvasCount: nonNegativeInteger(
                recordValue(productSnapshot.resources, 'CSM-018 resources').canvasCount,
                'CSM-018 active canvas count',
              ),
            },
          },
        },
      });
    }
    case 'CSM-022': {
      const move = actionActual(execution, 1, 'move-targets');
      const end = actionActual(execution, 2, 'end-move');
      const nudge = actionActual(execution, 3, 'nudge-targets');
      const failure = actionActual(execution, 4, 'probe-declared-failure');
      const product = actionProduct(failure, 'CSM-022');
      const snapshot = recordValue(product.snapshot, 'CSM-022 snapshot');
      const geometry = cloneRecord(nudge.geometry, 'CSM-022 geometry');
      const nudgeResult = recordValue(nudge.result, 'CSM-022 nudge result');
      const nudgePlan = recordValue(nudgeResult.plan, 'CSM-022 nudge plan');
      const completion = recordValue(end.completion, 'CSM-022 completion');
      return domains({
        geometry: { targets: geometry },
        interaction: {
          selectedTargets: stringArray(snapshot.selectionIds, 'CSM-022 selected targets'),
        },
        history: {
          depth: historyDepth(nudge.history, 'CSM-022 history'),
        },
        outcome: {
          hostEngineSeam: {
            engineReturns: {
              appliedTargets: stringArray(
                nudgePlan.eligibleIds,
                'CSM-022 applied targets',
              ),
              integerDeltaWorld: numberArray(
                move.integerDeltaWorld,
                'CSM-022 integer delta',
              ),
              historyDepthDelta:
                nonNegativeInteger(
                  completion.historyDepthDelta,
                  'CSM-022 move history delta',
                )
                + nonNegativeInteger(
                  nudgeResult.historyDepthDelta,
                  'CSM-022 nudge history delta',
                ),
            },
            failureRollback: cloneRecord(
              failure.rollback,
              'CSM-022 failure rollback',
            ),
            finalState: {
              selectedIds: stringArray(snapshot.selectionIds, 'CSM-022 final selection'),
              mode: productMode(product, 'CSM-022'),
              historyDepth: historyDepth(nudge.history, 'CSM-022 final history'),
              transformerTargets: selectionVisualTargets(product, 'CSM-022'),
            },
          },
        },
      });
    }
    case 'CSM-023': {
      const matrix = actionActual(execution, 0, 'run-resize-handle-matrix');
      const rotation = actionActual(execution, 1, 'rotate-target');
      const cancellation = actionActual(execution, 2, 'cancel-transform');
      const redo = actionActual(execution, 4, 'redo');
      const failure = actionActual(execution, 5, 'probe-declared-failure');
      const product = actionProduct(failure, 'CSM-023');
      const snapshot = recordValue(product.snapshot, 'CSM-023 snapshot');
      const geometry = recordValue(redo.geometry, 'CSM-023 redo geometry');
      const rect = recordValue(geometry['rect-b'], 'CSM-023 rect geometry');
      const rotationDegrees = finiteNumber(
        rect.rotationDegrees,
        'CSM-023 rotation degrees',
      );
      const transformerEdit = recordValue(
        product.transformerEdit,
        'CSM-023 transformer edit',
      );
      return domains({
        geometry: {
          targets: {
            'rect-b': { rotationDegrees },
          },
        },
        history: {
          cancelledHistorySteps: finiteNumber(
            cancellation.historyDelta,
            'CSM-023 cancelled history delta',
          ),
        },
        outcome: {
          handleCasesPassed: nonNegativeInteger(
            matrix.handleCasesPassed,
            'CSM-023 handle cases',
          ),
          hostEngineSeam: {
            engineReturns: {
              handleCasesPassed: nonNegativeInteger(
                matrix.handleCasesPassed,
                'CSM-023 seam handle cases',
              ),
              rotationDegrees,
              committedHistorySteps: historyDepth(
                rotation.history,
                'CSM-023 committed history',
              ),
              cancelledHistorySteps: finiteNumber(
                cancellation.historyDelta,
                'CSM-023 seam cancelled history',
              ),
            },
            failureRollback: cloneRecord(
              failure.rollback,
              'CSM-023 failure rollback',
            ),
            finalState: {
              selectedIds: stringArray(snapshot.selectionIds, 'CSM-023 final selection'),
              mode: productMode(product, 'CSM-023'),
              transformerTargets: selectionVisualTargets(product, 'CSM-023'),
              rotationDegrees,
            },
          },
        },
        resources: {
          transformOverlaysAfterTerminal: nonNegativeInteger(
            transformerEdit.previewOverlayCount,
            'CSM-023 overlay count',
          ),
        },
      });
    }
    case 'CSM-024': {
      const matrix = actionActual(execution, 0, 'run-pan-source-matrix');
      const hit = actionActual(execution, 2, 'hit-test');
      const exit = actionActual(execution, 3, 'exit-temporary-navigation-policy');
      const failure = actionActual(execution, 4, 'probe-declared-failure');
      const product = actionProduct(failure, 'CSM-024');
      const snapshot = recordValue(product.snapshot, 'CSM-024 snapshot');
      const pointer = recordValue(exit.pointerGesture, 'CSM-024 pointer');
      const mode = recordValue(exit.mode, 'CSM-024 mode');
      const hitTarget = nullableString(hit.targetId, 'CSM-024 hit target');
      const panCasesPassed = nonNegativeInteger(
        matrix.panCasesPassed,
        'CSM-024 pan cases',
      );
      return domains({
        interaction: {
          hitTarget,
          temporaryModifiers: stringArray(
            mode.temporaryModifiers,
            'CSM-024 temporary modifiers',
          ),
        },
        outcome: {
          panCasesPassed,
          hostEngineSeam: {
            engineReturns: {
              panCasesPassed,
              transformedHitTarget: hitTarget,
              viewRevision: finiteNumber(
                recordValue(snapshot.revisions, 'CSM-024 revisions').viewRevision,
                'CSM-024 view revision',
              ),
            },
            failureRollback: cloneRecord(
              failure.rollback,
              'CSM-024 failure rollback',
            ),
            finalState: {
              mode: stringValue(mode.activeState, 'CSM-024 final mode'),
              selectedIds: stringArray(snapshot.selectionIds, 'CSM-024 final selection'),
              activeGesture:
                nonNegativeInteger(
                  pointer.activeGestureCount,
                  'CSM-024 active gesture count',
                ) === 0
                  ? null
                  : clone(pointer.activeOwnedGesture),
              temporaryModifiers: stringArray(
                mode.temporaryModifiers,
                'CSM-024 final temporary modifiers',
              ),
            },
          },
        },
      });
    }
    default:
      throw new Error(`PatchMap interaction/editor fold invalid: unsupported case ${caseId}`);
  }
}

function domains(values) {
  return {
    revisions: values.revisions ?? {},
    scene: values.scene ?? {},
    geometry: values.geometry ?? {},
    interaction: values.interaction ?? {},
    events: values.events ?? {},
    history: values.history ?? {},
    outcome: values.outcome ?? {},
    resources: values.resources ?? {},
  };
}

function validateOptions(value) {
  const options = recordValue(value, 'options');
  assertExactKeys(
    options,
    ['casePlan', 'execution', 'provenance', 'environment'],
    'options',
  );
  return options;
}

function validatePlan(value) {
  const plan = recordValue(value, 'case plan');
  assert(CASE_IDS.includes(plan.id), 'case ID');
  assert(plan.caseType === 'consumer-journey', 'consumer case type');
  assert(isRecord(plan.fixture), 'case fixture');
  assert(isRecord(plan.fixture.setup), 'case fixture setup');
  assert(isRecord(plan.fixture.setup.params), 'case fixture params');
  assert(Array.isArray(plan.actionTrace), 'case action trace');
  assert(Array.isArray(plan.fixture.actionTrace), 'fixture action trace');
  assert(sameJson(plan.actionTrace, plan.fixture.actionTrace), 'action trace drift');
  return plan;
}

function validateExecution(value, plan) {
  const execution = recordValue(value, 'execution');
  assert(execution.$schema === EXECUTION_REVISION, 'execution revision');
  assert(execution.caseId === plan.id, 'execution case identity');
  assert(execution.caseType === plan.caseType, 'execution case type');
  assert(execution.status === 'completed', 'execution status');
  assert(execution.error === null, 'execution error');
  assert(Array.isArray(execution.actionResults), 'action results');
  assert(execution.actionResults.length === plan.actionTrace.length, 'action result count');
  execution.actionResults.forEach((resultValue, index) => {
    const result = recordValue(resultValue, `action result ${index}`);
    const action = recordValue(plan.actionTrace[index], `action ${index}`);
    assert(result.index === index, `action ${index} result index`);
    assert(result.type === action.type, `action ${index} result type`);
    assert(result.handlerId === `contract/${action.type}`, `action ${index} handler`);
    assert(result.status === 'completed', `action ${index} status`);
    assert(isRecord(result.delta), `action ${index} delta`);
    assert(isRecord(result.delta.actual), `action ${index} actual`);
  });
  assert(Array.isArray(execution.eventJournal), 'event journal');
  assert(Array.isArray(execution.eventJournalFailures), 'event failures');
  assert(execution.eventJournalFailures.length === 0, 'event journal failures empty');
  assert(Array.isArray(execution.captures), 'captures');
  assert(isRecord(execution.terminalSnapshot), 'terminal snapshot');
  assert(isRecord(execution.terminalSemanticProbe), 'terminal semantic');
  assert(isRecord(execution.cleanup), 'cleanup');
  assert(execution.cleanup.status === 'completed', 'cleanup status');
  const host = recordValue(execution.hostSeamDelta, 'host seam');
  assert(host.caseId === plan.id, 'host seam case identity');
  assert(host.capabilityPassInherited === false, 'host seam actual-only');
  return execution;
}

function actionActual(execution, index, type) {
  const result = execution.actionResults[index];
  assert(result?.type === type, `action ${index} must be ${type}`);
  return recordValue(result.delta.actual, `action ${index} actual`);
}

function actionProduct(action, label) {
  return recordValue(action.product, `${label} product`);
}

function productMode(product, label) {
  const host = recordValue(product.hostInteraction, `${label} host interaction`);
  const mode = recordValue(host.mode, `${label} mode`);
  return stringValue(mode.activeState, `${label} active mode`);
}

function selectionVisualTargets(product, label) {
  if (product.selectionVisual === null) return [];
  const visual = recordValue(product.selectionVisual, `${label} selection visual`);
  const targets = arrayValue(visual.overlayTargets, `${label} overlay targets`);
  return targets.map((targetValue, index) => {
    const target = recordValue(targetValue, `${label} overlay target ${index}`);
    return stringValue(target.selectionId, `${label} overlay target ID ${index}`);
  });
}

function projectRevisions(snapshot) {
  const revisions = recordValue(snapshot.revisions, 'snapshot revisions');
  return {
    scene: finiteNumber(revisions.sceneRevision, 'scene revision'),
    view: finiteNumber(revisions.viewRevision, 'view revision'),
    interaction: finiteNumber(revisions.interactionRevision, 'interaction revision'),
    frame: { revision: finiteNumber(snapshot.frameRevision, 'frame revision') },
  };
}

function actionRevisionValuesFinite(execution) {
  return execution.actionResults.every((result, index) => {
    const actual = recordValue(result.delta.actual, `action ${index} actual`);
    const product = recordValue(actual.product, `action ${index} product`);
    const snapshot = recordValue(product.snapshot, `action ${index} snapshot`);
    return allNumbersFinite(recordValue(snapshot.revisions, `action ${index} revisions`));
  });
}

function invalidNodeCount(semantic) {
  const scene = recordValue(semantic.scene, 'semantic scene');
  return arrayValue(scene.nodes, 'semantic nodes').filter((node) => !isRecord(node)).length;
}

function historyDepth(value, label) {
  const history = recordValue(value, label);
  return nonNegativeInteger(history.depth, `${label} depth`);
}

function unclassifiedEventCount(execution) {
  return execution.eventJournal.filter((entryValue) => {
    const entry = recordValue(entryValue, 'event journal entry');
    return !CLASSIFIED_ENGINE_EVENTS.has(stringValue(entry.event, 'event journal type'));
  }).length;
}

function unclassifiedErrorCount(execution) {
  return Number(execution.error !== null)
    + execution.eventJournalFailures.length
    + execution.actionResults.filter(({ status }) => status !== 'completed').length;
}

function cleanupLeakDelta(value) {
  const cleanup = recordValue(value, 'execution cleanup');
  let total = 0;
  for (const releaseValue of arrayValue(cleanup.releases, 'cleanup releases')) {
    const release = recordValue(releaseValue, 'cleanup release');
    if (!isRecord(release.remainingResources)) continue;
    for (const field of ['canvasCount', 'subscriptions', 'pendingWork']) {
      const count = release.remainingResources[field];
      if (typeof count === 'number' && Number.isFinite(count)) total += Math.abs(count);
    }
  }
  if (isRecord(cleanup.productResources)) {
    const runtimeCounts = cleanup.productResources.runtimeCounts;
    if (isRecord(runtimeCounts)) {
      for (const count of Object.values(runtimeCounts)) {
        if (typeof count === 'number' && Number.isFinite(count)) total += Math.abs(count);
      }
    }
  }
  return total;
}

function projectCaptures(execution) {
  const captures = {};
  execution.captures.forEach((value, index) => {
    const capture = recordValue(value, `capture ${index}`);
    const id = stringValue(capture.id, `capture ${index} ID`);
    assert(!Object.hasOwn(captures, id), `duplicate capture ${id}`);
    captures[id] = cloneRecord(capture.values, `capture ${id} values`);
  });
  return captures;
}

function notExercised(reason) {
  return { _availability: { status: 'not-exercised', reason } };
}

function validateJson(value, path, ancestors) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    assert(Number.isFinite(value), `${path} finite number`);
    return;
  }
  assert(typeof value === 'object', `${path} JSON type`);
  assert(!ancestors.has(value), `${path} cycle`);
  ancestors.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateJson(entry, `${path}[${index}]`, ancestors));
  } else {
    Object.entries(value).forEach(([key, entry]) =>
      validateJson(entry, `${path}.${key}`, ancestors));
  }
  ancestors.delete(value);
}

function assertExactKeys(value, keys, label) {
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  assert(sameJson(actual, expected), `${label} exact keys`);
}

function cloneRecord(value, label) {
  return clone(recordValue(value, label));
}


function stringArray(value, label) {
  return arrayValue(value, label).map((entry, index) =>
    stringValue(entry, `${label}[${index}]`));
}

function numberArray(value, label) {
  return arrayValue(value, label).map((entry, index) =>
    finiteNumber(entry, `${label}[${index}]`));
}

function recordValue(value, label) {
  assert(isRecord(value), `${label} record`);
  return value;
}


function nullableString(value, label) {
  assert(value === null || (typeof value === 'string' && value.length > 0), `${label} nullable string`);
  return value;
}


function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} finite number`);
  return value;
}

function nonNegativeInteger(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0, `${label} non-negative integer`);
  return value;
}

function allNumbersFinite(value, seen = new WeakSet()) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (value === null || typeof value !== 'object' || seen.has(value)) return true;
  seen.add(value);
  return Object.values(value).every((nested) => allNumbersFinite(nested, seen));
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assert(condition, message) {
  if (!condition) throw new Error(`PatchMap interaction/editor fold invalid: ${message}`);
}
