import { clone, deepFreeze, createTypeSuffixValueAtoms } from './value-atoms.mjs';

const {
  arrayValue,
  booleanValue,
} = createTypeSuffixValueAtoms(assert);

export const RENDER_IMAGES_FOLD_REVISION = 'patch-map-render-images-fold/1';

const OBSERVATION_REVISION = 'patch-map-semantic-observation/1';
const EXECUTION_REVISION = 'patch-map-contract-case-execution/1';
const DELTA_REVISION = 'patch-map-semantic-observation-delta/1';
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

const CASE_TRACE = Object.freeze([
  traceAction('loadDataset', { datasetId: 'image-specimens' }),
  traceAction('resolveAsset', {
    targetId: 'descriptor',
    requestId: 'old',
    completeAtMs: 100,
  }),
  traceAction('replaceSource', {
    targetId: 'descriptor',
    source: 'fixture-image',
    timeMs: 20,
  }),
  traceAction('completeAsset', { requestId: 'old', timeMs: 100 }),
]);

const CLEANUP_TRACE = Object.freeze([
  Object.freeze({
    type: 'destroy-case',
    operands: Object.freeze({ expectedResourceDelta: 0 }),
  }),
]);

/** Fold REN-005 public product evidence without reading expected assertions. */
export function foldRenderImageExecution(options) {
  const input = validateOptions(options);
  const plan = validateCasePlan(input.casePlan);
  const execution = validateExecution(input.execution, plan);
  const loaded = actionActualAt(execution, 0, 'loadDataset');
  const initial = productValue(loaded.product, 'loadDataset product');
  const pending = actionActualAt(execution, 1, 'resolveAsset');
  const replaced = actionActualAt(execution, 2, 'replaceSource');
  const terminalAction = actionActualAt(execution, 3, 'completeAsset');
  const terminal = productValue(terminalAction.product, 'terminal product');
  validateSequence(
    loaded,
    initial,
    pending,
    replaced,
    terminalAction,
    terminal,
    execution.cleanup,
  );

  const snapshot = recordValue(terminal.snapshot, 'terminal snapshot');
  const semantic = recordValue(terminal.semanticProbe, 'terminal semantic probe');
  const geometryProbe = recordValue(terminal.geometry, 'terminal geometry probe');
  const imageProbe = recordValue(terminal.imageProbe, 'terminal image probe');
  const images = recordValue(imageProbe.images, 'terminal image records');
  const alias = imageRecord(images, 'alias');
  const url = imageRecord(images, 'url');
  const descriptor = imageRecord(images, 'descriptor');
  const dataUri = imageRecord(images, 'data-uri');
  const transformed = imageRecord(images, 'transformed');
  const hidden = imageRecord(images, 'hidden-image');
  const failed = imageRecord(images, 'failed-image');
  const geometryImages = indexImageGeometry(geometryProbe);
  const hits = recordValue(terminal.hits, 'terminal image hits');
  const hiddenHit = recordValue(hits.hidden, 'hidden hit');
  const failedHit = recordValue(hits.failed, 'failed hit');
  const semanticGeometry = recordValue(semantic.geometry, 'semantic geometry');
  const semanticInteraction = recordValue(semantic.interaction, 'semantic interaction');
  const rendering = recordValue(
    recordValue(snapshot.resources, 'snapshot resources').rendering,
    'snapshot rendering',
  );

  const actual = {
    $schema: OBSERVATION_REVISION,
    case: projectCase(plan, execution),
    provenance: cloneRecord(input.provenance, 'provenance'),
    environment: cloneRecord(input.environment, 'environment'),
    revisions: projectRevisions(snapshot),
    scene: {
      _availability: { terminalSnapshot: 'available', imageProbe: 'available' },
      revision: finiteNumber(
        recordValue(snapshot.revisions, 'snapshot revisions').sceneRevision,
        'scene revision',
      ),
      images: {
        'data-uri': { zIndex: finiteNumber(dataUri.zIndex, 'data-uri zIndex') },
        transformed: { zIndex: finiteNumber(transformed.zIndex, 'transformed zIndex') },
        'hidden-image': {
          renderObjectCount: nonNegativeInteger(
            hidden.renderObjectCount,
            'hidden renderObjectCount',
          ),
        },
      },
    },
    geometry: {
      _availability: { semanticProbe: 'available', publicGeometryProbe: 'available' },
      finiteValueCount: nonNegativeInteger(
        semanticGeometry.finiteValueCount,
        'geometry finiteValueCount',
      ),
      images: {
        'data-uri': { worldBounds: cloneBounds(geometryImages['data-uri'], 'data-uri') },
        transformed: { worldBounds: cloneBounds(geometryImages.transformed, 'transformed') },
        'failed-image': {
          placeholderBounds: cloneBounds(geometryImages['failed-image'], 'failed-image'),
        },
      },
    },
    text: notExercised('image-actions-do-not-observe-text'),
    paint: {
      _availability: { rendererDebug: 'available', imageProbe: 'available' },
      commandCount: nonNegativeInteger(rendering.commandCount, 'paint commandCount'),
      images: {
        'data-uri': { opacity: finiteNumber(dataUri.opacity, 'data-uri opacity') },
        'hidden-image': { opacity: finiteNumber(hidden.opacity, 'hidden opacity') },
        'failed-image': { role: stringValue(failed.role, 'failed role') },
      },
    },
    interaction: {
      _availability: { semanticProbe: 'available', publicHitTest: 'available' },
      activeGestureCount: nonNegativeInteger(
        semanticInteraction.activeGestureCount,
        'active gesture count',
      ),
      images: {
        'hidden-image': { hit: hiddenHit.target !== null },
        'failed-image': {
          hitProbe: {
            point: clonePoint(failedHit.point, 'failed hit point'),
            target: nullableString(failedHit.target, 'failed hit target'),
          },
        },
      },
    },
    events: {
      _availability: { eventJournal: 'available' },
      journal: clone(execution.eventJournal),
    },
    history: projectHistory(semantic),
    accessibility: notExercised('image-actions-do-not-observe-accessibility'),
    outcome: {
      _availability: { imageProbe: 'available', actionResults: 'available' },
      images: {
        'failed-image': {
          diagnosticCount: nonNegativeInteger(failed.diagnosticCount, 'failed diagnosticCount'),
        },
      },
      actionResults: execution.actionResults.map(({ index, type, status }) => ({ index, type, status })),
    },
    resources: {
      _availability: {
        imageProbe: 'available',
        requestProbe: 'available',
        cleanup: 'available',
      },
      images: {
        // Bounds and sourceKind intentionally coexist with exact resource facts.
        // The immutable expected catalog currently contains overlapping strict-eq
        // parent assertions; the independent comparator must expose that conflict.
        alias: imageResource(alias, { bounds: cloneBounds(geometryImages.alias, 'alias') }),
        url: imageResource(url, {
          bounds: boundsObject(geometryImages.url, 'url'),
        }),
        descriptor: {
          source: clone(descriptor.authoredSource),
          staleAttachCount: nonNegativeInteger(
            descriptor.staleAttachCount,
            'descriptor staleAttachCount',
          ),
          hitBounds: cloneBounds(descriptor.hitBounds, 'descriptor hitBounds'),
          initial: initialResource(recordValue(descriptor.initial, 'descriptor initial')),
        },
        'data-uri': imageResource(dataUri, {
          sourceKind: stringValue(dataUri.sourceKind, 'data-uri sourceKind'),
        }),
        transformed: imageResource(transformed, {
          reusedResolvedResource: booleanValue(
            transformed.reusedResolvedResource,
            'transformed reusedResolvedResource',
          ),
        }),
      },
      abandonedRequests: projectAbandonedRequestEvidence(
        imageProbe,
        terminal,
        execution.cleanup,
      ),
      cleanup: clone(execution.cleanup),
    },
  };

  assert(DOMAIN_NAMES.every((domain) => isPlainObject(actual[domain])), 'fourteen domains');
  validateJsonValue(actual, 'actual', new WeakSet());
  return deepFreeze({
    actual,
    fixtures: cloneRecord(plan.fixture.setup.params, 'fixtures'),
    captures: projectCaptures(plan, execution),
  });
}

