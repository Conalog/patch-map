import { createActionRegistry } from './action-registry.mjs';
import { createEmptyStateHandlerEntries } from './handlers/empty-state.mjs';
import { createFoundationHandlerEntries } from './handlers/foundation.mjs';

const ACTUAL_DELTA_SCHEMA = 'core-v2-semantic-observation-delta/1';
const EXECUTION_SCHEMA = 'core-v2-contract-case-execution/1';
const HOST_DELTA_SCHEMA = 'core-v2-host-seam-delta/1';
const ENGINE_EVENTS = Object.freeze([
  'ready',
  'sceneCommitted',
  'drawComplete',
  'frame',
  'diagnostic',
  'destroyed',
]);

export class CoreV2ContractExecutionError extends Error {
  constructor(code, message, partialExecution, cause) {
    super(`${code}: ${message}`, { cause });
    this.name = 'CoreV2ContractExecutionError';
    this.code = code;
    this.partialExecution = partialExecution;
  }
}

export async function executeContractCase(options) {
  const input = validateExecutionOptions(options);
  const actions = cloneAndValidateActions(input.caseRecord);
  const registry = createActionRegistry(input.actionDefinitions, input.handlerEntries);
  registry.assertCoverage([input.caseRecord]);
  const state = createExecutionState(input, actions);

  let actionFailure = null;
  try {
    await executeActions(state, registry);
  } catch (error) {
    actionFailure = error;
  } finally {
    state.closing = true;
    state.terminalSnapshot = state.snapshotAuthoritativeEngine();
    try {
      assertNoJournalFailures(state);
      state.terminalSemanticProbe = await captureSemanticProbe(state.authoritativeEngineRecord);
      assertNoJournalFailures(state);
    } catch (error) {
      actionFailure ??= error;
    }
    state.terminalHostSnapshot = state.snapshotHostSeam();
    state.cleanup = await cleanupExecution(state);
  }

  const cleanupFailure = state.cleanup.errors.length > 0
    ? new Error(`cleanup failed: ${state.cleanup.errors.map((error) => error.code).join(', ')}`)
    : null;
  const failure = actionFailure ?? cleanupFailure;
  const execution = finalizeExecution(state, failure);
  if (failure) {
    const code = actionFailure ? errorCode(actionFailure) : 'CLEANUP_FAILED';
    throw new CoreV2ContractExecutionError(code, errorMessage(failure), execution, failure);
  }
  return execution;
}

function validateExecutionOptions(options) {
  assert(isRecord(options), 'execution options must be an object');
  assert(isRecord(options.caseRecord), 'caseRecord must be an object');
  assert(Array.isArray(options.actionDefinitions), 'actionDefinitions must be an array');
  assert(typeof options.engineFactory === 'function', 'engineFactory must be a function');
  assert(options.datasets !== undefined, 'datasets must be injected');
  validateClock(options.clock);
  const actionTimeoutMs = options.actionTimeoutMs ?? 5_000;
  assert(Number.isFinite(actionTimeoutMs) && actionTimeoutMs > 0, 'actionTimeoutMs must be positive and finite');

  return {
    caseRecord: options.caseRecord,
    actionDefinitions: options.actionDefinitions,
    engineFactory: options.engineFactory,
    datasets: options.datasets,
    clock: options.clock,
    actionTimeoutMs,
    handlerEntries: options.handlerEntries ?? createDefaultHandlerEntries(),
  };
}

function createDefaultHandlerEntries() {
  return Object.freeze([
    ...createFoundationHandlerEntries(),
    ...createEmptyStateHandlerEntries(),
  ]);
}

