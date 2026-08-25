import { clone, deepFreeze, createTypeSuffixValueAtoms } from './value-atoms.mjs';

const {
  arrayValue,
  booleanValue,
} = createTypeSuffixValueAtoms(assert);

export const VIEWPORT_FOLD_REVISION = 'patch-map-viewport-fold/1';

const OBSERVATION_REVISION = 'patch-map-semantic-observation/1';
const EXECUTION_REVISION = 'patch-map-contract-case-execution/1';
const DELTA_REVISION = 'patch-map-semantic-observation-delta/1';
const CASE_ACTIONS = Object.freeze({
  'VIE-001': Object.freeze(['view-gesture-series']),
  'VIE-002': Object.freeze([
    'set-view',
    'settle-view',
    'serialize-view',
    'remount-and-restore',
    'restore-view',
  ]),
  'VIE-003': Object.freeze([
    'focus-target-matrix',
    'focus-contributor-matrix',
  ]),
  'VIE-004': Object.freeze([
    'fit-target-matrix',
    'fit-targets',
    'fit-contributor-matrix',
    'resize-after-fit',
  ]),
  'VIE-005': Object.freeze([
    'world-rotation-series',
    'resize-surface',
  ]),
  'VIE-006': Object.freeze([
    'world-flip-matrix',
    'view-dependent-feature-matrix',
  ]),
  'VIE-007': Object.freeze(['surface-resize-matrix']),
  'VIE-008': Object.freeze(['viewport-policy-lifecycle']),
  'CSM-009': Object.freeze([
    'load-scene',
    'restore-or-fit-view',
    'restore-or-fit-view',
    'probe-declared-failure',
  ]),
  'CSM-010': Object.freeze([
    'load-scene',
    'pan-view',
    'zoom-view',
    'fit-view',
    'await-view-settle',
    'remount-and-restore-view',
    'probe-declared-failure',
  ]),
});
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
const CLASSIFIED_EVENTS = new Set([
  'ready',
  'sceneCommitted',
  'drawComplete',
  'frame',
  'diagnostic',
  'destroyed',
]);

/**
 * Project actual public Engine observations for the ten viewport cases.
 * This browser-safe fold has no comparator, normalized-expected, or verifier
 * dependency; fixture fields are used only as declared action inputs.
 */
export function foldViewportExecution(optionsValue) {
  const options = validateOptions(optionsValue);
  const plan = validateCasePlan(options.casePlan);
  const execution = validateExecution(options.execution, plan);
  const finalProduct = productAt(execution, plan.actionTypes.length - 1);
  const actual = baseActual(options, plan, execution, finalProduct);

  switch (plan.id) {
    case 'VIE-001':
      projectNavigation(actual, execution);
      break;
    case 'VIE-002':
      projectPersistence(actual, execution);
      break;
    case 'VIE-003':
      projectFocus(actual, execution);
      break;
    case 'VIE-004':
      projectFit(actual, execution);
      break;
    case 'VIE-005':
      projectWorldRotation(actual, execution);
      break;
    case 'VIE-006':
      projectWorldFlip(actual, execution);
      break;
    case 'VIE-007':
      projectSurfaceResize(actual, execution);
      break;
    case 'VIE-008':
      projectPolicy(actual, execution);
      break;
    case 'CSM-009':
      projectRestoreJourney(actual, execution);
      break;
    case 'CSM-010':
      projectNavigationJourney(actual, execution);
      break;
    default:
      throw new Error(`PatchMap viewport fold invalid: unsupported case ${String(plan.id)}`);
  }

  assert(
    DOMAIN_NAMES.every((domain) => isPlainObject(actual[domain])),
    'actual must contain all fourteen object domains',
  );
  validateJsonValue(actual, 'actual', new WeakSet());
  return deepFreeze({
    actual,
    fixtures: cloneRecord(plan.fixture.setup.params, `${plan.id} fixture params`),
    captures: projectCaptures(plan, execution),
  });
}

