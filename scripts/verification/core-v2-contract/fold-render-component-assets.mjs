import { clone, deepFreeze, createTypeSuffixValueAtoms } from './value-atoms.mjs';

const { arrayValue } = createTypeSuffixValueAtoms(assert);

export const RENDER_COMPONENT_ASSETS_FOLD_REVISION =
  'core-v2-render-component-assets-fold/1';

const OBSERVATION_REVISION = 'core-v2-semantic-observation/1';
const EXECUTION_REVISION = 'core-v2-contract-case-execution/1';
const DELTA_REVISION = 'core-v2-semantic-observation-delta/1';
const RESOURCE_PROBE_REVISION = 'core-v2-component-assets-resource-probe/1';
const PRODUCT_CLEANUP_REVISION = 'core-v2-component-assets-product-cleanup/1';

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

const RESOURCE_COUNT_FIELDS = Object.freeze([
  'canvasCount',
  'subscriptionCount',
  'pendingWorkCount',
  'bindingCount',
  'resourceCount',
  'leaseCount',
  'pendingSettlementCount',
  'pendingReleaseCount',
  'staleAttachmentCount',
  'rendererObjectCount',
  'cleanupFailureCount',
]);

const BACKEND_CLEANUP_FIELDS = Object.freeze([
  'pendingRequestCount',
  'resolvedLiveResourceCount',
  'retainedLeaseCount',
  'pendingReleaseCount',
]);

const CONTROLLER_CLEANUP_FIELDS = Object.freeze([
  'targetCount',
  'bindingCount',
  'pendingSettlementCount',
  'pendingReleaseCount',
  'staleAttachmentCount',
]);

const CLEANUP_TRACE = Object.freeze([
  Object.freeze({
    type: 'destroy-case',
    operands: Object.freeze({ expectedResourceDelta: 0 }),
  }),
]);

const CASES = Object.freeze({
  'REN-008': Object.freeze({
    target: Object.freeze({ ownerId: 'item', componentId: 'bg' }),
    trace: Object.freeze([
      traceAction('loadDataset', { datasetId: 'background' }),
      traceAction('replaceComponentSource', {
        ownerId: 'item',
        componentId: 'bg',
        source: 'fixture-image',
        timeMs: 20,
      }),
      traceAction('setComponentVisibility', {
        ownerId: 'item',
        componentId: 'bg',
        show: false,
      }),
      traceAction('setComponentVisibility', {
        ownerId: 'item',
        componentId: 'bg',
        show: true,
      }),
    ]),
    checkpoints: Object.freeze([
      Object.freeze({
        id: 'initial',
        phase: 'after-action',
        afterActionIndex: 0,
        paths: Object.freeze(['id']),
      }),
    ]),
  }),
  'REN-010': Object.freeze({
    target: Object.freeze({ ownerId: 'item-a', componentId: 'icon' }),
    trace: Object.freeze([
      traceAction('loadDataset', { datasetId: 'icon' }),
      traceAction('replaceSource', {
        target: { ownerId: 'item-a', id: 'icon' },
        source: 'fixture-icon-2',
        timeMs: 20,
      }),
      traceAction('patch', {
        target: { ownerId: 'item-a', id: 'icon' },
        changes: { tint: '#00ff00ff' },
      }),
    ]),
    checkpoints: Object.freeze([]),
  }),
});

/** Fold REN-008 / REN-010 product evidence without importing answer evidence. */
export function foldRenderComponentAssetExecution(options) {
  const input = validateOptions(options);
  const plan = validateCasePlan(input.casePlan);
  const execution = validateExecution(input.execution, plan);
  const products = validateSequence(plan, execution);
  const terminal = products.at(-1);
  assert(terminal !== undefined, 'terminal product');
  const terminalSnapshot = recordValue(terminal.snapshot, 'terminal snapshot');
  const terminalSemantic = recordValue(terminal.semanticProbe, 'terminal semantic probe');
  const captures = projectCaptures(plan, execution, products[0]);
  const retainedDelta = projectRetainedDelta(execution.cleanup, terminal.resources, plan.id);

  const actual = {
    $schema: OBSERVATION_REVISION,
    case: projectCase(plan, execution),
    provenance: cloneRecord(input.provenance, 'provenance'),
    environment: cloneRecord(input.environment, 'environment'),
    revisions: projectRevisions(terminalSnapshot),
    scene: {
      _availability: {
        terminalSnapshot: 'available',
        componentVisualProbe: 'available',
      },
      revision: snapshotSceneRevision(terminalSnapshot, 'terminal scene revision'),
    },
    geometry: {
      _availability: {
        semanticProbe: 'available',
        componentVisualProbe: 'available',
        publicGeometryProbe: 'available',
      },
      finiteValueCount: semanticFiniteValueCount(terminalSemantic),
    },
    text: notExercised('component-asset-actions-do-not-observe-text'),
    paint: {
      _availability: {
        componentVisualProbe: 'available',
        rendererPaint: 'available',
        rendererDebug: 'available',
      },
      commandCount: rendererCommandCount(terminalSnapshot),
    },
    interaction: notExercised('component-asset-actions-do-not-observe-interaction'),
    events: {
      _availability: { eventJournal: 'available' },
      journal: clone(execution.eventJournal),
    },
    history: projectHistory(terminalSemantic),
    accessibility: notExercised('component-asset-actions-do-not-observe-accessibility'),
    outcome: {
      _availability: { actionResults: 'available', productSnapshots: 'available' },
      actionResults: execution.actionResults.map(({ index, type, status }) => ({
        index,
        type,
        status,
      })),
    },
    resources: {
      _availability: {
        actionResourceProbe: 'available',
        cleanup: 'available',
        postDestroyProductProbe: 'available',
      },
      retainedDelta,
      cleanup: clone(execution.cleanup),
    },
  };

  if (plan.id === 'REN-008') {
    projectBackground(actual, products, captures);
  } else {
    projectIcon(actual, products);
  }

  assert(
    DOMAIN_NAMES.every((domain) => isPlainObject(actual[domain])),
    'fourteen observation domains',
  );
  validateJsonValue(actual, 'actual', new WeakSet());
  return deepFreeze({
    actual,
    fixtures: cloneRecord(plan.fixture.setup.params, 'fixtures'),
    captures,
  });
}

