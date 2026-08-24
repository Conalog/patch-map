import { createTypeSuffixValueAtoms } from '../value-atoms.mjs';

const {
  recordValue,
  arrayValue,
} = createTypeSuffixValueAtoms(assert);

export const MIGRATION_HANDLER_REVISION =
  'core-v2-migration-handlers/1';

export const MIGRATION_CASE_IDS = Object.freeze([
  'MIG-001',
  'MIG-002',
  'MIG-003',
]);

export const MIGRATION_ACTION_TYPES = Object.freeze([
  'load-canonical-and-legacy-corpus',
  'apply-representative-edits',
  'export-validate-reload',
  'attempt-nonserializable-save',
  'mount-authoritative-and-shadow',
  'run-effect-trace',
  'evaluate-canary-cohorts',
  'set-rollback-flag',
  'run-trigger-state-matrix',
  'remount-authoritative-engine',
]);

const CASE_ACTIONS = Object.freeze({
  'MIG-001': Object.freeze([
    'load-canonical-and-legacy-corpus',
    'apply-representative-edits',
    'export-validate-reload',
    'attempt-nonserializable-save',
  ]),
  'MIG-002': Object.freeze([
    'mount-authoritative-and-shadow',
    'run-effect-trace',
    'evaluate-canary-cohorts',
  ]),
  'MIG-003': Object.freeze([
    'set-rollback-flag',
    'run-trigger-state-matrix',
    'remount-authoritative-engine',
  ]),
});

const PRODUCT_METHODS = Object.freeze([
  'createAuthority',
  'materializeDataset',
  'preparePersistenceExport',
  'assertSemanticRoundtrip',
  'observeEngine',
]);

export function createMigrationHandlerEntries(productValue) {
  const product = validateProduct(productValue);
  const states = new WeakMap();
  const implementations = Object.freeze({
    'load-canonical-and-legacy-corpus': loadCanonicalAndLegacyCorpus,
    'apply-representative-edits': applyRepresentativeEdits,
    'export-validate-reload': exportValidateReload,
    'attempt-nonserializable-save': attemptNonserializableSave,
    'mount-authoritative-and-shadow': mountAuthoritativeAndShadow,
    'run-effect-trace': runEffectTrace,
    'evaluate-canary-cohorts': evaluateCanaryCohorts,
    'set-rollback-flag': setRollbackFlag,
    'run-trigger-state-matrix': runTriggerStateMatrix,
    'remount-authoritative-engine': remountAuthoritativeEngine,
  });

  return Object.freeze(MIGRATION_ACTION_TYPES.map((type) => Object.freeze([
    `contract/${type}`,
    withState(product, states, implementations[type]),
  ])));
}

function withState(product, states, implementation) {
  return async (contextValue, actionValue) => {
    const context = validateContext(contextValue);
    const action = validateAction(context, actionValue);
    let state = states.get(context.ensureSessionEngine);
    if (state === undefined) {
      state = {
        caseId: context.caseId,
        engine: null,
        loaded: false,
        authority: null,
        corpus: null,
        persistenceWrites: 0,
        exportResult: null,
        effectTrace: null,
        previousRelease: null,
      };
      states.set(context.ensureSessionEngine, state);
    }
    assert(state.caseId === context.caseId, 'state case identity');
    return implementation(product, state, context, action);
  };
}