function cloneAndValidateActions(caseRecord) {
  const source = caseRecord.fixture?.actionTrace ?? caseRecord.actionTrace;
  assert(Array.isArray(source) && source.length > 0, `${String(caseRecord.id)} action trace`);
  const actions = source.map((action, index) => {
    assert(isRecord(action), `${String(caseRecord.id)} action ${index} must be an object`);
    assert(action.index === index, `${String(caseRecord.id)} action index ${index}`);
    assert(typeof action.type === 'string' && action.type.length > 0, `${String(caseRecord.id)} action type ${index}`);
    assert(isRecord(action.operands), `${String(caseRecord.id)} action operands ${index}`);
    return deepFreeze(structuredClone(action));
  });
  return Object.freeze(actions);
}

function createExecutionState(input, actions) {
  const fixture = input.caseRecord.fixture ?? input.caseRecord;
  const definitions = new Map(input.actionDefinitions.map((definition) => [definition.type, definition]));
  const datasetCache = new Map();
  const bindings = new Map();
  const engineRecords = [];
  const sessionEngineRecords = new Map();
  const datasetBaselines = new Map();
  const state = {
    ...input,
    fixture,
    actions,
    definitions,
    datasetCache,
    bindings,
    engineRecords,
    sessionEngineRecords,
    datasetBaselines,
    mainEngineRecord: null,
    authoritativeEngineRecord: null,
    hostState: null,
    eventJournal: [],
    eventSequence: 0,
    eventJournalFailures: [],
    eventJournalFailureCursor: 0,
    actionResults: [],
    captures: [],
    hostFragments: [],
    terminalSnapshot: null,
    terminalSemanticProbe: null,
    terminalHostSnapshot: null,
    cleanup: null,
    closing: false,
  };

  state.createEngine = async (role) => createEngine(state, role);
  state.ensureMainEngine = async () => {
    state.mainEngineRecord ??= await state.createEngine('main');
    assert(!state.mainEngineRecord.released, 'main engine has already been released');
    state.authoritativeEngineRecord = state.mainEngineRecord;
    return state.mainEngineRecord.engine;
  };
  state.currentMainEngine = () => state.mainEngineRecord?.engine ?? null;
  state.ensureSessionEngine = async (session) => ensureSessionEngine(state, session);
  state.currentSessionEngine = (session) => currentSessionEngine(state, session);
  state.releaseEngine = async (engine, reason) => releaseEngine(state, engine, reason);
  state.resolveDataset = async (reference) => resolveDataset(state, reference);
  state.freezeDataset = async (reference) => {
    const dataset = await state.resolveDataset(reference);
    deepFreeze(dataset);
    return dataset;
  };
  state.cloneDataset = async (reference) => structuredClone(await state.resolveDataset(reference));
  state.fingerprint = fingerprint;
  state.snapshotAuthoritativeEngine = () => safeSnapshot(state.authoritativeEngineRecord?.engine ?? null);
  state.snapshotHostSeam = () => snapshotHostSeam(state);
  return state;
}

async function executeActions(state, registry) {
  for (const action of state.actions) {
    await executeAction(state, registry, action);
  }
}

async function executeAction(state, registry, action) {
  const definition = state.definitions.get(action.type);
  assert(definition !== undefined, `unknown action definition ${action.type}`);
  const handler = registry.resolve(action);
  const startedAtMs = readClock(state.clock);
  const abortController = new AbortController();
  const context = handlerContext(state, action, abortController.signal);
  let handlerPromise = null;

  try {
    handlerPromise = Promise.resolve().then(() => handler(context, action));
    const output = await state.clock.withTimeout(
      handlerPromise,
      state.actionTimeoutMs,
      `${state.caseRecord.id}:${action.index}:${action.type}`,
    );
    assertNoJournalFailures(state);
    const completedAtMs = readClock(state.clock);
    const stagedBindings = stageBindings(state, definition, action, output);
    const stagedCaptures = stageCaptures(state, action, output);
    const stagedHostState = stageHostState(state, action, output);
    const semanticProbe = await captureSemanticProbe(state.authoritativeEngineRecord);
    const result = successfulActionResult(
      state,
      action,
      output,
      semanticProbe,
      startedAtMs,
      completedAtMs,
    );
    const hostFragment = output.host === undefined
      ? null
      : deepFreeze({
          actionIndex: action.index,
          actionType: action.type,
          actual: structuredClone(output.host),
        });

    for (const [name, value] of stagedBindings) state.bindings.set(name, value);
    if (stagedHostState) state.hostState = stagedHostState;
    state.captures.push(...stagedCaptures);
    state.actionResults.push(result);
    if (hostFragment) state.hostFragments.push(hostFragment);
  } catch (error) {
    abortController.abort(error);
    handlerPromise?.catch(() => undefined);
    await Promise.resolve();
    state.actionResults.push(failedActionResult(state, action, error, startedAtMs, readClock(state.clock)));
    throw error;
  }
}