function validateOptions(options) {
  assert(isPlainObject(options), 'options');
  assertExactKeys(options, ['casePlan', 'execution', 'provenance', 'environment'], 'options');
  assert(isPlainObject(options.casePlan), 'casePlan');
  assert(isPlainObject(options.execution), 'execution');
  assert(isPlainObject(options.provenance), 'provenance');
  assert(isPlainObject(options.environment), 'environment');
  return options;
}

function validateCasePlan(casePlan) {
  validateJsonValue(casePlan, 'casePlan', new WeakSet());
  assert(casePlan.id === 'REN-005', 'case ID');
  assert(casePlan.caseType === 'capability', 'case type');
  const fixture = recordValue(casePlan.fixture, 'fixture');
  const setup = recordValue(fixture.setup, 'fixture setup');
  const params = recordValue(setup.params, 'fixture params');
  assert(Array.isArray(params.images) && params.images.length === 7, 'fixture image count');
  assert(Array.isArray(fixture.actionTrace), 'fixture actionTrace');
  assert(sameJson(fixture.actionTrace, casePlan.actionTrace), 'materialized actionTrace');
  assert(fixture.actionTrace.length === CASE_TRACE.length, 'action count');
  fixture.actionTrace.forEach((action, index) => {
    const trace = CASE_TRACE[index];
    assertExactKeys(action, ['index', 'type', 'operands'], `action ${index}`);
    assert(action.index === index, `action ${index} index`);
    assert(action.type === trace.type, `action ${index} type`);
    assert(sameJson(action.operands, trace.operands), `action ${index} operands`);
  });
  assert(Array.isArray(fixture.captureCheckpoints), 'capture checkpoints');
  assert(fixture.captureCheckpoints.length === 1, 'capture count');
  const checkpoint = fixture.captureCheckpoints[0];
  assert(sameJson(checkpoint, {
    id: 'images',
    phase: 'after-action',
    afterActionIndex: 3,
    paths: ['descriptor/worldBounds'],
  }), 'image capture checkpoint');
  assert(sameJson(fixture.cleanupTrace, CLEANUP_TRACE), 'cleanup trace');
  return casePlan;
}