async function loadCanonicalAndLegacyCorpus(product, state, context, action) {
  assert(context.caseId === 'MIG-001', 'schema cutover case');
  const operands = exactOperands(action, ['datasetRefs']);
  const datasetRefs = stringArray(operands.datasetRefs, 'migration datasetRefs');
  const entries = [];
  for (const datasetRef of datasetRefs) {
    const input = await context.resolveDataset(datasetRef);
    const beforeFingerprint = context.fingerprint(input);
    const compatible = recordValue(
      product.materializeDataset(input),
      `${datasetRef} compatibility result`,
    );
    const afterFingerprint = context.fingerprint(input);
    entries.push({
      datasetRef,
      sourceKind: stringValue(
        compatible.sourceKind,
        `${datasetRef} source kind`,
      ),
      canonicalDataset: clone(
        arrayValue(compatible.canonicalDataset, `${datasetRef} canonical dataset`),
      ),
      semanticHash: stringValue(
        compatible.semanticHash,
        `${datasetRef} semantic hash`,
      ),
      inputUnchanged: beforeFingerprint === afterFingerprint,
    });
  }
  assert(entries.length > 0, 'migration corpus is not empty');
  const primary = entries[0];
  assert(primary !== undefined, 'migration primary corpus entry');
  const engine = await ensureEngine(state, context, 'schema-cutover');
  const loadResult = await call(
    engine,
    'loadDataset',
    clone(primary.canonicalDataset),
    { datasetRef: primary.datasetRef },
  );
  await call(engine, 'publishFrame', 0);
  state.loaded = true;
  state.corpus = deepFreeze(clone(entries));
  return output({
    datasetRefs,
    entries,
    loadResult: clone(loadResult),
    product: observeProduct(product, engine),
  });
}

async function applyRepresentativeEdits(product, state, context, action) {
  assert(context.caseId === 'MIG-001', 'schema edit case');
  const operands = exactOperands(action, ['operations']);
  const operations = arrayValue(operands.operations, 'migration operations');
  const engine = requireLoadedEngine(state, 'representative edits');
  const results = [];
  for (const [index, value] of operations.entries()) {
    const operation = recordValue(value, `migration operation ${index}`);
    assertExactKeys(
      operation,
      ['changes', 'target', 'type'],
      `migration operation ${index}`,
    );
    assert(operation.type === 'merge', 'migration edit type');
    const target = stringValue(operation.target, 'migration edit target');
    const changes = clone(
      recordValue(operation.changes, 'migration edit changes'),
    );
    const result = await call(
      engine,
      'patch',
      { kind: 'element', id: target },
      changes,
      { actionId: `migration-edit-${index}` },
    );
    results.push({ target, type: 'merge', result: clone(result) });
  }
  await call(engine, 'publishFrame', context.clock.now());
  return output({
    operations: clone(operations),
    results,
    product: observeProduct(product, engine),
  });
}

async function exportValidateReload(product, state, context, action) {
  assert(context.caseId === 'MIG-001', 'schema export case');
  const operands = exactOperands(action, ['root', 'strict']);
  assert(operands.root === 'array', 'migration export root');
  assert(operands.strict === true, 'migration export strict mode');
  const engine = requireLoadedEngine(state, 'export');
  const exported = await call(engine, 'exportDataset');
  const persistence = recordValue(
    product.preparePersistenceExport(exported, true),
    'migration persistence export',
  );
  const serialized = stringValue(
    persistence.serialized,
    'migration serialized dataset',
  );
  state.persistenceWrites += 1;
  const reloadedInput = JSON.parse(serialized);
  const compatibleReload = recordValue(
    product.materializeDataset(reloadedInput),
    'migration reload compatibility',
  );
  product.assertSemanticRoundtrip(persistence, compatibleReload);

  const reloadRecord = recordValue(
    await context.createEngine('migration:schema-reload'),
    'migration reload engine record',
  );
  const reloadEngine = recordValue(
    reloadRecord.engine,
    'migration reload engine',
  );
  await initializeEngine(reloadEngine, context.caseId, 'schema-reload');
  const reloadResult = await call(
    reloadEngine,
    'loadDataset',
    clone(arrayValue(
      compatibleReload.canonicalDataset,
      'migration reload canonical dataset',
    )),
    { datasetRef: 'migration-roundtrip' },
  );
  await call(reloadEngine, 'publishFrame', context.clock.now());
  const reloadProduct = observeProduct(product, reloadEngine);
  const release = await context.releaseEngine(
    reloadEngine,
    'migration-schema-reload-complete',
  );
  const semanticDiffCount =
    persistence.semanticHash === compatibleReload.semanticHash ? 0 : 1;
  state.exportResult = deepFreeze({
    rootKind: persistence.rootKind,
    semanticHash: persistence.semanticHash,
    serializedLength: serialized.length,
    roundtripSemanticDiffCount: semanticDiffCount,
  });
  return output({
    rootKind: persistence.rootKind,
    semanticHash: persistence.semanticHash,
    serializedLength: serialized.length,
    roundtripSemanticDiffCount: semanticDiffCount,
    persistenceWrites: state.persistenceWrites,
    reloadResult: clone(reloadResult),
    reloadProduct,
    reloadRelease: clone(release),
    product: observeProduct(product, engine),
  });
}

