import { clone } from '../value-atoms.mjs';

export const PERFORMANCE_HANDLER_REVISION =
  'core-v2-performance-handlers/1';

export const PERFORMANCE_CASE_IDS = Object.freeze([
  'PRF-001',
  'PRF-002',
  'PRF-003',
  'PRF-004',
  'PRF-005',
  'PRF-006',
  'PRF-009',
]);

export const PERFORMANCE_ACTION_TYPES = Object.freeze([
  'run-performance-matrix',
  'measure-load-phase-matrix',
  'load-generated-scene',
  'animate-random-bars',
  'pan-and-zoom-during-animation',
  'render-random-text',
  'change-random-text',
  'apply-bulk-transaction',
  'apply-trusted-overlay',
  'run-continuous-interaction-trace',
  'capture-before-optimization-fixture',
  'run-post-optimization-cases',
  'compare-normalized-semantics',
]);

const CASE_ACTIONS = Object.freeze({
  'PRF-001': Object.freeze(['run-performance-matrix']),
  'PRF-002': Object.freeze(['measure-load-phase-matrix']),
  'PRF-003': Object.freeze([
    'load-generated-scene',
    'animate-random-bars',
    'pan-and-zoom-during-animation',
  ]),
  'PRF-004': Object.freeze([
    'load-generated-scene',
    'render-random-text',
    'change-random-text',
  ]),
  'PRF-005': Object.freeze([
    'apply-bulk-transaction',
    'apply-trusted-overlay',
  ]),
  'PRF-006': Object.freeze(['run-continuous-interaction-trace']),
  'PRF-009': Object.freeze([
    'capture-before-optimization-fixture',
    'run-post-optimization-cases',
    'compare-normalized-semantics',
  ]),
});

const MATRIX_SIZES = Object.freeze([
  100,
  500,
  1_000,
  2_000,
  5_000,
  'production-shaped-workload-v1',
]);
const OPTIMIZED_SCENARIOS = Object.freeze([
  'PRF-003',
  'PRF-004',
  'PRF-005',
  'PRF-006',
]);
const SEMANTIC_DOMAINS = Object.freeze([
  'scene',
  'geometry',
  'text',
  'paint',
  'interaction',
  'events',
  'history',
  'outcome',
]);

/** Expected-blind handlers shared by all seven performance contract routes. */
export function createPerformanceHandlerEntries(productValue) {
  const product = validateProduct(productValue);
  const states = new WeakMap();
  const implementations = Object.freeze({
    'run-performance-matrix': runPerformanceMatrixAction,
    'measure-load-phase-matrix': measureLoadPhaseMatrixAction,
    'load-generated-scene': loadGeneratedSceneAction,
    'animate-random-bars': animateRandomBarsAction,
    'pan-and-zoom-during-animation': panZoomDuringAnimationAction,
    'render-random-text': renderRandomTextAction,
    'change-random-text': changeRandomTextAction,
    'apply-bulk-transaction': applyBulkTransactionAction,
    'apply-trusted-overlay': applyTrustedOverlayAction,
    'run-continuous-interaction-trace': runContinuousInteractionTraceAction,
    'capture-before-optimization-fixture': captureBeforeOptimizationFixtureAction,
    'run-post-optimization-cases': runPostOptimizationCasesAction,
    'compare-normalized-semantics': compareNormalizedSemanticsAction,
  });
  return Object.freeze(PERFORMANCE_ACTION_TYPES.map((type) => Object.freeze([
    `contract/${type}`,
    withState(product, states, implementations[type]),
  ])));
}

function withState(product, states, implementation) {
  return async (contextValue, actionValue) => {
    const context = validateContext(contextValue);
    const expectedTypes = CASE_ACTIONS[context.caseId];
    assert(expectedTypes !== undefined, `unsupported case ${String(context.caseId)}`);
    const action = recordValue(actionValue, 'action');
    assertExactKeys(action, ['index', 'operands', 'type'], 'action');
    assert(action.index === context.actionIndex, 'action index');
    assert(action.type === expectedTypes[context.actionIndex], 'action type');
    assert(!context.signal.aborted, 'action is aborted');
    let state = states.get(context.resolveDataset);
    if (state === undefined) {
      state = {
        caseId: context.caseId,
        engine: null,
        barState: null,
        localActions: [],
        sessionProjections: [],
        expectedEvidenceDigestBefore: null,
      };
      states.set(context.resolveDataset, state);
    }
    assert(state.caseId === context.caseId, 'execution state case identity');
    return implementation(product, state, context, action);
  };
}

