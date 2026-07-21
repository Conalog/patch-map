export const PRESENTATION_DYNAMICS_FOLD_REVISION =
  'core-v2-presentation-dynamics-fold/1';

const OBSERVATION_REVISION = 'core-v2-semantic-observation/1';
const EXECUTION_REVISION = 'core-v2-contract-case-execution/1';
const DELTA_REVISION = 'core-v2-semantic-observation-delta/1';
const PRODUCT_RUNTIME_REVISION = 'core-v2-presentation-dynamics-runtime/1';
const PRODUCT_CLEANUP_REVISION = 'core-v2-presentation-dynamics-cleanup/1';
const RUNTIME_COUNT_FIELDS = Object.freeze([
  'activeSessionCount',
  'tickerCount',
  'schedulerCount',
  'listenerCount',
  'animationClosureCount',
  'pendingWorkCount',
]);
const EXECUTOR_RESOURCE_FIELDS = Object.freeze([
  'canvasCount',
  'pendingWork',
  'subscriptions',
]);
const CASE_ACTIONS = Object.freeze({
  'UPD-005': Object.freeze(['patch', 'readCurrentState', 'publishFrame']),
  'REN-009': Object.freeze(['loadDataset', 'patch', 'publishFrame', 'publishFrame']),
  'ANI-001': Object.freeze(['patch', 'advanceClock', 'patch', 'advanceClock', 'advanceClock']),
  'ANI-002': Object.freeze([
    'runAnimationSchedule',
    'snapshotAt',
    'runAnimationSchedule',
    'snapshotAt',
    'advanceClock',
    'destroy',
    'advanceClock',
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

/** Fold only public Engine/action observations. */
export function foldPresentationDynamicsExecution(optionsValue) {
  const options = validateOptions(optionsValue);
  const plan = validateCasePlan(options.casePlan);
  const execution = validateExecution(options.execution, plan);
  const terminalSnapshot = recordValue(execution.terminalSnapshot, 'terminal snapshot');
  const terminalSemantic = recordValue(execution.terminalSemanticProbe, 'terminal semantic probe');
  const actual = baseActual(options, plan, execution, terminalSnapshot, terminalSemantic);

  if (plan.id === 'UPD-005') projectUpdate(actual, execution);
  else if (plan.id === 'REN-009') projectBarAnimation(actual, execution);
  else if (plan.id === 'ANI-001') projectRetarget(actual, execution);
  else projectCadence(actual, execution, terminalSnapshot);

  validateTerminalCorrelation(execution, plan);
  validateInputEvidence(execution, plan);
  validateRuntimeJournalCorrelation(execution, plan);

  assert(
    DOMAIN_NAMES.every((domain) => isPlainObject(actual[domain])),
    'actual must contain all fourteen object domains',
  );
  validateJsonValue(actual, 'actual', new WeakSet());
  return deepFreeze({
    actual,
    fixtures: cloneRecord(plan.fixture.setup.params, 'fixture params'),
    captures: projectCaptures(execution),
  });
}

function baseActual(options, plan, execution, snapshot, semantic) {
  const revisions = recordValue(snapshot.revisions, 'snapshot revisions');
  const interaction = recordValue(semantic.interaction, 'semantic interaction');
  const resources = recordValue(snapshot.resources, 'snapshot resources');
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
    environment: cloneRecord(options.environment, 'environment'),
    revisions: {
      _availability: { lifecycle: 'engine-snapshot', frame: 'engine-snapshot' },
      lifecycle: {
        generation: finiteNumber(revisions.lifecycleGeneration, 'lifecycle generation'),
      },
      scene: {
        revision: finiteNumber(revisions.sceneRevision, 'scene revision'),
      },
      frame: {
        revision: finiteNumber(snapshot.frameRevision, 'frame revision'),
      },
    },
    scene: {
      _availability: { authority: 'engine-snapshot' },
      revision: finiteNumber(revisions.sceneRevision, 'scene revision'),
      datasetRef: nullableString(snapshot.datasetRef, 'datasetRef'),
      semanticHash: nullableString(snapshot.semanticHash, 'semanticHash'),
      rootIds: stringArray(snapshot.rootIds, 'rootIds'),
    },
    geometry: {
      _availability: { rendererGeometry: 'action-product-probe' },
      finiteValueCount: 0,
    },
    text: notExercised('presentation-tranche-does-not-observe-text'),
    paint: {
      _availability: { aggregateRenderer: 'engine-snapshot' },
      commandCount: nullableNonNegativeNumber(
        recordValue(resources.rendering, 'rendering resources').commandCount,
        'render command count',
      ),
    },
    interaction: {
      _availability: { engineSemanticProbe: 'available' },
      selectionIds: stringArray(interaction.selectionIds, 'selectionIds'),
    },
    events: {
      _availability: { eventJournal: 'available' },
      totalCount: execution.eventJournal.length,
      journal: clone(execution.eventJournal),
    },
    history: {
      _availability: { engineSnapshot: 'available' },
      depth: nonNegativeInteger(snapshot.historyDepth, 'history depth'),
    },
    accessibility: notExercised('presentation-tranche-does-not-observe-accessibility'),
    outcome: {
      _availability: { actionResults: 'available' },
      recorded: true,
      actionResults: execution.actionResults.map(({ index, type, status }) => ({
        index,
        type,
        status,
      })),
    },
    resources: {
      _availability: { cleanup: 'available', runtime: 'product-cleanup-probe' },
      dom: { canvasCount: nonNegativeInteger(resources.canvasCount, 'canvas count') },
      cleanup: clone(execution.cleanup),
    },
  };
}

function projectUpdate(actual, execution) {
  const patched = actionActual(execution, 0, 'patch');
  const read = actionActual(execution, 1, 'readCurrentState');
  const frame = actionActual(execution, 2, 'publishFrame');
  const returnState = recordValue(read.returnState, 'UPD-005 return state');
  const attrs = recordValue(returnState.attrs, 'UPD-005 return attrs');
  const frameState = recordValue(frame.returnState, 'UPD-005 frame state');
  const frameAttrs = recordValue(frameState.attrs, 'UPD-005 frame attrs');
  const after = productRecord(frame.after, 'UPD-005 frame product');
  const snapshot = recordValue(after.snapshot, 'UPD-005 frame snapshot');
  const changeEvent = recordValue(patched.changeEvent, 'UPD-005 change event');
  assertProductContinuity(
    productRecord(patched.after, 'UPD-005 patch product'),
    productRecord(read.product, 'UPD-005 read product'),
    'UPD-005 patch/read continuity',
  );
  assertProductContinuity(
    productRecord(read.product, 'UPD-005 read product'),
    productRecord(frame.before, 'UPD-005 frame before product'),
    'UPD-005 read/frame continuity',
  );
  assert(sameJson(patched.returnState, read.returnState), 'UPD-005 patch/read return state');
  assert(sameJson(read.returnState, frame.returnState), 'UPD-005 read/frame return state');
  const patchMutation = recordValue(patched.mutation, 'UPD-005 patch mutation');
  const patchRevisions = recordValue(patchMutation.revisions, 'UPD-005 patch revisions');
  assert(
    finiteNumber(changeEvent.revision, 'UPD-005 change revision') ===
      finiteNumber(patchRevisions.sceneRevision, 'UPD-005 mutation scene revision'),
    'UPD-005 event/mutation revision correlation',
  );

  actual.outcome.returnState = { attrs: { x: finiteNumber(attrs.x, 'UPD-005 return x') } };
  actual.events.event = {
    change: {
      orderIndex: positiveInteger(changeEvent.orderIndex, 'UPD-005 change order'),
      targets: stringArray(changeEvent.targets, 'UPD-005 change targets'),
      revision: finiteNumber(changeEvent.revision, 'UPD-005 change revision'),
    },
  };
  actual.revisions.frame.revision = finiteNumber(snapshot.frameRevision, 'UPD-005 frame revision');
  actual.revisions.frame['rect-b'] = {
    attrs: { x: finiteNumber(frameAttrs.x, 'UPD-005 frame x') },
  };
  actual.paint.headlessRaster = { normative: false };
  actual.events.totalCount += 1;
  actual.outcome.patch = clone(patched);
}

function projectBarAnimation(actual, execution) {
  const loaded = actionActual(execution, 0, 'loadDataset');
  const patched = actionActual(execution, 1, 'patch');
  const t100 = actionActual(execution, 2, 'publishFrame');
  const t200 = actionActual(execution, 3, 'publishFrame');
  const patchAfter = barRecord(productRecord(patched.after, 'REN-009 patch product'));
  const at100 = barRecord(productRecord(t100.after, 'REN-009 t100 product'));
  const at200 = barRecord(productRecord(t200.after, 'REN-009 t200 product'));
  const controller = recordValue(at200.controller, 'REN-009 controller');
  const product = productRecord(t200.after, 'REN-009 final product');
  const semantic = recordValue(product.semantic, 'REN-009 semantic');
  const interaction = recordValue(semantic.interaction, 'REN-009 interaction');
  assertProductContinuity(
    productRecord(loaded.product, 'REN-009 load product'),
    productRecord(patched.before, 'REN-009 patch before product'),
    'REN-009 load/patch continuity',
  );
  assertProductContinuity(
    productRecord(patched.after, 'REN-009 patch after product'),
    productRecord(t100.before, 'REN-009 t100 before product'),
    'REN-009 patch/t100 continuity',
  );
  assertProductContinuity(
    productRecord(t100.after, 'REN-009 t100 after product'),
    productRecord(t200.before, 'REN-009 t200 before product'),
    'REN-009 t100/t200 continuity',
  );
  assert(sameJson(patched.returnState, patched.after.bar), 'REN-009 patch return/probe correlation');

  actual.paint.bar = {
    semantic: { height: { return: finiteNumber(patchAfter.semanticHeight, 'semantic height') } },
    presentation: {
      height: {
        t0: finiteNumber(patchAfter.presentationHeight, 'presentation t0'),
        t100: finiteNumber(at100.presentationHeight, 'presentation t100'),
        t200: finiteNumber(at200.presentationHeight, 'presentation t200'),
      },
    },
    settledEvents: {
      count: nonNegativeInteger(controller.totalSettlementCount, 'settled count'),
    },
    ghostCount: nonNegativeInteger(at200.ghostPublicationCount, 'ghost count'),
  };
  actual.geometry.finiteValueCount = countFinite(product.geometry);
  actual.paint.animation = {
    activeCount: nonNegativeInteger(interaction.activeAnimationCount, 'active animation count'),
  };
  actual.revisions.frame.revision = finiteNumber(
    recordValue(product.snapshot, 'REN-009 snapshot').frameRevision,
    'REN-009 frame revision',
  );
}

function projectRetarget(actual, execution) {
  const first = actionActual(execution, 0, 'patch');
  const at100 = actionActual(execution, 1, 'advanceClock');
  const retarget = actionActual(execution, 2, 'patch');
  const at200 = actionActual(execution, 3, 'advanceClock');
  const at300 = actionActual(execution, 4, 'advanceClock');
  const firstBar = barRecord(productRecord(first.after, 'ANI-001 first patch'));
  const bar100 = barRecord(productRecord(at100.after, 'ANI-001 t100'));
  const retargetBar = barRecord(productRecord(retarget.after, 'ANI-001 retarget'));
  const bar200 = barRecord(productRecord(at200.after, 'ANI-001 t200'));
  const finalProduct = productRecord(at300.after, 'ANI-001 t300');
  const bar300 = barRecord(finalProduct);
  const controller = recordValue(bar300.controller, 'ANI-001 controller');
  const values = [
    firstBar.presentationHeight,
    bar100.presentationHeight,
    bar200.presentationHeight,
    bar300.presentationHeight,
  ].map((value, index) => finiteNumber(value, `ANI-001 value ${index}`));
  const semantic = recordValue(finalProduct.semantic, 'ANI-001 semantic');
  const interaction = recordValue(semantic.interaction, 'ANI-001 interaction');
  const preRetargetHeight = finiteNumber(
    bar100.presentationHeight,
    'ANI-001 pre-retarget presentation',
  );
  const retargetStartHeight = finiteNumber(
    retargetBar.startHeight,
    'ANI-001 retarget start',
  );
  const backwardJumps = retargetStartHeight < preRetargetHeight ? 1 : 0;
  assert(
    retargetStartHeight === preRetargetHeight,
    'ANI-001 retarget start must equal the observed pre-retarget presentation',
  );
  assertProductContinuity(
    productRecord(first.after, 'ANI-001 first patch product'),
    productRecord(at100.before, 'ANI-001 t100 before product'),
    'ANI-001 first/t100 continuity',
  );
  assertProductContinuity(
    productRecord(at100.after, 'ANI-001 t100 after product'),
    productRecord(retarget.before, 'ANI-001 retarget before product'),
    'ANI-001 t100/retarget continuity',
  );
  assertProductContinuity(
    productRecord(retarget.after, 'ANI-001 retarget after product'),
    productRecord(at200.before, 'ANI-001 t200 before product'),
    'ANI-001 retarget/t200 continuity',
  );
  assertProductContinuity(
    productRecord(at200.after, 'ANI-001 t200 after product'),
    productRecord(at300.before, 'ANI-001 t300 before product'),
    'ANI-001 t200/t300 continuity',
  );

  actual.outcome.first = {
    semanticDestination: finiteNumber(firstBar.semanticHeight, 'first semantic destination'),
    presentation: { t100: finiteNumber(bar100.presentationHeight, 'first t100') },
  };
  actual.outcome.retarget = {
    start: { t100: retargetStartHeight },
    presentation: {
      t200: finiteNumber(bar200.presentationHeight, 'retarget t200'),
      t300: finiteNumber(bar300.presentationHeight, 'retarget t300'),
    },
  };
  actual.paint.presentation = { min: Math.min(...values), max: Math.max(...values) };
  actual.events.settledEvents = {
    count: nonNegativeInteger(controller.totalSettlementCount, 'settled count'),
  };
  actual.geometry.finiteValueCount = countFinite(finalProduct.geometry);
  actual.paint.animation = {
    activeCount: nonNegativeInteger(interaction.activeAnimationCount, 'active animations'),
    backwardJumps,
  };
  actual.revisions.frame.revision = finiteNumber(
    recordValue(finalProduct.snapshot, 'ANI-001 snapshot').frameRevision,
    'ANI-001 frame revision',
  );
}

function projectCadence(actual, execution, terminalSnapshot) {
  const schedule0 = actionActual(execution, 0, 'runAnimationSchedule');
  const snapshot0 = actionActual(execution, 1, 'snapshotAt');
  const schedule1 = actionActual(execution, 2, 'runAnimationSchedule');
  const snapshot1 = actionActual(execution, 3, 'snapshotAt');
  const backward = actionActual(execution, 4, 'advanceClock');
  const destroyed = actionActual(execution, 5, 'destroy');
  const postDestroy = actionActual(execution, 6, 'advanceClock');
  const backwardTime = recordValue(backward.backwardTime, 'ANI-002 backwardTime');
  const at200 = recordValue(snapshot1.at200, 'ANI-002 at200');
  const postDestroyActual = recordValue(postDestroy.postDestroy, 'ANI-002 postDestroy');
  const afterDestroy = recordValue(destroyed.after, 'ANI-002 destroyed snapshot');
  const revisions = recordValue(afterDestroy.revisions, 'ANI-002 destroy revisions');
  const semantic = productRecord(snapshot1.product, 'ANI-002 schedule product').semantic;
  const interaction = recordValue(recordValue(semantic, 'ANI-002 semantic').interaction, 'ANI-002 interaction');
  assertProductContinuity(
    productRecord(schedule0.product, 'ANI-002 schedule0 product'),
    productRecord(snapshot0.product, 'ANI-002 snapshot0 product'),
    'ANI-002 schedule0/snapshot0 continuity',
  );
  assertProductContinuity(
    productRecord(schedule1.product, 'ANI-002 schedule1 product'),
    productRecord(snapshot1.product, 'ANI-002 snapshot1 product'),
    'ANI-002 schedule1/snapshot1 continuity',
  );
  assertProductContinuity(
    productRecord(snapshot1.product, 'ANI-002 snapshot1 product'),
    productRecord(backward.before, 'ANI-002 backward before product'),
    'ANI-002 snapshot1/backward continuity',
  );
  assertProductContinuity(
    productRecord(backward.before, 'ANI-002 backward before product'),
    productRecord(backward.after, 'ANI-002 backward after product'),
    'ANI-002 refused backward publication stability',
  );
  const destroyedBefore = recordValue(destroyed.before, 'ANI-002 destroy before snapshot');
  const backwardAfter = recordValue(
    productRecord(backward.after, 'ANI-002 backward after product').snapshot,
    'ANI-002 backward after snapshot',
  );
  assert(sameJson(destroyedBefore, backwardAfter), 'ANI-002 backward/destroy snapshot continuity');
  const postDestroyBefore = recordValue(postDestroy.before, 'ANI-002 post-destroy before snapshot');
  const postDestroyAfter = recordValue(postDestroy.after, 'ANI-002 post-destroy after snapshot');
  assert(sameJson(afterDestroy, postDestroyBefore), 'ANI-002 destroy/post-destroy continuity');
  assert(sameJson(postDestroyAfter, terminalSnapshot), 'ANI-002 post-destroy/terminal continuity');
  validatePostDestroyObservation(postDestroyActual, postDestroy, execution);

  actual.paint.schedule0 = { values: numberArray(snapshot0.values, 'ANI-002 schedule0 values') };
  actual.paint.schedule1 = { values: numberArray(snapshot1.values, 'ANI-002 schedule1 values') };
  assert(
    sameJson(schedule0.values, snapshot0.values) && sameJson(schedule1.values, snapshot1.values),
    'schedule action and snapshot values must agree',
  );
  actual.outcome.backwardTime = {
    code: stringValue(backwardTime.code, 'ANI-002 backward code'),
    category: stringValue(backwardTime.category, 'ANI-002 backward category'),
  };
  actual.paint.at200 = {
    activeAnimations: nonNegativeInteger(at200.activeAnimations, 'ANI-002 active animations'),
  };
  actual.resources.postDestroy = {
    publications: nonNegativeInteger(postDestroyActual.publications, 'post-destroy publications'),
  };
  actual.revisions.lifecycle.generation = finiteNumber(
    revisions.lifecycleGeneration,
    'ANI-002 lifecycle generation',
  );
  actual.paint.animation = {
    activeCount: nonNegativeInteger(interaction.activeAnimationCount, 'ANI-002 active count'),
  };
  actual.revisions.frame.revision = finiteNumber(
    terminalSnapshot.frameRevision,
    'ANI-002 frame revision',
  );
}

function validateOptions(value) {
  const options = recordValue(value, 'options');
  assertExactKeys(options, ['casePlan', 'environment', 'execution', 'provenance'], 'options');
  recordValue(options.casePlan, 'casePlan');
  recordValue(options.execution, 'execution');
  recordValue(options.provenance, 'provenance');
  recordValue(options.environment, 'environment');
  validateJsonValue(options.provenance, 'provenance', new WeakSet());
  validateJsonValue(options.environment, 'environment', new WeakSet());
  return options;
}

function validateCasePlan(plan) {
  validateJsonValue(plan, 'casePlan', new WeakSet());
  const actions = CASE_ACTIONS[plan.id];
  assert(actions !== undefined, `unsupported case ${String(plan.id)}`);
  assert(plan.caseType === 'capability', `${plan.id} case type`);
  const fixture = recordValue(plan.fixture, `${plan.id} fixture`);
  const setup = recordValue(fixture.setup, `${plan.id} fixture setup`);
  recordValue(setup.params, `${plan.id} fixture params`);
  assert(Array.isArray(fixture.actionTrace), `${plan.id} fixture actionTrace`);
  assert(Array.isArray(plan.actionTrace), `${plan.id} actionTrace`);
  assert(sameJson(fixture.actionTrace, plan.actionTrace), `${plan.id} action trace drift`);
  assert(plan.actionTrace.length === actions.length, `${plan.id} action count`);
  plan.actionTrace.forEach((actionValue, index) => {
    const action = recordValue(actionValue, `${plan.id} action ${index}`);
    assertExactKeys(action, ['index', 'operands', 'type'], `${plan.id} action ${index}`);
    assert(action.index === index, `${plan.id} action ${index} index`);
    assert(action.type === actions[index], `${plan.id} action ${index} type`);
    recordValue(action.operands, `${plan.id} action ${index} operands`);
  });
  assert(
    sameJson(fixture.cleanupTrace, [{
      type: 'destroy-case',
      operands: { expectedResourceDelta: 0 },
    }]),
    `${plan.id} cleanup trace`,
  );
  return plan;
}

function validateExecution(executionValue, plan) {
  const execution = recordValue(executionValue, 'execution');
  validateJsonValue(execution, 'execution', new WeakSet());
  const actions = CASE_ACTIONS[plan.id];
  assertExactKeys(
    execution,
    [
      '$schema',
      'actionResults',
      'bindings',
      'captures',
      'caseId',
      'caseType',
      'cleanup',
      'datasetObservations',
      'error',
      'eventJournal',
      'eventJournalFailures',
      'hostSeamDelta',
      'status',
      'terminalSemanticProbe',
      'terminalSnapshot',
    ],
    'execution',
  );
  assert(execution.$schema === EXECUTION_REVISION, 'execution schema');
  assert(execution.caseId === plan.id && execution.caseType === plan.caseType, 'execution identity');
  assert(execution.status === 'completed' && execution.error === null, 'execution completion');
  assert(execution.hostSeamDelta === null, 'capability host seam');
  assert(Array.isArray(execution.actionResults), 'action results');
  assert(execution.actionResults.length === actions.length, 'action result count');
  execution.actionResults.forEach((resultValue, index) => {
    const result = recordValue(resultValue, `action result ${index}`);
    assertExactKeys(
      result,
      ['completedAtMs', 'delta', 'handlerId', 'index', 'startedAtMs', 'status', 'type'],
      `action result ${index}`,
    );
    assert(result.index === index && result.type === actions[index], `action result ${index} identity`);
    assert(result.handlerId === `contract/${actions[index]}`, `action result ${index} handler`);
    assert(result.status === 'completed', `action result ${index} status`);
    const startedAtMs = finiteNumber(result.startedAtMs, `action result ${index} startedAtMs`);
    const completedAtMs = finiteNumber(result.completedAtMs, `action result ${index} completedAtMs`);
    assert(completedAtMs >= startedAtMs, `action result ${index} timing`);
    const delta = recordValue(result.delta, `action result ${index} delta`);
    assertExactKeys(
      delta,
      ['$schema', 'actionIndex', 'actionType', 'actual', 'caseId', 'semanticProbe'],
      `action result ${index} delta`,
    );
    assert(delta.$schema === DELTA_REVISION, `action result ${index} delta schema`);
    assert(delta.caseId === plan.id && delta.actionIndex === index, `action result ${index} delta identity`);
    assert(delta.actionType === actions[index], `action result ${index} delta type`);
    const actual = recordValue(delta.actual, `action result ${index} actual`);
    const semanticProbe = recordValue(delta.semanticProbe, `action result ${index} semantic probe`);
    validateActionOperandCorrelation(plan, index, actual);
    validateActionProductCorrelation(plan.id, index, actual, semanticProbe);
  });
  assert(Array.isArray(execution.eventJournal), 'event journal');
  assert(
    Array.isArray(execution.eventJournalFailures) && execution.eventJournalFailures.length === 0,
    'event journal failures',
  );
  validateDatasetObservations(execution.datasetObservations);
  assert(isPlainObject(execution.bindings) && Object.keys(execution.bindings).length === 0, 'bindings');
  validateCaptures(execution, plan);
  recordValue(execution.terminalSnapshot, 'terminal snapshot');
  recordValue(execution.terminalSemanticProbe, 'terminal semantic probe');
  validateCleanup(execution.cleanup, plan, execution);
  return execution;
}

function validateActionOperandCorrelation(plan, index, actual) {
  const action = recordValue(plan.actionTrace[index], `plan action ${index}`);
  const operands = recordValue(action.operands, `plan action ${index} operands`);
  if (action.type === 'loadDataset') {
    assert(actual.datasetRef === operands.datasetRef, `action ${index} datasetRef correlation`);
    assert(actual.timeMs === operands.timeMs, `action ${index} time correlation`);
    return;
  }
  if (action.type === 'patch') {
    assert(actual.timeMs === operands.timeMs, `action ${index} time correlation`);
    assert(sameJson(actual.changes, operands.changes), `action ${index} changes correlation`);
    const target = recordValue(actual.target, `action ${index} target`);
    const authoredTarget = plan.id === 'UPD-005'
      ? { kind: 'element', id: operands.targetId }
      : { kind: 'component', ...cloneRecord(operands.target, `action ${index} target operand`) };
    assert(sameJson(target, authoredTarget), `action ${index} target correlation`);
    const mutation = recordValue(actual.mutation, `action ${index} mutation`);
    assert(mutation.status === 'committed' && mutation.changed === true, `action ${index} mutation`);
    return;
  }
  if (action.type === 'readCurrentState' || action.type === 'publishFrame' ||
      action.type === 'advanceClock' || action.type === 'destroy') {
    assert(actual.timeMs === operands.timeMs, `action ${index} time correlation`);
    return;
  }
  if (action.type === 'runAnimationSchedule') {
    assert(actual.scheduleIndex === operands.scheduleIndex, `action ${index} schedule correlation`);
    const params = recordValue(
      recordValue(plan.fixture, `${plan.id} fixture`).setup,
      `${plan.id} fixture setup`,
    ).params;
    const fixture = recordValue(params, `${plan.id} fixture params`);
    const schedules = arrayValue(fixture.schedules, 'ANI-002 fixture schedules');
    assert(
      sameJson(actual.schedule, schedules[operands.scheduleIndex]),
      `action ${index} schedule values correlation`,
    );
    assert(
      sameJson(actual.probeTimesMs, fixture.probeTimesMs),
      `action ${index} probe times correlation`,
    );
    return;
  }
  assert(action.type === 'snapshotAt', `action ${index} recognized type`);
  assert(sameJson(actual.timesMs, operands.timesMs), `action ${index} snapshot times correlation`);
}

function validateActionProductCorrelation(caseId, index, actual, semanticProbe) {
  const products = actionProducts(actual, `action ${index}`);
  for (const product of products) validateProductObservation(product.value, caseId, product.label);
  const completed = completionProduct(actual);
  const requiresProduct = !(caseId === 'ANI-002' && (index === 5 || index === 6));
  if (requiresProduct) {
    assert(completed !== null, `action ${index} completion product`);
    assert(
      sameJson(completed.semantic, semanticProbe),
      `action ${index} product/semantic probe correlation`,
    );
  } else {
    assert(completed === null, `action ${index} must not fabricate a product probe`);
    validateSnapshotSemanticCorrelation(
      actual.after,
      semanticProbe,
      `action ${index} destroyed snapshot`,
    );
  }
}

function actionProducts(actual, label) {
  const products = [];
  for (const field of ['before', 'product', 'after']) {
    if (!Object.hasOwn(actual, field) || !isProductObservation(actual[field])) continue;
    products.push({ field, label: `${label} ${field} product`, value: actual[field] });
  }
  return products;
}

function completionProduct(actual) {
  if (isProductObservation(actual.after)) return actual.after;
  if (isProductObservation(actual.product)) return actual.product;
  return null;
}

function isProductObservation(value) {
  return isPlainObject(value) &&
    Object.hasOwn(value, 'snapshot') &&
    Object.hasOwn(value, 'semantic') &&
    Object.hasOwn(value, 'runtime');
}

function validateProductObservation(value, caseId, label) {
  const product = recordValue(value, label);
  assertExactKeys(product, ['bar', 'geometry', 'runtime', 'semantic', 'snapshot'], label);
  const snapshot = recordValue(product.snapshot, `${label} snapshot`);
  const semantic = recordValue(product.semantic, `${label} semantic`);
  validateSnapshotSemanticCorrelation(snapshot, semantic, label);
  assert(
    product.geometry === null || isPlainObject(product.geometry),
    `${label} geometry`,
  );
  validateRuntimeProbe(product.runtime, caseId, `${label} runtime`);
  if (product.bar !== null) validateBarSnapshotCorrelation(product.bar, snapshot, `${label} bar`);
  return product;
}

function validateSnapshotSemanticCorrelation(snapshotValue, semanticValue, label) {
  const snapshot = recordValue(snapshotValue, `${label} snapshot`);
  const semantic = recordValue(semanticValue, `${label} semantic`);
  const dataset = recordValue(semantic.dataset, `${label} semantic dataset`);
  assert(
    semantic.lifecycle === snapshot.lifecycle &&
      dataset.ref === snapshot.datasetRef &&
      dataset.semanticHash === snapshot.semanticHash &&
      sameJson(dataset.rootIds, snapshot.rootIds),
    `${label} snapshot/semantic correlation`,
  );
}

function validateBarSnapshotCorrelation(value, snapshot, label) {
  const bar = recordValue(value, label);
  const revisions = recordValue(bar.revisions, `${label} revisions`);
  const snapshotRevisions = recordValue(snapshot.revisions, `${label} snapshot revisions`);
  assert(sameJson(revisions, snapshotRevisions), `${label} revision correlation`);
  assert(
    sameJson(bar.publishedTuple, snapshot.publishedTuple),
    `${label} published tuple correlation`,
  );
  assert(bar.frameRevision === snapshot.frameRevision, `${label} frame revision correlation`);
}

function validateRuntimeProbe(value, caseId, label) {
  const probe = recordValue(value, label);
  assertExactKeys(probe, ['caseId', 'journal', 'ownership', 'revision', 'state'], label);
  assert(probe.revision === PRODUCT_RUNTIME_REVISION, `${label} revision`);
  assert(probe.caseId === caseId, `${label} case`);
  validateZeroCountRecord(probe.ownership, RUNTIME_COUNT_FIELDS, `${label} ownership`);
  validateRuntimeState(probe.state, `${label} state`);
  validateRuntimeJournal(probe.journal, caseId, `${label} journal`);
  return probe;
}

function validateRuntimeState(value, label) {
  const state = recordValue(value, label);
  assertExactKeys(
    state,
    [
      'destroyMarkCount',
      'destroyed',
      'lifecycleGeneration',
      'postDestroyAdvanceCount',
      'publicationsAfterDestroy',
      'scheduleCount',
    ],
    label,
  );
  assert(typeof state.destroyed === 'boolean', `${label} destroyed`);
  if (state.lifecycleGeneration !== null) {
    positiveInteger(state.lifecycleGeneration, `${label} lifecycleGeneration`);
  }
  nonNegativeInteger(state.scheduleCount, `${label} scheduleCount`);
  nonNegativeInteger(state.destroyMarkCount, `${label} destroyMarkCount`);
  nonNegativeInteger(state.postDestroyAdvanceCount, `${label} postDestroyAdvanceCount`);
  nonNegativeInteger(state.publicationsAfterDestroy, `${label} publicationsAfterDestroy`);
  return state;
}

function validateDatasetObservations(value) {
  const observations = recordValue(value, 'dataset observations');
  assertExactKeys(observations, ['interactive-scene'], 'dataset observations');
  const observation = recordValue(observations['interactive-scene'], 'interactive-scene observation');
  assertExactKeys(
    observation,
    [
      'beforeFingerprint',
      'beforeGraph',
      'currentDeeplyFrozen',
      'currentFingerprint',
      'currentGraph',
      'reference',
      'unchanged',
    ],
    'interactive-scene observation',
  );
  const before = stringValue(observation.beforeFingerprint, 'dataset before fingerprint');
  const current = stringValue(observation.currentFingerprint, 'dataset current fingerprint');
  assert(/^fnv1a64:[0-9a-f]{16}$/u.test(before), 'dataset before fingerprint format');
  assert(current === before, 'dataset fingerprint stability');
  assert(observation.reference === 'interactive-scene', 'dataset observation reference');
  assert(observation.unchanged === true, 'input dataset immutability');
  assert(typeof observation.currentDeeplyFrozen === 'boolean', 'dataset frozen observation');
  assert(sameJson(observation.beforeGraph, observation.currentGraph), 'dataset graph immutability');
}

function validateCaptures(execution, plan) {
  assert(Array.isArray(execution.captures), 'execution captures');
  const fixture = recordValue(plan.fixture, `${plan.id} fixture`);
  const checkpoints = arrayValue(fixture.captureCheckpoints, `${plan.id} capture checkpoints`);
  assert(execution.captures.length === checkpoints.length, `${plan.id} capture count`);
  execution.captures.forEach((captureValue, index) => {
    const capture = recordValue(captureValue, `${plan.id} capture ${index}`);
    const checkpoint = recordValue(checkpoints[index], `${plan.id} checkpoint ${index}`);
    assertExactKeys(
      capture,
      ['afterActionIndex', 'id', 'phase', 'values'],
      `${plan.id} capture ${index}`,
    );
    assert(capture.id === checkpoint.id, `${plan.id} capture ${index} id`);
    assert(capture.phase === checkpoint.phase, `${plan.id} capture ${index} phase`);
    assert(
      capture.afterActionIndex === checkpoint.afterActionIndex,
      `${plan.id} capture ${index} action`,
    );
    if (plan.id === 'ANI-002') {
      const values = recordValue(capture.values, 'ANI-002 capture values');
      assertExactKeys(values, ['values'], 'ANI-002 capture values');
      assert(
        sameJson(values.values, actionActual(execution, 3, 'snapshotAt').values),
        'ANI-002 capture/snapshot correlation',
      );
    }
  });
}

function validateCleanup(value, plan, execution) {
  const cleanup = recordValue(value, 'cleanup');
  assertExactKeys(
    cleanup,
    ['declaredActions', 'errors', 'productResources', 'releases', 'status'],
    'cleanup',
  );
  assert(cleanup.status === 'completed', 'cleanup status');
  assert(Array.isArray(cleanup.errors) && cleanup.errors.length === 0, 'cleanup errors');
  const fixture = recordValue(plan.fixture, `${plan.id} fixture`);
  const declared = arrayValue(fixture.cleanupTrace, `${plan.id} cleanup trace`)
    .map((step, index) => stringValue(recordValue(step, `cleanup step ${index}`).type, `cleanup step ${index} type`));
  assert(sameJson(cleanup.declaredActions, declared), 'cleanup declared actions');
  const releases = arrayValue(cleanup.releases, 'cleanup releases');
  assert(releases.length === (plan.id === 'ANI-002' ? 2 : 1), 'cleanup release count');
  const generations = new Set();
  for (const [index, releaseValue] of releases.entries()) {
    const release = validateRelease(releaseValue, `cleanup release ${index}`);
    assert(!generations.has(release.generation), `cleanup release ${index} generation unique`);
    generations.add(release.generation);
  }
  if (plan.id === 'ANI-002') {
    const latest = recordValue(releases[0], 'ANI-002 latest release');
    const earlier = recordValue(releases[1], 'ANI-002 earlier release');
    assert(latest.role === 'session:2' && latest.generation === 2, 'ANI-002 latest release identity');
    assert(earlier.role === 'session:1' && earlier.generation === 1, 'ANI-002 earlier release identity');
    assert(latest.reason === 'action:destroy:210', 'ANI-002 explicit release reason');
    assert(earlier.reason === 'session-replaced-by:2', 'ANI-002 replacement release reason');
    assert(
      sameJson(actionActual(execution, 5, 'destroy').release, latest),
      'ANI-002 destroy/cleanup release correlation',
    );
    assert(sameJson(execution.terminalSnapshot, latest.after), 'ANI-002 terminal/release correlation');
  } else {
    const main = recordValue(releases[0], `${plan.id} main release`);
    assert(main.role === 'main' && main.generation === 1, `${plan.id} main release identity`);
    assert(main.reason === 'case-finally', `${plan.id} main release reason`);
    assert(sameJson(execution.terminalSnapshot, main.before), `${plan.id} terminal/release correlation`);
  }
  validateProductCleanup(cleanup.productResources, plan, execution);
}

function validateRelease(value, label) {
  const release = recordValue(value, label);
  assertExactKeys(
    release,
    [
      'after',
      'before',
      'destroyReturned',
      'generation',
      'journalSubscriptions',
      'reason',
      'remainingResources',
      'role',
    ],
    label,
  );
  stringValue(release.role, `${label} role`);
  positiveInteger(release.generation, `${label} generation`);
  stringValue(release.reason, `${label} reason`);
  assert(release.destroyReturned === true, `${label} destroy return`);
  recordValue(release.before, `${label} before`);
  const after = recordValue(release.after, `${label} after`);
  assert(after.lifecycle === 'destroyed', `${label} destroyed lifecycle`);
  const subscriptions = recordValue(release.journalSubscriptions, `${label} journal subscriptions`);
  assertExactKeys(subscriptions, ['registeredCount', 'releasedCount'], `${label} journal subscriptions`);
  assert(
    subscriptions.registeredCount === 6 && subscriptions.releasedCount === 6,
    `${label} journal subscription release`,
  );
  validateZeroCountRecord(
    release.remainingResources,
    EXECUTOR_RESOURCE_FIELDS,
    `${label} remaining resources`,
  );
  return release;
}

function validateProductCleanup(value, plan, execution) {
  const cleanup = recordValue(value, 'cleanup product resources');
  assertExactKeys(
    cleanup,
    ['caseId', 'journal', 'postDestroy', 'revision', 'runtimeCounts', 'state'],
    'cleanup product resources',
  );
  assert(cleanup.revision === PRODUCT_CLEANUP_REVISION, 'cleanup product revision');
  assert(cleanup.caseId === plan.id, 'cleanup product case');
  validateZeroCountRecord(cleanup.runtimeCounts, RUNTIME_COUNT_FIELDS, 'cleanup runtimeCounts');
  const state = validateRuntimeState(cleanup.state, 'cleanup product state');
  const postDestroy = recordValue(cleanup.postDestroy, 'cleanup product postDestroy');
  assertExactKeys(postDestroy, ['observations', 'publications'], 'cleanup product postDestroy');
  const observations = arrayValue(postDestroy.observations, 'cleanup postDestroy observations');
  const publications = nonNegativeInteger(
    postDestroy.publications,
    'cleanup postDestroy publications',
  );
  assert(
    publications === observations.reduce(
      (total, observation, index) => total + nonNegativeInteger(
        recordValue(observation, `cleanup postDestroy observation ${index}`).publications,
        `cleanup postDestroy observation ${index} publications`,
      ),
      0,
    ),
    'cleanup postDestroy publication sum',
  );
  assert(publications === state.publicationsAfterDestroy, 'cleanup postDestroy/state correlation');
  const journal = validateRuntimeJournal(cleanup.journal, plan.id, 'cleanup product journal');
  assert(
    journal.at(-1)?.event === 'runtime-released',
    'cleanup product journal release terminal',
  );
  if (plan.id === 'ANI-002') {
    assert(
      state.destroyed === true && state.lifecycleGeneration !== null &&
        state.scheduleCount === 2 && state.destroyMarkCount === 1 &&
        state.postDestroyAdvanceCount === 1,
      'ANI-002 cleanup product state',
    );
    assert(observations.length === 1, 'ANI-002 cleanup postDestroy observation count');
    const destroy = actionActual(execution, 5, 'destroy');
    const runtime = recordValue(destroy.runtime, 'ANI-002 destroy runtime');
    const after = recordValue(destroy.after, 'ANI-002 destroy after');
    const revisions = recordValue(after.revisions, 'ANI-002 destroy revisions');
    assert(
      runtime.caseId === plan.id && runtime.destroyed === true &&
        runtime.lifecycleGeneration === state.lifecycleGeneration &&
        revisions.lifecycleGeneration === state.lifecycleGeneration,
      'ANI-002 destroy runtime/lifecycle correlation',
    );
    assert(
      sameJson(observations[0], actionActual(execution, 6, 'advanceClock').postDestroy),
      'ANI-002 cleanup/action postDestroy correlation',
    );
  } else {
    assert(
      state.destroyed === false && state.lifecycleGeneration === null &&
        state.scheduleCount === 0 && state.destroyMarkCount === 0 &&
        state.postDestroyAdvanceCount === 0 && state.publicationsAfterDestroy === 0,
      `${plan.id} cleanup product state`,
    );
    assert(observations.length === 0 && publications === 0, `${plan.id} postDestroy absence`);
  }
  return cleanup;
}

function validateZeroCountRecord(value, fields, label) {
  const counts = recordValue(value, label);
  assertExactKeys(counts, fields, label);
  for (const field of fields) {
    assert(nonNegativeInteger(counts[field], `${label} ${field}`) === 0, `${label} ${field} zero`);
  }
}

function validateRuntimeJournal(value, caseId, label) {
  const journal = arrayValue(value, label);
  let previous = 0;
  for (const [index, entryValue] of journal.entries()) {
    const entry = recordValue(entryValue, `${label} ${index}`);
    const sequence = positiveInteger(entry.sequence, `${label} ${index} sequence`);
    assert(sequence > previous, `${label} sequence order`);
    previous = sequence;
    stringValue(entry.event, `${label} ${index} event`);
    assert(entry.caseId === caseId, `${label} ${index} case`);
  }
  return journal;
}

function validateTerminalCorrelation(execution, plan) {
  const lastIndex = execution.actionResults.length - 1;
  const last = actionActual(execution, lastIndex, CASE_ACTIONS[plan.id][lastIndex]);
  const delta = recordValue(
    recordValue(execution.actionResults[lastIndex], 'terminal action result').delta,
    'terminal action delta',
  );
  assert(
    sameJson(delta.semanticProbe, execution.terminalSemanticProbe),
    'terminal action/semantic probe correlation',
  );
  const product = completionProduct(last);
  const actionSnapshot = product === null
    ? recordValue(last.after, 'terminal action after snapshot')
    : recordValue(product.snapshot, 'terminal product snapshot');
  assert(sameJson(actionSnapshot, execution.terminalSnapshot), 'terminal product/snapshot correlation');
  const terminalSnapshot = recordValue(execution.terminalSnapshot, 'terminal snapshot');
  const terminalSemantic = recordValue(execution.terminalSemanticProbe, 'terminal semantic probe');
  const dataset = recordValue(terminalSemantic.dataset, 'terminal semantic dataset');
  assert(
    dataset.ref === terminalSnapshot.datasetRef &&
      dataset.semanticHash === terminalSnapshot.semanticHash &&
      sameJson(dataset.rootIds, terminalSnapshot.rootIds),
    'terminal semantic/snapshot dataset correlation',
  );
}

function validateInputEvidence(execution, plan) {
  const dataset = recordValue(
    recordValue(execution.datasetObservations, 'dataset observations')['interactive-scene'],
    'interactive-scene observation',
  );
  const baseline = stringValue(dataset.beforeFingerprint, 'dataset baseline fingerprint');
  const current = stringValue(dataset.currentFingerprint, 'dataset current fingerprint');
  for (const [index] of plan.actionTrace.entries()) {
    const actual = actionActual(execution, index, CASE_ACTIONS[plan.id][index]);
    const input = recordValue(actual.input, `action ${index} input fingerprint`);
    assertExactKeys(
      input,
      ['afterFingerprint', 'beforeFingerprint', 'unchanged'],
      `action ${index} input fingerprint`,
    );
    assert(
      input.beforeFingerprint === baseline && input.afterFingerprint === current &&
        input.unchanged === true,
      `action ${index} input fingerprint correlation`,
    );
  }
}

function validateRuntimeJournalCorrelation(execution, plan) {
  let prior = [];
  for (const [index] of plan.actionTrace.entries()) {
    const actual = actionActual(execution, index, CASE_ACTIONS[plan.id][index]);
    for (const product of actionProducts(actual, `action ${index}`)) {
      const runtime = recordValue(product.value.runtime, `${product.label} runtime`);
      const journal = arrayValue(runtime.journal, `${product.label} runtime journal`);
      assert(journal.length > prior.length, `${product.label} runtime journal growth`);
      assert(
        sameJson(journal.slice(0, prior.length), prior),
        `${product.label} runtime journal prefix`,
      );
      prior = journal;
    }
  }
  const cleanup = recordValue(execution.cleanup, 'cleanup');
  const product = recordValue(cleanup.productResources, 'cleanup product resources');
  const cleanupJournal = arrayValue(product.journal, 'cleanup product journal');
  assert(cleanupJournal.length > prior.length, 'cleanup product journal growth');
  assert(
    sameJson(cleanupJournal.slice(0, prior.length), prior),
    'cleanup product journal extends action journal',
  );
}

function validatePostDestroyObservation(observationValue, action, execution) {
  const observation = recordValue(observationValue, 'ANI-002 postDestroy observation');
  assertExactKeys(
    observation,
    [
      'after',
      'attemptedCall',
      'before',
      'correlation',
      'frameEventCount',
      'publications',
      'timeMs',
    ],
    'ANI-002 postDestroy observation',
  );
  const beforeSnapshot = recordValue(action.before, 'ANI-002 postDestroy before snapshot');
  const afterSnapshot = recordValue(action.after, 'ANI-002 postDestroy after snapshot');
  const before = validatePublicationObservation(observation.before, 'ANI-002 postDestroy before');
  const after = validatePublicationObservation(observation.after, 'ANI-002 postDestroy after');
  assert(
    sameJson(before, publicationProjection(beforeSnapshot, 'ANI-002 before snapshot')),
    'ANI-002 postDestroy before correlation',
  );
  assert(
    sameJson(after, publicationProjection(afterSnapshot, 'ANI-002 after snapshot')),
    'ANI-002 postDestroy after correlation',
  );
  assert(before.lifecycle === 'destroyed' && after.lifecycle === 'destroyed', 'ANI-002 destroyed lifecycle');
  const frameEvents = arrayValue(action.frameEvents, 'ANI-002 postDestroy frame events');
  frameEvents.forEach((event, index) => {
    const value = recordValue(event, `ANI-002 postDestroy frame event ${index}`);
    assertExactKeys(value, ['frameRevision', 'publishedTuple'], `ANI-002 frame event ${index}`);
    nonNegativeInteger(value.frameRevision, `ANI-002 frame event ${index} revision`);
    validatePublicationTuple(value.publishedTuple, `ANI-002 frame event ${index} tuple`);
  });
  const frameEventCount = nonNegativeInteger(
    observation.frameEventCount,
    'ANI-002 postDestroy frameEventCount',
  );
  assert(frameEventCount === frameEvents.length, 'ANI-002 postDestroy frame event correlation');
  const attempt = validateAttemptObservation(observation.attemptedCall);
  const frameRevisionDelta = after.frameRevision - before.frameRevision;
  assert(frameRevisionDelta >= 0, 'ANI-002 postDestroy frame revision direction');
  const publishedTupleChanged = !sameJson(before.publishedTuple, after.publishedTuple);
  const derivedPublications = Math.max(
    frameRevisionDelta,
    frameEventCount,
    attempt.status === 'completed' ? 1 : 0,
    publishedTupleChanged ? 1 : 0,
  );
  const correlation = recordValue(observation.correlation, 'ANI-002 postDestroy correlation');
  assertExactKeys(
    correlation,
    ['frameRevisionDelta', 'publishedTupleChanged'],
    'ANI-002 postDestroy correlation',
  );
  assert(
    correlation.frameRevisionDelta === frameRevisionDelta &&
      correlation.publishedTupleChanged === publishedTupleChanged,
    'ANI-002 postDestroy derived correlation',
  );
  assert(
    nonNegativeInteger(observation.publications, 'ANI-002 postDestroy publications') ===
      derivedPublications,
    'ANI-002 postDestroy publications derivation',
  );
  assert(observation.timeMs === action.timeMs, 'ANI-002 postDestroy time correlation');
  assert(
    sameJson(action.after, execution.terminalSnapshot),
    'ANI-002 postDestroy terminal snapshot correlation',
  );
}

function validatePublicationObservation(value, label) {
  const observation = recordValue(value, label);
  assertExactKeys(
    observation,
    ['frameRevision', 'lifecycle', 'publishedTuple'],
    label,
  );
  stringValue(observation.lifecycle, `${label} lifecycle`);
  nonNegativeInteger(observation.frameRevision, `${label} frameRevision`);
  validatePublicationTuple(observation.publishedTuple, `${label} publishedTuple`);
  return observation;
}

function publicationProjection(snapshot, label) {
  return {
    lifecycle: stringValue(snapshot.lifecycle, `${label} lifecycle`),
    frameRevision: nonNegativeInteger(snapshot.frameRevision, `${label} frameRevision`),
    publishedTuple: clone(validatePublicationTuple(
      snapshot.publishedTuple,
      `${label} publishedTuple`,
    )),
  };
}

function validatePublicationTuple(value, label) {
  const tuple = recordValue(value, label);
  assertExactKeys(tuple, ['interaction', 'scene', 'view'], label);
  nonNegativeInteger(tuple.scene, `${label} scene`);
  nonNegativeInteger(tuple.view, `${label} view`);
  nonNegativeInteger(tuple.interaction, `${label} interaction`);
  return tuple;
}

function validateAttemptObservation(value) {
  const attempt = recordValue(value, 'ANI-002 postDestroy attempted call');
  assert(attempt.status === 'completed' || attempt.status === 'rejected', 'ANI-002 attempt status');
  if (attempt.status === 'completed') {
    assertExactKeys(attempt, ['status'], 'ANI-002 completed attempt');
    return attempt;
  }
  assertExactKeys(attempt, ['error', 'status'], 'ANI-002 rejected attempt');
  const error = recordValue(attempt.error, 'ANI-002 rejected attempt error');
  assertExactKeys(
    error,
    ['category', 'code', 'operation', 'recoverable', 'retryable'],
    'ANI-002 rejected attempt error',
  );
  stringValue(error.code, 'ANI-002 rejected attempt code');
  stringValue(error.category, 'ANI-002 rejected attempt category');
  assert(error.operation === 'publishFrame', 'ANI-002 rejected attempt operation');
  assert(typeof error.recoverable === 'boolean', 'ANI-002 rejected attempt recoverable');
  assert(typeof error.retryable === 'boolean', 'ANI-002 rejected attempt retryable');
  return attempt;
}

function assertProductContinuity(left, right, label) {
  for (const field of ['snapshot', 'semantic', 'geometry', 'bar']) {
    assert(sameJson(left[field], right[field]), `${label} ${field}`);
  }
}

function projectCaptures(execution) {
  const captures = cloneRecord(execution.bindings, 'execution bindings');
  for (const captureValue of execution.captures) {
    const capture = recordValue(captureValue, 'capture');
    const id = stringValue(capture.id, 'capture id');
    assert(!Object.hasOwn(captures, id), `capture ${id} unique`);
    captures[id] = cloneRecord(capture.values, `capture ${id} values`);
  }
  return captures;
}

function actionActual(execution, index, type) {
  const result = execution.actionResults[index];
  assert(result.type === type, `action ${index} requires ${type}`);
  return recordValue(recordValue(result.delta, `action ${index} delta`).actual, `action ${index} actual`);
}

function productRecord(value, label) {
  return recordValue(value, label);
}

function barRecord(product) {
  return recordValue(product.bar, 'bar product probe');
}

function countFinite(value, seen = new WeakSet()) {
  if (typeof value === 'number') return Number.isFinite(value) ? 1 : 0;
  if (value === null || typeof value !== 'object' || seen.has(value)) return 0;
  seen.add(value);
  return Object.values(value).reduce((count, nested) => count + countFinite(nested, seen), 0);
}

function notExercised(reason) {
  return { _availability: { status: 'not-exercised', reason } };
}

function cloneRecord(value, label) {
  return clone(recordValue(value, label));
}

function arrayValue(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  return value;
}

function numberArray(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  return value.map((entry, index) => finiteNumber(entry, `${label}[${index}]`));
}

function stringArray(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  return value.map((entry, index) => stringValue(entry, `${label}[${index}]`));
}

function nullableString(value, label) {
  if (value === null) return null;
  return stringValue(value, label);
}

function nullableNonNegativeNumber(value, label) {
  if (value === null) return null;
  const number = finiteNumber(value, label);
  assert(number >= 0, `${label} must be non-negative`);
  return number;
}

function positiveInteger(value, label) {
  assert(Number.isSafeInteger(value) && value > 0, `${label} must be positive`);
  return value;
}

function nonNegativeInteger(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0, `${label} must be non-negative`);
  return value;
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} must be finite`);
  return Object.is(value, -0) ? 0 : value;
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} must be a non-empty string`);
  return value;
}

function recordValue(value, label) {
  assert(isPlainObject(value), `${label} must be a plain object`);
  return value;
}

function assertExactKeys(record, keys, label) {
  const actual = Object.keys(record).sort();
  const required = [...keys].sort();
  assert(
    actual.length === required.length && actual.every((key, index) => key === required[index]),
    `${label} keys`,
  );
}

function validateJsonValue(value, label, ancestors) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    assert(Number.isFinite(value), `${label} finite number`);
    return;
  }
  assert(typeof value === 'object' && !ancestors.has(value), `${label} JSON object`);
  ancestors.add(value);
  if (Array.isArray(value)) {
    value.forEach((nested, index) => validateJsonValue(nested, `${label}[${index}]`, ancestors));
  } else {
    assert(isPlainObject(value), `${label} plain object`);
    for (const [key, nested] of Object.entries(value)) {
      assert(nested !== undefined, `${label}.${key} defined`);
      validateJsonValue(nested, `${label}.${key}`, ancestors);
    }
  }
  ancestors.delete(value);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assert(condition, message) {
  if (!condition) throw new Error(`Core v2 presentation dynamics fold invalid: ${message}`);
}