function validateExecution(execution, plan) {
  validateJsonValue(execution, 'execution', new WeakSet());
  assert(execution.$schema === EXECUTION_REVISION, 'execution schema');
  assert(execution.caseId === plan.id, 'execution case ID');
  assert(execution.caseType === plan.caseType, 'execution case type');
  assert(execution.status === 'completed' && execution.error === null, 'execution completion');
  assert(execution.hostSeamDelta === null, 'capability host seam');
  assert(Array.isArray(execution.actionResults) && execution.actionResults.length === 4, 'action results');
  execution.actionResults.forEach((result, index) => {
    const trace = CASE_TRACE[index];
    assert(result.index === index && result.type === trace.type, `result ${index} identity`);
    assert(result.handlerId === `contract/${trace.type}`, `result ${index} handler`);
    assert(result.status === 'completed', `result ${index} status`);
    finiteNumber(result.startedAtMs, `result ${index} startedAtMs`);
    finiteNumber(result.completedAtMs, `result ${index} completedAtMs`);
    const delta = recordValue(result.delta, `result ${index} delta`);
    assert(delta.$schema === DELTA_REVISION, `result ${index} delta schema`);
    assert(delta.caseId === plan.id && delta.actionIndex === index, `result ${index} delta identity`);
    assert(delta.actionType === trace.type, `result ${index} delta type`);
    recordValue(delta.actual, `result ${index} actual`);
    recordValue(delta.semanticProbe, `result ${index} semantic probe`);
  });
  assert(Array.isArray(execution.eventJournal), 'event journal');
  assert(Array.isArray(execution.eventJournalFailures) && execution.eventJournalFailures.length === 0, 'event failures');
  assert(isPlainObject(execution.bindings) && Object.keys(execution.bindings).length === 0, 'bindings');
  assert(Array.isArray(execution.captures) && execution.captures.length === 1, 'execution capture');
  recordValue(execution.terminalSnapshot, 'terminal snapshot');
  recordValue(execution.terminalSemanticProbe, 'terminal semantic probe');
  validateCleanup(execution.cleanup, plan.fixture.cleanupTrace);
  return execution;
}