function baseActual(options, plan, execution, product) {
  const snapshot = recordValue(product.snapshot, 'terminal product snapshot');
  const revisions = recordValue(snapshot.revisions, 'terminal product revisions');
  const semantic = recordValue(product.semantic, 'terminal product semantic');
  const semanticScene = recordValue(semantic.scene, 'terminal semantic scene');
  const semanticCounts = recordValue(semanticScene.counts, 'terminal semantic counts');
  const semanticInteraction = recordValue(
    semantic.interaction,
    'terminal semantic interaction',
  );
  const quality = recordValue(product.quality, 'terminal product quality');
  const cleanupLeakDelta = cleanupResourceDelta(execution.cleanup);

  return {
    $schema: OBSERVATION_REVISION,
    case: {
      id: plan.id,
      caseType: plan.caseType,
      rootTestId: plan.rootTestId,
      fixtureSha256: plan.fixtureSha256,
      executionStatus: execution.status,
    },
    provenance: cloneRecord(options.provenance, 'provenance'),
    environment: projectEnvironment(options.environment, plan, execution),
    revisions: {
      _availability: { engineSnapshot: 'available' },
      valuesFinite: allNumbersFinite(revisions),
      lifecycle: nonNegativeInteger(
        revisions.lifecycleGeneration,
        'lifecycle generation',
      ),
      scene: nonNegativeInteger(revisions.sceneRevision, 'scene revision'),
      view: nonNegativeInteger(revisions.viewRevision, 'view revision'),
      interaction: nonNegativeInteger(
        revisions.interactionRevision,
        'interaction revision',
      ),
    },
    scene: {
      _availability: { semanticProbe: 'available' },
      invalidNodeCount: acceptedInvalidNodeCount(snapshot, semantic),
      rootIds: stringArray(snapshot.rootIds, 'terminal root IDs'),
      nodeCount:
        nonNegativeInteger(semanticCounts.elements, 'semantic element count')
        + nonNegativeInteger(semanticCounts.components, 'semantic component count'),
    },
    geometry: {
      _availability: { semanticProbe: 'available', rendererProbe: 'available' },
      nonFiniteCount: nonNegativeInteger(
        quality.nonFiniteCount,
        'non-finite geometry count',
      ),
    },
    text: {
      _availability: { semanticProbe: 'available' },
      unpairedSurrogates: nonNegativeInteger(
        quality.textUnpairedSurrogates,
        'unpaired surrogate count',
      ),
    },
    paint: {
      _availability: { semanticProbe: 'available' },
      unresolvedIntentCount: nonNegativeInteger(
        quality.unresolvedPaintIntents,
        'unresolved paint count',
      ),
    },
    interaction: {
      _availability: {
        viewport: 'public-engine',
        semanticProbe: 'available',
      },
      view: clone(recordValue(snapshot.viewport, 'terminal viewport')),
      selectedIds: stringArray(
        semanticInteraction.selectionIds,
        'terminal selection IDs',
      ),
    },
    events: {
      _availability: { eventJournal: 'available' },
      unclassifiedCount: execution.eventJournal.filter((entry) =>
        !CLASSIFIED_EVENTS.has(entry.event)).length,
      totalCount: execution.eventJournal.length,
    },
    history: {
      _availability: { semanticProbe: 'available' },
      corruptEntryCount: nonNegativeInteger(
        recordValue(semantic.history, 'terminal semantic history').corruptCount ?? 0,
        'history corrupt count',
      ),
      depth: nonNegativeInteger(snapshot.historyDepth, 'history depth'),
    },
    accessibility: notExercised('viewport-tranche-has-no-accessibility-action'),
    outcome: {
      _availability: {
        actionResults: 'available',
        hostSeam: plan.caseType === 'consumer-journey' ? 'available' : 'not-applicable',
      },
      unclassifiedErrorCount: execution.status === 'completed' ? 0 : 1,
      actionResults: execution.actionResults.map(({ index, type, status }) => ({
        index,
        type,
        status,
      })),
    },
    resources: {
      _availability: {
        cleanup: 'available',
        runtimeCleanup: execution.cleanup.productResources === undefined
          ? 'unavailable'
          : 'available',
      },
      leakDelta: cleanupLeakDelta,
      cleanup: clone(execution.cleanup),
    },
  };
}

function projectEnvironment(value, plan, execution) {
  const environment = cloneRecord(value, 'environment');
  if (plan.id !== 'CSM-010' || Object.hasOwn(environment, 'runtimeResourceIds')) {
    return environment;
  }
  environment.runtimeResourceIds = arrayValue(
    execution.cleanup.releases,
    'CSM-010 cleanup releases',
  ).map((releaseValue, index) => {
    const release = recordValue(releaseValue, `CSM-010 cleanup release ${index}`);
    return `${stringValue(release.role, `CSM-010 cleanup role ${index}`)}:${
      nonNegativeInteger(release.generation, `CSM-010 cleanup generation ${index}`)
    }`;
  });
  return environment;
}

function projectNavigation(actual, execution) {
  const action = actionActualAt(execution, 0, 'view-gesture-series');
  const zoom = recordValue(action.zoom, 'VIE-001 zoom');
  const pinch = recordValue(action.pinch, 'VIE-001 pinch');
  const settled = recordValue(action.settled, 'VIE-001 settled');
  const persistence = recordValue(settled.persistence, 'VIE-001 settled persistence');
  const viewport = recordValue(action.viewport, 'VIE-001 viewport');
  const transformedHit = recordValue(action.transformedHit, 'VIE-001 transformed hit');
  actual.interaction.zoom = {
    worldUnderCursorBefore: pointTuple(
      zoom.worldUnderCursorBefore,
      'VIE-001 world under cursor before',
    ),
    worldUnderCursorAfter: pointTuple(
      zoom.worldUnderCursorAfter,
      'VIE-001 world under cursor after',
    ),
  };
  actual.interaction.pinch = {
    worldUnderCenterBefore: pointTuple(
      pinch.worldUnderCenterBefore,
      'VIE-001 world under center before',
    ),
    worldUnderCenterAfter: pointTuple(
      pinch.worldUnderCenterAfter,
      'VIE-001 world under center after',
    ),
  };
  actual.interaction.view = clone(viewport);
  actual.interaction.transformedHit = {
    target: nullableString(transformedHit.target, 'VIE-001 transformed target'),
  };
  actual.interaction.settled = booleanValue(
    persistence.settled,
    'VIE-001 settled state',
  );
}