function validateOptions(options) {
  const input = recordValue(options, 'options');
  assertExactKeys(input, ['casePlan', 'environment', 'execution', 'provenance'], 'options');
  recordValue(input.casePlan, 'casePlan');
  recordValue(input.execution, 'execution');
  recordValue(input.provenance, 'provenance');
  recordValue(input.environment, 'environment');
  validateJsonValue(input.provenance, 'provenance', new WeakSet());
  validateJsonValue(input.environment, 'environment', new WeakSet());
  return input;
}

function validateCasePlan(casePlan) {
  validateJsonValue(casePlan, 'casePlan', new WeakSet());
  const definition = CASES[casePlan.id];
  assert(definition !== undefined, `unsupported case ${String(casePlan.id)}`);
  assert(casePlan.caseType === 'capability', `${casePlan.id} case type`);
  const fixture = recordValue(casePlan.fixture, `${casePlan.id} fixture`);
  const setup = recordValue(fixture.setup, `${casePlan.id} fixture setup`);
  validateFixtureParams(casePlan.id, setup.params);
  const routeParams = recordValue(casePlan.routeParams, `${casePlan.id} route params`);
  assertExactKeys(routeParams, ['seed', 'size'], `${casePlan.id} route params`);
  stringValue(routeParams.size, `${casePlan.id} route size`);
  uint32(routeParams.seed, `${casePlan.id} route seed`);
  stringValue(casePlan.fixtureSha256, `${casePlan.id} fixture digest`);
  stringValue(casePlan.rootTestId, `${casePlan.id} root test ID`);

  const fixtureTrace = arrayValue(fixture.actionTrace, `${casePlan.id} fixture actionTrace`);
  const materializedTrace = arrayValue(casePlan.actionTrace, `${casePlan.id} actionTrace`);
  assert(sameJson(fixtureTrace, materializedTrace), `${casePlan.id} materialized actionTrace`);
  assert(fixtureTrace.length === definition.trace.length, `${casePlan.id} action count`);
  fixtureTrace.forEach((action, index) => {
    const value = recordValue(action, `${casePlan.id} action ${index}`);
    const canonical = definition.trace[index];
    assertExactKeys(value, ['index', 'operands', 'type'], `${casePlan.id} action ${index}`);
    assert(value.index === index, `${casePlan.id} action ${index} index`);
    assert(value.type === canonical.type, `${casePlan.id} action ${index} type`);
    assert(sameJson(value.operands, canonical.operands), `${casePlan.id} action ${index} operands`);
  });
  const checkpoints = arrayValue(
    fixture.captureCheckpoints,
    `${casePlan.id} capture checkpoints`,
  );
  assert(sameJson(checkpoints, definition.checkpoints), `${casePlan.id} capture checkpoints`);
  assert(sameJson(fixture.cleanupTrace, CLEANUP_TRACE), `${casePlan.id} cleanup trace`);
  assert(sameJson(fixture.requiredObservationDomains, [
    'scene',
    'geometry',
    'paint',
    'resources',
  ]), `${casePlan.id} required domains`);
  return { ...casePlan, definition, checkpoints };
}

function validateExecution(execution, plan) {
  validateJsonValue(execution, 'execution', new WeakSet());
  assert(execution.$schema === EXECUTION_REVISION, 'execution schema');
  assert(execution.caseId === plan.id, 'execution case ID');
  assert(execution.caseType === plan.caseType, 'execution case type');
  assert(execution.status === 'completed' && execution.error === null, 'execution completion');
  assert(execution.hostSeamDelta === null, 'capability host seam');
  const results = arrayValue(execution.actionResults, 'execution actionResults');
  assert(results.length === plan.definition.trace.length, 'execution action count');
  results.forEach((result, index) => {
    const value = recordValue(result, `execution result ${index}`);
    const canonical = plan.definition.trace[index];
    assert(value.index === index && value.type === canonical.type, `result ${index} identity`);
    assert(value.handlerId === `contract/${canonical.type}`, `result ${index} handler`);
    assert(value.status === 'completed', `result ${index} status`);
    const startedAtMs = finiteNumber(value.startedAtMs, `result ${index} startedAtMs`);
    const completedAtMs = finiteNumber(value.completedAtMs, `result ${index} completedAtMs`);
    assert(completedAtMs >= startedAtMs, `result ${index} timing`);
    const delta = recordValue(value.delta, `result ${index} delta`);
    assert(delta.$schema === DELTA_REVISION, `result ${index} delta schema`);
    assert(delta.caseId === plan.id && delta.actionIndex === index, `result ${index} delta identity`);
    assert(delta.actionType === canonical.type, `result ${index} delta type`);
    recordValue(delta.actual, `result ${index} actual`);
    recordValue(delta.semanticProbe, `result ${index} semantic probe`);
  });
  assert(Array.isArray(execution.eventJournal), 'execution event journal');
  assert(
    Array.isArray(execution.eventJournalFailures) && execution.eventJournalFailures.length === 0,
    'execution event journal failures',
  );
  assert(isPlainObject(execution.bindings) && Object.keys(execution.bindings).length === 0, 'bindings');
  assert(Array.isArray(execution.captures), 'execution captures');
  recordValue(execution.datasetObservations, 'execution dataset observations');
  recordValue(execution.terminalSnapshot, 'execution terminal snapshot');
  recordValue(execution.terminalSemanticProbe, 'execution terminal semantic probe');
  validateExecutorCleanup(execution.cleanup, plan);
  return execution;
}