function validateCleanup(value, cleanupTrace) {
  const cleanup = recordValue(value, 'cleanup');
  assert(cleanup.status === 'completed', 'cleanup status');
  assert(Array.isArray(cleanup.errors) && cleanup.errors.length === 0, 'cleanup errors');
  const declaredActions = cleanupTrace.map((action, index) => (
    stringValue(recordValue(action, `cleanup trace ${index}`).type, `cleanup trace ${index} type`)
  ));
  assert(sameJson(cleanup.declaredActions, declaredActions), 'cleanup declared actions');
  assert(Array.isArray(cleanup.releases) && cleanup.releases.length === 1, 'cleanup release count');
  const expectedDelta = nonNegativeInteger(
    recordValue(cleanupTrace[0].operands, 'cleanup operands').expectedResourceDelta,
    'cleanup expected resource delta',
  );
  cleanup.releases.forEach((value, index) => {
    const release = recordValue(value, `cleanup release ${index}`);
    assert(release.role === 'main', `cleanup release ${index} role`);
    const remaining = recordValue(
      release.remainingResources,
      `cleanup release ${index} remaining resources`,
    );
    assertExactKeys(
      remaining,
      ['canvasCount', 'subscriptions', 'pendingWork'],
      `cleanup release ${index} remaining resources`,
    );
    for (const field of ['canvasCount', 'subscriptions', 'pendingWork']) {
      assert(
        nonNegativeInteger(remaining[field], `cleanup release ${index} ${field}`)
          === expectedDelta,
        `cleanup release ${index} ${field} resource delta`,
      );
    }
  });
  validateProductCleanup(cleanup.productResources);
}

function validateSequence(
  loaded,
  initial,
  pending,
  replaced,
  terminalAction,
  terminal,
  cleanupValue,
) {
  const loadInput = recordValue(loaded.input, 'load input');
  assert(loaded.datasetId === CASE_TRACE[0].operands.datasetId, 'loaded dataset ID');
  assert(loadInput.unchanged === true, 'initial input unchanged');
  assert(loadInput.beforeFingerprint === loadInput.afterFingerprint, 'initial input fingerprint');
  assert(initial.imageProbe.images.descriptor !== undefined, 'initial descriptor image');
  assert(pending.targetId === 'descriptor' && pending.requestId === 'old', 'pending request');
  assert(pending.completeAtMs === CASE_TRACE[1].operands.completeAtMs, 'pending completion time');
  const pendingRequest = recordValue(pending.request, 'pending request state');
  assert(
    pendingRequest.state === 'pending' && pendingRequest.attached === false,
    'pending request state',
  );
  validatePendingControlledRequest(pendingRequest);
  assert(replaced.targetId === 'descriptor' && replaced.source === 'fixture-image', 'replacement');
  assert(replaced.timeMs === CASE_TRACE[2].operands.timeMs, 'replacement time');
  const mutation = recordValue(replaced.mutation, 'replacement mutation');
  assert(
    mutation.status === 'committed' && mutation.changed === true,
    'replacement mutation result',
  );
  const replacementProduct = productValue(replaced.after, 'replacement product');
  const replacementDescriptor = imageRecord(
    recordValue(replacementProduct.imageProbe.images, 'replacement images'),
    'descriptor',
  );
  assert(replacementDescriptor.authoredSource === 'fixture-image', 'replacement descriptor source');
  assert(terminalAction.requestId === 'old', 'completed request');
  assert(terminalAction.timeMs === CASE_TRACE[3].operands.timeMs, 'completed request time');
  const completion = recordValue(terminalAction.completion, 'completed request state');
  assert(
    completion.state === 'stale-discarded' && completion.attached === false,
    'completed request state',
  );
  validateTerminalControlledRequest(completion, pendingRequest, 'completion');
  const requests = recordValue(terminal.requests, 'terminal request ledger');
  assert(nonNegativeInteger(requests.pendingCount, 'terminal pendingCount') === 0, 'terminal request drain');
  assert(nonNegativeInteger(requests.completedCount, 'terminal completedCount') === 1, 'terminal completed count');
  assert(
    nonNegativeInteger(requests.staleCompletionCount, 'terminal staleCompletionCount') === 1,
    'terminal stale completion count',
  );
  assert(nonNegativeInteger(requests.attachedCount, 'terminal attachedCount') === 0, 'terminal attachment drain');
  assert(
    nonNegativeInteger(requests.retainedPendingCount, 'terminal retainedPendingCount') === 0,
    'terminal retained pending drain',
  );
  const controlledRequests = arrayValue(
    requests.controlledRequests,
    'terminal controlledRequests',
  );
  assert(controlledRequests.length === 1, 'terminal controlled request count');
  const terminalControlled = recordValue(
    controlledRequests[0],
    'terminal controlled request',
  );
  validateTerminalControlledRequest(
    terminalControlled,
    pendingRequest,
    'terminal controlled request',
  );
  validateCleanupControlledLink(cleanupValue, pendingRequest, terminalControlled);
  const descriptor = imageRecord(recordValue(terminal.imageProbe.images, 'terminal images'), 'descriptor');
  assert(descriptor.authoredSource === 'fixture-image', 'terminal descriptor source');
}