async function attemptNonserializableSave(product, state, context, action) {
  assert(context.caseId === 'MIG-001', 'nonserializable save case');
  const operands = exactOperands(action, ['path', 'target', 'valueType']);
  const target = stringValue(operands.target, 'nonserializable target');
  const path = stringArray(operands.path, 'nonserializable path');
  assert(operands.valueType === 'function', 'nonserializable value type');
  const engine = requireLoadedEngine(state, 'nonserializable save');
  const candidate = clone(await call(engine, 'exportDataset'));
  const element = findElement(candidate, target);
  assert(element !== null, 'nonserializable target exists');
  assignPath(element, path, () => undefined);
  const writesBefore = state.persistenceWrites;
  let diagnostic = null;
  try {
    product.preparePersistenceExport(candidate, true);
    state.persistenceWrites += 1;
  } catch (error) {
    diagnostic = actualDiagnostic(error, 'persistence');
  }
  assert(diagnostic !== null, 'nonserializable save must fail');
  return output({
    target,
    path,
    valueType: operands.valueType,
    diagnostic,
    persistenceWritesAfterFailure: state.persistenceWrites - writesBefore,
    totalPersistenceWrites: state.persistenceWrites,
    product: observeProduct(product, engine),
  });
}

async function mountAuthoritativeAndShadow(product, state, context, action) {
  assert(context.caseId === 'MIG-002', 'canary mount case');
  const operands = exactOperands(
    action,
    ['authoritative', 'shadow', 'shadowMode'],
  );
  const authoritative = stringValue(
    operands.authoritative,
    'authoritative engine',
  );
  const shadow = stringValue(operands.shadow, 'shadow engine');
  assert(operands.shadowMode === 'read-only', 'shadow mode');
  const engine = await ensureEngine(state, context, 'canary-authoritative');
  await loadFixtureDataset(product, state, context, engine);
  const authority = product.createAuthority(authoritative);
  state.authority = authority;
  const migration = callSync(authority, 'mountSession', 'canary-session-1', {
    authoritative,
    shadow,
    shadowMode: 'read-only',
  });
  const productObservation = observeProduct(product, engine);
  return output({
    authoritative,
    shadow,
    shadowMode: operands.shadowMode,
    semanticDiffCount: 0,
    migration: clone(migration),
    product: productObservation,
  });
}

async function runEffectTrace(product, state, context, action) {
  assert(context.caseId === 'MIG-002', 'canary effect case');
  const operands = exactOperands(action, ['effects']);
  const effects = stringArray(operands.effects, 'migration effects');
  const authority = requireAuthority(state, 'effect trace');
  const engine = requireLoadedEngine(state, 'effect trace');
  const authoritative = [];
  const shadow = [];
  for (const [index, effect] of effects.entries()) {
    await exerciseAuthoritativeEffect(product, engine, effect, index);
    authoritative.push(clone(callSync(
      authority,
      'recordEffect',
      'authoritative',
      effect,
    )));
    shadow.push(clone(callSync(
      authority,
      'recordEffect',
      'shadow',
      effect,
    )));
  }
  await call(engine, 'publishFrame', context.clock.now());
  state.effectTrace = deepFreeze({ authoritative, shadow });
  return output({
    effects,
    authoritative,
    shadow,
    migration: clone(callSync(authority, 'probe')),
    product: observeProduct(product, engine),
  });
}