function projectPersistence(actual, execution) {
  const settled = actionActualAt(execution, 1, 'settle-view');
  const serialized = actionActualAt(execution, 2, 'serialize-view');
  const remounted = actionActualAt(execution, 3, 'remount-and-restore');
  const invalid = actionActualAt(execution, 4, 'restore-view');
  const settledPersistence = recordValue(settled.persistence, 'VIE-002 settle persistence');
  const serializedPersistence = recordValue(
    serialized.persistence,
    'VIE-002 serialize persistence',
  );
  const restored = recordValue(remounted.restored, 'VIE-002 restored result');
  const restoredViewport = recordValue(restored.viewport, 'VIE-002 restored viewport');
  const invalidResult = recordValue(invalid.restored, 'VIE-002 invalid result');

  actual.events.settledPublicationCount = nonNegativeInteger(
    settledPersistence.settledPublicationCount,
    'VIE-002 settled publication count',
  );
  actual.events.equivalentSaveCount = nonNegativeInteger(
    serializedPersistence.equivalentSaveCount,
    'VIE-002 equivalent save count',
  );
  actual.events.suppressedEquivalentSaveCount = nonNegativeInteger(
    serializedPersistence.suppressedEquivalentSaveCount,
    'VIE-002 suppressed equivalent save count',
  );
  actual.interaction.restored = {
    centerWorld: pointTuple(restoredViewport.centerWorld, 'VIE-002 restored center'),
    scale: finiteNumber(restoredViewport.scale, 'VIE-002 restored scale'),
  };
  actual.outcome.invalidRestore = stringValue(
    invalidResult.status,
    'VIE-002 invalid restore status',
  );
}

function projectFocus(actual, execution) {
  const matrix = actionActualAt(execution, 0, 'focus-target-matrix');
  const contributors = actionActualAt(execution, 1, 'focus-contributor-matrix');
  const results = recordValue(matrix.results, 'VIE-003 focus results');
  const explicit = matrixResult(results, 'explicit', 'VIE-003');
  const relation = matrixResult(results, 'relation', 'VIE-003');
  const defaults = matrixResult(results, 'default', 'VIE-003');
  const empty = matrixResult(results, 'empty', 'VIE-003');
  const explicitResult = recordValue(explicit.result, 'VIE-003 explicit result');
  const relationResult = recordValue(relation.result, 'VIE-003 relation result');
  const defaultResult = recordValue(defaults.result, 'VIE-003 default result');
  const emptyResult = recordValue(empty.result, 'VIE-003 empty result');

  actual.interaction.explicit = {
    scale: finiteNumber(
      recordValue(explicitResult.viewport, 'VIE-003 explicit viewport').scale,
      'VIE-003 explicit scale',
    ),
    visibleBoundsCenterCss: pointTuple(
      explicit.visibleBoundsCenterCss,
      'VIE-003 explicit visible center',
    ),
  };
  actual.interaction.relation = {
    contributors: contributorIds(relationResult, 'VIE-003 relation'),
  };
  actual.interaction.default = {
    excluded: stringArray(defaultResult.excluded, 'VIE-003 default excluded'),
    duplicateCount: nonNegativeInteger(
      defaultResult.duplicateCount,
      'VIE-003 default duplicate count',
    ),
  };
  actual.interaction.beforeEmpty = {
    view: clone(recordValue(empty.before, 'VIE-003 empty before')),
  };
  actual.interaction.empty = {
    view: clone(recordValue(empty.after, 'VIE-003 empty after')),
  };
  actual.interaction.contributors = projectContributorResults(
    contributors.results,
    'VIE-003 contributors',
  );
  actual.outcome.empty = {
    applied: stringArray(emptyResult.applied, 'VIE-003 empty applied'),
    missing: stringArray(emptyResult.missing, 'VIE-003 empty missing'),
  };
}