function validateCleanupControlledLink(cleanupValue, pending, terminal) {
  const cleanup = recordValue(cleanupValue, 'cleanup');
  const product = recordValue(cleanup.productResources, 'cleanup productResources');
  const controlled = arrayValue(product.controlledRequests, 'cleanup controlledRequests');
  assert(controlled.length === 1, 'cleanup controlled request count');
  const old = recordValue(controlled[0], 'cleanup controlled old request');
  for (const field of [
    'requestId',
    'targetId',
    'generation',
    'bindingKey',
    'sourceCacheIdentity',
    'backendToken',
    'backendKey',
  ]) {
    assert(old[field] === pending[field], `cleanup controlled ${field} identity`);
  }
  for (const field of [
    'backendState',
    'attemptState',
    'attachmentState',
    'retainedPendingCount',
    'retainedLeaseCount',
  ]) {
    assert(old[field] === terminal[field], `cleanup controlled ${field} terminal link`);
  }

  const backend = recordValue(product.backend, 'cleanup backend');
  const backendRequests = arrayValue(backend.requests, 'cleanup backend requests')
    .map((value, index) => recordValue(value, `cleanup backend request ${index}`));
  const requestMatches = backendRequests.filter(({ token, key }) => (
    token === old.backendToken && key === old.backendKey
  ));
  assert(requestMatches.length === 1, 'cleanup controlled backend request link');
  assert(requestMatches[0].state === 'unloaded', 'cleanup controlled backend request unloaded');
  assert(requestMatches[0].kind === 'descriptor', 'cleanup controlled backend request kind');

  const journal = recordValue(product.journal, 'cleanup product journal');
  const unloadTokens = stringArray(journal.unloadRequestTokens, 'cleanup unloadRequestTokens');
  assert(unloadTokens.includes(old.backendToken), 'cleanup controlled unload token link');
  const entries = arrayValue(journal.entries, 'cleanup journal entries')
    .map((value, index) => recordValue(value, `cleanup journal entry ${index}`));
  assert(entries.some(({ event, requestToken, requestKey }) => (
    event === 'unload' &&
    requestToken === old.backendToken &&
    requestKey === old.backendKey
  )), 'cleanup controlled unload journal link');
}

function validatePendingControlledRequest(request) {
  positiveInteger(request.generation, 'pending generation');
  stringValue(request.bindingKey, 'pending bindingKey');
  stringValue(request.sourceCacheIdentity, 'pending sourceCacheIdentity');
  stringValue(request.backendToken, 'pending backendToken');
  stringValue(request.backendKey, 'pending backendKey');
  assert(request.backendState === 'pending', 'pending backend state');
  assert(request.attemptState === 'pending', 'pending attempt state');
  assert(request.attachmentState === 'current', 'pending attachment state');
  assert(
    nonNegativeInteger(request.retainedPendingCount, 'pending retainedPendingCount') === 1,
    'pending target request count',
  );
  assert(
    nonNegativeInteger(request.retainedLeaseCount, 'pending retainedLeaseCount') === 1,
    'pending target lease count',
  );
}

