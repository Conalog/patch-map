import { clone, deepFreeze } from '../value-atoms.mjs';

export const RENDER_TEXT_HANDLER_REVISION = 'patch-map-render-text-handlers/1';

export const RENDER_TEXT_CASE_IDS = Object.freeze(['REN-006', 'REN-011']);

export const RENDER_TEXT_ACTION_TYPES = Object.freeze([
  'loadDataset',
  'snapshot-observation',
  'patch',
  'publishFrame',
  'observeItemTextMatrix',
]);

const STANDALONE_TARGETS = Object.freeze([
  textTarget('text'),
  textTarget('empty-text'),
  textTarget('long-text'),
  textTarget('missing-font'),
  textTarget('rapid-text'),
]);

const ITEM_TARGETS = Object.freeze([
  componentTextTarget('item-a', 'zero'),
  componentTextTarget('item-a', 'positive'),
  componentTextTarget('item-a', 'bidi'),
]);

const SUPPLEMENTAL_IDS = Object.freeze([
  'placed',
  'auto',
  'wrap',
  'overflow-visible',
  'overflow-hidden',
  'overflow-ellipsis',
  'upright',
]);

const CASES = Object.freeze({
  'REN-006': Object.freeze({
    datasetRef: 'standalone-text',
    targets: STANDALONE_TARGETS,
    trace: Object.freeze([
      traceAction('loadDataset', { datasetId: 'standalone-text' }),
      traceAction('snapshot-observation', { label: 'initial-text' }),
      traceAction('patch', {
        targetId: 'text',
        changes: { text: 'مرحبا world' },
      }),
      traceAction('patch', {
        targetId: 'rapid-text',
        changes: { text: 'intermediate' },
      }),
      traceAction('patch', {
        targetId: 'rapid-text',
        changes: { text: 'final中' },
      }),
      traceAction('publishFrame', { timeMs: 16.666667 }),
    ]),
  }),
  'REN-011': Object.freeze({
    datasetRef: 'item-text-corpus',
    targets: ITEM_TARGETS,
    trace: Object.freeze([
      traceAction('loadDataset', { datasetRef: 'item-text-corpus' }),
      traceAction('observeItemTextMatrix', { valueRef: 'itemTextContractMatrix' }),
      traceAction('patch', {
        target: { ownerId: 'item-a', id: 'bidi' },
        changes: { text: '中😀é\nمرحبا' },
      }),
      traceAction('publishFrame', { timeMs: 16.666667 }),
    ]),
  }),
});

/**
 * Browser-safe, expected-blind REN-006 / REN-011 product handlers.
 *
 * The adapter owns only independently authored supplemental specimens and a
 * sanitized resource probe. Text content, layout, geometry, paint, renderer
 * publication, and revisions are observed exclusively through public Engine
 * methods. The approved item-text result matrix is never passed to the adapter
 * and none of its rows are read by this module.
 */
export function createRenderTextHandlerEntries(product) {
  const adapter = validateProductAdapter(product);
  const states = new WeakMap();
  const handlers = Object.freeze({
    loadDataset: withState(adapter, states, loadDatasetAction),
    'snapshot-observation': withState(adapter, states, snapshotObservationAction),
    patch: withState(adapter, states, patchAction),
    publishFrame: withState(adapter, states, publishFrameAction),
    observeItemTextMatrix: withState(adapter, states, observeItemTextMatrixAction),
  });
  return Object.freeze(RENDER_TEXT_ACTION_TYPES.map((type) => Object.freeze([
    `contract/${type}`,
    handlers[type],
  ])));
}

