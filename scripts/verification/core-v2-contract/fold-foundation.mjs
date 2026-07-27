export const FOUNDATION_FOLD_REVISION = 'core-v2-foundation-fold/1';

const OBSERVATION_REVISION = 'core-v2-semantic-observation/1';
const EXECUTION_REVISION = 'core-v2-contract-case-execution/1';
const DELTA_REVISION = 'core-v2-semantic-observation-delta/1';
const PRODUCT_PROBE_REVISION = 'core-v2-semantic-probe/1';
const BROWSER_PROBE_REVISION = 'core-v2-browser-probe/1';
const HOST_PROBE_REVISION = 'core-v2-packed-host-probe/1';

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

const FOUNDATION_CASES = Object.freeze({
  'LIF-001': Object.freeze({
    caseType: 'capability',
    actions: Object.freeze(['initialize', 'initialize']),
  }),
  'LIF-002': Object.freeze({
    caseType: 'capability',
    actions: Object.freeze([
      'initialize',
      'snapshot-resolved-dataset',
      'exercise-authoritative-draw-races',
      'publishFrame',
    ]),
  }),
  'DAT-001': Object.freeze({
    caseType: 'capability',
    actions: Object.freeze(['loadDataset', 'queryAll', 'attemptStrictLoadVariant']),
  }),
  'DAT-002': Object.freeze({
    caseType: 'capability',
    actions: Object.freeze(['freezeInput', 'loadDataset', 'snapshot', 'loadDataset', 'snapshot']),
  }),
  'CSM-001': Object.freeze({
    caseType: 'consumer-journey',
    actions: Object.freeze([
      'initialize-engine',
      'load-scene',
      'await-first-useful-frame',
      'probe-declared-failure',
    ]),
  }),
  'CSM-003': Object.freeze({
    caseType: 'consumer-journey',
    actions: Object.freeze([
      'set-host-state',
      'set-host-state',
      'load-scene',
      'query-target',
      'probe-declared-failure',
    ]),
  }),
});

const CLASSIFIED_EVENTS = new Set([
  'ready',
  'sceneCommitted',
  'drawComplete',
  'frame',
  'diagnostic',
  'destroyed',
]);

/**
 * Fold actual executor, product, browser, and packed-host facts for the six foundation
 * cases. This projector deliberately performs no hashing and has no filesystem or
 * verifier dependency, so the same function can run in the focused browser Lab.
 */
export function foldFoundationExecution(options) {
  const input = validateOptions(options);
  const plan = validateCasePlan(input.casePlan);
  const execution = validateExecution(input.execution, plan);
  const browserProbe = validateBrowserProbe(input.browserProbe, plan.id);
  const hostProbe = validateHostProbe(input.hostProbe, plan);
  const semantic = selectAuthoritativeSemanticProbe(execution);
  const fixtures = projectFixtures(plan);
  const captures = projectCaptures(plan, execution);

  const provenance = cloneRecord(input.provenance, 'provenance');
  const extensions = {};
  projectHostEvidence({ plan, execution, hostProbe, provenance, extensions });

  const domains = {
    case: projectCase(plan, execution),
    provenance,
    environment: cloneRecord(input.environment, 'environment'),
    revisions: projectRevisions(execution),
    scene: projectScene(execution, semantic),
    geometry: projectGeometry(semantic, browserProbe),
    text: projectText(semantic, browserProbe),
    paint: projectPaint(semantic, browserProbe),
    interaction: projectInteraction(execution, semantic, browserProbe),
    events: projectEvents(execution, browserProbe),
    history: projectHistory(execution, semantic, browserProbe),
    accessibility: {
      _availability: {
        status: 'not-exercised',
        reason: 'foundation-slice-has-no-accessibility-action',
      },
    },
    outcome: projectOutcome(plan, execution, semantic, hostProbe),
    resources: projectResources(plan, execution, browserProbe),
  };

  const actual = {
    $schema: OBSERVATION_REVISION,
    ...domains,
    ...(Object.keys(extensions).length === 0 ? {} : { extensions }),
  };
  validateJsonValue(actual, 'actual', new WeakSet());
  assert(
    DOMAIN_NAMES.every((domain) => isPlainObject(actual[domain])),
    'actual must contain all fourteen object domains',
  );

  return deepFreeze({ actual, fixtures, captures });
}

function validateOptions(options) {
  assert(isPlainObject(options), 'options must be a plain object');
  assertExactKeys(
    options,
    ['browserProbe', 'casePlan', 'environment', 'execution', 'hostProbe', 'provenance'],
    'options',
    { optional: ['browserProbe', 'hostProbe'] },
  );
  assert(isPlainObject(options.casePlan), 'casePlan must be a plain object');
  assert(isPlainObject(options.execution), 'execution must be a plain object');
  assert(isPlainObject(options.provenance), 'provenance must be a plain object');
  assert(isPlainObject(options.environment), 'environment must be a plain object');
  validateJsonValue(options.provenance, 'provenance', new WeakSet());
  validateJsonValue(options.environment, 'environment', new WeakSet());
  return options;
}