function projectFit(actual, execution) {
  const matrix = actionActualAt(execution, 0, 'fit-target-matrix');
  const invalid = actionActualAt(execution, 1, 'fit-targets');
  const contributors = actionActualAt(execution, 2, 'fit-contributor-matrix');
  const resized = actionActualAt(execution, 3, 'resize-after-fit');
  const results = recordValue(matrix.results, 'VIE-004 fit results');
  const ordered = ['default', 'zero', 'scalar', 'axis'].map((id) => {
    const entry = matrixResult(results, id, 'VIE-004');
    const result = recordValue(entry.result, `VIE-004 ${id} result`);
    const viewport = recordValue(result.viewport, `VIE-004 ${id} viewport`);
    const content = boundsTuple(entry.contentCss, `VIE-004 ${id} content`);
    return {
      id,
      paddingCssPx: pointTuple(
        result.paddingCssPx,
        `VIE-004 ${id} padding`,
      ),
      scale: finiteNumber(viewport.scale, `VIE-004 ${id} scale`),
      content,
    };
  });
  actual.interaction.default = {
    paddingCssPx: ordered[0].paddingCssPx,
  };
  actual.interaction.valid = ordered.map(({ id, scale }) => ({ id, scale }));
  actual.geometry.valid = ordered.map(({ id, content }) => ({
    id,
    contentMinCss: { x: content[0], y: content[1] },
    contentMaxCss: {
      x: content[0] + content[2],
      y: content[1] + content[3],
    },
  }));
  actual.interaction.beforeInvalid = {
    view: clone(recordValue(invalid.before, 'VIE-004 invalid before')),
  };
  actual.interaction.invalid = {
    accepted: booleanValue(invalid.accepted, 'VIE-004 invalid accepted'),
    view: clone(recordValue(invalid.after, 'VIE-004 invalid after')),
  };
  actual.interaction.resizeAfterFit = {
    viewportCssPx: pointTuple(
      resized.viewportCssPx,
      'VIE-004 resized viewport',
    ),
  };
  actual.geometry.resizeAfterFit = {
    targetsVisible: booleanValue(
      resized.targetsVisible,
      'VIE-004 resized targets visible',
    ),
  };
  actual.interaction.contributors = projectContributorResults(
    contributors.results,
    'VIE-004 contributors',
  );
}

function projectWorldRotation(actual, execution) {
  const rotation = actionActualAt(execution, 0, 'world-rotation-series');
  const resized = actionActualAt(execution, 1, 'resize-surface');
  const steps = arrayValue(rotation.steps, 'VIE-005 rotation steps');
  actual.interaction.centerWorldByStep = steps.map((stepValue, index) => {
    const step = recordValue(stepValue, `VIE-005 step ${index}`);
    const viewport = recordValue(step.viewport, `VIE-005 step ${index} viewport`);
    return pointTuple(viewport.centerWorld, `VIE-005 step ${index} center`);
  });
  actual.interaction.angleDegreesByStep = steps.map((stepValue, index) => {
    const step = recordValue(stepValue, `VIE-005 step ${index}`);
    const world = recordValue(step.world, `VIE-005 step ${index} world`);
    return normalizeFiniteNumber(
      world.rotationDegrees,
      `VIE-005 step ${index} rotation`,
    );
  });
  actual.interaction.beforeInvalid = {
    view: clone(recordValue(
      recordValue(rotation.beforeInvalid, 'VIE-005 before invalid').view,
      'VIE-005 before invalid view',
    )),
  };
  actual.interaction.invalid = {
    view: clone(recordValue(
      recordValue(rotation.invalid, 'VIE-005 invalid').view,
      'VIE-005 invalid view',
    )),
  };
  const transformedHit = recordValue(
    resized.transformedHit,
    'VIE-005 transformed hit',
  );
  actual.geometry.transformedHit = {
    target: nullableString(
      transformedHit.target,
      'VIE-005 transformed hit target',
    ),
  };
}

function projectWorldFlip(actual, execution) {
  const matrix = actionActualAt(execution, 0, 'world-flip-matrix');
  const dependent = actionActualAt(
    execution,
    1,
    'view-dependent-feature-matrix',
  );
  const matrixResults = arrayValue(matrix.results, 'VIE-006 flip results');
  const dependentResults = arrayValue(
    dependent.results,
    'VIE-006 dependent results',
  );
  actual.interaction.centerWorldByCase = matrixResults.map((rowValue, index) => {
    const row = recordValue(rowValue, `VIE-006 flip result ${index}`);
    const viewport = recordValue(
      row.viewport,
      `VIE-006 flip result ${index} viewport`,
    );
    return pointTuple(
      viewport.centerWorld,
      `VIE-006 flip result ${index} center`,
    );
  });
  actual.interaction.hitByCase = matrixResults.map((rowValue, index) => {
    const row = recordValue(rowValue, `VIE-006 flip result ${index}`);
    return nullableString(row.hit, `VIE-006 flip result ${index} hit`);
  });
  actual.interaction.final = cloneRecord(
    dependent.final,
    'VIE-006 final world transform',
  );
  actual.geometry.relation = {
    sourceTargetOrder: stringArray(
      recordValue(matrix.relation, 'VIE-006 relation').sourceTargetOrder,
      'VIE-006 source target order',
    ),
  };
  actual.geometry.text = {
    upright: booleanValue(
      recordValue(matrix.text, 'VIE-006 text').upright,
      'VIE-006 upright text',
    ),
  };
  for (const feature of ['focus', 'fit', 'transformer']) {
    actual.interaction[feature] = {
      correctByCase: dependentResults.map((rowValue, index) => {
        const row = recordValue(rowValue, `VIE-006 dependent result ${index}`);
        return booleanValue(
          recordValue(
            row[feature],
            `VIE-006 dependent result ${index} ${feature}`,
          ).correct,
          `VIE-006 dependent result ${index} ${feature} correct`,
        );
      }),
    };
  }
}