async function runPerformanceMatrixAction(product, state, _context, action) {
  const operands = exactOperands(action, [
    'backend',
    'cpuProfile',
    'headed',
    'samples',
    'seed',
    'sizes',
    'warmups',
  ]);
  assertSameJson(operands.sizes, MATRIX_SIZES, 'performance sizes');
  assert(operands.seed === 319, 'performance seed');
  assert(operands.warmups === 2, 'performance warmups');
  assert(operands.samples === 7, 'performance samples');
  assert(operands.cpuProfile === 'windows-low-end-n100-8g-v1', 'CPU profile');
  assert(operands.headed === true, 'approved headed request');
  assert(operands.backend === 'webgl2', 'performance backend');
  const evidence = await product.readPerformanceEvidence();
  const projection = caseEvidence(evidence, 'PRF-001');
  state.localActions.push({ type: action.type, projection });
  return actionOutput(product, state, evidence, {
    request: clone(operands),
    projection,
  });
}

async function measureLoadPhaseMatrixAction(product, state, _context, action) {
  const operands = exactOperands(action, [
    'expectedSemanticHash',
    'generatorRefs',
    'phases',
    'samples',
    'seed',
    'sizes',
    'warmups',
    'workloadMatrix',
  ]);
  assertSameJson(operands.sizes, MATRIX_SIZES, 'load phase sizes');
  assertSameJson(
    operands.generatorRefs,
    ['synthetic-scene', 'production-shaped'],
    'load phase generators',
  );
  assertSameJson(
    operands.phases,
    ['validate', 'materialize', 'asset', 'upload-prepare', 'first-useful-frame'],
    'load phases',
  );
  assert(operands.seed === 319, 'load phase seed');
  assert(operands.warmups === 2, 'load phase warmups');
  assert(operands.samples === 7, 'load phase samples');
  assert(
    digestValue(operands.expectedSemanticHash, 'expected semantic hash')
      === '4bc16c65500b4f305114162fdc4472b45997eea7498020496072ca0b741e95c3',
    'load phase semantic hash binding',
  );
  validateWorkloadMatrix(operands.workloadMatrix);
  const evidence = await product.readPerformanceEvidence();
  const projection = caseEvidence(evidence, 'PRF-002');
  state.localActions.push({ type: action.type, projection });
  return actionOutput(product, state, evidence, {
    request: clone(operands),
    projection,
  });
}

async function loadGeneratedSceneAction(product, state, context, action) {
  assert(context.caseId === 'PRF-003' || context.caseId === 'PRF-004', 'generated scene case');
  const operands = exactOperands(action, ['generatorRef', 'seed', 'size']);
  assert(operands.generatorRef === 'synthetic-scene', 'generated scene reference');
  const size = positiveInteger(operands.size, 'generated scene size');
  const seed = uint32(operands.seed, 'generated scene seed');
  const engine = await context.ensureMainEngine();
  const local = await product.loadSyntheticScene({
    engine,
    instanceId: `${context.caseId.toLowerCase()}-performance`,
    size,
    seed,
  });
  state.engine = engine;
  state.localActions.push({ type: action.type, local });
  return localActionOutput(product, state, {
    size,
    seed,
    generatorRef: operands.generatorRef,
    local,
  });
}

async function animateRandomBarsAction(product, state, context, action) {
  assert(context.caseId === 'PRF-003', 'bar animation case');
  const operands = exactOperands(action, [
    'durationMs',
    'easing',
    'retargetAtMs',
    'seed',
    'targetFraction',
  ]);
  assert(operands.easing === 'easeOutCubic', 'bar easing');
  const engine = currentEngine(state, 'animate random bars');
  const barState = await product.startBarAnimation({
    engine,
    size: 2_000,
    seed: uint32(operands.seed, 'bar seed'),
    targetFraction: fraction(operands.targetFraction, 'bar target fraction'),
    durationMs: positiveNumber(operands.durationMs, 'bar duration'),
    retargetAtMs: positiveNumber(operands.retargetAtMs, 'bar retarget time'),
  });
  state.barState = barState;
  state.localActions.push({ type: action.type, local: barState });
  return localActionOutput(product, state, {
    easing: operands.easing,
    barState: clone(barState),
  });
}