function validateCasePlan(casePlan) {
  validateJsonValue(casePlan, 'casePlan', new WeakSet());
  const definition = FOUNDATION_CASES[casePlan.id];
  assert(definition !== undefined, `unsupported foundation case ${String(casePlan.id)}`);
  assert(casePlan.caseType === definition.caseType, `${casePlan.id} caseType`);
  assert(isPlainObject(casePlan.fixture), `${casePlan.id} fixture`);
  assert(isPlainObject(casePlan.fixture.setup), `${casePlan.id} fixture setup`);
  assert(isPlainObject(casePlan.fixture.setup.params), `${casePlan.id} fixture setup params`);
  assert(isPlainObject(casePlan.routeParams), `${casePlan.id} routeParams`);
  assert(typeof casePlan.routeParams.size === 'string' && casePlan.routeParams.size.length > 0, `${casePlan.id} size`);
  assertUint32(casePlan.routeParams.seed, `${casePlan.id} seed`);

  const fixtureActions = casePlan.fixture.actionTrace;
  const materializedActions = casePlan.actionTrace;
  assert(Array.isArray(fixtureActions), `${casePlan.id} fixture actionTrace`);
  assert(Array.isArray(materializedActions), `${casePlan.id} actionTrace`);
  assert(sameJson(fixtureActions, materializedActions), `${casePlan.id} materialized actionTrace drift`);
  validateExactActionTrace(casePlan.id, fixtureActions, definition.actions);

  const checkpoints = casePlan.fixture.captureCheckpoints ?? casePlan.captureCheckpoints ?? [];
  assert(Array.isArray(checkpoints), `${casePlan.id} captureCheckpoints`);
  const checkpointIds = new Set();
  for (const checkpoint of checkpoints) {
    assert(isPlainObject(checkpoint), `${casePlan.id} checkpoint must be an object`);
    assert(typeof checkpoint.id === 'string' && checkpoint.id.length > 0, `${casePlan.id} checkpoint id`);
    assert(!checkpointIds.has(checkpoint.id), `${casePlan.id} duplicate checkpoint ${checkpoint.id}`);
    checkpointIds.add(checkpoint.id);
    assert(checkpoint.phase === 'after-action', `${casePlan.id} checkpoint ${checkpoint.id} phase`);
    assertActionIndex(checkpoint.afterActionIndex, fixtureActions.length, `${casePlan.id} checkpoint ${checkpoint.id}`);
    assert(Array.isArray(checkpoint.paths), `${casePlan.id} checkpoint ${checkpoint.id} paths`);
  }

  return {
    ...casePlan,
    definition,
    actionTrace: fixtureActions,
    checkpoints,
  };
}

function validateExactActionTrace(caseId, actions, expectedTypes) {
  assert(actions.length === expectedTypes.length, `${caseId} action count`);
  actions.forEach((action, index) => {
    assert(isPlainObject(action), `${caseId} action ${index}`);
    assert(action.index === index, `${caseId} action index ${index}`);
    assert(action.type === expectedTypes[index], `${caseId} action ${index} type`);
    assert(isPlainObject(action.operands), `${caseId} action ${index} operands`);
  });
}

function validateExecution(execution, plan) {
  validateJsonValue(execution, 'execution', new WeakSet());
  assert(execution.$schema === EXECUTION_REVISION, 'execution schema');
  assert(execution.caseId === plan.id, 'execution caseId');
  assert(execution.caseType === plan.caseType, 'execution caseType');
  assert(execution.status === 'completed', 'execution status must be completed');
  assert(execution.error === null, 'completed execution error must be null');
  assert(Array.isArray(execution.actionResults), 'execution actionResults');
  assert(execution.actionResults.length === plan.actionTrace.length, 'execution action result count');

  execution.actionResults.forEach((result, index) => {
    const action = plan.actionTrace[index];
    assert(isPlainObject(result), `execution action ${index}`);
    assert(result.index === index, `execution action ${index} index`);
    assert(result.type === action.type, `execution action ${index} type`);
    assert(result.handlerId === `contract/${action.type}`, `execution action ${index} handlerId`);
    assert(result.status === 'completed', `execution action ${index} status`);
    assertFiniteNumber(result.startedAtMs, `execution action ${index} startedAtMs`);
    assertFiniteNumber(result.completedAtMs, `execution action ${index} completedAtMs`);
    assert(result.completedAtMs >= result.startedAtMs, `execution action ${index} timing order`);
    assert(isPlainObject(result.delta), `execution action ${index} delta`);
    assert(result.delta.$schema === DELTA_REVISION, `execution action ${index} delta schema`);
    assert(result.delta.caseId === plan.id, `execution action ${index} delta caseId`);
    assert(result.delta.actionIndex === index, `execution action ${index} delta actionIndex`);
    assert(result.delta.actionType === action.type, `execution action ${index} delta actionType`);
    assert(isPlainObject(result.delta.actual), `execution action ${index} actual`);
    assert(Object.hasOwn(result.delta, 'semanticProbe'), `execution action ${index} semanticProbe presence`);
    validateSemanticProbe(result.delta.semanticProbe, `execution action ${index} semanticProbe`);
  });

  assert(Array.isArray(execution.eventJournal), 'execution eventJournal');
  validateEventJournal(execution.eventJournal);
  assert(isPlainObject(execution.bindings), 'execution bindings');
  assert(Array.isArray(execution.captures), 'execution captures');
  assert(isPlainObject(execution.cleanup), 'execution cleanup');
  assert(execution.cleanup.status === 'completed', 'execution cleanup status');
  assert(Array.isArray(execution.cleanup.errors) && execution.cleanup.errors.length === 0, 'execution cleanup errors');
  assert(Array.isArray(execution.cleanup.releases), 'execution cleanup releases');
  assert(execution.terminalSnapshot === null || isPlainObject(execution.terminalSnapshot), 'terminalSnapshot');
  validateSemanticProbe(execution.terminalSemanticProbe, 'terminalSemanticProbe');

  if (plan.caseType === 'consumer-journey') {
    assert(isPlainObject(execution.hostSeamDelta), `${plan.id} hostSeamDelta`);
    assert(execution.hostSeamDelta.caseId === plan.id, `${plan.id} hostSeamDelta caseId`);
    assert(execution.hostSeamDelta.capabilityPassInherited === false, `${plan.id} host inheritance`);
  } else {
    assert(execution.hostSeamDelta === null, `${plan.id} capability hostSeamDelta`);
  }

  if (Object.hasOwn(execution, 'datasetObservations')) {
    validateDatasetObservations(execution.datasetObservations);
  }
  return execution;
}