function projectSurfaceResize(actual, execution) {
  const action = actionActualAt(execution, 0, 'surface-resize-matrix');
  const final = recordValue(action.final, 'VIE-007 final surface');
  actual.resources.canvasCount = nonNegativeInteger(
    final.canvasCount,
    'VIE-007 canvas count',
  );
  actual.geometry.final = {
    cssSize: pointTuple(final.cssSize, 'VIE-007 final CSS size'),
    backingSize: pointTuple(final.backingSize, 'VIE-007 final backing size'),
  };
  actual.events.centerPolicyApplicationCountByResize = arrayValue(
    action.centerPolicyApplicationCountByResize,
    'VIE-007 resize policy counts',
  ).map((count, index) =>
    nonNegativeInteger(count, `VIE-007 resize policy count ${index}`));
  actual.events.blackFrameCount = nonNegativeInteger(
    action.blackFrameCount,
    'VIE-007 black frame count',
  );
  actual.interaction.pointerTransformRevision = nonNegativeInteger(
    action.pointerTransformRevision,
    'VIE-007 pointer transform revision',
  );
}

function projectPolicy(actual, execution) {
  const action = actionActualAt(execution, 0, 'viewport-policy-lifecycle');
  const disabled = recordValue(action.disabled, 'VIE-008 disabled');
  const removed = recordValue(action.removed, 'VIE-008 removed');
  const afterDoubleStart = recordValue(
    action.afterDoubleStart,
    'VIE-008 double start',
  );
  const callbacks = recordValue(
    afterDoubleStart.callbacksByPolicy,
    'VIE-008 callbacks',
  );
  const beforeTemporary = recordValue(
    action.beforeTemporary,
    'VIE-008 before temporary',
  );
  const afterTemporary = recordValue(
    action.afterTemporary,
    'VIE-008 after temporary',
  );
  const destroyed = recordValue(action.destroyed, 'VIE-008 destroyed');

  actual.interaction.disabled = {
    panDelta: policyDelta(disabled, 'pan', 'VIE-008 disabled pan'),
    wheelDelta: policyDelta(disabled, 'wheel', 'VIE-008 disabled wheel'),
    pinchDelta: policyDelta(disabled, 'pinch', 'VIE-008 disabled pinch'),
    decelerationDelta: policyDelta(
      disabled,
      'deceleration',
      'VIE-008 disabled deceleration',
    ),
  };
  actual.interaction.removed = {
    panDelta: policyDelta(removed, 'pan', 'VIE-008 removed pan'),
  };
  actual.interaction.beforeTemporary = {
    policies: stringArray(
      beforeTemporary.policies,
      'VIE-008 before temporary policies',
    ),
  };
  actual.interaction.afterTemporary = {
    policies: stringArray(
      afterTemporary.policies,
      'VIE-008 after temporary policies',
    ),
  };
  actual.events.afterDoubleStart = {
    callbackCount: nonNegativeInteger(
      callbacks.pan,
      'VIE-008 pan callback count',
    ),
  };
  actual.events.oldLifecycleAfterDestroy = nonNegativeInteger(
    action.oldLifecycleAfterDestroy,
    'VIE-008 old lifecycle event count',
  );
  actual.resources.destroyed = cloneRecord(
    destroyed.resources,
    'VIE-008 destroyed resources',
  );
}