async function panZoomDuringAnimationAction(product, state, context, action) {
  assert(context.caseId === 'PRF-003', 'bar pan/zoom case');
  const operands = exactOperands(action, ['anchorCss', 'panCss', 'zoomFactor']);
  const engine = currentEngine(state, 'pan and zoom during animation');
  assert(state.barState !== null, 'bar state before pan/zoom');
  const local = await product.settleBarAnimation({
    engine,
    state: state.barState,
    panCss: numberTuple(operands.panCss, 'bar pan'),
    zoomFactor: positiveNumber(operands.zoomFactor, 'bar zoom factor'),
    anchorCss: numberTuple(operands.anchorCss, 'bar zoom anchor'),
  });
  const evidence = await product.readPerformanceEvidence();
  state.localActions.push({ type: action.type, local });
  return actionOutput(product, state, evidence, {
    local,
    projection: caseEvidence(evidence, 'PRF-003'),
  });
}

async function renderRandomTextAction(product, state, context, action) {
  assert(context.caseId === 'PRF-004', 'render random text case');
  return updateTextAction(product, state, context, action, false);
}

async function changeRandomTextAction(product, state, context, action) {
  assert(context.caseId === 'PRF-004', 'change random text case');
  const localOutput = await updateTextAction(product, state, context, action, true);
  const evidence = await product.readPerformanceEvidence();
  return actionOutput(product, state, evidence, {
    ...recordValue(localOutput.actual, 'text action actual'),
    projection: caseEvidence(evidence, 'PRF-004'),
  });
}

async function updateTextAction(product, state, _context, action, finalAction) {
  const operands = exactOperands(action, ['actionIndex', 'fields', 'seed']);
  const actionIndex = nonNegativeInteger(operands.actionIndex, 'text action index');
  const expectedFields = finalAction
    ? ['text', 'fontSize', 'fill', 'wordWrapWidth']
    : ['text', 'fontSize', 'fill'];
  assertSameJson(operands.fields, expectedFields, 'text fields');
  const local = await product.updateRandomText({
    engine: currentEngine(state, 'random text update'),
    size: 2_000,
    seed: uint32(operands.seed, 'text seed'),
    actionIndex,
    includeWordWrapWidth: finalAction,
    timeMs: finalAction ? 16 : 0,
  });
  state.localActions.push({ type: action.type, local });
  return localActionOutput(product, state, {
    fields: clone(operands.fields),
    actionIndex,
    local,
  });
}

async function applyBulkTransactionAction(product, state, context, action) {
  assert(context.caseId === 'PRF-005', 'bulk transaction case');
  const operands = exactOperands(action, ['seed', 'size', 'strict', 'targetFraction']);
  assert(operands.strict === true, 'strict bulk transaction');
  const engine = await context.ensureMainEngine();
  const local = await product.applyBulkPatch({
    engine,
    instanceId: 'prf-005-performance',
    size: positiveInteger(operands.size, 'bulk size'),
    seed: uint32(operands.seed, 'bulk seed'),
    targetFraction: fraction(operands.targetFraction, 'bulk target fraction'),
    strict: true,
    timeMs: 0,
    actionId: 'prf-005-bulk',
    ensureScene: true,
  });
  state.engine = engine;
  state.localActions.push({ type: action.type, local });
  return localActionOutput(product, state, { local });
}

async function applyTrustedOverlayAction(product, state, context, action) {
  assert(context.caseId === 'PRF-005', 'trusted overlay case');
  const operands = exactOperands(action, ['seed', 'size', 'strict', 'targetFraction']);
  assert(operands.strict === false, 'permissive trusted overlay');
  const local = await product.applyBulkPatch({
    engine: currentEngine(state, 'trusted overlay'),
    instanceId: 'prf-005-performance',
    size: positiveInteger(operands.size, 'overlay size'),
    seed: uint32(operands.seed, 'overlay seed'),
    targetFraction: fraction(operands.targetFraction, 'overlay target fraction'),
    strict: false,
    timeMs: 16,
    actionId: 'prf-005-overlay',
    ensureScene: false,
  });
  const evidence = await product.readPerformanceEvidence();
  state.localActions.push({ type: action.type, local });
  return actionOutput(product, state, evidence, {
    local,
    projection: caseEvidence(evidence, 'PRF-005'),
  });
}

async function runContinuousInteractionTraceAction(product, state, context, action) {
  assert(context.caseId === 'PRF-006', 'continuous interaction case');
  const operands = exactOperands(action, [
    'durationMs',
    'gestureSequence',
    'seed',
    'size',
  ]);
  const gestures = stringArray(operands.gestureSequence, 'gesture sequence');
  assertSameJson(
    gestures,
    [
      'pan',
      'zoom',
      'point-hit',
      'box-select',
      'paint-select',
      'move',
      'resize',
      'rotate',
      'edge-auto-pan',
      'hover',
    ],
    'continuous interaction gestures',
  );
  const engine = await context.ensureMainEngine();
  const local = await product.runContinuousInteraction({
    engine,
    instanceId: 'prf-006-performance',
    size: positiveInteger(operands.size, 'interaction size'),
    seed: uint32(operands.seed, 'interaction seed'),
    durationMs: positiveNumber(operands.durationMs, 'interaction duration'),
    gestureSequence: gestures,
    ensureScene: true,
  });
  state.engine = engine;
  const evidence = await product.readPerformanceEvidence();
  state.localActions.push({ type: action.type, local });
  return actionOutput(product, state, evidence, {
    local,
    projection: caseEvidence(evidence, 'PRF-006'),
  });
}