function validateDatasetObservations(observations) {
  assert(isPlainObject(observations), 'execution datasetObservations');
  for (const [reference, observation] of Object.entries(observations)) {
    assert(reference.length > 0, 'dataset observation reference');
    assert(isPlainObject(observation), `dataset observation ${reference}`);
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
      `dataset observation ${reference}`,
    );
    assert(observation.reference === reference, `dataset observation ${reference} identity`);
    assertFingerprint(observation.beforeFingerprint, `dataset observation ${reference} beforeFingerprint`);
    assertFingerprint(observation.currentFingerprint, `dataset observation ${reference} currentFingerprint`);
    assert(typeof observation.unchanged === 'boolean', `dataset observation ${reference} unchanged`);
    assert(
      observation.unchanged === (observation.beforeFingerprint === observation.currentFingerprint),
      `dataset observation ${reference} fingerprint consistency`,
    );
    assert(typeof observation.currentDeeplyFrozen === 'boolean', `dataset observation ${reference} frozen`);
  }
}

function validateEventJournal(journal) {
  journal.forEach((entry, index) => {
    assert(isPlainObject(entry), `eventJournal ${index}`);
    assert(entry.sequence === index + 1, `eventJournal ${index} sequence`);
    assertPositiveInteger(entry.generation, `eventJournal ${index} generation`);
    assert(typeof entry.role === 'string' && entry.role.length > 0, `eventJournal ${index} role`);
    assert(typeof entry.event === 'string' && entry.event.length > 0, `eventJournal ${index} event`);
    assert(Object.hasOwn(entry, 'actual'), `eventJournal ${index} actual`);
  });
}

function validateSemanticProbe(probe, label) {
  if (probe === null) return;
  assert(isPlainObject(probe), `${label} must be null or an object`);
  assert(probe.revision === PRODUCT_PROBE_REVISION, `${label} revision`);
  assert(typeof probe.lifecycle === 'string' && probe.lifecycle.length > 0, `${label} lifecycle`);
  assert(isPlainObject(probe.dataset), `${label} dataset`);
  assert(typeof probe.dataset.state === 'string' && probe.dataset.state.length > 0, `${label} dataset state`);
  assert(probe.dataset.ref === null || typeof probe.dataset.ref === 'string', `${label} dataset ref`);
  assert(probe.dataset.semanticHash === null || typeof probe.dataset.semanticHash === 'string', `${label} semanticHash`);
  assertStringArray(probe.dataset.rootIds, `${label} rootIds`);
  assert(typeof probe.dataset.graphDeepFrozen === 'boolean', `${label} graphDeepFrozen`);
  assert(isPlainObject(probe.scene), `${label} scene`);
  assert(Array.isArray(probe.scene.nodes), `${label} scene nodes`);
  assertStringArray(probe.scene.elementTypes, `${label} elementTypes`);
  assertStringArray(probe.scene.componentTypes, `${label} componentTypes`);
  assert(isPlainObject(probe.scene.counts), `${label} scene counts`);
  for (const field of ['rootElements', 'elements', 'components', 'hierarchyEdges', 'maxDepth', 'hiddenLogicalComponents']) {
    assertNonNegativeInteger(probe.scene.counts[field], `${label} scene counts ${field}`);
  }
  validateSemanticNodes(probe.scene.nodes, label);
  assert(isPlainObject(probe.geometry), `${label} geometry`);
  assertNonNegativeInteger(probe.geometry.finiteValueCount, `${label} finiteValueCount`);
  assertNonNegativeInteger(probe.geometry.nonFiniteValueCount, `${label} nonFiniteValueCount`);
  assert(typeof probe.geometry.allFinite === 'boolean', `${label} allFinite`);
  assert(
    probe.geometry.allFinite === (probe.geometry.nonFiniteValueCount === 0),
    `${label} allFinite consistency`,
  );
  assert(isPlainObject(probe.text), `${label} text`);
  for (const field of ['sourceCount', 'codeUnitCount', 'sourcesWithUnpairedSurrogate', 'unpairedSurrogateCount']) {
    assertNonNegativeInteger(probe.text[field], `${label} text ${field}`);
  }
  assert(isPlainObject(probe.paint), `${label} paint`);
  for (const field of ['intentCount', 'resolvedCount', 'unresolvedCount']) {
    assertNonNegativeInteger(probe.paint[field], `${label} paint ${field}`);
  }
  assert(Array.isArray(probe.paint.intents), `${label} paint intents`);
  assert(
    probe.paint.intentCount === probe.paint.resolvedCount + probe.paint.unresolvedCount,
    `${label} paint count consistency`,
  );
  assert(isPlainObject(probe.interaction), `${label} interaction`);
  assertStringArray(probe.interaction.selectionIds, `${label} selectionIds`);
  for (const field of ['activeAnimationCount', 'activeGestureCount']) {
    if (probe.interaction[field] !== undefined) {
      assertNonNegativeInteger(probe.interaction[field], `${label} interaction ${field}`);
    }
  }
  assert(isPlainObject(probe.history), `${label} history`);
  for (const field of ['depth', 'corruptCount']) {
    if (probe.history[field] !== undefined) assertNonNegativeInteger(probe.history[field], `${label} history ${field}`);
  }
}

function validateSemanticNodes(nodes, label) {
  const identities = new Set();
  nodes.forEach((node, index) => {
    assert(isPlainObject(node), `${label} node ${index}`);
    assert(node.order === index, `${label} node ${index} order`);
    assert(isPlainObject(node.target), `${label} node ${index} target`);
    assert(typeof node.target.id === 'string' && node.target.id.length > 0, `${label} node ${index} id`);
    const identity = node.target.kind === 'component'
      ? `component:${String(node.target.ownerId)}:${node.target.id}`
      : `element:${node.target.id}`;
    assert(node.target.kind === 'element' || node.target.kind === 'component', `${label} node ${index} kind`);
    if (node.target.kind === 'component') {
      assert(typeof node.target.ownerId === 'string' && node.target.ownerId.length > 0, `${label} node ${index} ownerId`);
    }
    assert(!identities.has(identity), `${label} duplicate node ${identity}`);
    identities.add(identity);
    assert(typeof node.type === 'string' && node.type.length > 0, `${label} node ${index} type`);
    assertNonNegativeInteger(node.depth, `${label} node ${index} depth`);
    for (const field of ['authoredShow', 'visible', 'locked']) {
      assert(typeof node[field] === 'boolean', `${label} node ${index} ${field}`);
    }
  });
}