function handlerContext(state, action, signal) {
  return Object.freeze({
    caseId: state.caseRecord.id,
    caseType: state.caseRecord.caseType,
    actionIndex: action.index,
    fixtureParams: state.fixture.setup?.params ?? {},
    routeParams: state.caseRecord.routeParams ?? {},
    clock: state.clock,
    signal,
    ensureMainEngine: state.ensureMainEngine,
    currentMainEngine: state.currentMainEngine,
    ensureSessionEngine: state.ensureSessionEngine,
    currentSessionEngine: state.currentSessionEngine,
    createEngine: state.createEngine,
    releaseEngine: state.releaseEngine,
    resolveDataset: state.resolveDataset,
    freezeDataset: state.freezeDataset,
    cloneDataset: state.cloneDataset,
    fingerprint: state.fingerprint,
    snapshotAuthoritativeEngine: state.snapshotAuthoritativeEngine,
    snapshotHostSeam: state.snapshotHostSeam,
    getBinding(name) {
      return state.bindings.get(name);
    },
  });
}

function stageHostState(state, action, output) {
  if (output.hostState === undefined) return null;
  assert(isRecord(output.hostState), `${action.type} hostState must be an object`);
  assertExactKeys(
    output.hostState,
    ['actionIndex', 'owner', 'revision', 'state'],
    `${action.type} hostState`,
  );
  assert(output.hostState.owner === 'host', `${action.type} hostState owner`);
  assert(typeof output.hostState.state === 'string' && output.hostState.state.length > 0, `${action.type} hostState state`);
  assert(output.hostState.actionIndex === action.index, `${action.type} hostState actionIndex`);
  const currentRevision = state.hostState?.revision ?? 0;
  assert(output.hostState.revision === currentRevision + 1, `${action.type} hostState revision`);
  return deepFreeze(structuredClone(output.hostState));
}

function stageBindings(state, definition, action, output) {
  assert(isRecord(output), `${action.type} handler result must be an object`);
  assert(isRecord(output.actual), `${action.type} handler must return actual data`);
  const bindingContract = definition.binding ?? {};
  const producesFields = bindingContract.producesFields ?? [];
  const consumesFields = bindingContract.consumesFields ?? [];
  assert(Array.isArray(producesFields), `${action.type} producesFields`);
  assert(Array.isArray(consumesFields), `${action.type} consumesFields`);

  for (const field of consumesFields) {
    const name = action.operands[field];
    assert(typeof name === 'string' && state.bindings.has(name), `${action.type} unresolved binding ${String(name)}`);
  }

  const expectedNames = producesFields.map((field) => {
    const name = action.operands[field];
    assert(typeof name === 'string' && name.length > 0, `${action.type} binding operand ${field}`);
    assert(!state.bindings.has(name), `${action.type} duplicate binding ${name}`);
    return name;
  });
  const produced = output.bindings ?? {};
  assert(isRecord(produced), `${action.type} bindings must be an object`);
  assertExactKeys(produced, expectedNames, `${action.type} produced bindings`);

  const capturePaths = bindingContract.capturePaths ?? [];
  const staged = expectedNames.map((name) => {
    const value = structuredClone(produced[name]);
    for (const path of capturePaths) readPath(value, path, `${action.type} binding ${name}`);
    return [name, deepFreeze(value)];
  });
  return staged;
}