async function captureBeforeOptimizationFixtureAction(product, state, context, action) {
  assert(context.caseId === 'PRF-009', 'semantic fixture capture case');
  const operands = exactOperands(action, ['scenarioIds', 'seed']);
  assertSameJson(operands.scenarioIds, OPTIMIZED_SCENARIOS, 'optimized scenario IDs');
  const seed = uint32(operands.seed, 'optimization seed');
  const digest = digestValue(product.expectedEvidenceDigest(), 'expected evidence digest');
  state.expectedEvidenceDigestBefore = digest;
  const capture = {
    scenarioIds: clone(OPTIMIZED_SCENARIOS),
    seed,
    expectedEvidenceDigestBefore: digest,
    fixtureFingerprint: context.fingerprint({
      scenarioIds: OPTIMIZED_SCENARIOS,
      seed,
    }),
  };
  state.localActions.push({ type: action.type, local: capture });
  return localActionOutput(product, state, capture);
}

async function runPostOptimizationCasesAction(product, state, context, action) {
  assert(context.caseId === 'PRF-009', 'post-optimization case');
  const operands = exactOperands(action, ['seed', 'sessions']);
  const sessions = positiveInteger(operands.sessions, 'optimization sessions');
  assert(sessions === 2, 'optimization session count');
  const seed = uint32(operands.seed, 'optimization seed');
  const projections = [];
  for (let session = 1; session <= sessions; session += 1) {
    const engine = await context.ensureSessionEngine(session);
    const projection = await product.runOptimizedScenarioSuite({
      engine,
      instanceId: `prf-009-session-${session}`,
      seed,
    });
    projections.push({
      session,
      fingerprint: context.fingerprint(projection),
      projection: clone(projection),
    });
  }
  state.sessionProjections = projections;
  state.localActions.push({ type: action.type, local: projections });
  return localActionOutput(product, state, {
    sessions,
    projections: clone(projections),
  });
}

async function compareNormalizedSemanticsAction(product, state, context, action) {
  assert(context.caseId === 'PRF-009', 'semantic comparison case');
  const operands = exactOperands(action, ['domains']);
  const domains = stringArray(operands.domains, 'semantic comparison domains');
  assertSameJson(domains, SEMANTIC_DOMAINS, 'semantic comparison domains');
  assert(state.sessionProjections.length === 2, 'two session projections');
  assert(state.expectedEvidenceDigestBefore !== null, 'expected digest captured');
  const [first, second] = state.sessionProjections;
  const domainDiffs = [];
  for (const domain of domains) {
    const left = domain === 'outcome'
      ? { semanticSuiteCompleted: true }
      : recordValue(first.projection[domain], `${domain} first projection`);
    const right = domain === 'outcome'
      ? { semanticSuiteCompleted: true }
      : recordValue(second.projection[domain], `${domain} second projection`);
    if (context.fingerprint(left) !== context.fingerprint(right)) domainDiffs.push(domain);
  }
  const digestAfter = digestValue(product.expectedEvidenceDigest(), 'expected evidence digest after');
  const comparison = {
    domains,
    semanticDiffCount: domainDiffs.length,
    domainDiffs,
    sessionFingerprints: state.sessionProjections.map(({ fingerprint }) => fingerprint),
    expectedEvidenceDigestBefore: state.expectedEvidenceDigestBefore,
    expectedEvidenceDigest: digestAfter,
    expectedEvidenceDigestUnchanged:
      digestAfter === state.expectedEvidenceDigestBefore,
    terminalProjection: clone(second.projection),
  };
  state.localActions.push({ type: action.type, local: comparison });
  return localActionOutput(product, state, comparison);
}

function actionOutput(product, state, evidence, actual) {
  return {
    actual: {
      ...clone(actual),
      evidenceBinding: evidenceBinding(evidence),
      runtimeState: runtimeState(product, state),
    },
  };
}

function localActionOutput(product, state, actual) {
  return {
    actual: {
      ...clone(actual),
      runtimeState: runtimeState(product, state),
    },
  };
}