function validateExecutorCleanup(value, plan) {
  const cleanup = recordValue(value, 'cleanup');
  assert(cleanup.status === 'completed', 'cleanup status');
  assert(Array.isArray(cleanup.errors) && cleanup.errors.length === 0, 'cleanup errors');
  assert(sameJson(cleanup.declaredActions, ['destroy-case']), 'cleanup declared actions');
  const releases = arrayValue(cleanup.releases, 'cleanup releases');
  assert(releases.length === 1, 'cleanup release count');
  const release = recordValue(releases[0], 'cleanup main release');
  assert(release.role === 'main', 'cleanup main role');
  const remaining = recordValue(release.remainingResources, 'cleanup remaining resources');
  assertExactKeys(
    remaining,
    ['canvasCount', 'pendingWork', 'subscriptions'],
    'cleanup remaining resources',
  );
  for (const field of ['canvasCount', 'pendingWork', 'subscriptions']) {
    assert(nonNegativeInteger(remaining[field], `cleanup ${field}`) === 0, `cleanup ${field} drain`);
  }
  validateProductCleanup(cleanup.productResources, plan.id);
}

function validateSequence(plan, execution) {
  return plan.id === 'REN-008'
    ? validateBackgroundSequence(plan, execution)
    : validateIconSequence(plan, execution);
}

function validateBackgroundSequence(plan, execution) {
  const loaded = actionActualAt(execution, 0, 'loadDataset');
  const replaced = actionActualAt(execution, 1, 'replaceComponentSource');
  const hidden = actionActualAt(execution, 2, 'setComponentVisibility');
  const shown = actionActualAt(execution, 3, 'setComponentVisibility');
  validateLoadActual(loaded, plan, 'background');
  validateMutationActual(replaced, plan, 'replaceComponentSource');
  validateMutationActual(hidden, plan, 'setComponentVisibility');
  validateMutationActual(shown, plan, 'setComponentVisibility');
  assert(replaced.timeMs === 20, 'REN-008 replacement time');
  assert(replaced.source === plan.definition.trace[1].operands.source, 'REN-008 replacement source');
  assert(hidden.show === false, 'REN-008 hidden operand');
  assert(shown.show === true, 'REN-008 shown operand');

  const initial = validateProduct(loaded.product, plan, 'REN-008 initial');
  const replaceBefore = validateProduct(replaced.before, plan, 'REN-008 replacement before');
  const replacement = validateProduct(replaced.after, plan, 'REN-008 replacement after');
  const hideBefore = validateProduct(hidden.before, plan, 'REN-008 hide before');
  const hiddenProduct = validateProduct(hidden.after, plan, 'REN-008 hidden after');
  const showBefore = validateProduct(shown.before, plan, 'REN-008 show before');
  const terminal = validateProduct(shown.after, plan, 'REN-008 shown after');
  assertProductContinuity(initial, replaceBefore, 'REN-008 load/replacement');
  assertProductContinuity(replacement, hideBefore, 'REN-008 replacement/hide');
  assertProductContinuity(hiddenProduct, showBefore, 'REN-008 hide/show');
  validateInputEvidence([loaded, replaced, hidden, shown], 'REN-008');
  validateStableIdentity(
    [initial, replacement, hiddenProduct, terminal],
    'REN-008 component identity',
  );
  validateResourceJournalSequence(
    [initial, replacement, hiddenProduct, terminal],
    'REN-008 resource journal',
  );

  const initialComponent = initial.component;
  assert(initialComponent.componentType === 'background', 'REN-008 initial component type');
  assert(initialComponent.renderRole === 'background-geometry', 'REN-008 initial render role');
  assert(initialComponent.entityKind === 'rect', 'REN-008 initial entity kind');
  assert(initialComponent.sceneImage === null, 'REN-008 initial rect image absence');
  const initialSource = recordValue(initialComponent.semantic.source, 'REN-008 initial rect source');
  assert(initialSource.type === 'rect', 'REN-008 initial rect source kind');

  assertImageComponent(replacement.component, 'REN-008 replacement');
  assert(replacement.component.renderRole === 'background-asset', 'REN-008 asset render role');
  assert(replacement.component.semantic.show === true, 'REN-008 replacement visibility');
  assertSourceAgreement(replacement.component, 'REN-008 replacement');
  assert(hiddenProduct.component.semantic.show === false, 'REN-008 hidden semantic visibility');
  assert(hiddenProduct.component.geometry.visible === false, 'REN-008 hidden geometry visibility');
  assert(hiddenProduct.component.geometry.visibleBounds === null, 'REN-008 hidden visible bounds');
  const hiddenImage = recordValue(hiddenProduct.component.sceneImage, 'REN-008 hidden scene image');
  assert(nonNegativeInteger(hiddenImage.renderObjectCount, 'REN-008 hidden render objects') === 0, 'REN-008 hidden renderer drain');
  const hiddenPaint = recordValue(hiddenProduct.component.rendererPaint, 'REN-008 hidden renderer paint');
  assert(nonNegativeInteger(hiddenPaint.renderObjectCount, 'REN-008 hidden paint objects') === 0, 'REN-008 hidden paint drain');

  assertImageComponent(terminal.component, 'REN-008 shown');
  assert(terminal.component.semantic.show === true, 'REN-008 shown semantic visibility');
  assert(terminal.component.geometry.visible === true, 'REN-008 shown geometry visibility');
  boundsValue(terminal.component.geometry.visibleBounds, 'REN-008 shown visible bounds');
  const shownImage = recordValue(terminal.component.sceneImage, 'REN-008 shown scene image');
  assert(nonNegativeInteger(shownImage.renderObjectCount, 'REN-008 shown render objects') === 1, 'REN-008 shown renderer object');
  assertSourceAgreement(terminal.component, 'REN-008 shown');
  validateIncreasingRevision(initial, replacement, 'REN-008 replacement revision');
  validateIncreasingRevision(replacement, hiddenProduct, 'REN-008 hide revision');
  validateIncreasingRevision(hiddenProduct, terminal, 'REN-008 show revision');
  return [initial, replacement, hiddenProduct, terminal];
}