function withState(adapter, states, handler) {
  return async (contextValue, actionValue) => {
    const context = validateContext(contextValue);
    const definition = CASES[context.caseId];
    assert(definition !== undefined, `unsupported case ${String(context.caseId)}`);
    assert(Number.isInteger(context.actionIndex), 'context actionIndex');
    const canonical = definition.trace[context.actionIndex];
    assert(canonical !== undefined, `${context.caseId} action ${context.actionIndex}`);
    const action = recordValue(actionValue, 'action record');
    assertExactKeys(action, ['index', 'operands', 'type'], 'action record');
    assert(action.index === context.actionIndex, `${context.caseId} action index`);
    assert(action.type === canonical.type, `${context.caseId} action type`);
    assert(
      sameJson(action.operands, canonical.operands),
      `${context.caseId} action ${context.actionIndex} operands`,
    );
    validateFixtureParams(context.caseId, context.fixtureParams);
    validateRouteParams(context.routeParams);
    assert(!context.signal.aborted, 'action is aborted');

    let state = states.get(context.resolveDataset);
    if (state === undefined) {
      state = {
        caseId: context.caseId,
        engine: null,
        dataset: null,
        datasetRef: null,
        inputFingerprint: null,
      };
      states.set(context.resolveDataset, state);
    }
    assert(state.caseId === context.caseId, 'execution state case identity');
    return handler(adapter, state, context, action, definition);
  };
}

async function loadDatasetAction(adapter, state, context, action, definition) {
  const operandKey = context.caseId === 'REN-006' ? 'datasetId' : 'datasetRef';
  const operands = exactOperands(action, [operandKey]);
  const datasetRef = stringValue(operands[operandKey], `loadDataset.${operandKey}`);
  assert(datasetRef === definition.datasetRef, `${context.caseId} dataset identity`);
  assert(state.engine === null && state.dataset === null, `${context.caseId} dataset loads once`);

  const engine = await ensureInitializedEngine(context, 'main');
  const dataset = await context.resolveDataset(datasetRef);
  const beforeFingerprint = context.fingerprint(dataset);
  state.engine = engine;
  state.dataset = dataset;
  state.datasetRef = datasetRef;
  state.inputFingerprint = beforeFingerprint;
  const loaded = await call(engine, 'loadDataset', dataset, { datasetRef });
  await publish(engine, context);
  const product = observeProduct(engine, adapter, context.caseId, definition.targets);
  return {
    actual: {
      caseId: context.caseId,
      datasetRef,
      loaded: clone(loaded),
      input: inputEvidence(state, context),
      product,
    },
  };
}

async function snapshotObservationAction(adapter, state, context, action, definition) {
  assert(context.caseId === 'REN-006', 'snapshot-observation case');
  const operands = exactOperands(action, ['label']);
  const label = stringValue(operands.label, 'snapshot-observation.label');
  const engine = currentEngine(state, 'snapshot-observation');
  return {
    actual: {
      label,
      input: inputEvidence(state, context),
      product: observeProduct(engine, adapter, context.caseId, definition.targets),
    },
  };
}

async function patchAction(adapter, state, context, action, _definition) {
  const engine = currentEngine(state, 'patch');
  const normalized = normalizePatchAction(context.caseId, action);
  const before = observeProduct(
    engine,
    adapter,
    context.caseId,
    Object.freeze([normalized.target]),
  );
  const mutation = await call(engine, 'patch', clone(normalized.target), clone(normalized.changes));
  const result = recordValue(mutation, 'patch result');
  assert(result.status === 'committed', 'patch must commit');
  assert(result.changed === true, 'patch must change product state');

  // The primary REN-006 edit publishes immediately. The two rapid replacement
  // edits and the REN-011 bidi edit intentionally remain pending until the
  // canonical publishFrame action.
  const publishTriggered = context.caseId === 'REN-006' && context.actionIndex === 2;
  if (publishTriggered) await publish(engine, context);
  const after = observeProduct(
    engine,
    adapter,
    context.caseId,
    Object.freeze([normalized.target]),
  );
  return {
    actual: {
      target: clone(normalized.target),
      changes: clone(normalized.changes),
      mutation: clone(result),
      publishTriggered,
      input: inputEvidence(state, context),
      before,
      after,
    },
  };
}

async function publishFrameAction(adapter, state, context, action, definition) {
  const operands = exactOperands(action, ['timeMs']);
  const timeMs = finiteNumber(operands.timeMs, 'publishFrame.timeMs');
  const engine = currentEngine(state, 'publishFrame');
  const before = observeProduct(engine, adapter, context.caseId, definition.targets);
  await advanceClock(context, timeMs);
  await publish(engine, context);
  const after = observeProduct(engine, adapter, context.caseId, definition.targets);
  const actual = {
    timeMs,
    input: inputEvidence(state, context),
    before,
    after,
  };
  if (context.caseId !== 'REN-006') return { actual };
  const primary = textProbeEntry(after, 'text');
  return {
    actual,
    captureSource: {
      worldBounds: boundsObject(
        recordValue(primary.probe.geometry, 'primary geometry').worldBounds,
        'primary world bounds',
      ),
    },
  };
}