function projectRestoreJourney(actual, execution) {
  const valid = actionActualAt(execution, 1, 'restore-or-fit-view');
  const invalid = actionActualAt(execution, 2, 'restore-or-fit-view');
  const failure = actionActualAt(execution, 3, 'probe-declared-failure');
  const validResult = recordValue(valid.result, 'CSM-009 valid result');
  const validViewport = recordValue(validResult.viewport, 'CSM-009 valid viewport');
  const invalidResult = recordValue(invalid.result, 'CSM-009 invalid result');
  const rollback = recordValue(failure.rollback, 'CSM-009 failure rollback');
  const finalProduct = recordValue(failure.product, 'CSM-009 final product');
  const finalSnapshot = recordValue(finalProduct.snapshot, 'CSM-009 final snapshot');
  const finalRevisions = recordValue(finalSnapshot.revisions, 'CSM-009 final revisions');
  const finalSemantic = recordValue(finalProduct.semantic, 'CSM-009 final semantic');
  const finalInteraction = recordValue(
    finalSemantic.interaction,
    'CSM-009 final semantic interaction',
  );
  const validView = {
    centerWorld: pointTuple(validViewport.centerWorld, 'CSM-009 valid center'),
    scale: finiteNumber(validViewport.scale, 'CSM-009 valid scale'),
  };
  const contributors = stringArray(invalid.contributors, 'CSM-009 fit contributors');
  const invalidFallbackUsed = invalidResult.status === 'fallback:auto-fit';

  actual.interaction.validView = validView;
  actual.interaction.invalidFallbackUsed = invalidFallbackUsed;
  actual.interaction.fitContributors = contributors;
  actual.outcome.hostEngineSeam = {
    engineReturns: {
      validView: clone(validView),
      invalidFallbackUsed,
      contributors: clone(contributors),
    },
    failureRollback: {
      invalidViewNeverPublished: booleanValue(
        rollback.invalidViewNeverPublished,
        'CSM-009 invalid view publication',
      ),
      sceneUnchanged: booleanValue(
        rollback.sceneUnchanged,
        'CSM-009 failure scene continuity',
      ),
    },
    finalState: {
      viewRevision: nonNegativeInteger(
        finalRevisions.viewRevision,
        'CSM-009 final view revision',
      ),
      selectedIds: stringArray(
        finalInteraction.selectionIds,
        'CSM-009 final selected IDs',
      ),
      mode: stringValue(finalInteraction.mode, 'CSM-009 final interaction mode'),
    },
  };
}

function projectNavigationJourney(actual, execution) {
  const settled = actionActualAt(execution, 4, 'await-view-settle');
  const remounted = actionActualAt(execution, 5, 'remount-and-restore-view');
  const failure = actionActualAt(execution, 6, 'probe-declared-failure');
  const settledResult = recordValue(settled.settled, 'CSM-010 settled result');
  const settledView = recordValue(settledResult.viewport, 'CSM-010 settled viewport');
  const persistence = recordValue(settled.persistence, 'CSM-010 persistence');
  const restoredView = recordValue(remounted.restoredView, 'CSM-010 restored view');
  const rollback = recordValue(failure.rollback, 'CSM-010 failure rollback');
  const longTasks = recordValue(failure.longTasks, 'CSM-010 long tasks');
  const finalProduct = recordValue(failure.product, 'CSM-010 final product');
  const finalSnapshot = recordValue(finalProduct.snapshot, 'CSM-010 final snapshot');
  const finalSemantic = recordValue(finalProduct.semantic, 'CSM-010 final semantic');
  const finalInteraction = recordValue(
    finalSemantic.interaction,
    'CSM-010 final semantic interaction',
  );

  actual.interaction.view = clone(recordValue(finalSnapshot.viewport, 'CSM-010 final viewport'));
  actual.interaction.settledView = clone(settledView);
  actual.interaction.restoredView = clone(restoredView);
  actual.outcome.persistenceWriteCount = nonNegativeInteger(
    persistence.persistenceWriteCount,
    'CSM-010 persistence write count',
  );
  actual.outcome.longTaskAtLeast100Ms = nonNegativeInteger(
    longTasks.atLeast100MsCount,
    'CSM-010 long task count',
  );
  actual.outcome.rawTimingSamples = arrayValue(
    longTasks.durationsMs,
    'CSM-010 long task durations',
  ).map((duration, index) =>
    finiteNumber(duration, `CSM-010 long task duration ${index}`));
  actual.outcome.hostEngineSeam = {
    engineReturns: {
      settledView: {
        finite: allNumbersFinite(settledView),
      },
      persistenceWriteCount: nonNegativeInteger(
        persistence.persistenceWriteCount,
        'CSM-010 host persistence count',
      ),
      restoredView: {
        sameAsSettled: booleanValue(
          remounted.sameAsSettled,
          'CSM-010 restored view equality',
        ),
      },
    },
    failureRollback: {
      invalidSavedViewFallback: stringValue(
        rollback.invalidSavedViewFallback,
        'CSM-010 invalid saved view fallback',
      ),
      duplicatePersistenceWrites: nonNegativeInteger(
        rollback.duplicatePersistenceWrites,
        'CSM-010 duplicate persistence writes',
      ),
      sceneUnchanged: booleanValue(
        rollback.sceneUnchanged,
        'CSM-010 failure scene continuity',
      ),
    },
    finalState: {
      lifecycleGeneration: nonNegativeInteger(
        remounted.lifecycleGeneration,
        'CSM-010 lifecycle generation',
      ),
      canvasCount: nonNegativeInteger(
        finalSnapshot.resources.canvasCount,
        'CSM-010 canvas count',
      ),
      selectedIds: stringArray(
        finalInteraction.selectionIds,
        'CSM-010 selected IDs',
      ),
      restoredViewMatches: booleanValue(
        remounted.sameAsSettled,
        'CSM-010 restored view match',
      ),
    },
  };
}