function stageCaptures(state, action, output) {
  const checkpoints = state.fixture.captureCheckpoints ?? [];
  assert(Array.isArray(checkpoints), `${state.caseRecord.id} capture checkpoints`);
  const matching = checkpoints.filter((checkpoint) => checkpoint.afterActionIndex === action.index);
  if (matching.length === 0) return [];

  const source = output.captureSource ?? state.snapshotAuthoritativeEngine();
  assert(source !== null, `${action.type} capture source`);
  return matching.map((checkpoint) => {
    assert(checkpoint.phase === 'after-action', `${checkpoint.id} capture phase`);
    assert(Array.isArray(checkpoint.paths), `${checkpoint.id} capture paths`);
    const values = {};
    for (const path of checkpoint.paths) {
      values[path] = structuredClone(readPath(source, path, `${checkpoint.id} capture`));
    }
    return deepFreeze({
      id: checkpoint.id,
      phase: checkpoint.phase,
      afterActionIndex: action.index,
      values,
    });
  });
}

function successfulActionResult(state, action, output, semanticProbe, startedAtMs, completedAtMs) {
  return deepFreeze({
    index: action.index,
    type: action.type,
    handlerId: `contract/${action.type}`,
    status: 'completed',
    startedAtMs,
    completedAtMs,
    delta: {
      $schema: ACTUAL_DELTA_SCHEMA,
      caseId: state.caseRecord.id,
      actionIndex: action.index,
      actionType: action.type,
      actual: structuredClone(output.actual),
      semanticProbe: structuredClone(semanticProbe),
    },
  });
}

function failedActionResult(state, action, error, startedAtMs, completedAtMs) {
  return deepFreeze({
    index: action.index,
    type: action.type,
    handlerId: `contract/${action.type}`,
    status: 'failed',
    startedAtMs,
    completedAtMs,
    delta: {
      $schema: ACTUAL_DELTA_SCHEMA,
      caseId: state.caseRecord.id,
      actionIndex: action.index,
      actionType: action.type,
      actual: { error: serializeError(error) },
    },
  });
}

async function createEngine(state, role) {
  const generation = state.engineRecords.length + 1;
  const engine = await state.engineFactory(Object.freeze({
    caseId: state.caseRecord.id,
    caseType: state.caseRecord.caseType,
    role,
    generation,
  }));
  assertEngine(engine, role);
  const record = {
    engine,
    role,
    generation,
    released: false,
    releaseActual: null,
    journalUnsubscribers: [],
  };
  state.engineRecords.push(record);
  attachEventJournal(state, record);
  if (state.closing) {
    await releaseEngineRecord(state, record, 'late-after-execution');
    throw new Error(`Core v2 execution invalid: ${role} engine created after execution closed`);
  }
  return record;
}

async function ensureSessionEngine(state, session) {
  assert(Number.isInteger(session) && session > 0, `session ${String(session)} must be a positive integer`);
  const existing = state.sessionEngineRecords.get(session);
  if (existing) {
    assert(!existing.released, `session ${session} engine has already been released`);
    state.authoritativeEngineRecord = existing;
    return existing.engine;
  }

  for (const [priorSession, record] of state.sessionEngineRecords) {
    assert(priorSession < session, `session ${session} must follow session ${priorSession}`);
    if (!record.released) await releaseEngineRecord(state, record, `session-replaced-by:${session}`);
  }

  const record = await state.createEngine(`session:${session}`);
  state.sessionEngineRecords.set(session, record);
  state.authoritativeEngineRecord = record;
  return record.engine;
}