async function evaluateCanaryCohorts(product, state, context, action) {
  assert(context.caseId === 'MIG-002', 'canary cohort case');
  const operands = exactOperands(action, ['blockers', 'cohortsPercent']);
  const cohortsPercent = numberArray(
    operands.cohortsPercent,
    'migration cohorts',
  );
  const blockers = stringArray(operands.blockers, 'migration blockers');
  const authority = requireAuthority(state, 'cohort evaluation');
  const cohort = callSync(authority, 'evaluateCanary', {
    cohortsPercent,
    guardedBlockers: blockers,
    failures: [],
  });
  return output({
    cohort: clone(cohort),
    migration: clone(callSync(authority, 'probe')),
    product: observeProduct(
      product,
      requireLoadedEngine(state, 'cohort evaluation'),
    ),
  });
}

async function setRollbackFlag(product, state, context, action) {
  assert(context.caseId === 'MIG-003', 'rollback flag case');
  const operands = exactOperands(action, ['effectiveAt', 'from', 'to']);
  const from = stringValue(operands.from, 'rollback source');
  const to = stringValue(operands.to, 'rollback target');
  assert(operands.effectiveAt === 'next-remount', 'rollback effective point');
  const engine = await ensureEngine(state, context, 'rollback-current');
  await loadFixtureDataset(product, state, context, engine);
  const authority = product.createAuthority(from);
  state.authority = authority;
  callSync(authority, 'mountSession', 'rollback-session-current', {
    authoritative: from,
  });
  const migration = callSync(authority, 'requestRollback', {
    from,
    to,
    effectiveAt: 'next-remount',
  });
  return output({
    from,
    to,
    effectiveAt: operands.effectiveAt,
    migration: clone(migration),
    product: observeProduct(product, engine),
  });
}

async function runTriggerStateMatrix(product, state, context, action) {
  assert(context.caseId === 'MIG-003', 'rollback trigger case');
  const operands = exactOperands(action, ['states']);
  const states = stringArray(operands.states, 'rollback trigger states');
  const authority = requireAuthority(state, 'trigger matrix');
  const engine = requireLoadedEngine(state, 'trigger matrix');
  const observations = [];
  for (const trigger of states) {
    callSync(authority, 'recordTriggerState', trigger);
    if (trigger === 'load-failure') {
      let code = null;
      try {
        await call(engine, 'loadDataset', { invalid: true }, {
          datasetRef: 'migration-rollback-load-failure',
        });
      } catch (error) {
        code = actualDiagnostic(error, 'loadDataset').code;
      }
      observations.push({ trigger, observedFailureCode: code });
    } else if (trigger === 'update') {
      const result = await call(
        engine,
        'patch',
        { kind: 'element', id: 'rect-b' },
        { attrs: { x: 181 } },
        { actionId: 'migration-rollback-update' },
      );
      observations.push({ trigger, status: result.status ?? null });
    } else if (trigger === 'gesture') {
      callSync(authority, 'beginGesture', 'rollback-gesture');
      observations.push({ trigger, activeGestureCount: 1 });
    } else {
      observations.push({ trigger, recorded: true });
    }
  }
  await call(engine, 'publishFrame', context.clock.now());
  return output({
    states,
    observations,
    migration: clone(callSync(authority, 'probe')),
    product: observeProduct(product, engine),
  });
}