function validateOptions(options) {
  assert(isPlainObject(options), 'options object');
  assertExactKeys(
    options,
    ['casePlan', 'environment', 'execution', 'provenance'],
    'options',
  );
  assert(isPlainObject(options.casePlan), 'casePlan object');
  assert(isPlainObject(options.execution), 'execution object');
  assert(isPlainObject(options.provenance), 'provenance object');
  assert(isPlainObject(options.environment), 'environment object');
  return options;
}

function validateCasePlan(casePlan) {
  const actionTypes = CASE_ACTIONS[casePlan.id];
  assert(actionTypes !== undefined, `unsupported case ${String(casePlan.id)}`);
  assert(
    casePlan.caseType === (casePlan.id.startsWith('CSM-') ? 'consumer-journey' : 'capability'),
    `${casePlan.id} caseType`,
  );
  assert(isPlainObject(casePlan.fixture), `${casePlan.id} fixture`);
  assert(isPlainObject(casePlan.fixture.setup), `${casePlan.id} fixture setup`);
  assert(isPlainObject(casePlan.fixture.setup.params), `${casePlan.id} fixture params`);
  assert(Array.isArray(casePlan.actionTrace), `${casePlan.id} actionTrace`);
  assert(casePlan.actionTrace.length === actionTypes.length, `${casePlan.id} action count`);
  casePlan.actionTrace.forEach((action, index) => {
    assert(isPlainObject(action), `${casePlan.id} action ${index}`);
    assert(action.index === index, `${casePlan.id} action index ${index}`);
    assert(action.type === actionTypes[index], `${casePlan.id} action type ${index}`);
    assert(isPlainObject(action.operands), `${casePlan.id} operands ${index}`);
  });
  assert(Array.isArray(casePlan.captureCheckpoints), `${casePlan.id} checkpoints`);
  return { ...casePlan, actionTypes };
}

function validateExecution(execution, plan) {
  assert(execution.$schema === EXECUTION_REVISION, 'execution schema');
  assert(execution.caseId === plan.id, 'execution case identity');
  assert(execution.caseType === plan.caseType, 'execution case type');
  assert(execution.status === 'completed', 'execution completed');
  assert(execution.error === null, 'execution error is null');
  assert(Array.isArray(execution.actionResults), 'execution action results');
  assert(execution.actionResults.length === plan.actionTypes.length, 'execution action count');
  execution.actionResults.forEach((result, index) => {
    const type = plan.actionTypes[index];
    assert(isPlainObject(result), `execution action ${index}`);
    assert(result.index === index, `execution action ${index} index`);
    assert(result.type === type, `execution action ${index} type`);
    assert(result.handlerId === `contract/${type}`, `execution action ${index} handler`);
    assert(result.status === 'completed', `execution action ${index} completed`);
    assert(isPlainObject(result.delta), `execution action ${index} delta`);
    assert(result.delta.$schema === DELTA_REVISION, `execution action ${index} delta schema`);
    assert(isPlainObject(result.delta.actual), `execution action ${index} actual`);
  });
  assert(Array.isArray(execution.eventJournal), 'execution event journal');
  execution.eventJournal.forEach((entry, index) => {
    assert(isPlainObject(entry), `event journal ${index}`);
    assert(typeof entry.event === 'string', `event journal ${index} event`);
  });
  assert(isPlainObject(execution.cleanup), 'execution cleanup');
  assert(execution.cleanup.status === 'completed', 'execution cleanup completed');
  assert(Array.isArray(execution.cleanup.errors), 'execution cleanup errors');
  assert(execution.cleanup.errors.length === 0, 'execution cleanup error count');
  return execution;
}

function productAt(execution, index) {
  const actual = actionActualAt(execution, index);
  return recordValue(actual.product, `action ${index} product`);
}

function actionActualAt(execution, index, expectedType) {
  const result = execution.actionResults[index];
  assert(isPlainObject(result), `action ${index} result`);
  if (expectedType !== undefined) {
    assert(result.type === expectedType, `action ${index} expected ${expectedType}`);
  }
  const delta = recordValue(result.delta, `action ${index} delta`);
  return recordValue(delta.actual, `action ${index} actual`);
}

function projectContributorResults(value, label) {
  const results = recordValue(value, label);
  return Object.fromEntries([
    'group',
    'grid',
    'rejected-subtree',
    'deduplicated',
    'relation-own-bounds',
  ].map((id) => {
    const entry = matrixResult(results, id, label);
    return [id, stringArray(entry.contributors, `${label} ${id}`)];
  }));
}

function contributorIds(result, label) {
  assert(Array.isArray(result.contributors), `${label} contributors`);
  return result.contributors.map((entry, index) => {
    const contributor = recordValue(entry, `${label} contributor ${index}`);
    return stringValue(contributor.id, `${label} contributor ${index} ID`);
  });
}