function currentSessionEngine(state, session) {
  assert(Number.isInteger(session) && session > 0, `session ${String(session)} must be a positive integer`);
  const record = state.sessionEngineRecords.get(session);
  assert(record !== undefined, `session ${session} engine has not been created`);
  assert(!record.released, `session ${session} engine has already been released`);
  assert(record === state.authoritativeEngineRecord, `session ${session} is not authoritative`);
  return record.engine;
}

function attachEventJournal(state, record) {
  for (const event of ENGINE_EVENTS) {
    const unsubscribe = record.engine.on(event, (actual) => recordEngineEvent(state, record, event, actual));
    assert(typeof unsubscribe === 'function', `${record.role} ${event} subscription must return unsubscribe()`);
    record.journalUnsubscribers.push(unsubscribe);
  }
}

function recordEngineEvent(state, record, event, payload) {
  let actual;
  try {
    assertJsonEvidenceSafe(payload, `${record.role} ${event}`);
    actual = structuredClone(payload);
  } catch (error) {
    const failure = new CoreV2EventJournalError(
      'UNSERIALIZABLE_ENGINE_EVENT',
      `${record.role} generation ${record.generation} emitted non-JSON-safe ${event}`,
      error,
    );
    state.eventJournalFailures.push(deepFreeze({
      generation: record.generation,
      role: record.role,
      event,
      error: serializeError(failure),
    }));
    return;
  }
  state.eventSequence += 1;
  state.eventJournal.push(deepFreeze({
    sequence: state.eventSequence,
    generation: record.generation,
    role: record.role,
    event,
    actual,
  }));
}

function assertNoJournalFailures(state) {
  if (state.eventJournalFailureCursor >= state.eventJournalFailures.length) return;
  const failures = state.eventJournalFailures.slice(state.eventJournalFailureCursor);
  state.eventJournalFailureCursor = state.eventJournalFailures.length;
  const first = failures[0];
  throw new CoreV2EventJournalError(
    first.error.code,
    `engine event journal rejected ${failures.length} event payload(s): ${first.role} ${first.event}`,
  );
}

async function resolveDataset(state, reference) {
  assert(typeof reference === 'string' && reference.length > 0, 'dataset reference must be a non-empty string');
  if (state.datasetCache.has(reference)) return state.datasetCache.get(reference);

  const embeddedName = `${reference}Dataset`;
  let source;
  if (Object.hasOwn(state.fixture.setup?.params ?? {}, embeddedName)) {
    source = state.fixture.setup.params[embeddedName];
  } else {
    source = await readDatasetSource(state.datasets, reference);
  }
  assert(source !== undefined, `dataset ${reference} is not available`);
  const owned = structuredClone(source);
  state.datasetCache.set(reference, owned);
  state.datasetBaselines.set(reference, deepFreeze({
    beforeFingerprint: fingerprint(owned),
    beforeGraph: structuredClone(owned),
  }));
  return owned;
}

async function readDatasetSource(datasets, reference) {
  if (typeof datasets === 'function') return datasets(reference);
  if (datasets instanceof Map) return datasets.get(reference);
  if (isRecord(datasets) && typeof datasets.resolve === 'function') return datasets.resolve(reference);
  if (isRecord(datasets) && Object.hasOwn(datasets, reference)) return datasets[reference];
  return undefined;
}

async function cleanupExecution(state) {
  const errors = [];
  const declared = state.fixture.cleanupTrace ?? [];
  if (!Array.isArray(declared)) {
    errors.push({ code: 'INVALID_CLEANUP_TRACE', message: 'cleanupTrace must be an array' });
  } else {
    for (const step of declared) {
      if (!isRecord(step) || step.type !== 'destroy-case') {
        errors.push({ code: 'UNKNOWN_CLEANUP_ACTION', message: `unsupported cleanup ${String(step?.type)}` });
      }
    }
  }

  const releases = [];
  for (const record of [...state.engineRecords].reverse()) {
    try {
      releases.push(await releaseEngineRecord(state, record, 'case-finally'));
    } catch (error) {
      errors.push(serializeError(error));
    }
  }
  return deepFreeze({
    status: errors.length === 0 ? 'completed' : 'failed',
    declaredActions: Array.isArray(declared)
      ? declared.map((step) => isRecord(step) ? String(step.type) : 'invalid')
      : [],
    releases,
    errors,
  });
}