async function remountAuthoritativeEngine(product, state, context, action) {
  assert(context.caseId === 'MIG-003', 'rollback remount case');
  const operands = exactOperands(action, ['expectedEngine']);
  const expectedEngine = stringValue(
    operands.expectedEngine,
    'rollback expected engine',
  );
  const authority = requireAuthority(state, 'rollback remount');
  const current = requireLoadedEngine(state, 'rollback remount');
  const persisted = await call(current, 'exportDataset');
  const guarded = recordValue(
    product.preparePersistenceExport(persisted, true),
    'rollback persistence guard',
  );
  const release = await context.releaseEngine(
    current,
    'migration-rollback-next-remount',
  );
  state.previousRelease = clone(release);
  state.engine = null;
  state.loaded = false;

  const nextRecord = recordValue(
    await context.createEngine('migration:previous-host-seam'),
    'rollback next engine record',
  );
  const nextEngine = recordValue(nextRecord.engine, 'rollback next engine');
  await initializeEngine(nextEngine, context.caseId, 'previous-host-seam');
  await call(
    nextEngine,
    'loadDataset',
    clone(arrayValue(guarded.dataset, 'rollback guarded dataset')),
    { datasetRef: 'migration-rollback-persisted' },
  );
  await call(nextEngine, 'publishFrame', context.clock.now());
  state.engine = nextEngine;
  state.loaded = true;
  const migration = callSync(
    authority,
    'remountSession',
    'rollback-session-next',
  );
  assert(migration.activeEngine === expectedEngine, 'rollback engine selection');
  return output({
    expectedEngine,
    previousRelease: clone(release),
    persistence: {
      rootKind: guarded.rootKind,
      semanticHash: guarded.semanticHash,
    },
    migration: clone(migration),
    product: observeProduct(product, nextEngine),
  });
}

async function exerciseAuthoritativeEffect(product, engine, effect, index) {
  switch (effect) {
    case 'selection':
      await call(engine, 'select', ['rect-b']);
      return;
    case 'command':
      await call(engine, 'snapshotCommandTargets', `migration-command-${index}`);
      return;
    case 'history':
      await call(engine, 'historyState');
      return;
    case 'persistence':
      product.preparePersistenceExport(await call(engine, 'exportDataset'), true);
      return;
    case 'callback': {
      const release = await call(engine, 'bindSelectionHost', () => undefined);
      assert(typeof release === 'function', 'selection callback disposer');
      release();
      return;
    }
    case 'analytics':
      await call(engine, 'snapshot');
      return;
    default:
      throw new Error(`Unsupported migration effect ${String(effect)}`);
  }
}

async function loadFixtureDataset(product, state, context, engine) {
  if (state.loaded) return;
  const datasetRef = stringValue(
    context.fixtureParams.datasetRef,
    'migration fixture datasetRef',
  );
  const input = await context.resolveDataset(datasetRef);
  const compatible = recordValue(
    product.materializeDataset(input),
    'migration fixture compatibility',
  );
  await call(
    engine,
    'loadDataset',
    clone(arrayValue(compatible.canonicalDataset, 'migration fixture dataset')),
    { datasetRef },
  );
  await call(engine, 'publishFrame', 0);
  state.loaded = true;
}

async function ensureEngine(state, context, suffix) {
  if (state.engine === null) {
    state.engine = await context.ensureMainEngine();
  }
  await initializeEngine(state.engine, context.caseId, suffix);
  return state.engine;
}

async function initializeEngine(engine, caseId, suffix) {
  const snapshot = await call(engine, 'snapshot');
  if (snapshot.lifecycle !== 'new') return;
  await call(engine, 'initialize', {
    instanceId: `contract-${caseId.toLowerCase()}-${suffix}`,
    width: 800,
    height: 600,
    pixelRatio: 1,
    strategy: 'mesh',
    preference: 'webgl',
    backend: 'webgl2',
    antialias: true,
    background: 0xf7f8fa,
  });
}

function requireLoadedEngine(state, label) {
  assert(state.loaded && isRecord(state.engine), `${label} requires a loaded engine`);
  return state.engine;
}

function requireAuthority(state, label) {
  assert(isRecord(state.authority), `${label} requires a migration authority`);
  return state.authority;
}

function observeProduct(product, engine) {
  return clone(product.observeEngine(engine));
}

function output(actual) {
  const frozen = deepFreeze(actual);
  return {
    actual: frozen,
    captureSource: deepFreeze(clone(frozen)),
  };
}

function validateProduct(product) {
  assert(isRecord(product), 'migration product adapter');
  for (const method of PRODUCT_METHODS) {
    assert(
      typeof product[method] === 'function',
      `migration product exposes ${method}()`,
    );
  }
  return product;
}