function validateIconSequence(plan, execution) {
  const loaded = actionActualAt(execution, 0, 'loadDataset');
  const replaced = actionActualAt(execution, 1, 'replaceSource');
  const tinted = actionActualAt(execution, 2, 'patch');
  validateLoadActual(loaded, plan, 'icon');
  validateMutationActual(replaced, plan, 'replaceSource');
  validateMutationActual(tinted, plan, 'patch');
  assert(replaced.timeMs === 20, 'REN-010 replacement time');
  assert(replaced.source === plan.definition.trace[1].operands.source, 'REN-010 replacement source');
  assert(sameJson(tinted.changes, plan.definition.trace[2].operands.changes), 'REN-010 tint changes');

  const initial = validateProduct(loaded.product, plan, 'REN-010 initial');
  const replaceBefore = validateProduct(replaced.before, plan, 'REN-010 replacement before');
  const replacement = validateProduct(replaced.after, plan, 'REN-010 replacement after');
  const tintBefore = validateProduct(tinted.before, plan, 'REN-010 tint before');
  const terminal = validateProduct(tinted.after, plan, 'REN-010 tint after');
  assertProductContinuity(initial, replaceBefore, 'REN-010 load/replacement');
  assertProductContinuity(replacement, tintBefore, 'REN-010 replacement/tint');
  validateInputEvidence([loaded, replaced, tinted], 'REN-010');
  validateStableIdentity([initial, replacement, terminal], 'REN-010 component identity');
  validateResourceJournalSequence([initial, replacement, terminal], 'REN-010 resource journal');

  for (const [label, product] of [
    ['initial', initial],
    ['replacement', replacement],
    ['terminal', terminal],
  ]) {
    assert(product.component.componentType === 'icon', `REN-010 ${label} component type`);
    assert(product.component.renderRole === 'content-asset', `REN-010 ${label} render role`);
    assertImageComponent(product.component, `REN-010 ${label}`);
    assertSourceAgreement(product.component, `REN-010 ${label}`);
  }
  assert(
    sameJson(initial.component.geometry.worldBounds, replacement.component.geometry.worldBounds) &&
      sameJson(replacement.component.geometry.worldBounds, terminal.component.geometry.worldBounds),
    'REN-010 source/tint geometry stability',
  );
  const initialImage = recordValue(initial.component.sceneImage, 'REN-010 initial image');
  const replacementImage = recordValue(replacement.component.sceneImage, 'REN-010 replacement image');
  const terminalImage = recordValue(terminal.component.sceneImage, 'REN-010 terminal image');
  assert(
    positiveInteger(replacementImage.generation, 'REN-010 replacement generation') >
      positiveInteger(initialImage.generation, 'REN-010 initial generation'),
    'REN-010 replacement advances generation',
  );
  assert(replacementImage.bindingKey !== initialImage.bindingKey, 'REN-010 replacement binding');
  assert(terminalImage.generation === replacementImage.generation, 'REN-010 tint generation stable');
  assert(terminalImage.bindingKey === replacementImage.bindingKey, 'REN-010 tint binding stable');
  assertSourceAgreement(terminal.component, 'REN-010 terminal');
  validateTintAgreement(terminal.component, 'REN-010 terminal');
  validateIncreasingRevision(initial, replacement, 'REN-010 replacement revision');
  validateIncreasingRevision(replacement, terminal, 'REN-010 tint revision');
  return [initial, replacement, terminal];
}

function validateLoadActual(actual, plan, datasetId) {
  const value = recordValue(actual, `${plan.id} load actual`);
  assert(value.caseId === plan.id, `${plan.id} load case ID`);
  assert(value.datasetId === datasetId, `${plan.id} load dataset ID`);
  assertOwnerQualifiedTarget(value.target, plan.definition.target, `${plan.id} load target`);
  recordValue(value.registration, `${plan.id} registration`);
  recordValue(value.settlement, `${plan.id} settlement`);
  recordValue(value.loaded, `${plan.id} load result`);
  recordValue(value.input, `${plan.id} load input`);
}

function validateMutationActual(actual, plan, label) {
  const value = recordValue(actual, `${plan.id} ${label} actual`);
  assertOwnerQualifiedTarget(value.target, plan.definition.target, `${plan.id} ${label} target`);
  const mutation = recordValue(value.mutation, `${plan.id} ${label} mutation`);
  assert(mutation.status === 'committed' && mutation.changed === true, `${plan.id} ${label} commit`);
  recordValue(value.input, `${plan.id} ${label} input`);
  recordValue(value.before, `${plan.id} ${label} before`);
  recordValue(value.after, `${plan.id} ${label} after`);
}

function validateProduct(value, plan, label) {
  const product = recordValue(value, `${label} product`);
  const snapshot = recordValue(product.snapshot, `${label} snapshot`);
  const semanticProbe = recordValue(product.semanticProbe, `${label} semantic probe`);
  const geometry = recordValue(product.geometry, `${label} geometry probe`);
  const imageProbe = recordValue(product.imageProbe, `${label} scene image probe`);
  const dataset = arrayValue(product.dataset, `${label} dataset`);
  const component = validateComponentProbe(product.component, plan.definition.target, label);
  const resources = validateResourceProbe(product.resources, plan.id, `${label} resources`);
  assert(Array.isArray(geometry.entities), `${label} geometry entities`);
  recordValue(imageProbe.images, `${label} scene image records`);
  validateDatasetComponent(dataset, component, plan.definition.target, label);
  validateGeometryCrossLink(geometry, component, label);
  validateImageCrossLink(imageProbe, component, label);
  validateRendererCrossLink(component, label);
  assert(
    snapshotSceneRevision(snapshot, `${label} snapshot revision`) ===
      revisionSceneValue(component.revisions, `${label} component revisions`),
    `${label} revision cross-link`,
  );
  validateAllFinite(component.geometry, `${label} component geometry`);
  return { snapshot, semanticProbe, geometry, imageProbe, dataset, component, resources };
}