function validateBrowserProbe(probe, caseId) {
  if (probe === undefined) return null;
  assert(isPlainObject(probe), 'browserProbe must be an object');
  validateJsonValue(probe, 'browserProbe', new WeakSet());
  assertExactKeys(
    probe,
    [
      '$schema',
      'caseId',
      'events',
      'geometry',
      'history',
      'interaction',
      'paint',
      'resources',
      'text',
    ],
    'browserProbe',
    {
      optional: [
        'events',
        'geometry',
        'history',
        'interaction',
        'paint',
        'resources',
        'text',
      ],
    },
  );
  assert(probe.$schema === BROWSER_PROBE_REVISION, 'browserProbe schema');
  assert(probe.caseId === caseId, 'browserProbe caseId');
  for (const domain of [
    'events',
    'geometry',
    'history',
    'interaction',
    'paint',
    'resources',
    'text',
  ]) {
    if (probe[domain] !== undefined) assert(isPlainObject(probe[domain]), `browserProbe ${domain}`);
  }
  return probe;
}

function validateHostProbe(probe, plan) {
  if (probe === undefined) return null;
  assert(plan.caseType === 'consumer-journey', `${plan.id} hostProbe is journey-only`);
  assert(isPlainObject(probe), 'hostProbe must be an object');
  validateJsonValue(probe, 'hostProbe', new WeakSet());
  assertExactKeys(
    probe,
    ['$schema', 'caseId', 'engineReturns', 'failureRollback', 'finalState', 'promotionEligible'],
    'hostProbe',
  );
  assert(probe.$schema === HOST_PROBE_REVISION, 'hostProbe schema');
  assert(probe.caseId === plan.id, 'hostProbe caseId');
  assert(probe.promotionEligible === true, 'hostProbe must be explicitly promotion eligible');
  for (const field of ['engineReturns', 'failureRollback', 'finalState']) {
    assert(isPlainObject(probe[field]), `hostProbe ${field}`);
  }
  return probe;
}

function selectAuthoritativeSemanticProbe(execution) {
  if (execution.terminalSemanticProbe !== null) {
    return { probe: execution.terminalSemanticProbe, source: 'terminal' };
  }
  for (let index = execution.actionResults.length - 1; index >= 0; index -= 1) {
    const probe = execution.actionResults[index].delta.semanticProbe;
    if (probe !== null) return { probe, source: `action:${index}` };
  }
  return { probe: null, source: null };
}

function projectFixtures(plan) {
  return cloneRecord(plan.fixture.setup.params, `${plan.id} fixtures`);
}

function projectCaptures(plan, execution) {
  const result = {};
  for (const [name, value] of Object.entries(execution.bindings)) {
    assert(name.length > 0, 'binding name must not be empty');
    assignOwned(result, name, clone(value), `binding ${name}`);
  }

  const declaredById = new Map(plan.checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]));
  const seen = new Set();
  for (const capture of execution.captures) {
    assert(isPlainObject(capture), 'capture must be an object');
    assert(typeof capture.id === 'string' && capture.id.length > 0, 'capture id');
    assert(!seen.has(capture.id), `duplicate capture ${capture.id}`);
    seen.add(capture.id);
    const declared = declaredById.get(capture.id);
    assert(declared !== undefined, `undeclared capture ${capture.id}`);
    assert(capture.phase === declared.phase, `capture ${capture.id} phase`);
    assert(capture.afterActionIndex === declared.afterActionIndex, `capture ${capture.id} action index`);
    assert(isPlainObject(capture.values), `capture ${capture.id} values`);
    assignOwned(result, capture.id, clone(capture.values), `capture ${capture.id}`);
  }
  assert(seen.size === declaredById.size, 'execution must contain every declared capture');
  return result;
}

function projectCase(plan, execution) {
  return {
    id: plan.id,
    caseType: plan.caseType,
    params: clone(plan.routeParams),
    ...(typeof plan.fixtureSha256 === 'string' ? { fixtureSha256: plan.fixtureSha256 } : {}),
    ...(typeof plan.rootTestId === 'string' ? { rootTestId: plan.rootTestId } : {}),
    executedActions: execution.actionResults.map((result) => ({
      index: result.index,
      type: result.type,
      status: result.status,
    })),
  };
}

function projectRevisions(execution) {
  const terminal = execution.terminalSnapshot;
  const domain = {
    _availability: sourceAvailability('terminalSnapshot', terminal),
  };
  if (!terminal) return domain;

  const stamp = isPlainObject(terminal.revisions) ? terminal.revisions : null;
  if (stamp) {
    if (isFiniteNumber(stamp.sceneRevision)) assignOwned(domain, 'scene', stamp.sceneRevision, 'terminal revisions');
    if (isFiniteNumber(stamp.viewRevision)) assignOwned(domain, 'view', stamp.viewRevision, 'terminal revisions');
    if (isFiniteNumber(stamp.interactionRevision)) {
      assignOwned(domain, 'interaction', stamp.interactionRevision, 'terminal revisions');
    }
    const lifecycle = {};
    if (isFiniteNumber(stamp.lifecycleGeneration)) lifecycle.generation = stamp.lifecycleGeneration;
    if (Array.isArray(terminal.facilities)) lifecycle.facilities = clone(terminal.facilities);
    if (Object.keys(lifecycle).length > 0) assignOwned(domain, 'lifecycle', lifecycle, 'terminal lifecycle');
  }
  if (isPlainObject(terminal.publishedTuple)) {
    assignOwned(domain, 'publishedTuple', clone(terminal.publishedTuple), 'terminal published tuple');
  }
  if (isFiniteNumber(terminal.frameRevision)) {
    assignOwned(domain, 'frame', { revision: terminal.frameRevision }, 'terminal frame revision');
  }

  const race = actionActual(execution, 'exercise-authoritative-draw-races');
  const preReadyScene = race?.preReady?.diagnostic?.revisionStamp?.sceneRevision;
  if (isFiniteNumber(preReadyScene)) domain.preReady = { scene: preReadyScene };

  const revisionNumbers = collectRevisionNumbers(execution);
  if (revisionNumbers.length > 0) domain.valuesFinite = revisionNumbers.every(isFiniteNumber);
  return domain;
}