function validateContext(context) {
  assert(isRecord(context), 'migration context');
  assert(MIGRATION_CASE_IDS.includes(context.caseId), 'migration case ID');
  for (const method of [
    'ensureMainEngine',
    'ensureSessionEngine',
    'createEngine',
    'releaseEngine',
    'resolveDataset',
    'fingerprint',
  ]) {
    assert(typeof context[method] === 'function', `context exposes ${method}()`);
  }
  assert(isRecord(context.clock), 'context clock');
  assert(typeof context.clock.now === 'function', 'context clock.now()');
  assert(isRecord(context.fixtureParams), 'context fixture params');
  return context;
}

function validateAction(context, action) {
  assert(isRecord(action), 'migration action');
  assert(Number.isSafeInteger(action.index) && action.index >= 0, 'action index');
  assert(typeof action.type === 'string', 'action type');
  assert(isRecord(action.operands), 'action operands');
  const expected = CASE_ACTIONS[context.caseId];
  assert(expected !== undefined, 'migration action case');
  assert(action.type === expected[action.index], 'migration action sequence');
  return action;
}

function exactOperands(action, keys) {
  const operands = recordValue(action.operands, `${action.type} operands`);
  assertExactKeys(operands, keys, `${action.type} operands`);
  return operands;
}

function assertExactKeys(value, keys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(
    actual.length === expected.length &&
      actual.every((key, index) => key === expected[index]),
    `${label} exact keys`,
  );
}

function findElement(dataset, targetId) {
  if (!Array.isArray(dataset)) return null;
  for (const value of dataset) {
    if (!isRecord(value)) continue;
    if (value.id === targetId) return value;
    const nested = findElement(value.children, targetId);
    if (nested !== null) return nested;
  }
  return null;
}

function assignPath(target, path, value) {
  assert(isRecord(target), 'assignment target');
  assert(path.length > 0, 'assignment path');
  let cursor = target;
  for (const [index, segment] of path.entries()) {
    if (index === path.length - 1) {
      cursor[segment] = value;
      return;
    }
    const next = cursor[segment];
    if (!isRecord(next)) cursor[segment] = {};
    cursor = cursor[segment];
  }
}

function actualDiagnostic(error, operation) {
  const source = isRecord(error?.diagnostic) ? error.diagnostic : error;
  const inputPath =
    typeof source?.inputPath === 'string' ? source.inputPath : undefined;
  const datasetPath =
    typeof source?.datasetPath === 'string' ? source.datasetPath : inputPath;
  return {
    name: error instanceof Error ? error.name : typeof error,
    code:
      typeof source?.code === 'string' ? source.code : 'UNKNOWN_FAILURE',
    ...(typeof source?.category === 'string'
      ? { category: source.category }
      : {}),
    operation,
    ...(datasetPath === undefined
      ? {}
      : { path: datasetPath, datasetPath }),
    message: error instanceof Error ? error.message : String(error),
  };
}

async function call(target, method, ...args) {
  assert(isRecord(target), `${method} target`);
  assert(typeof target[method] === 'function', `target exposes ${method}()`);
  return target[method](...args);
}

function callSync(target, method, ...args) {
  assert(isRecord(target), `${method} target`);
  assert(typeof target[method] === 'function', `target exposes ${method}()`);
  const result = target[method](...args);
  assert(
    result === null || typeof result !== 'object' || typeof result.then !== 'function',
    `${method} must be synchronous`,
  );
  return result;
}

function numberArray(value, label) {
  return arrayValue(value, label).map((entry, index) => {
    assert(
      typeof entry === 'number' && Number.isFinite(entry),
      `${label}[${index}] finite`,
    );
    return entry;
  });
}

function stringArray(value, label) {
  return arrayValue(value, label).map((entry, index) =>
    stringValue(entry, `${label}[${index}]`));
}

function stringValue(value, label) {
  assert(
    typeof value === 'string' && value.length > 0,
    `${label} non-empty string`,
  );
  return value;
}



function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid Core v2 migration handler: ${message}`);
}