function validateTerminalControlledRequest(request, pending, label) {
  for (const field of [
    'requestId',
    'targetId',
    'generation',
    'bindingKey',
    'sourceCacheIdentity',
    'backendToken',
    'backendKey',
  ]) {
    assert(request[field] === pending[field], `${label} ${field} identity`);
  }
  assert(request.state === 'stale-discarded', `${label} state`);
  assert(request.attached === false, `${label} attachment result`);
  assert(request.backendState === 'unloaded', `${label} backend unloaded`);
  assert(request.attemptState === 'resolved', `${label} attempt resolved`);
  assert(request.attachmentState === 'stale', `${label} attempt stale`);
  assert(
    nonNegativeInteger(request.retainedPendingCount, `${label} retainedPendingCount`) === 0,
    `${label} retained pending drain`,
  );
  assert(
    nonNegativeInteger(request.retainedLeaseCount, `${label} retainedLeaseCount`) === 0,
    `${label} retained lease drain`,
  );
}

function validateProductCleanup(value) {
  const cleanup = recordValue(value, 'cleanup productResources');
  assert(cleanup.revision === 'patch-map-ren-005-product-cleanup/1', 'cleanup product revision');
  const runtime = recordValue(cleanup.assetRuntime, 'cleanup assetRuntime');
  assertExactKeys(
    runtime,
    ['resourceCount', 'pendingCount', 'leaseCount', 'cleanupPendingCount'],
    'cleanup assetRuntime',
  );
  for (const field of ['resourceCount', 'pendingCount', 'leaseCount', 'cleanupPendingCount']) {
    assert(nonNegativeInteger(runtime[field], `cleanup assetRuntime ${field}`) === 0, `cleanup assetRuntime ${field} drain`);
  }

  const backend = recordValue(cleanup.backend, 'cleanup backend');
  assert(nonNegativeInteger(backend.requestCount, 'cleanup backend requestCount') === 5, 'cleanup backend request inventory');
  assert(nonNegativeInteger(backend.pendingCount, 'cleanup backend pendingCount') === 0, 'cleanup backend pending drain');
  assert(
    nonNegativeInteger(
      backend.resolvedLiveResourceCount,
      'cleanup backend resolvedLiveResourceCount',
    ) === 0,
    'cleanup backend live resource drain',
  );
  assert(nonNegativeInteger(backend.unloadedCount, 'cleanup backend unloadedCount') === 4, 'cleanup backend unload count');
  assert(nonNegativeInteger(backend.rejectedCount, 'cleanup backend rejectedCount') === 1, 'cleanup backend rejected count');
  const backendRequests = arrayValue(backend.requests, 'cleanup backend requests');
  assert(backendRequests.length === 5, 'cleanup backend request records');
  const backendRequestRecords = backendRequests
    .map((value, index) => recordValue(value, `cleanup backend request ${index}`));
  backendRequestRecords.forEach((request, index) => {
    stringValue(request.token, `cleanup backend request ${index} token`);
    stringValue(request.key, `cleanup backend request ${index} key`);
    stringValue(request.kind, `cleanup backend request ${index} kind`);
    stringValue(request.state, `cleanup backend request ${index} state`);
  });
  const unloadedTokens = backendRequestRecords
    .filter(({ state }) => state === 'unloaded')
    .map(({ token }, index) => stringValue(token, `cleanup unloaded token ${index}`))
    .sort();
  const rejectedTokens = backendRequestRecords
    .filter(({ state }) => state === 'rejected')
    .map(({ token }, index) => stringValue(token, `cleanup rejected token ${index}`))
    .sort();
  assert(unloadedTokens.length === 4 && rejectedTokens.length === 1, 'cleanup backend terminal states');

  const controlled = arrayValue(cleanup.controlledRequests, 'cleanup controlledRequests');
  assert(controlled.length === 1, 'cleanup controlled request count');
  const old = recordValue(controlled[0], 'cleanup controlled old request');
  assert(old.requestId === 'old' && old.targetId === 'descriptor', 'cleanup controlled identity');
  positiveInteger(old.generation, 'cleanup controlled generation');
  for (const field of ['bindingKey', 'sourceCacheIdentity', 'backendToken', 'backendKey']) {
    stringValue(old[field], `cleanup controlled ${field}`);
  }
  assert(old.backendState === 'unloaded', 'cleanup controlled backend unloaded');
  assert(old.attemptState === 'resolved', 'cleanup controlled attempt resolved');
  assert(old.attachmentState === 'stale', 'cleanup controlled attempt stale');
  assert(
    nonNegativeInteger(old.retainedPendingCount, 'cleanup controlled retainedPendingCount') === 0,
    'cleanup controlled pending drain',
  );
  assert(
    nonNegativeInteger(old.retainedLeaseCount, 'cleanup controlled retainedLeaseCount') === 0,
    'cleanup controlled lease drain',
  );

  const journal = recordValue(cleanup.journal, 'cleanup product journal');
  const journalUnloaded = stringArray(journal.unloadRequestTokens, 'cleanup unloadRequestTokens').sort();
  const journalRejected = stringArray(journal.rejectedRequestTokens, 'cleanup rejectedRequestTokens').sort();
  assert(sameJson(journalUnloaded, unloadedTokens), 'cleanup unload journal tokens');
  assert(sameJson(journalRejected, rejectedTokens), 'cleanup rejected journal tokens');
  const entries = arrayValue(journal.entries, 'cleanup journal entries');
  assert(entries.length > 0, 'cleanup journal entries retained');
}