function projectScene(execution, semantic) {
  const terminal = execution.terminalSnapshot;
  const domain = {
    _availability: sourceAvailability('semanticProbe', semantic.probe, semantic.source),
  };
  if (terminal?.revisions && isFiniteNumber(terminal.revisions.sceneRevision)) {
    domain.revision = terminal.revisions.sceneRevision;
  }
  if (!semantic.probe) return domain;

  const { probe } = semantic;
  const { dataset, scene } = probe;
  domain.datasetState = dataset.state;
  if (typeof dataset.ref === 'string') domain.authoritativeDatasetRef = dataset.ref;
  if (typeof dataset.semanticHash === 'string') domain.semanticHash = dataset.semanticHash;
  domain.rootIds = clone(dataset.rootIds);
  domain.immutable = dataset.graphDeepFrozen;
  domain.nodes = clone(scene.nodes);
  domain.elementTypes = clone(scene.elementTypes);
  domain.componentTypes = clone(scene.componentTypes);
  domain.elements = { count: scene.counts.elements };
  domain.hierarchy = {
    nodeCount: scene.nodes.length,
    rootCount: scene.counts.rootElements,
    elementCount: scene.counts.elements,
    componentCount: scene.counts.components,
    edgeCount: scene.counts.hierarchyEdges,
    maxDepth: scene.counts.maxDepth,
  };
  domain.query = projectNodeQueries(scene.nodes);

  const race = actionActual(execution, 'exercise-authoritative-draw-races');
  const retainedHash = race?.authoritative?.sceneSemanticHash;
  if (typeof retainedHash === 'string') domain.afterFailedLater = { semanticHash: retainedHash };
  return domain;
}

function projectNodeQueries(nodes) {
  const query = {};
  for (const node of nodes) {
    if (node.target.kind !== 'element') continue;
    assert(!Object.hasOwn(query, node.target.id), `query element collision ${node.target.id}`);
    query[node.target.id] = {
      id: node.target.id,
      type: node.type,
      show: node.authoredShow,
      visible: node.visible,
      locked: node.locked,
    };
  }
  for (const node of nodes) {
    if (node.target.kind !== 'component') continue;
    const owner = query[node.target.ownerId];
    assert(isPlainObject(owner), `component owner ${node.target.ownerId} missing from semantic nodes`);
    assert(!Object.hasOwn(owner, node.target.id), `query component collision ${node.target.ownerId}/${node.target.id}`);
    owner[node.target.id] = {
      id: node.target.id,
      type: node.type,
      logicalCount: 1,
      show: node.authoredShow,
      visible: node.visible,
      locked: node.locked,
    };
  }
  return query;
}

function projectGeometry(semantic, browserProbe) {
  const domain = {
    _availability: sourceAvailability('semanticProbe', semantic.probe, semantic.source),
  };
  if (semantic.probe) {
    domain.finiteValueCount = semantic.probe.geometry.finiteValueCount;
    domain.nonFiniteCount = semantic.probe.geometry.nonFiniteValueCount;
    domain.nonFiniteValueCount = semantic.probe.geometry.nonFiniteValueCount;
    domain.allFinite = semantic.probe.geometry.allFinite;
  }
  mergeBrowserDomain(domain, browserProbe, 'geometry');
  return domain;
}

function projectText(semantic, browserProbe) {
  const domain = {
    _availability: sourceAvailability('semanticProbe', semantic.probe, semantic.source),
  };
  if (semantic.probe) {
    domain.sourceCount = semantic.probe.text.sourceCount;
    domain.codeUnitCount = semantic.probe.text.codeUnitCount;
    domain.sourcesWithUnpairedSurrogate = semantic.probe.text.sourcesWithUnpairedSurrogate;
    domain.unpairedSurrogates = semantic.probe.text.unpairedSurrogateCount;
    domain.unpairedSurrogateCount = semantic.probe.text.unpairedSurrogateCount;
  }
  mergeBrowserDomain(domain, browserProbe, 'text');
  return domain;
}

function projectPaint(semantic, browserProbe) {
  const domain = {
    _availability: sourceAvailability('semanticProbe', semantic.probe, semantic.source),
  };
  if (semantic.probe) {
    domain.intentCount = semantic.probe.paint.intentCount;
    domain.resolvedIntentCount = semantic.probe.paint.resolvedCount;
    domain.unresolvedIntentCount = semantic.probe.paint.unresolvedCount;
    domain.intents = clone(semantic.probe.paint.intents);
  }
  mergeBrowserDomain(domain, browserProbe, 'paint');
  return domain;
}

function projectInteraction(execution, semantic, browserProbe) {
  const terminal = execution.terminalSnapshot;
  const domain = {
    _availability: {
      semanticProbe: semantic.probe ? 'available' : 'unavailable',
      browserProbe: browserProbe ? 'available' : 'unavailable',
    },
  };
  if (semantic.probe) {
    for (const [key, value] of Object.entries(semantic.probe.interaction)) {
      assignOwned(domain, key, clone(value), 'semantic interaction');
    }
  }
  if (terminal) {
    const viewport = {};
    if (Array.isArray(terminal.zoomLimits)) viewport.zoomLimits = clone(terminal.zoomLimits);
    if (isPlainObject(terminal.viewport)) viewport.state = clone(terminal.viewport);
    if (Object.keys(viewport).length > 0) assignOwned(domain, 'viewport', viewport, 'terminal viewport');
  }
  mergeBrowserDomain(domain, browserProbe, 'interaction');
  return domain;
}