async function observeItemTextMatrixAction(adapter, state, context, action, definition) {
  assert(context.caseId === 'REN-011', 'observeItemTextMatrix case');
  const operands = exactOperands(action, ['valueRef']);
  const valueRef = stringValue(operands.valueRef, 'observeItemTextMatrix.valueRef');
  assert(valueRef === 'itemTextContractMatrix', 'observeItemTextMatrix valueRef');
  const mainEngine = currentEngine(state, 'observeItemTextMatrix');
  const canonical = observeProduct(
    mainEngine,
    adapter,
    context.caseId,
    definition.targets,
  );
  const canonicalDataset = clone(state.dataset);
  const canonicalDatasetRef = stringValue(state.datasetRef, 'canonical datasetRef');
  const canonicalFingerprint = context.fingerprint(canonicalDataset);
  assert(
    canonicalFingerprint === state.inputFingerprint,
    'canonical dataset must match the immutable input baseline',
  );

  const specimens = validateSupplementalSpecimens(adapter.createSupplementalSpecimens());
  const observations = [];
  let observationFailure = null;
  try {
    for (const specimen of specimens) {
      assert(!context.signal.aborted, 'action is aborted');
      const dataset = clone(specimen.dataset);
      const authored = supplementalAuthoredFacts(specimen);
      const beforeFingerprint = context.fingerprint(dataset);
      const loaded = await call(
        mainEngine,
        'loadDataset',
        dataset,
        { datasetRef: specimen.datasetId },
      );
      await publish(mainEngine, context);
      const product = observeProduct(
        mainEngine,
        adapter,
        context.caseId,
        Object.freeze([specimen.target]),
      );
      const afterFingerprint = context.fingerprint(dataset);
      observations.push({
        id: specimen.id,
        datasetId: specimen.datasetId,
        target: clone(specimen.target),
        authored: clone(authored),
        loaded: clone(loaded),
        input: {
          beforeFingerprint,
          afterFingerprint,
          unchanged: beforeFingerprint === afterFingerprint,
        },
        product,
      });
    }
  } catch (error) {
    observationFailure = error;
  }

  let restorationFailure = null;
  try {
    await restoreCanonicalDataset(
      mainEngine,
      state,
      context,
      canonicalDataset,
      canonicalDatasetRef,
      canonicalFingerprint,
    );
  } catch (error) {
    restorationFailure = error;
  }

  if (observationFailure !== null && restorationFailure !== null) {
    throw combinedObservationAndRestorationFailure(observationFailure, restorationFailure);
  }
  if (observationFailure !== null) throw observationFailure;
  if (restorationFailure !== null) throw restorationFailure;

  return {
    actual: {
      valueRef,
      input: inputEvidence(state, context),
      canonical,
      supplemental: observations,
      resources: observeResources(adapter, context.caseId),
    },
  };
}