function projectAbandonedRequestEvidence(imageProbe, terminal, cleanupValue) {
  const controller = cloneRecord(imageProbe.abandonedRequests, 'abandonedRequests');
  const requests = recordValue(terminal.requests, 'terminal request ledger');
  const controlled = arrayValue(requests.controlledRequests, 'terminal controlledRequests');
  assert(controlled.length === 1, 'abandoned controlled request count');
  const old = recordValue(controlled[0], 'abandoned controlled old request');
  const cleanup = recordValue(cleanupValue, 'cleanup');
  const productCleanup = recordValue(cleanup.productResources, 'cleanup productResources');
  const runtime = recordValue(productCleanup.assetRuntime, 'cleanup assetRuntime');
  const backend = recordValue(productCleanup.backend, 'cleanup backend');
  return clone({
    ...controller,
    controlledOldRequest: {
      pendingCount: old.retainedPendingCount,
      leaseCount: old.retainedLeaseCount,
      liveResourceCount: old.backendState === 'unloaded' ? 0 : 1,
      nonStaleAttachmentCount: old.attachmentState === 'stale' ? 0 : 1,
    },
    postDestroy: {
      resourceCount: runtime.resourceCount,
      pendingCount: runtime.pendingCount,
      leaseCount: runtime.leaseCount,
      cleanupPendingCount: runtime.cleanupPendingCount,
      backendPendingCount: backend.pendingCount,
      backendResolvedLiveResourceCount: backend.resolvedLiveResourceCount,
    },
  });
}

function actionActualAt(execution, index, type) {
  const result = execution.actionResults[index];
  assert(result?.type === type, `action ${index} ${type}`);
  return recordValue(result.delta.actual, `action ${index} actual`);
}

function productValue(value, label) {
  const product = recordValue(value, label);
  recordValue(product.snapshot, `${label} snapshot`);
  recordValue(product.semanticProbe, `${label} semanticProbe`);
  recordValue(product.geometry, `${label} geometry`);
  recordValue(product.imageProbe, `${label} imageProbe`);
  return product;
}