function projectEvents(execution, browserProbe) {
  const { eventJournal: journal } = execution;
  const domain = {
    _availability: {
      eventJournal: 'available',
      browserProbe: browserProbe ? 'available' : 'unavailable',
    },
    journal: clone(journal),
    ordered: journal.map((entry) => ({
      sequence: entry.sequence,
      generation: entry.generation,
      role: entry.role,
      event: entry.event,
      actual: clone(entry.actual),
    })),
    unclassifiedCount: journal.filter((entry) => !CLASSIFIED_EVENTS.has(entry.event)).length,
  };

  const names = [...CLASSIFIED_EVENTS];
  for (const name of names) {
    const matches = journal.filter((entry) => entry.event === name);
    const collection = { count: matches.length };
    matches.forEach((entry, index) => {
      const actual = clone(entry.actual);
      if (
        name === 'drawComplete'
        && isPlainObject(actual)
        && isFiniteNumber(actual.sceneRevision)
        && !Object.hasOwn(actual, 'revision')
      ) {
        actual.revision = actual.sceneRevision;
      }
      collection[index] = actual;
    });
    domain[name] = collection;
  }

  const superseded = new Set();
  const race = actionActual(execution, 'exercise-authoritative-draw-races');
  if (Array.isArray(race?.pending)) {
    for (const pending of race.pending) {
      if (pending?.result?.status === 'superseded' && typeof pending.requestId === 'string') {
        superseded.add(pending.requestId);
      }
    }
  }
  if (superseded.size > 0) {
    domain.staleCompletionCount = journal.filter(
      (entry) => entry.event === 'drawComplete' && superseded.has(entry.actual?.requestId),
    ).length;
  }
  mergeBrowserDomain(domain, browserProbe, 'events');
  return domain;
}

function projectHistory(execution, semantic, browserProbe) {
  const terminal = execution.terminalSnapshot;
  const domain = {
    _availability: sourceAvailability('semanticProbe', semantic.probe, semantic.source),
  };
  if (semantic.probe && semantic.probe.history.depth !== undefined) {
    domain.depth = semantic.probe.history.depth;
  } else if (terminal && isNonNegativeInteger(terminal.historyDepth)) {
    domain.depth = terminal.historyDepth;
    domain._availability.depthSource = 'terminalSnapshot';
  }
  if (semantic.probe && semantic.probe.history.corruptCount !== undefined) {
    domain.corruptEntryCount = semantic.probe.history.corruptCount;
  }
  mergeBrowserDomain(domain, browserProbe, 'history');
  return domain;
}

function projectOutcome(plan, execution, semantic, hostProbe) {
  const domain = {
    _availability: {
      actionResults: 'available',
      semanticProbe: semantic.probe ? 'available' : 'unavailable',
      datasetObservations: isPlainObject(execution.datasetObservations) ? 'available' : 'unavailable',
      hostProbe: hostProbe ? 'available' : 'unavailable',
    },
    recorded: true,
    actionResults: clone(execution.actionResults),
  };
  if (isPlainObject(execution.datasetObservations)) {
    domain.datasetObservations = clone(execution.datasetObservations);
  }

  const loadActions = execution.actionResults.filter((result) => result.type === 'loadDataset');
  const immutability = loadActions
    .map((result) => result.delta.actual.input)
    .filter(isPlainObject);
  if (immutability.length > 0) domain.inputAudit = clone(immutability);

  if (plan.id === 'LIF-002') projectLifecycleRaceOutcome(domain, execution);
  if (plan.id === 'DAT-001') projectStrictValidationOutcome(domain, execution);
  if (plan.id === 'DAT-002') projectSessionOutcomes(domain, execution);
  if (plan.id === 'CSM-003') {
    const query = actionActual(execution, 'query-target');
    if (query && Object.hasOwn(query, 'result')) domain.missingQuery = clone(query.result);
  }
  if (hostProbe) {
    domain.hostEngineSeam = {
      engineReturns: clone(hostProbe.engineReturns),
      failureRollback: clone(hostProbe.failureRollback),
      finalState: clone(hostProbe.finalState),
    };
  }
  return domain;
}

function projectLifecycleRaceOutcome(domain, execution) {
  const race = actionActual(execution, 'exercise-authoritative-draw-races');
  if (!race) return;
  if (isPlainObject(race.preReady)) {
    const preReady = clone(race.preReady);
    if (!Object.hasOwn(preReady, 'appliedCount') && isFiniteNumber(preReady.diagnostic?.appliedCount)) {
      preReady.appliedCount = preReady.diagnostic.appliedCount;
    }
    domain.preReady = preReady;
  }
  if (Array.isArray(race.pending)) {
    const settlements = Array.isArray(race.completionOrder) ? clone(race.completionOrder) : null;
    const completionOrder = settlements?.map((entry) => {
      if (typeof entry === 'string') return entry;
      assert(isPlainObject(entry), 'race completionOrder entry');
      assert(typeof entry.requestId === 'string' && entry.requestId.length > 0, 'race completionOrder requestId');
      return entry.requestId;
    });
    domain.pending = {
      submissions: clone(race.pending),
      ...(completionOrder ? { completionOrder, settlements } : {}),
    };
  }
  if (isPlainObject(race.failedLater)) {
    domain.failedLater = clone(race.failedLater);
    if (
      !Object.hasOwn(domain.failedLater, 'code')
      && typeof domain.failedLater.diagnostic?.code === 'string'
    ) {
      domain.failedLater.code = domain.failedLater.diagnostic.code;
    }
  }
  const snapshotted = actionActual(execution, 'snapshot-resolved-dataset');
  const snapshotDatasetRef = typeof snapshotted?.datasetRef === 'string'
    ? snapshotted.datasetRef
    : null;
  const submitted = Array.isArray(race.submittedInputs) && snapshotDatasetRef !== null
    ? race.submittedInputs.find((entry) => entry?.datasetRef === snapshotDatasetRef)
    : race.authoritativeSubmittedInput;
  if (isPlainObject(submitted)) {
    const input = {
      requestId: submitted.requestId,
      datasetRef: submitted.datasetRef,
      beforeFingerprint: submitted.beforeFingerprint,
      postUseFingerprint: submitted.postUseFingerprint,
      unchanged: submitted.unchanged,
      deeplyFrozen: submitted.deeplyFrozen,
    };
    if (submitted.unchanged === true && Object.hasOwn(submitted, 'postUseGraph')) {
      input.dataset = clone(submitted.postUseGraph);
    }
    if (
      isPlainObject(race.authoritativeSubmittedInput)
      && race.authoritativeSubmittedInput.requestId !== submitted.requestId
    ) {
      input.authoritativeSubmitted = clone(race.authoritativeSubmittedInput);
    }
    domain.input = input;
  }
}