function runtimeState(product, state) {
  return {
    caseId: state.caseId,
    actionCount: state.localActions.length,
    localActions: clone(state.localActions),
    runtime: clone(product.runtimeProbe()),
  };
}

function evidenceBinding(evidence) {
  return clone({
    revision: evidence.revision,
    status: evidence.status,
    generatedAt: evidence.generatedAt,
    protocol: recordValue(evidence.protocol, 'evidence protocol'),
    provenance: recordValue(evidence.provenance, 'evidence provenance'),
    environment: recordValue(evidence.environment, 'evidence environment'),
    rawArtifact: recordValue(evidence.rawArtifact, 'raw evidence artifact'),
    browser: recordValue(evidence.browser, 'evidence browser'),
  });
}

function caseEvidence(evidence, caseId) {
  return clone(recordValue(
    recordValue(evidence.cases, 'performance cases')[caseId],
    `${caseId} performance evidence`,
  ));
}

function currentEngine(state, operation) {
  assert(state.engine !== null, `${operation} requires loaded Engine`);
  return state.engine;
}

function validateWorkloadMatrix(value) {
  const rows = arrayValue(value, 'workload matrix');
  assert(rows.length === MATRIX_SIZES.length, 'workload matrix row count');
  rows.forEach((entry, index) => {
    const row = recordValue(entry, `workload matrix ${index}`);
    assertExactKeys(row, ['generatorRef', 'size'], `workload matrix ${index}`);
    assert(row.size === MATRIX_SIZES[index], `workload matrix ${index} size`);
    assert(
      row.generatorRef
        === (index === MATRIX_SIZES.length - 1 ? 'production-shaped' : 'synthetic-scene'),
      `workload matrix ${index} generator`,
    );
  });
}

function validateContext(value) {
  const context = recordValue(value, 'handler context');
  for (const method of [
    'ensureMainEngine',
    'ensureSessionEngine',
    'resolveDataset',
    'fingerprint',
  ]) {
    assert(typeof context[method] === 'function', `context must expose ${method}()`);
  }
  assert(isRecord(context.signal), 'context signal');
  return context;
}

function validateProduct(value) {
  const product = recordValue(value, 'performance product adapter');
  assertExactKeys(
    product,
    [
      'applyBulkPatch',
      'expectedEvidenceDigest',
      'loadSyntheticScene',
      'readPerformanceEvidence',
      'runContinuousInteraction',
      'runOptimizedScenarioSuite',
      'runtimeProbe',
      'settleBarAnimation',
      'startBarAnimation',
      'updateRandomText',
    ],
    'performance product adapter',
  );
  for (const method of Object.keys(product)) {
    assert(typeof product[method] === 'function', `performance product ${method}()`);
  }
  return product;
}

function exactOperands(action, keys) {
  const operands = recordValue(action.operands, `${action.type} operands`);
  assertExactKeys(operands, keys, `${action.type} operands`);
  return operands;
}

function assertExactKeys(value, keys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assertSameJson(actual, expected, `${label} keys`);
}

function assertSameJson(left, right, label) {
  assert(JSON.stringify(left) === JSON.stringify(right), label);
}

function numberTuple(value, label) {
  const tuple = arrayValue(value, label);
  assert(tuple.length === 2, `${label} tuple length`);
  return [
    finiteNumber(tuple[0], `${label}[0]`),
    finiteNumber(tuple[1], `${label}[1]`),
  ];
}

function stringArray(value, label) {
  return arrayValue(value, label).map((entry, index) =>
    stringValue(entry, `${label}[${index}]`));
}

function digestValue(value, label) {
  const digest = stringValue(value, label);
  assert(/^[a-f0-9]{64}$/u.test(digest), label);
  return digest;
}

function stringValue(value, label) {
  assert(typeof value === 'string', label);
  return value;
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), label);
  return value;
}

function positiveNumber(value, label) {
  const number = finiteNumber(value, label);
  assert(number > 0, label);
  return number;
}

function nonNegativeInteger(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0, label);
  return value;
}

function positiveInteger(value, label) {
  const integer = nonNegativeInteger(value, label);
  assert(integer > 0, label);
  return integer;
}

function uint32(value, label) {
  const integer = nonNegativeInteger(value, label);
  assert(integer <= 0xffff_ffff, label);
  return integer;
}

function fraction(value, label) {
  const number = finiteNumber(value, label);
  assert(number > 0 && number <= 1, label);
  return number;
}

function recordValue(value, label) {
  assert(isRecord(value), label);
  return value;
}

function arrayValue(value, label) {
  assert(Array.isArray(value), label);
  return value;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid Core v2 performance action: ${message}`);
}