async function releaseEngine(state, engine, reason) {
  const record = state.engineRecords.find((candidate) => candidate.engine === engine);
  assert(record !== undefined, 'cannot release an unowned engine');
  return releaseEngineRecord(state, record, reason);
}

async function releaseEngineRecord(state, record, reason) {
  if (record.released) return record.releaseActual;
  record.released = true;
  const before = safeSnapshot(record.engine);
  let destroyed;
  let journalSubscriptions;
  try {
    destroyed = await record.engine.destroy();
    assertNoJournalFailures(state);
  } finally {
    journalSubscriptions = releaseJournalSubscriptions(record);
  }
  const after = safeSnapshot(record.engine);
  record.releaseActual = deepFreeze({
    role: record.role,
    generation: record.generation,
    reason,
    destroyReturned: destroyed,
    before,
    after,
    journalSubscriptions,
    remainingResources: resourceCounts(after),
  });
  return record.releaseActual;
}

function releaseJournalSubscriptions(record) {
  const errors = [];
  let releasedCount = 0;
  for (const unsubscribe of [...record.journalUnsubscribers].reverse()) {
    try {
      unsubscribe();
      releasedCount += 1;
    } catch (error) {
      errors.push(serializeError(error));
    }
  }
  record.journalUnsubscribers.length = 0;
  if (errors.length > 0) {
    throw new CoreV2EventJournalError(
      'EVENT_JOURNAL_UNSUBSCRIBE_FAILED',
      `${record.role} event journal unsubscribe failed: ${errors.map((error) => error.code).join(', ')}`,
    );
  }
  return deepFreeze({ registeredCount: ENGINE_EVENTS.length, releasedCount });
}

function finalizeExecution(state, failure) {
  const status = failure ? 'failed' : 'completed';
  const hostSeamDelta = state.caseRecord.caseType === 'consumer-journey'
    ? deepFreeze({
        $schema: HOST_DELTA_SCHEMA,
        caseId: state.caseRecord.id,
        status,
        capabilityPassInherited: false,
        actions: structuredClone(state.hostFragments),
        terminalEngine: structuredClone(state.terminalSnapshot),
        terminalHost: structuredClone(state.terminalHostSnapshot),
      })
    : null;
  return deepFreeze({
    $schema: EXECUTION_SCHEMA,
    caseId: state.caseRecord.id,
    caseType: state.caseRecord.caseType,
    status,
    actionResults: structuredClone(state.actionResults),
    captures: structuredClone(state.captures),
    bindings: Object.fromEntries([...state.bindings].map(([name, value]) => [name, structuredClone(value)])),
    eventJournal: structuredClone(state.eventJournal),
    eventJournalFailures: structuredClone(state.eventJournalFailures),
    datasetObservations: finalizeDatasetObservations(state),
    hostSeamDelta,
    terminalSnapshot: structuredClone(state.terminalSnapshot),
    terminalSemanticProbe: structuredClone(state.terminalSemanticProbe),
    cleanup: structuredClone(state.cleanup),
    error: failure ? serializeError(failure) : null,
  });
}

function assertEngine(engine, role) {
  assert(isRecord(engine), `${role} engineFactory result must be an object`);
  for (const method of ['on', 'initialize', 'loadDataset', 'publishFrame', 'snapshot', 'destroy']) {
    assert(typeof engine[method] === 'function', `${role} engine must expose ${method}()`);
  }
}