function projectStrictValidationOutcome(domain, execution) {
  const strict = actionActual(execution, 'attemptStrictLoadVariant');
  if (!strict || !isPlainObject(strict.diagnostic)) return;
  const diagnostic = clone(strict.diagnostic);
  if (!Object.hasOwn(diagnostic, 'path') && typeof diagnostic.datasetPath === 'string') {
    diagnostic.path = diagnostic.datasetPath;
  }
  domain.validation = { unsupportedType: diagnostic };
}

function projectSessionOutcomes(domain, execution) {
  const frozen = actionActual(execution, 'freezeInput');
  const datasetId = frozen?.datasetId;
  const datasetObservation = typeof datasetId === 'string'
    ? execution.datasetObservations?.[datasetId]
    : null;
  if (isPlainObject(datasetObservation) && datasetObservation.unchanged === true) {
    domain.input = { minimal: clone(datasetObservation.currentGraph) };
  }

  for (const session of [1, 2]) {
    const probeCandidates = execution.actionResults.filter(
      (result) => result.delta.actual.session === session && result.delta.semanticProbe !== null,
    );
    const probeCandidate = probeCandidates.at(-1);
    if (!probeCandidate) continue;
    const exportCandidate = execution.actionResults.find(
      (result) => result.type === 'loadDataset'
        && result.delta.actual.session === session
        && Array.isArray(result.delta.actual.exportedDataset),
    );
    const probe = probeCandidate.delta.semanticProbe;
    const sessionResult = {};
    if (typeof probe.dataset.semanticHash === 'string') sessionResult.semanticHash = probe.dataset.semanticHash;
    projectSessionExport(sessionResult, exportCandidate?.delta.actual.exportedDataset, probe);
    domain[`session${session}`] = sessionResult;
  }
}

function projectSessionExport(sessionResult, exportedDataset, probe) {
  const item = Array.isArray(exportedDataset)
    ? findFirstElementByType(exportedDataset, 'item')
    : null;
  if (item) {
    sessionResult.item = {
      id: item.id,
      show: item.show,
      locked: item.locked,
      ...(isPlainObject(item.padding)
        ? { padding: [item.padding.top, item.padding.right, item.padding.bottom, item.padding.left] }
        : {}),
      ...(typeof item.contentOrientation === 'string'
        ? { contentOrientation: item.contentOrientation }
        : {}),
    };
    if (Array.isArray(item.components)) {
      const bar = item.components.find((component) => component?.type === 'bar');
      if (isPlainObject(bar)) {
        sessionResult.bar = {
          id: bar.id,
          ...(typeof bar.placement === 'string' ? { placement: bar.placement } : {}),
          ...(isFiniteNumber(bar.animationDuration)
            ? { animationDuration: bar.animationDuration }
            : {}),
        };
      }
      const text = item.components.find((component) => component?.type === 'text');
      if (isPlainObject(text)) {
        sessionResult.text = {
          id: text.id,
          ...(Number.isInteger(text.split) ? { split: text.split } : {}),
        };
      }
    }
    return;
  }

  const itemNode = probe.scene.nodes.find(
    (node) => node.target.kind === 'element' && node.type === 'item',
  );
  if (itemNode) {
    sessionResult.item = {
      id: itemNode.target.id,
      show: itemNode.authoredShow,
      locked: itemNode.locked,
    };
  }
}

function findFirstElementByType(elements, type) {
  for (const element of elements) {
    if (!isPlainObject(element)) continue;
    if (element.type === type) return element;
    if (element.type === 'group' && Array.isArray(element.children)) {
      const nested = findFirstElementByType(element.children, type);
      if (nested) return nested;
    }
  }
  return null;
}

function projectResources(plan, execution, browserProbe) {
  const terminal = execution.terminalSnapshot;
  const domain = {
    _availability: {
      terminalSnapshot: terminal ? 'available' : 'unavailable',
      cleanup: 'available',
      browserProbe: browserProbe ? 'available' : 'unavailable',
    },
    cleanup: clone(execution.cleanup),
  };

  const browserResources = browserProbe?.resources;
  if (browserResources) {
    for (const [key, value] of Object.entries(browserResources)) {
      assignOwned(domain, key, clone(value), `browser resources ${key}`);
    }
  }

  if (terminal) {
    if (isNonNegativeInteger(terminal.pendingWork)) {
      assignOwned(domain, 'pendingWork', terminal.pendingWork, 'terminal pending work');
    }
    const resources = terminal.resources;
    if (isPlainObject(resources)) {
      if (isNonNegativeInteger(resources.canvasCount)) {
        assignOwned(domain, 'canvasCount', resources.canvasCount, 'terminal canvas count');
        if (!Object.hasOwn(domain, 'dom')) domain.dom = { canvasCount: resources.canvasCount };
      }
      if (resources.renderer !== null && isPlainObject(resources.renderer)) {
        assignOwned(domain, 'renderer', clone(resources.renderer), 'terminal renderer');
      }
      if (isPlainObject(resources.subscriptions)) {
        assignOwned(domain, 'subscriptions', clone(resources.subscriptions), 'terminal subscriptions');
      }
      if (isPlainObject(resources.canvas)) {
        assignOwned(domain, 'canvas', clone(resources.canvas), 'terminal canvas');
      }
    }
  }

  const retained = aggregateRemainingResources(execution.cleanup.releases);
  if (Object.keys(retained).length > 0) domain.retainedDelta = retained;
  if (plan.id === 'LIF-001') {
    const first = execution.actionResults[0]?.delta.actual.snapshot;
    const second = execution.actionResults[1]?.delta.actual.snapshot;
    const repeatDelta = resourceDelta(first, second);
    if (Object.keys(repeatDelta).length > 0) domain.afterRepeatInit = repeatDelta;
  }
  return domain;
}