function projectCase(plan, execution) {
  return {
    id: plan.id,
    caseType: plan.caseType,
    params: cloneRecord(plan.routeParams, 'route params'),
    fixtureSha256: stringValue(plan.fixtureSha256, 'fixture digest'),
    rootTestId: stringValue(plan.rootTestId, 'root test ID'),
    executedActions: execution.actionResults.map(({ index, type, status }) => ({ index, type, status })),
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

function indexImageGeometry(geometry) {
  assert(Array.isArray(geometry.entities), 'geometry entities');
  const result = {};
  for (const entity of geometry.entities) {
    if (!isPlainObject(entity) || entity.kind !== 'image') continue;
    const id = stringValue(entity.id, 'image geometry ID');
    assert(!Object.hasOwn(result, id), `duplicate image geometry ${id}`);
    result[id] = cloneBounds(entity.worldBounds, `${id} geometry bounds`);
  }
  for (const id of ['alias', 'url', 'descriptor', 'data-uri', 'transformed', 'hidden-image', 'failed-image']) {
    assert(Object.hasOwn(result, id), `missing image geometry ${id}`);
  }
  return result;
}

function imageRecord(images, id) {
  return recordValue(images[id], `image ${id}`);
}

function imageResource(image, extras = {}) {
  return {
    ...(Object.hasOwn(image, 'authoredSource')
      ? { authoredSource: clone(image.authoredSource) }
      : { authoredSourceKind: stringValue(image.authoredSourceKind, 'authored source kind') }),
    normalizedResourceIdentity: stringValue(
      image.normalizedResourceIdentity,
      'normalized resource identity',
    ),
    cacheIdentity: stringValue(image.cacheIdentity, 'cache identity'),
    ...extras,
    state: stringValue(image.state, 'resource state'),
  };
}

function initialResource(image) {
  return imageResource(image);
}

function boundsObject(bounds, label) {
  const [x, y, width, height] = cloneBounds(bounds, label);
  return { x, y, width, height };
}

function cloneBounds(value, label) {
  assert(Array.isArray(value) && value.length === 4, `${label} bounds`);
  return value.map((entry, index) => finiteNumber(entry, `${label}[${index}]`));
}

function clonePoint(value, label) {
  assert(Array.isArray(value) && value.length === 2, `${label} point`);
  return value.map((entry, index) => finiteNumber(entry, `${label}[${index}]`));
}

function projectCaptures(plan, execution) {
  const checkpoint = plan.fixture.captureCheckpoints[0];
  const capture = execution.captures[0];
  assert(capture.id === checkpoint.id, 'capture ID');
  assert(capture.phase === checkpoint.phase, 'capture phase');
  assert(capture.afterActionIndex === checkpoint.afterActionIndex, 'capture action');
  const values = recordValue(capture.values, 'capture values');
  assert(Object.hasOwn(values, 'descriptor/worldBounds'), 'descriptor capture value');
  return {
    images: {
      descriptor: {
        worldBounds: cloneBounds(values['descriptor/worldBounds'], 'descriptor capture'),
      },
    },
  };
}

function notExercised(reason) {
  return { _availability: { status: 'not-exercised', reason } };
}

function recordValue(value, label) {
  assert(isPlainObject(value), `${label} must be an object`);
  return value;
}

function cloneRecord(value, label) {
  return clone(recordValue(value, label));
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} finite number`);
  return value;
}

function nonNegativeInteger(value, label) {
  assert(Number.isInteger(value) && value >= 0, `${label} non-negative integer`);
  return value;
}

function positiveInteger(value, label) {
  assert(Number.isInteger(value) && value > 0, `${label} positive integer`);
  return value;
}


function stringArray(value, label) {
  return arrayValue(value, label).map((entry, index) => (
    stringValue(entry, `${label} ${index}`)
  ));
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} non-empty string`);
  return value;
}

function nullableString(value, label) {
  assert(value === null || (typeof value === 'string' && value.length > 0), `${label} nullable string`);
  return value;
}


function traceAction(type, operands) {
  return Object.freeze({ type, operands: deepFreeze(operands) });
}

function assertExactKeys(value, keys, label) {
  assert(isPlainObject(value), `${label} object`);
  assert(sameJson(Object.keys(value).sort(), [...keys].sort()), `${label} keys`);
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
  assert(Array.isArray(value) || isPlainObject(value), `${path} plain JSON object`);
  ancestors.add(value);
  for (const key of Object.keys(value)) validateJsonValue(value[key], `${path}/${key}`, ancestors);
  ancestors.delete(value);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}


function assert(condition, message) {
  if (!condition) throw new Error(`PatchMap render-images fold invalid: ${message}`);
}