async function captureSemanticProbe(record) {
  if (!record || typeof record.engine.semanticProbe !== 'function') return null;
  let payload;
  try {
    payload = await record.engine.semanticProbe();
  } catch (error) {
    throw new CoreV2SemanticProbeError(
      'SEMANTIC_PROBE_FAILED',
      `${record.role} generation ${record.generation} semanticProbe() failed`,
      error,
    );
  }
  if (payload === undefined) {
    throw new CoreV2SemanticProbeError(
      'SEMANTIC_PROBE_UNDEFINED',
      `${record.role} generation ${record.generation} semanticProbe() returned undefined`,
    );
  }
  try {
    assertJsonEvidenceSafe(payload, `${record.role} semanticProbe()`);
    return deepFreeze(structuredClone(payload));
  } catch (error) {
    throw new CoreV2SemanticProbeError(
      'UNSERIALIZABLE_SEMANTIC_PROBE',
      `${record.role} generation ${record.generation} semanticProbe() returned non-JSON-safe data`,
      error,
    );
  }
}

function assertJsonEvidenceSafe(value, label) {
  validateJsonEvidenceValue(value, label, new WeakSet());
}

function validateJsonEvidenceValue(value, path, ancestors) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) rejectJsonEvidence(path, 'number must be finite');
    if (Object.is(value, -0)) rejectJsonEvidence(path, 'negative zero does not round-trip through JSON');
    return;
  }
  if (typeof value !== 'object') {
    rejectJsonEvidence(path, `${typeof value} values are not supported`);
  }
  if (ancestors.has(value)) rejectJsonEvidence(path, 'cycles are not supported');
  if (Array.isArray(value)) {
    validateJsonEvidenceArray(value, path, ancestors);
    return;
  }
  validateJsonEvidenceRecord(value, path, ancestors);
}

function validateJsonEvidenceArray(value, path, ancestors) {
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    rejectJsonEvidence(path, 'array must use Array.prototype');
  }

  let elementCount = 0;
  ancestors.add(value);
  try {
    for (const key of Reflect.ownKeys(value)) {
      if (key === 'length') continue;
      if (typeof key !== 'string' || !isArrayIndexKey(key, value.length)) {
        rejectJsonEvidence(path, 'array contains a symbol or non-index property');
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
        rejectJsonEvidence(`${path}[${key}]`, 'array elements must be enumerable data properties');
      }
      elementCount += 1;
      validateJsonEvidenceValue(descriptor.value, `${path}[${key}]`, ancestors);
    }
    if (elementCount !== value.length) rejectJsonEvidence(path, 'sparse arrays are not supported');
  } finally {
    ancestors.delete(value);
  }
}