function aggregateRemainingResources(releases) {
  if (releases.length === 0) return {};
  const remaining = releases.map((release) => release.remainingResources).filter(isPlainObject);
  if (remaining.length !== releases.length) return {};
  const result = {};
  for (const field of ['canvasCount', 'subscriptions', 'pendingWork']) {
    const values = remaining.map((entry) => entry[field]);
    if (values.every(isNonNegativeInteger)) result[field] = values.reduce((sum, value) => sum + value, 0);
  }
  return result;
}

function resourceDelta(before, after) {
  if (!isPlainObject(before) || !isPlainObject(after)) return {};
  const result = {};
  const pairs = [
    ['canvasCount', before.resources?.canvasCount, after.resources?.canvasCount],
    ['subscriptions', before.resources?.subscriptions?.active, after.resources?.subscriptions?.active],
    ['pendingWork', before.pendingWork, after.pendingWork],
  ];
  for (const [field, left, right] of pairs) {
    if (isNonNegativeInteger(left) && isNonNegativeInteger(right)) result[field] = right - left;
  }
  return result;
}

function projectHostEvidence({ plan, execution, hostProbe, provenance, extensions }) {
  if (plan.caseType !== 'consumer-journey') return;
  assert(!Object.hasOwn(provenance, 'hostEvidence'), 'provenance hostEvidence collision');
  if (hostProbe) {
    provenance.hostEvidence = {
      source: 'packed-host-probe',
      schema: hostProbe.$schema,
      promotionEligible: true,
    };
    return;
  }

  provenance.hostEvidence = {
    source: 'executor-host-seam',
    promotionEligible: false,
    reason: 'packed-host-probe-unavailable',
  };
  extensions.foundationHostSeam = {
    $schema: 'core-v2-foundation-host-seam/1',
    promotionEligible: false,
    reason: 'executor-host-seam-is-not-packed-consumer-evidence',
    actual: clone(execution.hostSeamDelta),
  };
}

function mergeBrowserDomain(domain, browserProbe, name) {
  const source = browserProbe?.[name];
  if (!source) return;
  for (const [key, value] of Object.entries(source)) {
    assignOwned(domain, key, clone(value), `browser ${name} ${key}`);
  }
}

function actionActual(execution, type) {
  return execution.actionResults.find((result) => result.type === type)?.delta.actual ?? null;
}

function collectRevisionNumbers(execution) {
  const values = [];
  const visit = (value, key = '') => {
    if (typeof value === 'number') {
      if (/revision|generation|publishedTuple/i.test(key)) values.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry, key));
      return;
    }
    if (!isPlainObject(value)) return;
    for (const [nestedKey, nested] of Object.entries(value)) {
      visit(nested, `${key}.${nestedKey}`);
    }
  };
  visit(execution.terminalSnapshot, 'terminalSnapshot');
  for (const result of execution.actionResults) visit(result.delta.actual, `action.${result.index}`);
  return values;
}

function sourceAvailability(name, value, detail = null) {
  return {
    [name]: value === null ? 'unavailable' : 'available',
    ...(detail === null ? {} : { source: detail }),
  };
}

function assignOwned(target, key, value, source) {
  assert(!Object.hasOwn(target, key), `${source} collides at ${key}`);
  target[key] = value;
}

function cloneRecord(value, label) {
  assert(isPlainObject(value), `${label} must be a plain object`);
  return clone(value);
}

function clone(value) {
  return structuredClone(value);
}

function validateJsonValue(value, path, ancestors) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    assert(Number.isFinite(value), `${path} contains a non-finite number`);
    return;
  }
  assert(typeof value === 'object', `${path} contains non-JSON ${typeof value}`);
  assert(!ancestors.has(value), `${path} contains a cycle`);
  assert(Array.isArray(value) || isPlainObject(value), `${path} contains a non-plain object`);
  assert(Object.getOwnPropertySymbols(value).length === 0, `${path} contains symbol keys`);
  if (Array.isArray(value)) {
    const expectedKeys = Array.from({ length: value.length }, (_, index) => String(index));
    assert(
      Object.keys(value).length === expectedKeys.length
        && expectedKeys.every((key) => Object.hasOwn(value, key)),
      `${path} contains a sparse or named array`,
    );
  }
  ancestors.add(value);
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    assert(descriptor?.get === undefined && descriptor?.set === undefined, `${path} contains accessor ${key}`);
    assert(descriptor?.enumerable === true, `${path} contains non-enumerable ${key}`);
    validateJsonValue(descriptor.value, `${path}/${key}`, ancestors);
  }
  ancestors.delete(value);
}

function assertExactKeys(value, allowed, label, options = {}) {
  const optional = new Set(options.optional ?? []);
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !allowedSet.has(key));
  assert(unknown === undefined, `${label} unknown key ${String(unknown)}`);
  for (const key of allowed) {
    if (!optional.has(key)) assert(Object.hasOwn(value, key), `${label} missing key ${key}`);
  }
}

function assertActionIndex(value, actionCount, label) {
  assert(Number.isInteger(value) && value >= 0 && value < actionCount, `${label} action index`);
}

function assertStringArray(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  assert(value.every((entry) => typeof entry === 'string'), `${label} must contain strings`);
}

function assertFiniteNumber(value, label) {
  assert(isFiniteNumber(value), `${label} must be finite`);
}

function assertNonNegativeInteger(value, label) {
  assert(isNonNegativeInteger(value), `${label} must be a non-negative integer`);
}

function assertPositiveInteger(value, label) {
  assert(Number.isInteger(value) && value > 0, `${label} must be a positive integer`);
}

function assertUint32(value, label) {
  assert(Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff, `${label} must be uint32`);
}

function assertFingerprint(value, label) {
  assert(
    typeof value === 'string' && /^fnv1a64:[a-f0-9]{16}$/.test(value),
    `${label} must be a canonical fnv1a64 fingerprint`,
  );
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Core v2 foundation fold invalid: ${message}`);
}