function supplementalAuthoredFacts(specimen) {
  const owner = recordValue(specimen.dataset[0], `${specimen.id} authored owner`);
  assert(owner.type === 'item', `${specimen.id} authored owner type`);
  assert(owner.id === specimen.target.ownerId, `${specimen.id} authored owner identity`);
  assert(Array.isArray(owner.components), `${specimen.id} authored components`);
  const matches = owner.components.filter((component) => (
    isRecord(component) && component.type === 'text' && component.id === specimen.id
  ));
  assert(matches.length === 1, `${specimen.id} authored component identity`);
  const component = recordValue(matches[0], `${specimen.id} authored component`);
  const style = recordValue(component.style, `${specimen.id} authored style`);
  const size = recordValue(owner.size, `${specimen.id} authored size`);
  const autoFont = style.autoFont === undefined
    ? null
    : authoredAutoFont(style.autoFont, `${specimen.id} authored autoFont`);
  const attrs = owner.attrs === undefined
    ? null
    : recordValue(owner.attrs, `${specimen.id} authored attrs`);
  return deepFreeze({
    revision: 'patch-map-render-text-authored-facts/1',
    datasetId: specimen.datasetId,
    ownerId: specimen.target.ownerId,
    componentId: specimen.id,
    source: textValue(component.text, `${specimen.id} authored source`),
    frame: [
      finiteNumber(size.width, `${specimen.id} authored width`),
      finiteNumber(size.height, `${specimen.id} authored height`),
    ],
    metrics: {
      fontFamily: stringValue(style.fontFamily, `${specimen.id} authored fontFamily`),
      fontSize: finiteNumber(style.fontSize, `${specimen.id} authored fontSize`),
      lineHeight: finiteNumber(style.lineHeight, `${specimen.id} authored lineHeight`),
      letterSpacing: finiteNumber(
        style.letterSpacing,
        `${specimen.id} authored letterSpacing`,
      ),
    },
    placement: optionalString(component.placement, `${specimen.id} authored placement`),
    margin: authoredEdges(component.margin, `${specimen.id} authored margin`),
    tint: optionalString(component.tint, `${specimen.id} authored tint`),
    autoFont,
    wrap: {
      enabled: optionalBoolean(style.wordWrap, `${specimen.id} authored wordWrap`),
      breakWords: optionalBoolean(style.breakWords, `${specimen.id} authored breakWords`),
      width: optionalFiniteNumber(
        style.wordWrapWidth,
        `${specimen.id} authored wordWrapWidth`,
      ),
    },
    overflow: optionalString(style.overflow, `${specimen.id} authored overflow`),
    itemAngle: attrs === null
      ? null
      : optionalFiniteNumber(attrs.angle, `${specimen.id} authored angle`),
    orientation: optionalString(
      owner.contentOrientation,
      `${specimen.id} authored orientation`,
    ),
  });
}

function authoredAutoFont(value, label) {
  const autoFont = recordValue(value, label);
  assertExactKeys(autoFont, ['max', 'min'], label);
  return {
    min: finiteNumber(autoFont.min, `${label}.min`),
    max: finiteNumber(autoFont.max, `${label}.max`),
  };
}