function matrixResult(results, id, label) {
  return recordValue(results[id], `${label} ${id}`);
}

function policyDelta(values, policy, label) {
  const entry = recordValue(values[policy], label);
  return finiteNumber(entry.delta, `${label} delta`);
}

function acceptedInvalidNodeCount(snapshot, semantic) {
  const dataset = recordValue(semantic.dataset, 'terminal semantic dataset');
  if (snapshot.semanticHash === null) {
    assert(dataset.semanticHash === null, 'empty dataset semantic hash correlation');
    return 0;
  }
  assert(dataset.semanticHash === snapshot.semanticHash, 'accepted semantic hash correlation');
  return 0;
}

function cleanupResourceDelta(cleanupValue) {
  const cleanup = recordValue(cleanupValue, 'execution cleanup');
  const releases = arrayValue(cleanup.releases, 'cleanup releases');
  let total = 0;
  for (const [index, releaseValue] of releases.entries()) {
    const release = recordValue(releaseValue, `cleanup release ${index}`);
    const counts = release.remainingResources;
    if (counts === null) continue;
    const record = recordValue(counts, `cleanup release ${index} resources`);
    for (const key of ['canvasCount', 'subscriptions', 'pendingWork']) {
      const value = record[key];
      if (value === null) continue;
      total += nonNegativeInteger(value, `cleanup release ${index} ${key}`);
    }
  }
  if (cleanup.productResources !== undefined) {
    const resources = recordValue(cleanup.productResources, 'cleanup product resources');
    const counts = recordValue(resources.runtimeCounts, 'cleanup runtime counts');
    for (const [key, value] of Object.entries(counts)) {
      total += nonNegativeInteger(value, `cleanup runtime ${key}`);
    }
  }
  return total;
}

function projectCaptures(plan, execution) {
  const checkpoints = arrayValue(plan.captureCheckpoints, `${plan.id} checkpoints`);
  const captures = arrayValue(execution.captures, `${plan.id} execution captures`);
  assert(checkpoints.length === captures.length, `${plan.id} capture count`);
  return Object.fromEntries(captures.map((captureValue, index) => {
    const capture = recordValue(captureValue, `${plan.id} capture ${index}`);
    return [stringValue(capture.id, `${plan.id} capture ID`), clone(capture)];
  }));
}

function allNumbersFinite(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(allNumbersFinite);
  if (isPlainObject(value)) return Object.values(value).every(allNumbersFinite);
  return true;
}

function pointTuple(value, label) {
  const tuple = arrayValue(value, label);
  assert(tuple.length === 2, `${label} length`);
  return tuple.map((entry, index) =>
    normalizeFiniteNumber(entry, `${label}[${index}]`));
}

function boundsTuple(value, label) {
  const tuple = arrayValue(value, label);
  assert(tuple.length === 4, `${label} length`);
  return tuple.map((entry, index) => finiteNumber(entry, `${label}[${index}]`));
}

function nullableString(value, label) {
  assert(value === null || typeof value === 'string', `${label} nullable string`);
  return value;
}

function stringArray(value, label) {
  return arrayValue(value, label).map((entry, index) =>
    stringValue(entry, `${label}[${index}]`));
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} finite number`);
  return value;
}

function normalizeFiniteNumber(value, label) {
  const numeric = finiteNumber(value, label);
  const rounded = Math.round(numeric * 1_000_000_000) / 1_000_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function nonNegativeInteger(value, label) {
  assert(Number.isInteger(value) && value >= 0, `${label} non-negative integer`);
  return value;
}


function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} non-empty string`);
  return value;
}


function cloneRecord(value, label) {
  return clone(recordValue(value, label));
}

function recordValue(value, label) {
  assert(isPlainObject(value), `${label} object`);
  return value;
}

function notExercised(reason) {
  return { _availability: { status: 'not-exercised', reason } };
}

function assertExactKeys(value, keys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(sameJson(actual, expected), `${label} keys`);
}

function validateJsonValue(value, path, ancestors) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    assert(Number.isFinite(value) && !Object.is(value, -0), `${path} finite JSON number`);
    return;
  }
  assert(typeof value === 'object', `${path} JSON value`);
  assert(!ancestors.has(value), `${path} acyclic`);
  ancestors.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateJsonValue(entry, `${path}[${index}]`, ancestors));
  } else {
    assert(isPlainObject(value), `${path} plain object`);
    for (const [key, nested] of Object.entries(value)) {
      assert(
        key !== '__proto__' && key !== 'constructor' && key !== 'prototype',
        `${path} safe key`,
      );
      validateJsonValue(nested, `${path}.${key}`, ancestors);
    }
  }
  ancestors.delete(value);
}


function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assert(condition, message) {
  if (!condition) throw new Error(`PatchMap viewport fold invalid: ${message}`);
}