function validateComponentProbe(value, target, label) {
  const component = recordValue(value, `${label} component probe`);
  assertComponentProbeTarget(component.target, target, `${label} component target`);
  const semantic = recordValue(component.semantic, `${label} component semantic`);
  const semanticTarget = recordValue(semantic.target, `${label} semantic target`);
  assert(semanticTarget.kind === 'component', `${label} semantic target kind`);
  assert(semanticTarget.ownerId === target.ownerId, `${label} semantic target owner`);
  assert(semanticTarget.id === target.componentId, `${label} semantic target ID`);
  assert(semantic.ownerId === target.ownerId, `${label} semantic owner`);
  assert(semantic.componentId === target.componentId, `${label} semantic component ID`);
  stringValue(semantic.componentType, `${label} semantic component type`);
  assert(typeof semantic.show === 'boolean', `${label} semantic visibility`);
  stringValue(component.entityId, `${label} entity ID`);
  stringValue(component.logicalIdentity, `${label} logical identity`);
  stringValue(component.componentType, `${label} component type`);
  stringValue(component.renderRole, `${label} render role`);
  stringValue(component.entityKind, `${label} entity kind`);
  const geometry = recordValue(component.geometry, `${label} component geometry`);
  boundsValue(geometry.localBounds, `${label} local bounds`);
  boundsValue(geometry.worldBounds, `${label} world bounds`);
  if (geometry.visibleBounds !== null) boundsValue(geometry.visibleBounds, `${label} visible bounds`);
  assert(typeof geometry.visible === 'boolean', `${label} geometry visible`);
  assert(typeof geometry.interactive === 'boolean', `${label} geometry interactive`);
  if (component.sceneImage !== null) recordValue(component.sceneImage, `${label} scene image`);
  if (component.rendererPaint !== null) recordValue(component.rendererPaint, `${label} renderer paint`);
  recordValue(component.renderLanes, `${label} render lanes`);
  recordValue(component.revisions, `${label} revisions`);
  const availability = recordValue(component.availability, `${label} availability`);
  assert(
    availability.semantic === true && availability.surface === true &&
      availability.rendererPaint === true && availability.renderLanes === true,
    `${label} product availability`,
  );
  return component;
}

function validateDatasetComponent(dataset, component, target, label) {
  const exported = findExportedComponent(dataset, target.ownerId, target.componentId);
  const semantic = component.semantic;
  assert(exported.type === semantic.componentType, `${label} exported component type`);
  assert(sameJson(exported.size ?? null, semantic.authoredSize), `${label} authored size cross-link`);
  assert(sameJson(exported.source ?? null, semantic.source), `${label} source cross-link`);
  assert(sameJson(exported.tint ?? null, semantic.tint), `${label} tint cross-link`);
  assert((exported.show ?? true) === semantic.show, `${label} visibility cross-link`);
}

function validateGeometryCrossLink(geometry, component, label) {
  const matches = geometry.entities.filter((entity) => (
    isPlainObject(entity) && entity.id === component.entityId
  ));
  assert(matches.length === 1, `${label} geometry entity identity`);
  const entity = matches[0];
  assert(sameJson(entity.worldBounds, component.geometry.worldBounds), `${label} world bounds cross-link`);
  assert(entity.visible === component.geometry.visible, `${label} visible cross-link`);
  if (Object.hasOwn(entity, 'visibleBounds')) {
    assert(
      sameJson(entity.visibleBounds, component.geometry.visibleBounds),
      `${label} visible bounds cross-link`,
    );
  }
}

function validateImageCrossLink(imageProbe, component, label) {
  const images = recordValue(imageProbe.images, `${label} image records`);
  if (component.sceneImage === null) {
    assert(!Object.hasOwn(images, component.entityId), `${label} unexpected image record`);
    return;
  }
  const image = recordValue(images[component.entityId], `${label} image record`);
  const componentImage = recordValue(component.sceneImage, `${label} component image`);
  for (const field of [
    'entityId',
    'generation',
    'bindingKey',
    'sourceKind',
    'state',
    'attachmentState',
    'renderObjectCount',
    'placeholderCount',
    'staleAttachCount',
  ]) {
    assert(sameJson(image[field], componentImage[field]), `${label} image ${field} cross-link`);
  }
  assert(sameJson(image.authoredSource, componentImage.authoredSource), `${label} image source cross-link`);
  assert(componentImage.entityId === component.entityId, `${label} image entity identity`);
  positiveInteger(componentImage.generation, `${label} image generation`);
  stringValue(componentImage.bindingKey, `${label} image binding key`);
  nonNegativeInteger(componentImage.renderObjectCount, `${label} image renderObjectCount`);
  nonNegativeInteger(componentImage.staleAttachCount, `${label} image staleAttachCount`);
}

function validateRendererCrossLink(component, label) {
  const paint = recordValue(component.rendererPaint, `${label} renderer paint`);
  assert(paint.entityId === component.entityId, `${label} paint entity identity`);
  nonNegativeInteger(paint.primitiveCount, `${label} paint primitiveCount`);
  nonNegativeInteger(paint.renderObjectCount, `${label} paint renderObjectCount`);
  const lane = renderLaneForRole(component.renderRole);
  assert(paint.lane === lane, `${label} renderer lane`);
  const laneRecords = Object.values(component.renderLanes).filter((value) => (
    isPlainObject(value) && value.role === lane
  ));
  assert(laneRecords.length === 1, `${label} render lane identity`);
  const laneRecord = laneRecords[0];
  nonNegativeInteger(laneRecord.renderObjectCount, `${label} lane renderObjectCount`);
  nonNegativeInteger(laneRecord.visiblePrimitiveCount, `${label} lane visiblePrimitiveCount`);
  if (component.sceneImage !== null) {
    assert(
      paint.renderObjectCount === component.sceneImage.renderObjectCount,
      `${label} image/paint render object count`,
    );
  }
}

function renderLaneForRole(role) {
  if (role === 'background-geometry') return 'background-geometry';
  if (role === 'background-asset') return 'background-assets';
  if (role === 'content-asset') return 'content-assets';
  throw new Error(`Core v2 render-component-assets fold invalid: unsupported render role ${String(role)}`);
}