function authoredEdges(value, label) {
  if (value === undefined || value === null) {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  if (typeof value === 'number') {
    const edge = finiteNumber(value, label);
    return { top: edge, right: edge, bottom: edge, left: edge };
  }
  const edges = recordValue(value, label);
  assertExactKeys(edges, ['bottom', 'left', 'right', 'top'], label);
  return {
    top: finiteNumber(edges.top, `${label}.top`),
    right: finiteNumber(edges.right, `${label}.right`),
    bottom: finiteNumber(edges.bottom, `${label}.bottom`),
    left: finiteNumber(edges.left, `${label}.left`),
  };
}

function optionalString(value, label) {
  return value === undefined || value === null ? null : stringValue(value, label);
}

function optionalBoolean(value, label) {
  if (value === undefined || value === null) return false;
  assert(typeof value === 'boolean', `${label} must be boolean`);
  return value;
}

function optionalFiniteNumber(value, label) {
  return value === undefined || value === null ? null : finiteNumber(value, label);
}

function textValue(value, label) {
  assert(typeof value === 'string', `${label} must be a string`);
  return value;
}

async function restoreCanonicalDataset(
  mainEngine,
  state,
  context,
  canonicalDataset,
  canonicalDatasetRef,
  canonicalFingerprint,
) {
  const authoritativeEngine = await context.ensureMainEngine();
  assert(authoritativeEngine === mainEngine, 'main engine authority restoration');
  assert(currentEngine(state, 'canonical restoration') === mainEngine, 'stored main engine authority');

  const restorationInput = clone(canonicalDataset);
  assert(
    context.fingerprint(restorationInput) === canonicalFingerprint,
    'canonical restoration clone fingerprint',
  );
  await call(mainEngine, 'loadDataset', restorationInput, { datasetRef: canonicalDatasetRef });
  assert(
    context.fingerprint(restorationInput) === canonicalFingerprint,
    'canonical restoration input immutability',
  );

  // Restoration is a lifecycle invariant, so it must not be skipped merely
  // because the specimen observation path is already failing.
  const timeMs = finiteNumber(context.clock.now(), 'clock.now()');
  await call(mainEngine, 'publishFrame', timeMs);
  const evidence = inputEvidence(state, context);
  assert(evidence.unchanged === true, 'canonical caller input immutability');
}

function combinedObservationAndRestorationFailure(observationFailure, restorationFailure) {
  const observationMessage = errorSummary(observationFailure);
  const restorationMessage = errorSummary(restorationFailure);
  return new AggregateError(
    [observationFailure, restorationFailure],
    `REN-011 observation failed (${observationMessage}); canonical restoration also failed (${restorationMessage})`,
    { cause: observationFailure },
  );
}

function errorSummary(value) {
  return value instanceof Error ? value.message : String(value);
}

function normalizePatchAction(caseId, action) {
  if (caseId === 'REN-006') {
    const operands = exactOperands(action, ['changes', 'targetId']);
    const targetId = stringValue(operands.targetId, 'patch.targetId');
    assert(targetId === 'text' || targetId === 'rapid-text', 'standalone patch target');
    return {
      target: textTarget(targetId),
      changes: textChanges(operands.changes),
    };
  }
  assert(caseId === 'REN-011', `unsupported patch case ${String(caseId)}`);
  const operands = exactOperands(action, ['changes', 'target']);
  const target = recordValue(operands.target, 'patch.target');
  assertExactKeys(target, ['id', 'ownerId'], 'patch.target');
  const ownerId = stringValue(target.ownerId, 'patch.target.ownerId');
  const id = stringValue(target.id, 'patch.target.id');
  assert(ownerId === 'item-a' && id === 'bidi', 'item text patch target');
  return {
    target: componentTextTarget(ownerId, id),
    changes: textChanges(operands.changes),
  };
}

function textChanges(value) {
  const changes = recordValue(value, 'patch.changes');
  assertExactKeys(changes, ['text'], 'patch.changes');
  assert(typeof changes.text === 'string', 'patch.changes.text string');
  return { text: changes.text };
}

async function ensureInitializedEngine(context, role) {
  const engine = await context.ensureMainEngine();
  const snapshot = snapshotEngine(engine);
  if (snapshot.lifecycle === 'new') {
    await initializeEngine(engine, `${context.caseId.toLowerCase()}-text-${role}-engine`);
  } else {
    assert(snapshot.lifecycle === 'ready-empty', 'initial engine lifecycle');
  }
  return engine;
}

async function initializeEngine(engine, instanceId) {
  const snapshot = snapshotEngine(engine);
  if (snapshot.lifecycle === 'new') {
    await call(engine, 'initialize', {
      instanceId,
      width: 800,
      height: 600,
      pixelRatio: 1,
      strategy: 'mesh',
      preference: 'webgl',
    });
    return;
  }
  assert(snapshot.lifecycle === 'ready-empty', 'supplemental engine lifecycle');
}

async function publish(engine, context) {
  assert(!context.signal.aborted, 'action is aborted');
  const timeMs = finiteNumber(context.clock.now(), 'clock.now()');
  await call(engine, 'publishFrame', timeMs);
  assert(!context.signal.aborted, 'action is aborted');
}

async function advanceClock(context, timeMs) {
  assert(typeof context.clock.advanceTo === 'function', 'manual clock advanceTo');
  await context.clock.advanceTo(timeMs);
  assert(context.clock.now() === timeMs, 'manual clock milestone');
}

function observeProduct(engine, adapter, caseId, targets) {
  const snapshot = snapshotEngine(engine);
  const semanticProbe = callSync(engine, 'semanticProbe');
  const geometryProbe = callSync(engine, 'geometryProbe');
  const exportedDataset = callSync(engine, 'exportDataset');
  assert(isRecord(semanticProbe), 'semanticProbe() result');
  assert(isRecord(geometryProbe), 'geometryProbe() result');
  assert(Array.isArray(exportedDataset), 'exportDataset() result');
  const textProbes = targets.map((target) => {
    const probe = callSync(engine, 'textProbe', target);
    assert(isRecord(probe), `textProbe(${textTargetKey(target)}) result`);
    assert(sameJson(probe.target, target), `textProbe(${textTargetKey(target)}) target`);
    return {
      key: textTargetKey(target),
      target: clone(target),
      probe: clone(probe),
    };
  });
  return clone({
    snapshot,
    semanticProbe,
    geometryProbe,
    exportedDataset,
    textProbes,
    resources: observeResources(adapter, caseId),
  });
}

function observeResources(adapter, caseId) {
  const resources = adapter.resourceProbe(Object.freeze({ caseId }));
  assert(isRecord(resources), 'resourceProbe() result');
  validateJsonValue(resources, 'resourceProbe', new WeakSet());
  return clone(resources);
}

function textProbeEntry(productValue, key) {
  const product = recordValue(productValue, 'product');
  assert(Array.isArray(product.textProbes), 'product textProbes');
  const entry = product.textProbes.find((candidate) => (
    isRecord(candidate) && candidate.key === key
  ));
  return recordValue(entry, `text probe ${key}`);
}

function inputEvidence(state, context) {
  assert(state.dataset !== null, 'input dataset');
  const beforeFingerprint = stringValue(state.inputFingerprint, 'input baseline fingerprint');
  const afterFingerprint = context.fingerprint(state.dataset);
  return {
    datasetRef: stringValue(state.datasetRef, 'input datasetRef'),
    beforeFingerprint,
    afterFingerprint,
    unchanged: beforeFingerprint === afterFingerprint,
  };
}

function currentEngine(state, operation) {
  assert(state.engine !== null, `${operation} requires the loaded main engine`);
  return state.engine;
}

function validateProductAdapter(value) {
  const adapter = recordValue(value, 'render text product adapter');
  assertExactKeys(
    adapter,
    ['createSupplementalSpecimens', 'resourceProbe'],
    'render text product adapter',
  );
  for (const method of ['createSupplementalSpecimens', 'resourceProbe']) {
    assert(typeof adapter[method] === 'function', `product.${method}`);
  }
  return adapter;
}

function validateSupplementalSpecimens(value) {
  assert(Array.isArray(value), 'supplemental specimens array');
  assert(value.length === SUPPLEMENTAL_IDS.length, 'supplemental specimen count');
  const seenDatasets = new Set();
  const seenTargets = new Set();
  return value.map((entryValue, index) => {
    const entry = recordValue(entryValue, `supplemental specimen ${index}`);
    assertExactKeys(entry, ['dataset', 'datasetId', 'id', 'target'], `supplemental specimen ${index}`);
    const id = stringValue(entry.id, `supplemental specimen ${index} id`);
    assert(id === SUPPLEMENTAL_IDS[index], `supplemental specimen ${index} stable order`);
    const datasetId = stringValue(entry.datasetId, `supplemental specimen ${index} datasetId`);
    assert(!seenDatasets.has(datasetId), `supplemental specimen ${index} dataset identity`);
    seenDatasets.add(datasetId);
    assert(Array.isArray(entry.dataset) && entry.dataset.length === 1, `supplemental specimen ${index} dataset`);
    validateJsonValue(entry.dataset, `supplemental specimen ${index} dataset`, new WeakSet());
    const target = normalizeTextTarget(entry.target, `supplemental specimen ${index} target`);
    assert(target.kind === 'component', `supplemental specimen ${index} component target`);
    assert(target.id === id, `supplemental specimen ${index} target identity`);
    const targetKey = textTargetKey(target);
    assert(!seenTargets.has(targetKey), `supplemental specimen ${index} unique target`);
    seenTargets.add(targetKey);
    return deepFreeze({ id, datasetId, target, dataset: clone(entry.dataset) });
  });
}

function validateContext(value) {
  const context = recordValue(value, 'context');
  for (const method of ['ensureMainEngine', 'resolveDataset', 'fingerprint']) {
    assert(typeof context[method] === 'function', `context.${method}`);
  }
  assert(isRecord(context.clock) && typeof context.clock.now === 'function', 'context.clock');
  assert(isRecord(context.signal) && typeof context.signal.aborted === 'boolean', 'context.signal');
  return context;
}

function validateRouteParams(value) {
  const params = recordValue(value, 'route params');
  assertExactKeys(params, ['seed', 'size'], 'route params');
  stringValue(params.size, 'route size');
  assert(
    Number.isInteger(params.seed) && params.seed >= 0 && params.seed <= 0xffff_ffff,
    'route seed',
  );
}

function validateFixtureParams(caseId, value) {
  const params = recordValue(value, `${caseId} fixture params`);
  if (caseId === 'REN-006') {
    assertExactKeys(params, ['text', 'textMatrix'], 'REN-006 fixture params');
    return;
  }
  assert(caseId === 'REN-011', `unsupported fixture case ${String(caseId)}`);
  // Presence is validated, but the result-bearing matrix value is deliberately
  // not read, cloned, fingerprinted, or forwarded.
  assertExactKeys(
    params,
    ['datasetRef', 'fontProfile', 'itemTextContractMatrix', 'texts'],
    'REN-011 fixture params',
  );
  assert(params.datasetRef === 'item-text-corpus', 'REN-011 fixture datasetRef');
}

function normalizeTextTarget(value, label) {
  const target = recordValue(value, label);
  if (target.kind === 'element') {
    assertExactKeys(target, ['id', 'kind'], label);
    return textTarget(stringValue(target.id, `${label}.id`));
  }
  assert(target.kind === 'component', `${label}.kind`);
  assertExactKeys(target, ['id', 'kind', 'ownerId'], label);
  return componentTextTarget(
    stringValue(target.ownerId, `${label}.ownerId`),
    stringValue(target.id, `${label}.id`),
  );
}

function textTarget(id) {
  return Object.freeze({ kind: 'element', id });
}

function componentTextTarget(ownerId, id) {
  return Object.freeze({ kind: 'component', ownerId, id });
}

function textTargetKey(target) {
  return target.kind === 'element' ? target.id : `${target.ownerId}:${target.id}`;
}

function boundsObject(value, label) {
  assert(Array.isArray(value) && value.length === 4, `${label} tuple`);
  const [x, y, width, height] = value.map((entry, index) => finiteNumber(entry, `${label}[${index}]`));
  return { x, y, width, height };
}

function snapshotEngine(engine) {
  return clone(recordValue(callSync(engine, 'snapshot'), 'snapshot() result'));
}

async function call(target, method, ...args) {
  const receiver = recordValue(target, `${method} target`);
  const callable = receiver[method];
  assert(typeof callable === 'function', `${method}() must exist`);
  return callable.apply(receiver, args);
}

function callSync(target, method, ...args) {
  const receiver = recordValue(target, `${method} target`);
  const callable = receiver[method];
  assert(typeof callable === 'function', `${method}() must exist`);
  const result = callable.apply(receiver, args);
  assert(!(result instanceof Promise), `${method}() must be synchronous`);
  return result;
}

function exactOperands(action, keys) {
  const operands = recordValue(action.operands, `${action.type} operands`);
  assertExactKeys(operands, keys, `${action.type} operands`);
  return operands;
}

function traceAction(type, operands) {
  return Object.freeze({ type, operands: deepFreeze(operands) });
}

function recordValue(value, label) {
  assert(isRecord(value), `${label} must be an object`);
  return value;
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} must be a non-empty string`);
  return value;
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} must be finite`);
  return value;
}

function assertExactKeys(value, keys, label) {
  const record = recordValue(value, label);
  assert(sameJson(Object.keys(record).sort(), [...keys].sort()), `${label} keys`);
}

function validateJsonValue(value, label, ancestors) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    assert(Number.isFinite(value) && !Object.is(value, -0), `${label} JSON number`);
    return;
  }
  assert(typeof value === 'object', `${label} JSON value`);
  assert(!ancestors.has(value), `${label} cycle`);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => validateJsonValue(entry, `${label}[${index}]`, ancestors));
      return;
    }
    assert(isRecord(value), `${label} JSON record`);
    for (const [key, entry] of Object.entries(value)) {
      validateJsonValue(entry, `${label}.${key}`, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}


function assert(condition, message) {
  if (!condition) throw new Error(`PatchMap render-text handler invalid: ${message}`);
}