function validateJsonEvidenceRecord(value, path, ancestors) {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    rejectJsonEvidence(path, 'object must be a plain record');
  }

  ancestors.add(value);
  try {
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') rejectJsonEvidence(path, 'symbol properties are not supported');
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
        rejectJsonEvidence(`${path}[${JSON.stringify(key)}]`, 'properties must be enumerable data properties');
      }
      validateJsonEvidenceValue(descriptor.value, `${path}[${JSON.stringify(key)}]`, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

function isArrayIndexKey(key, length) {
  const index = Number(key);
  return Number.isInteger(index) && index >= 0 && index < length && String(index) === key;
}

function rejectJsonEvidence(path, reason) {
  throw new TypeError(`${path} is not JSON-evidence-safe: ${reason}`);
}

class CoreV2EventJournalError extends Error {
  constructor(code, message, cause) {
    super(`${code}: ${message}`, { cause });
    this.name = 'CoreV2EventJournalError';
    this.code = code;
  }
}

class CoreV2SemanticProbeError extends Error {
  constructor(code, message, cause) {
    super(`${code}: ${message}`, { cause });
    this.name = 'CoreV2SemanticProbeError';
    this.code = code;
  }
}

function validateClock(clock) {
  assert(isRecord(clock), 'clock must be an object');
  for (const method of ['now', 'advanceTo', 'withTimeout']) {
    assert(typeof clock[method] === 'function', `clock must expose ${method}()`);
  }
  readClock(clock);
}

function readClock(clock) {
  const value = clock.now();
  assert(Number.isFinite(value), 'clock.now() must be finite');
  return value;
}

function safeSnapshot(engine) {
  if (!engine || typeof engine.snapshot !== 'function') return null;
  try {
    return deepFreeze(structuredClone(engine.snapshot()));
  } catch (error) {
    return deepFreeze({ snapshotError: serializeError(error) });
  }
}

function resourceCounts(snapshot) {
  if (!isRecord(snapshot)) return null;
  return deepFreeze({
    canvasCount: numberOrNull(snapshot.resources?.canvasCount),
    subscriptions: numberOrNull(snapshot.resources?.subscriptions?.active),
    pendingWork: numberOrNull(snapshot.pendingWork),
  });
}

function snapshotHostSeam(state) {
  const resources = hostResourceCounts(state);
  return deepFreeze({
    state: state.hostState?.state ?? null,
    owner: state.hostState?.owner ?? null,
    revision: state.hostState?.revision ?? 0,
    actionIndex: state.hostState?.actionIndex ?? null,
    ownsUi: state.hostState?.owner === 'host',
    resources,
  });
}

function hostResourceCounts(state) {
  const active = state.engineRecords.filter((record) => !record.released);
  const canvasCounts = active.map((record) => numberOrNull(safeSnapshot(record.engine)?.resources?.canvasCount));
  return deepFreeze({
    engineAllocationCount: state.engineRecords.length,
    activeEngineCount: active.length,
    canvasCount: canvasCounts.every((count) => count !== null)
      ? canvasCounts.reduce((total, count) => total + count, 0)
      : null,
  });
}

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function fingerprint(value) {
  const canonical = JSON.stringify(sortKeys(value));
  assert(typeof canonical === 'string', 'fingerprint input must be JSON serializable');
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(canonical)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

function finalizeDatasetObservations(state) {
  return Object.fromEntries([...state.datasetCache].map(([reference, current]) => {
    const baseline = state.datasetBaselines.get(reference);
    assert(baseline !== undefined, `dataset ${reference} baseline is missing`);
    const currentFingerprint = fingerprint(current);
    return [reference, deepFreeze({
      reference,
      beforeFingerprint: baseline.beforeFingerprint,
      currentFingerprint,
      unchanged: baseline.beforeFingerprint === currentFingerprint,
      beforeGraph: structuredClone(baseline.beforeGraph),
      currentGraph: structuredClone(current),
      currentDeeplyFrozen: isDeeplyFrozen(current),
    })];
  }));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
}

function isDeeplyFrozen(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Object.values(value).every((nested) => isDeeplyFrozen(nested, seen));
}

function readPath(value, path, label) {
  assert(typeof path === 'string' && path.length > 0, `${label} path`);
  let cursor = value;
  for (const segment of path.split('.')) {
    assert(isRecord(cursor) || Array.isArray(cursor), `${label} unresolved path ${path}`);
    assert(Object.hasOwn(cursor, segment), `${label} unresolved path ${path}`);
    cursor = cursor[segment];
  }
  return cursor;
}

function assertExactKeys(record, expected, label) {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  assert(actual.length === wanted.length && actual.every((key, index) => key === wanted[index]), `${label} keys`);
}

function serializeError(error) {
  return deepFreeze({
    name: error instanceof Error ? error.name : typeof error,
    code: errorCode(error),
    message: errorMessage(error),
    ...(isRecord(error?.diagnostic) ? { diagnostic: structuredClone(error.diagnostic) } : {}),
  });
}

function errorCode(error) {
  if (isRecord(error?.diagnostic) && typeof error.diagnostic.code === 'string') return error.diagnostic.code;
  if (isRecord(error) && typeof error.code === 'string') return error.code;
  return error instanceof Error && error.name ? error.name : 'UNKNOWN_FAILURE';
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Core v2 execution invalid: ${message}`);
}