function assertImageComponent(component, label) {
  assert(component.entityKind === 'image', `${label} image entity kind`);
  const image = recordValue(component.sceneImage, `${label} scene image`);
  assert(image.state === 'resolved', `${label} image resolved state`);
  assert(image.attachmentState === 'current', `${label} image current attachment`);
  assert(image.active === component.semantic.show, `${label} image active visibility`);
}

function assertSourceAgreement(component, label) {
  const semanticSource = component.semantic.source;
  const image = recordValue(component.sceneImage, `${label} scene image`);
  assert(sameJson(semanticSource, image.authoredSource), `${label} semantic/image source`);
}

function validateTintAgreement(component, label) {
  const tint = stringValue(component.semantic.tint, `${label} semantic tint`);
  assert(/^#[0-9a-f]{8}$/u.test(tint), `${label} normalized RGBA tint`);
  const packed = Number.parseInt(tint.slice(1), 16) >>> 0;
  const paint = recordValue(component.rendererPaint, `${label} renderer paint`);
  assert(nonNegativeInteger(paint.packedTint, `${label} packed tint`) === packed, `${label} packed tint agreement`);
  assert(nonNegativeInteger(paint.rgbTint, `${label} RGB tint`) === (packed >>> 8), `${label} RGB tint agreement`);
  const alpha = finiteNumber(paint.alpha, `${label} renderer alpha`);
  assert(Math.abs(alpha - (packed & 0xff) / 0xff) <= 1e-9, `${label} alpha agreement`);
}

function validateResourceProbe(value, caseId, label) {
  const probe = recordValue(value, label);
  assertExactKeys(probe, ['caseId', 'counts', 'journal', 'revision'], label);
  assert(probe.revision === RESOURCE_PROBE_REVISION, `${label} revision`);
  assert(probe.caseId === caseId, `${label} case ID`);
  const counts = recordValue(probe.counts, `${label} counts`);
  assertExactKeys(counts, RESOURCE_COUNT_FIELDS, `${label} counts`);
  for (const field of RESOURCE_COUNT_FIELDS) {
    nonNegativeInteger(counts[field], `${label} ${field}`);
  }
  validateJournal(probe.journal, `${label} journal`);
  return probe;
}

function validateProductCleanup(value, caseId) {
  const cleanup = recordValue(value, 'cleanup productResources');
  assertExactKeys(
    cleanup,
    ['backendCounts', 'caseId', 'controllerCounts', 'journal', 'revision', 'runtimeCounts'],
    'cleanup productResources',
  );
  assert(cleanup.revision === PRODUCT_CLEANUP_REVISION, 'cleanup product revision');
  assert(cleanup.caseId === caseId, 'cleanup product case ID');
  validateZeroCountRecord(cleanup.runtimeCounts, RESOURCE_COUNT_FIELDS, 'cleanup runtimeCounts');
  validateZeroCountRecord(cleanup.backendCounts, BACKEND_CLEANUP_FIELDS, 'cleanup backendCounts');
  validateZeroCountRecord(
    cleanup.controllerCounts,
    CONTROLLER_CLEANUP_FIELDS,
    'cleanup controllerCounts',
  );
  validateJournal(cleanup.journal, 'cleanup product journal');
  return cleanup;
}

function validateZeroCountRecord(value, fields, label) {
  const counts = recordValue(value, label);
  assertExactKeys(counts, fields, label);
  for (const field of fields) {
    assert(nonNegativeInteger(counts[field], `${label} ${field}`) === 0, `${label} ${field} drain`);
  }
}

function validateJournal(value, label) {
  const journal = arrayValue(value, label);
  let previous = 0;
  journal.forEach((entry, index) => {
    const record = recordValue(entry, `${label} ${index}`);
    const sequence = positiveInteger(record.sequence, `${label} ${index} sequence`);
    assert(sequence > previous, `${label} sequence order`);
    previous = sequence;
    stringValue(record.event, `${label} ${index} event`);
    validateJsonValue(record, `${label}/${index}`, new WeakSet());
  });
  return journal;
}

function validateResourceJournalSequence(products, label) {
  let previous = [];
  for (const [index, product] of products.entries()) {
    const journal = product.resources.journal;
    assert(journal.length >= previous.length, `${label} ${index} length`);
    assert(sameJson(journal.slice(0, previous.length), previous), `${label} ${index} prefix`);
    previous = journal;
  }
}

function projectRetainedDelta(cleanupValue, terminalResources, caseId) {
  const cleanup = recordValue(cleanupValue, 'cleanup');
  const product = validateProductCleanup(cleanup.productResources, caseId);
  const terminal = validateResourceProbe(terminalResources, caseId, 'terminal resources');
  assert(
    product.journal.length >= terminal.journal.length &&
      sameJson(product.journal.slice(0, terminal.journal.length), terminal.journal),
    'cleanup journal extends terminal resource journal',
  );
  const release = recordValue(arrayValue(cleanup.releases, 'cleanup releases')[0], 'cleanup release');
  const remaining = recordValue(release.remainingResources, 'cleanup remaining resources');
  return {
    executor: {
      canvasCount: remaining.canvasCount,
      subscriptions: remaining.subscriptions,
      pendingWork: remaining.pendingWork,
    },
    runtime: clone(product.runtimeCounts),
    backend: clone(product.backendCounts),
    controller: clone(product.controllerCounts),
  };
}

function projectBackground(actual, products, captures) {
  const initial = products[0];
  const hidden = products[2];
  const terminal = products[3];
  assert(initial && hidden && terminal, 'REN-008 product phases');
  const authoredSize = componentSizeTuple(
    initial.component.semantic.authoredSize,
    'REN-008 authored size',
  );
  const visibleBounds = cloneBounds(
    terminal.component.geometry.visibleBounds,
    'REN-008 visible bounds',
  );
  const terminalImage = recordValue(terminal.component.sceneImage, 'REN-008 terminal image');
  const hiddenImage = recordValue(hidden.component.sceneImage, 'REN-008 hidden image');
  const shownId = stringValue(
    terminal.component.semantic.componentId,
    'REN-008 shown component ID',
  );
  assert(shownId === captures.initial.id, 'REN-008 shown/captured identity');
  actual.scene.hidden = {
    renderObjectCount: nonNegativeInteger(
      hiddenImage.renderObjectCount,
      'REN-008 hidden renderObjectCount',
    ),
  };
  actual.scene.shown = { id: shownId };
  actual.paint.background = {
    data: { size: authoredSize },
    visibleBounds,
    source: clone(terminal.component.semantic.source),
    staleTextureCount: nonNegativeInteger(
      terminalImage.staleAttachCount,
      'REN-008 stale texture count',
    ),
  };
}

function projectIcon(actual, products) {
  const terminal = products[2];
  assert(terminal !== undefined, 'REN-010 terminal product');
  const bounds = cloneBounds(terminal.component.geometry.visibleBounds, 'REN-010 icon bounds');
  const [x, y, width, height] = bounds;
  const image = recordValue(terminal.component.sceneImage, 'REN-010 terminal image');
  validateTintAgreement(terminal.component, 'REN-010 projection');
  actual.paint.icon = {
    bounds: {
      width,
      height,
      right: finiteNumber(x + width, 'REN-010 bounds right'),
      top: y,
    },
    source: clone(terminal.component.semantic.source),
    tint: terminal.component.semantic.tint,
    staleTextureCount: nonNegativeInteger(
      image.staleAttachCount,
      'REN-010 stale texture count',
    ),
  };
}

function projectCaptures(plan, execution, initialProduct) {
  const captures = execution.captures;
  if (plan.id === 'REN-010') {
    assert(captures.length === 0, 'REN-010 capture count');
    return {};
  }
  assert(captures.length === 1, 'REN-008 capture count');
  const capture = recordValue(captures[0], 'REN-008 initial capture');
  const checkpoint = plan.checkpoints[0];
  assert(capture.id === checkpoint.id, 'REN-008 capture ID');
  assert(capture.phase === checkpoint.phase, 'REN-008 capture phase');
  assert(capture.afterActionIndex === checkpoint.afterActionIndex, 'REN-008 capture action');
  const values = recordValue(capture.values, 'REN-008 capture values');
  assertExactKeys(values, ['id'], 'REN-008 capture values');
  const id = stringValue(values.id, 'REN-008 captured ID');
  assert(
    id === initialProduct.component.semantic.componentId,
    'REN-008 capture product identity',
  );
  return { initial: { id } };
}

function projectCase(plan, execution) {
  return {
    id: plan.id,
    caseType: plan.caseType,
    params: cloneRecord(plan.routeParams, 'route params'),
    fixtureSha256: stringValue(plan.fixtureSha256, 'fixture digest'),
    rootTestId: stringValue(plan.rootTestId, 'root test ID'),
    executedActions: execution.actionResults.map(({ index, type, status }) => ({
      index,
      type,
      status,
    })),
  };
}

function projectRevisions(snapshot) {
  const revisions = recordValue(snapshot.revisions, 'snapshot revisions');
  return {
    _availability: { terminalSnapshot: 'available' },
    scene: finiteNumber(revisions.sceneRevision, 'revision scene'),
    view: finiteNumber(revisions.viewRevision, 'revision view'),
    interaction: finiteNumber(revisions.interactionRevision, 'revision interaction'),
    frame: { revision: finiteNumber(snapshot.frameRevision, 'frame revision') },
    publishedTuple: cloneRecord(snapshot.publishedTuple, 'published tuple'),
  };
}

function projectHistory(semantic) {
  const history = recordValue(semantic.history, 'semantic history');
  return {
    _availability: { semanticProbe: 'available' },
    depth: nonNegativeInteger(history.depth, 'history depth'),
  };
}

function validateInputEvidence(actuals, label) {
  let baseline = null;
  for (const [index, actual] of actuals.entries()) {
    const input = recordValue(actual.input, `${label} input ${index}`);
    const before = stringValue(input.beforeFingerprint, `${label} input ${index} before`);
    const after = stringValue(input.afterFingerprint, `${label} input ${index} after`);
    assert(input.unchanged === true && before === after, `${label} input ${index} unchanged`);
    baseline ??= before;
    assert(before === baseline, `${label} input ${index} baseline`);
  }
}

function validateStableIdentity(products, label) {
  const first = products[0].component;
  for (const product of products) {
    const component = product.component;
    assert(component.entityId === first.entityId, `${label} entity ID`);
    assert(component.logicalIdentity === first.logicalIdentity, `${label} logical identity`);
    assert(
      component.semantic.componentId === first.semantic.componentId,
      `${label} semantic component ID`,
    );
    assert(component.semantic.ownerId === first.semantic.ownerId, `${label} semantic owner`);
  }
}

function assertProductContinuity(left, right, label) {
  assert(sameJson(left, right), `${label} product continuity`);
}

function validateIncreasingRevision(before, after, label) {
  assert(
    snapshotSceneRevision(after.snapshot, `${label} after`) >
      snapshotSceneRevision(before.snapshot, `${label} before`),
    label,
  );
  assert(
    finiteNumber(after.snapshot.frameRevision, `${label} after frame`) >
      finiteNumber(before.snapshot.frameRevision, `${label} before frame`),
    `${label} frame`,
  );
}

function semanticFiniteValueCount(semantic) {
  const geometry = recordValue(semantic.geometry, 'semantic geometry');
  return nonNegativeInteger(geometry.finiteValueCount, 'geometry finiteValueCount');
}

function rendererCommandCount(snapshot) {
  const resources = recordValue(snapshot.resources, 'snapshot resources');
  const rendering = recordValue(resources.rendering, 'snapshot rendering');
  return nonNegativeInteger(rendering.commandCount, 'paint commandCount');
}

function snapshotSceneRevision(snapshot, label) {
  const revisions = recordValue(snapshot.revisions, `${label} revisions`);
  return finiteNumber(revisions.sceneRevision, label);
}

function revisionSceneValue(value, label) {
  const revisions = recordValue(value, label);
  return finiteNumber(revisions.sceneRevision, `${label} sceneRevision`);
}

function componentSizeTuple(value, label) {
  const size = recordValue(value, label);
  assertExactKeys(size, ['height', 'width'], label);
  return [
    finiteNumber(size.width, `${label} width`),
    finiteNumber(size.height, `${label} height`),
  ];
}

function findExportedComponent(elements, ownerId, componentId) {
  const owner = findExportedElement(elements, ownerId);
  const components = owner.type === 'item'
    ? owner.components
    : owner.type === 'grid'
      ? owner.item?.components
      : null;
  assert(Array.isArray(components), `${ownerId} exported components`);
  const matches = components.filter((candidate) => (
    isPlainObject(candidate) && candidate.id === componentId
  ));
  assert(matches.length === 1, `${ownerId}:${componentId} exported component identity`);
  return matches[0];
}

function findExportedElement(elements, id) {
  for (const element of elements) {
    if (!isPlainObject(element)) continue;
    if (element.id === id) return element;
    if (element.type === 'group' && Array.isArray(element.children)) {
      const nested = findExportedElementOrNull(element.children, id);
      if (nested) return nested;
    }
  }
  throw new Error(`Core v2 render-component-assets fold invalid: missing exported owner ${id}`);
}

function findExportedElementOrNull(elements, id) {
  for (const element of elements) {
    if (!isPlainObject(element)) continue;
    if (element.id === id) return element;
    if (element.type === 'group' && Array.isArray(element.children)) {
      const nested = findExportedElementOrNull(element.children, id);
      if (nested) return nested;
    }
  }
  return null;
}

function actionActualAt(execution, index, type) {
  const result = execution.actionResults[index];
  assert(result?.type === type, `action ${index} ${type}`);
  return recordValue(result.delta.actual, `action ${index} actual`);
}

function assertOwnerQualifiedTarget(value, target, label) {
  const candidate = recordValue(value, label);
  assertExactKeys(candidate, ['id', 'kind', 'ownerId'], label);
  assert(candidate.kind === 'component', `${label} kind`);
  assert(candidate.ownerId === target.ownerId, `${label} owner`);
  assert(candidate.id === target.componentId, `${label} component`);
}

function assertComponentProbeTarget(value, target, label) {
  const candidate = recordValue(value, label);
  assertExactKeys(candidate, ['componentId', 'ownerId'], label);
  assert(candidate.ownerId === target.ownerId, `${label} owner`);
  assert(candidate.componentId === target.componentId, `${label} component`);
}

function validateAllFinite(value, label) {
  for (const [key, candidate] of Object.entries(value)) {
    if (candidate === null || typeof candidate === 'boolean') continue;
    if (typeof candidate === 'number') {
      finiteNumber(candidate, `${label}.${key}`);
      continue;
    }
    if (Array.isArray(candidate)) {
      candidate.forEach((entry, index) => finiteNumber(entry, `${label}.${key}[${index}]`));
    }
  }
}

function boundsValue(value, label) {
  assert(Array.isArray(value) && value.length === 4, `${label} bounds`);
  value.forEach((entry, index) => finiteNumber(entry, `${label}[${index}]`));
  return value;
}

function cloneBounds(value, label) {
  return boundsValue(value, label).map((entry) => entry);
}

function validateFixtureParams(caseId, value) {
  const params = recordValue(value, `${caseId} fixture params`);
  if (caseId === 'REN-008') {
    assert(sameJson(params, {
      item: {
        id: 'item',
        size: [100, 80],
        padding: 10,
        background: {
          id: 'bg',
          source: {
            type: 'rect',
            fill: '#ff0000',
            borderWidth: 2,
            radius: 8,
          },
          size: [20, 10],
        },
      },
      replacementSource: 'fixture-image',
    }), 'REN-008 fixture identity');
    return;
  }
  assert(caseId === 'REN-010', `unsupported fixture case ${String(caseId)}`);
  assert(sameJson(params, {
    icon: {
      ownerId: 'item-a',
      id: 'icon',
      source: 'fixture-icon',
      size: ['50%', '25%'],
      placement: 'right-top',
      margin: { top: 2, right: 3 },
    },
    contentBox: [10, 10, 80, 60],
  }), 'REN-010 fixture identity');
}

function notExercised(reason) {
  return { _availability: { status: 'not-exercised', reason } };
}

function traceAction(type, operands) {
  return Object.freeze({ type, operands: deepFreeze(operands) });
}

function recordValue(value, label) {
  assert(isPlainObject(value), `${label} must be an object`);
  return value;
}

function cloneRecord(value, label) {
  return clone(recordValue(value, label));
}


function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} non-empty string`);
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

function positiveInteger(value, label) {
  assert(Number.isSafeInteger(value) && value > 0, `${label} positive integer`);
  return value;
}

function uint32(value, label) {
  assert(Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff, `${label} uint32`);
  return value;
}

function assertExactKeys(value, keys, label) {
  const record = recordValue(value, label);
  assert(sameJson(Object.keys(record).sort(), [...keys].sort()), `${label} keys`);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateJsonValue(value, path, ancestors) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return;
  if (typeof value === 'number') {
    assert(Number.isFinite(value), `${path} non-finite number`);
    return;
  }
  assert(typeof value === 'object', `${path} JSON type`);
  assert(!ancestors.has(value), `${path} cycle`);
  assert(Array.isArray(value) || isPlainObject(value), `${path} plain JSON value`);
  ancestors.add(value);
  for (const key of Object.keys(value)) {
    validateJsonValue(value[key], `${path}/${key}`, ancestors);
  }
  ancestors.delete(value);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}


function assert(condition, message) {
  if (!condition) {
    throw new Error(`Core v2 render-component-assets fold invalid: ${message}`);
  }
}
