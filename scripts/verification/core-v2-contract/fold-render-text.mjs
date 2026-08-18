import { clone, deepFreeze, createTypeSuffixValueAtoms } from './value-atoms.mjs';

const { booleanValue } = createTypeSuffixValueAtoms(assert);

export const RENDER_TEXT_FOLD_REVISION = 'core-v2-render-text-fold/1';

const OBSERVATION_REVISION = 'core-v2-semantic-observation/1';
const EXECUTION_REVISION = 'core-v2-contract-case-execution/1';
const DELTA_REVISION = 'core-v2-semantic-observation-delta/1';

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
    fixtureKeys: Object.freeze(['text', 'textMatrix']),
    targets: Object.freeze([
      elementTarget('text'),
      elementTarget('empty-text'),
      elementTarget('long-text'),
      elementTarget('missing-font'),
      elementTarget('rapid-text'),
    ]),
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
    checkpoints: Object.freeze([
      Object.freeze({
        id: 'text',
        phase: 'after-action',
        afterActionIndex: 5,
        paths: Object.freeze(['worldBounds']),
      }),
    ]),
    releaseRoles: Object.freeze(['main']),
  }),
  'REN-011': Object.freeze({
    datasetRef: 'item-text-corpus',
    fixtureKeys: Object.freeze([
      'datasetRef',
      'fontProfile',
      'itemTextContractMatrix',
      'texts',
    ]),
    targets: Object.freeze([
      componentTarget('item-a', 'zero'),
      componentTarget('item-a', 'positive'),
      componentTarget('item-a', 'negative'),
      componentTarget('item-a', 'bidi'),
    ]),
    trace: Object.freeze([
      traceAction('loadDataset', { datasetRef: 'item-text-corpus' }),
      traceAction('observeItemTextMatrix', { valueRef: 'itemTextContractMatrix' }),
      traceAction('patch', {
        target: { ownerId: 'item-a', id: 'bidi' },
        changes: { text: '中😀é\nمرحبا' },
      }),
      traceAction('publishFrame', { timeMs: 16.666667 }),
    ]),
    checkpoints: Object.freeze([]),
    releaseRoles: Object.freeze(['main']),
  }),
});

/**
 * Fold raw public Engine observations into the canonical fourteen domains.
 * The fold is fail-closed and expected-blind: it validates publication and
 * semantic/renderer correlation, but never imports a comparator or reads any
 * result-bearing item-text fixture row.
 */
export function foldRenderTextExecution(options) {
  const input = validateOptions(options);
  const plan = validateCasePlan(input.casePlan);
  const definition = CASES[plan.id];
  const execution = validateExecution(input.execution, plan, definition);
  const captures = projectCaptures(plan, execution, definition);
  const terminalSnapshot = recordValue(execution.terminalSnapshot, 'terminal snapshot');
  const terminalSemantic = recordValue(
    execution.terminalSemanticProbe,
    'terminal semantic probe',
  );

  const actual = {
    $schema: OBSERVATION_REVISION,
    case: projectCase(plan, execution),
    provenance: cloneRecord(input.provenance, 'provenance'),
    environment: cloneRecord(input.environment, 'environment'),
    revisions: projectRevisions(terminalSnapshot),
    scene: projectScene(terminalSnapshot),
    geometry: projectGeometryFoundation(terminalSemantic),
    text: {
      _availability: {
        semanticLayout: 'available',
        publicTextProbe: 'available',
        rendererPublication: 'available',
      },
    },
    paint: projectPaintFoundation(terminalSemantic, terminalSnapshot),
    interaction: projectInteractionFoundation(terminalSemantic),
    events: {
      _availability: { eventJournal: 'available' },
      journal: clone(execution.eventJournal),
    },
    history: projectHistory(terminalSemantic, terminalSnapshot),
    accessibility: notExercised('text-render-actions-do-not-observe-accessibility'),
    outcome: {
      _availability: {
        actionResults: 'available',
        publicTextProbe: 'available',
      },
      actionResults: execution.actionResults.map(({ index, type, status }) => ({
        index,
        type,
        status,
      })),
    },
    resources: projectResources(execution, terminalSnapshot),
  };

  if (plan.id === 'REN-006') projectStandalone(actual, execution, captures);
  else projectItemText(actual, execution);

  assert(
    DOMAIN_NAMES.every((domain) => isPlainObject(actual[domain])),
    'actual must contain all fourteen object domains',
  );
  validateJsonValue(actual, 'actual', new WeakSet());
  return deepFreeze({
    actual,
    fixtures: projectSafeFixtures(plan, definition),
    captures,
  });
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

function validateCasePlan(casePlan) {
  validateJsonValue(casePlan, 'casePlan', new WeakSet());
  const definition = CASES[casePlan.id];
  assert(definition !== undefined, `unsupported render-text case ${String(casePlan.id)}`);
  assert(casePlan.caseType === 'capability', `${casePlan.id} caseType`);
  const fixture = recordValue(casePlan.fixture, `${casePlan.id} fixture`);
  const setup = recordValue(fixture.setup, `${casePlan.id} fixture setup`);
  const params = recordValue(setup.params, `${casePlan.id} fixture params`);
  assertExactKeys(params, definition.fixtureKeys, `${casePlan.id} fixture params`);
  if (casePlan.id === 'REN-011') {
    assert(params.datasetRef === definition.datasetRef, 'REN-011 fixture datasetRef');
    // Deliberately do not dereference the result-bearing matrix property.
  }
  const route = recordValue(casePlan.routeParams, `${casePlan.id} route params`);
  assertExactKeys(route, ['seed', 'size'], `${casePlan.id} route params`);
  stringValue(route.size, `${casePlan.id} route size`);
  uint32(route.seed, `${casePlan.id} route seed`);

  assert(Array.isArray(fixture.actionTrace), `${casePlan.id} fixture actionTrace`);
  assert(Array.isArray(casePlan.actionTrace), `${casePlan.id} actionTrace`);
  assert(sameJson(fixture.actionTrace, casePlan.actionTrace), `${casePlan.id} actionTrace drift`);
  assert(fixture.actionTrace.length === definition.trace.length, `${casePlan.id} action count`);
  fixture.actionTrace.forEach((actionValue, index) => {
    const action = recordValue(actionValue, `${casePlan.id} action ${index}`);
    const canonical = definition.trace[index];
    assertExactKeys(action, ['index', 'operands', 'type'], `${casePlan.id} action ${index}`);
    assert(action.index === index, `${casePlan.id} action ${index} index`);
    assert(action.type === canonical.type, `${casePlan.id} action ${index} type`);
    assert(
      sameJson(action.operands, canonical.operands),
      `${casePlan.id} action ${index} operands`,
    );
  });
  assert(
    sameJson(fixture.captureCheckpoints, definition.checkpoints),
    `${casePlan.id} capture checkpoints`,
  );
  assert(
    sameJson(fixture.cleanupTrace, [{
      type: 'destroy-case',
      operands: { expectedResourceDelta: 0 },
    }]),
    `${casePlan.id} cleanup trace`,
  );
  return casePlan;
}

function validateExecution(value, plan, definition) {
  const execution = recordValue(value, 'execution');
  validateJsonValue(execution, 'execution', new WeakSet());
  assert(execution.$schema === EXECUTION_REVISION, 'execution schema');
  assert(execution.caseId === plan.id, 'execution case ID');
  assert(execution.caseType === plan.caseType, 'execution case type');
  assert(execution.status === 'completed' && execution.error === null, 'execution completion');
  assert(execution.hostSeamDelta === null, 'capability host seam');
  assert(Array.isArray(execution.actionResults), 'execution action results');
  assert(execution.actionResults.length === definition.trace.length, 'execution action count');
  execution.actionResults.forEach((resultValue, index) => {
    const result = recordValue(resultValue, `action result ${index}`);
    const canonical = definition.trace[index];
    assert(result.index === index, `action result ${index} index`);
    assert(result.type === canonical.type, `action result ${index} type`);
    assert(result.handlerId === `contract/${canonical.type}`, `action result ${index} handler`);
    assert(result.status === 'completed', `action result ${index} status`);
    finiteNumber(result.startedAtMs, `action result ${index} startedAtMs`);
    finiteNumber(result.completedAtMs, `action result ${index} completedAtMs`);
    const delta = recordValue(result.delta, `action result ${index} delta`);
    assert(delta.$schema === DELTA_REVISION, `action result ${index} delta schema`);
    assert(delta.caseId === plan.id, `action result ${index} delta case`);
    assert(delta.actionIndex === index, `action result ${index} delta index`);
    assert(delta.actionType === canonical.type, `action result ${index} delta type`);
    recordValue(delta.actual, `action result ${index} actual`);
    recordValue(delta.semanticProbe, `action result ${index} semantic probe`);
  });
  assert(Array.isArray(execution.eventJournal), 'execution event journal');
  assert(
    Array.isArray(execution.eventJournalFailures) && execution.eventJournalFailures.length === 0,
    'execution event journal failures',
  );
  assert(isPlainObject(execution.bindings) && Object.keys(execution.bindings).length === 0, 'bindings');
  assert(isPlainObject(execution.datasetObservations), 'dataset observations');
  for (const [datasetRef, observationValue] of Object.entries(execution.datasetObservations)) {
    const observation = recordValue(observationValue, `dataset observation ${datasetRef}`);
    assert(observation.unchanged === true, `dataset observation ${datasetRef} immutable`);
  }
  recordValue(execution.terminalSnapshot, 'terminal snapshot');
  recordValue(execution.terminalSemanticProbe, 'terminal semantic probe');
  validateCleanup(execution.cleanup, definition, plan.id);
  return execution;
}

function validateCleanup(value, definition, caseId) {
  const cleanup = recordValue(value, 'cleanup');
  assertExactKeys(
    cleanup,
    ['declaredActions', 'errors', 'productResources', 'releases', 'status'],
    'cleanup',
  );
  assert(cleanup.status === 'completed', 'cleanup status');
  assert(Array.isArray(cleanup.errors) && cleanup.errors.length === 0, 'cleanup errors');
  assert(sameJson(cleanup.declaredActions, ['destroy-case']), 'cleanup declared actions');
  assert(Array.isArray(cleanup.releases), 'cleanup releases');
  assert(cleanup.releases.length === definition.releaseRoles.length, 'cleanup release count');
  cleanup.releases.forEach((releaseValue, index) => {
    const release = recordValue(releaseValue, `cleanup release ${index}`);
    assert(release.role === definition.releaseRoles[index], `cleanup release ${index} role`);
    assert(release.destroyReturned === true, `cleanup release ${index} destroy result`);
    const before = recordValue(release.before, `cleanup release ${index} before`);
    const after = recordValue(release.after, `cleanup release ${index} after`);
    assert(before.lifecycle === 'scene-ready', `cleanup release ${index} before lifecycle`);
    assert(after.lifecycle === 'destroyed', `cleanup release ${index} after lifecycle`);
    const remaining = recordValue(
      release.remainingResources,
      `cleanup release ${index} remaining resources`,
    );
    assertExactKeys(
      remaining,
      ['canvasCount', 'pendingWork', 'subscriptions'],
      `cleanup release ${index} remaining resources`,
    );
    for (const field of ['canvasCount', 'pendingWork', 'subscriptions']) {
      assert(
        nonNegativeInteger(remaining[field], `cleanup release ${index} ${field}`) === 0,
        `cleanup release ${index} ${field} drained`,
      );
    }
  });
  validateTextCleanupProbe(cleanup.productResources, caseId);
}

function validateTextCleanupProbe(value, caseId) {
  const cleanup = recordValue(value, 'cleanup productResources');
  assertExactKeys(
    cleanup,
    ['caseId', 'journal', 'revision', 'runtimeCounts', 'supplemental', 'transport'],
    'cleanup productResources',
  );
  assert(
    cleanup.revision === 'core-v2-text-runtime-cleanup/1',
    'cleanup product revision',
  );
  assert(cleanup.caseId === caseId, 'cleanup product case ID');
  validateZeroCounts(
    cleanup.runtimeCounts,
    [
      'activeSessionCount',
      'assetLeaseCount',
      'atlasLeaseCount',
      'fontFaceCount',
      'pendingLoadCount',
      'pendingWorkCount',
    ],
    'cleanup runtimeCounts',
  );
  validateZeroCounts(
    cleanup.transport,
    ['externalFontRequestCount', 'networkRequestCount'],
    'cleanup transport',
  );
  const supplemental = recordValue(cleanup.supplemental, 'cleanup supplemental');
  assertExactKeys(
    supplemental,
    ['factoryCallCount', 'specimenCount'],
    'cleanup supplemental',
  );
  const expectedFactoryCalls = caseId === 'REN-011' ? 1 : 0;
  const expectedSpecimens = caseId === 'REN-011' ? SUPPLEMENTAL_IDS.length : 0;
  assert(
    nonNegativeInteger(supplemental.factoryCallCount, 'cleanup factoryCallCount') ===
      expectedFactoryCalls,
    'cleanup factoryCallCount correlation',
  );
  assert(
    nonNegativeInteger(supplemental.specimenCount, 'cleanup specimenCount') === expectedSpecimens,
    'cleanup specimenCount correlation',
  );
  validateCleanupJournal(cleanup.journal, caseId, supplemental);
  return cleanup;
}

function validateZeroCounts(value, fields, label) {
  const counts = recordValue(value, label);
  assertExactKeys(counts, fields, label);
  for (const field of fields) {
    assert(nonNegativeInteger(counts[field], `${label} ${field}`) === 0, `${label} ${field} drain`);
  }
}

function validateCleanupJournal(value, caseId, supplemental) {
  assert(Array.isArray(value) && value.length > 0, 'cleanup product journal');
  let observedCount = 0;
  let factoryCount = 0;
  value.forEach((entryValue, index) => {
    const entry = recordValue(entryValue, `cleanup product journal ${index}`);
    assert(entry.sequence === index + 1, `cleanup product journal ${index} sequence`);
    assert(entry.caseId === caseId, `cleanup product journal ${index} case ID`);
    if (entry.event === 'text-runtime-observed') {
      assertExactKeys(
        entry,
        ['caseId', 'event', 'resourceProbeCount', 'sequence'],
        `cleanup product journal ${index}`,
      );
      observedCount += 1;
      assert(
        entry.resourceProbeCount === observedCount,
        `cleanup product journal ${index} resourceProbeCount`,
      );
      return;
    }
    if (entry.event === 'supplemental-specimens-created') {
      assertExactKeys(
        entry,
        ['caseId', 'event', 'factoryCallCount', 'sequence', 'specimenCount'],
        `cleanup product journal ${index}`,
      );
      factoryCount += 1;
      assert(entry.factoryCallCount === factoryCount, `cleanup product journal ${index} factory count`);
      assert(
        entry.specimenCount === supplemental.specimenCount,
        `cleanup product journal ${index} specimen count`,
      );
      return;
    }
    assert(entry.event === 'text-runtime-released', `cleanup product journal ${index} event`);
    assert(index === value.length - 1, 'cleanup release journal terminal');
    assertExactKeys(
      entry,
      ['caseId', 'event', 'factoryCallCount', 'resourceProbeCount', 'sequence'],
      `cleanup product journal ${index}`,
    );
    assert(entry.factoryCallCount === factoryCount, 'cleanup release factory count');
    assert(entry.resourceProbeCount === observedCount, 'cleanup release resource probe count');
  });
  assert(factoryCount === supplemental.factoryCallCount, 'cleanup journal factory correlation');
  assert(observedCount > 0, 'cleanup journal observed resources');
  assert(value[value.length - 1].event === 'text-runtime-released', 'cleanup journal terminal release');
}

function projectStandalone(actual, execution, captures) {
  const loaded = actionActualAt(execution, 0, 'loadDataset');
  const initialAction = actionActualAt(execution, 1, 'snapshot-observation');
  const primaryPatch = actionActualAt(execution, 2, 'patch');
  const intermediatePatch = actionActualAt(execution, 3, 'patch');
  const finalPatch = actionActualAt(execution, 4, 'patch');
  const publication = actionActualAt(execution, 5, 'publishFrame');

  validateInputEvidence(loaded.input, 'load input');
  validateInputEvidence(initialAction.input, 'initial input');
  validateInputEvidence(primaryPatch.input, 'primary patch input');
  validateInputEvidence(intermediatePatch.input, 'intermediate patch input');
  validateInputEvidence(finalPatch.input, 'final patch input');
  validateInputEvidence(publication.input, 'publication input');
  assert(initialAction.label === 'initial-text', 'initial snapshot label');
  assert(primaryPatch.publishTriggered === true, 'primary patch publication');
  assert(intermediatePatch.publishTriggered === false, 'intermediate patch publication');
  assert(finalPatch.publishTriggered === false, 'final patch publication');

  const initial = productValue(initialAction.product, 'initial product');
  const initialPrimary = currentProbe(initial, 'text', elementTarget('text'));
  const initialEmpty = currentProbe(initial, 'empty-text', elementTarget('empty-text'));
  const initialLong = currentProbe(initial, 'long-text', elementTarget('long-text'));
  const initialMissing = currentProbe(initial, 'missing-font', elementTarget('missing-font'));

  const patchedPrimary = currentProbe(
    productValue(primaryPatch.after, 'primary patch after'),
    'text',
    elementTarget('text'),
  );
  const pendingIntermediate = pendingProbe(
    productValue(intermediatePatch.after, 'intermediate patch after'),
    'rapid-text',
    elementTarget('rapid-text'),
  );
  const pendingFinal = pendingProbe(
    productValue(finalPatch.after, 'final patch after'),
    'rapid-text',
    elementTarget('rapid-text'),
  );
  const terminal = productValue(publication.after, 'terminal product');
  const terminalPrimary = currentProbe(terminal, 'text', elementTarget('text'));
  const terminalRapid = currentProbe(terminal, 'rapid-text', elementTarget('rapid-text'));
  const terminalEmpty = currentProbe(terminal, 'empty-text', elementTarget('empty-text'));
  const terminalLong = currentProbe(terminal, 'long-text', elementTarget('long-text'));
  const terminalMissing = currentProbe(terminal, 'missing-font', elementTarget('missing-font'));

  assert(stableTextSemantics(patchedPrimary, terminalPrimary), 'primary terminal stability');
  assert(
    pendingIntermediate.projection.source === 'intermediate',
    'rapid intermediate semantic source',
  );
  assert(pendingFinal.projection.source === 'final中', 'rapid final semantic source');
  assert(terminalRapid.projection.source === pendingFinal.projection.source, 'rapid terminal source');
  assert(
    pendingIntermediate.projection.contentSignature !== pendingFinal.projection.contentSignature,
    'rapid signatures must replace',
  );
  assert(
    sameJson(
      pendingIntermediate.renderer.lastRenderedSignatures,
      pendingIntermediate.renderer.attachedSignatures,
    ),
    'intermediate retains the prior rendered attachment',
  );
  assert(
    sameJson(
      pendingFinal.renderer.lastRenderedSignatures,
      pendingFinal.renderer.attachedSignatures,
    ),
    'final pending state retains the prior rendered attachment',
  );

  const styleAndTransformPreserved =
    initialPrimary.projection.styleSignature === terminalPrimary.projection.styleSignature &&
    sameJson(initialPrimary.transform.affine, terminalPrimary.transform.affine) &&
    sameJson(initialPrimary.transform.worldBasis, terminalPrimary.transform.worldBasis) &&
    initialPrimary.transform.rotationDegrees === terminalPrimary.transform.rotationDegrees &&
    initialPrimary.transform.scaleX === terminalPrimary.transform.scaleX &&
    initialPrimary.transform.scaleY === terminalPrimary.transform.scaleY &&
    initialPrimary.transform.contentOrientation === terminalPrimary.transform.contentOrientation &&
    sameJson(initialPrimary.projection.authoredStyle, terminalPrimary.projection.authoredStyle);

  actual.scene.text = {
    visible: terminalPrimary.state.visible,
    zIndex: terminalPrimary.state.zIndex,
    objectCount: terminalPrimary.renderer.objectCount,
    // Historical normalized evidence keeps its approved pre-promotion route value.
    route: historicalTextRoute(terminalPrimary.renderer.attachedRoute),
    publication: terminalPrimary.publication.status,
  };
  actual.geometry.text = {
    positionWorld: [
      normalizeNumber(terminalPrimary.transform.affine[4]),
      normalizeNumber(terminalPrimary.transform.affine[5]),
    ],
    rotationDegrees: normalizeNumber(terminalPrimary.transform.rotationDegrees),
  };
  const capturedWorldBounds = boundsObject(
    recordValue(captures.text, 'text capture').worldBounds,
    'captured text world bounds',
  );
  assert(
    sameJson(
      boundsObject(terminalPrimary.geometry.worldBounds, 'primary world bounds'),
      capturedWorldBounds,
    ),
    'captured world bounds parity',
  );
  const intermediatePublicationCount = [
    pendingIntermediate.renderer.lastRenderedSignatures,
    pendingFinal.renderer.lastRenderedSignatures,
    terminalRapid.renderer.lastRenderedSignatures,
  ].filter((signatures) => (
    signatures !== null &&
    signatures.content === pendingIntermediate.projection.contentSignature &&
    signatures.style === pendingIntermediate.projection.styleSignature &&
    signatures.layout === pendingIntermediate.projection.layoutSignature
  )).length;
  assert(intermediatePublicationCount === 0, 'rapid intermediate signature was never published');
  actual.text.content = terminalPrimary.projection.source;
  actual.text.lines = clone(terminalPrimary.projection.lines);
  actual.text.fontRuns = clone(terminalPrimary.projection.fontRuns);
  actual.text.layoutBounds = boundsObject(
    terminalPrimary.projection.layoutBounds,
    'primary layout bounds',
  );
  actual.text.worldBounds = boundsObject(
    terminalPrimary.geometry.worldBounds,
    'primary world bounds',
  );
  actual.text.hitBounds = boundsObject(
    terminalPrimary.geometry.hitBounds,
    'primary hit bounds',
  );
  actual.text.staleGlyphCount = terminalPrimary.renderer.staleGlyphCount;
  actual.text.phases = {
    'initial-text': phaseWithLines(initialPrimary, 'initial text'),
  };
  actual.text.empty = {
    visibleText: stringOrEmpty(terminalEmpty.projection.visibleText, 'empty visible text'),
    layoutBounds: boundsArray(terminalEmpty.projection.layoutBounds, 'empty layout bounds'),
  };
  actual.text.long = {
    lines: cloneArray(terminalLong.projection.lines, 'long text lines'),
    layoutBounds: boundsArray(terminalLong.projection.layoutBounds, 'long text layout bounds'),
  };
  actual.text.missingFont = {
    fontRuns: cloneArray(terminalMissing.projection.fontRuns, 'missing font runs'),
    layoutBounds: boundsArray(terminalMissing.projection.layoutBounds, 'missing font layout bounds'),
  };
  actual.text.rapid = {
    visibleText: stringOrEmpty(terminalRapid.projection.visibleText, 'rapid visible text'),
    layoutBounds: boundsArray(terminalRapid.projection.layoutBounds, 'rapid layout bounds'),
    intermediatePublicationCount,
    staleGlyphCount: terminalRapid.renderer.staleGlyphCount,
  };
  assert(styleAndTransformPreserved, 'primary style and transform preservation');
  assert(stableTextSemantics(initialEmpty, terminalEmpty), 'empty text stability');
  assert(stableTextSemantics(initialLong, terminalLong), 'long text stability');
  assert(stableTextSemantics(initialMissing, terminalMissing), 'missing font stability');

  actual.paint.text = {
    opacity: terminalPrimary.state.opacity,
    style: canonicalStandaloneTextStyle(terminalPrimary.projection),
  };
  actual.interaction.text = {
    interactive: terminalPrimary.state.interactive,
    hitBounds: boundsObject(terminalPrimary.geometry.hitBounds, 'primary interaction bounds'),
  };
  actual.outcome.text = {
    contentChangePreservedStyleAndTransform: styleAndTransformPreserved,
  };
  actual.resources.textRuntime = clone(terminal.resources);
  validateCleanupJournalContinuation(execution.cleanup.productResources, terminal.resources);
}

function projectItemText(actual, execution) {
  const loaded = actionActualAt(execution, 0, 'loadDataset');
  const observed = actionActualAt(execution, 1, 'observeItemTextMatrix');
  const patched = actionActualAt(execution, 2, 'patch');
  const publication = actionActualAt(execution, 3, 'publishFrame');
  validateInputEvidence(loaded.input, 'load input');
  validateInputEvidence(observed.input, 'matrix input');
  validateInputEvidence(patched.input, 'bidi patch input');
  validateInputEvidence(publication.input, 'bidi publication input');
  assert(observed.valueRef === 'itemTextContractMatrix', 'matrix valueRef');
  assert(patched.publishTriggered === false, 'bidi patch publication');
  const observedResources = validateTextRuntimeProbe(observed.resources, 'matrix resources');
  assert(observedResources.caseId === 'REN-011', 'matrix resource case ID');
  assert(observedResources.supplemental.factoryCallCount === 1, 'supplemental factory call count');
  assert(observedResources.supplemental.specimenCount === SUPPLEMENTAL_IDS.length, 'supplemental resource specimen count');

  const canonicalInitial = productValue(observed.canonical, 'canonical observed product');
  const initialRows = [
    currentProbe(canonicalInitial, 'item-a:zero', componentTarget('item-a', 'zero')),
    currentProbe(canonicalInitial, 'item-a:positive', componentTarget('item-a', 'positive')),
    currentProbe(canonicalInitial, 'item-a:negative', componentTarget('item-a', 'negative')),
    currentProbe(canonicalInitial, 'item-a:bidi', componentTarget('item-a', 'bidi')),
  ];
  const restoredBidi = currentProbe(
    productValue(patched.before, 'bidi patch before'),
    'item-a:bidi',
    componentTarget('item-a', 'bidi'),
  );
  const pendingBidi = pendingProbe(
    productValue(patched.after, 'bidi patch after'),
    'item-a:bidi',
    componentTarget('item-a', 'bidi'),
  );
  const terminal = productValue(publication.after, 'item terminal product');
  const terminalRows = [
    currentProbe(terminal, 'item-a:zero', componentTarget('item-a', 'zero')),
    currentProbe(terminal, 'item-a:positive', componentTarget('item-a', 'positive')),
    currentProbe(terminal, 'item-a:negative', componentTarget('item-a', 'negative')),
    currentProbe(terminal, 'item-a:bidi', componentTarget('item-a', 'bidi')),
  ];
  assert(
    initialRows.slice(0, 3).every((probe, index) => (
      stableTextSemantics(probe, terminalRows[index])
    )),
    'unchanged canonical item text stability',
  );
  assert(
    stableTextSemantics(initialRows[3], restoredBidi),
    'canonical item text restored before patch',
  );
  assert(pendingBidi.projection.source === '中😀é\nمرحبا', 'bidi pending source');
  assert(terminalRows[3].projection.source === pendingBidi.projection.source, 'bidi terminal source');

  const supplemental = validateSupplementalObservations(observed.supplemental);
  const specimenRows = supplemental.map(({ id, probe, authored, surfaceGeometry }) => (
    projectSpecimen(id, probe, authored, surfaceGeometry)
  ));
  const allRowsExact = supplemental.every((entry, index) => (
    specimenMatchesPinnedReference(entry, specimenRows[index])
  ));

  const placed = supplemental.find(({ id }) => id === 'placed').probe;
  const uprightRow = supplemental.find(({ id }) => id === 'upright');
  assert(uprightRow !== undefined, 'upright supplemental row');

  actual.scene.itemText = {
    logicalCount: terminalRows.length,
    renderObjectCount: terminalRows.reduce((sum, probe) => sum + probe.renderer.objectCount, 0),
    publication: terminalRows.every(({ publication: state }) => state.status === 'current')
      ? 'current'
      : 'pending',
  };
  actual.geometry.texts = {
    placed: {
      localBounds: boundsTuple(placed.geometry.ownerLocalBounds, 'placed owner bounds'),
    },
    upright: {
      screenAngle: normalizeNumber(
        finiteNumber(uprightRow.surfaceGeometry.screenAngle, 'upright surface screen angle'),
      ),
    },
  };
  actual.text.texts = {
    zero: {
      visibleText: stringOrEmpty(terminalRows[0].projection.visibleText, 'zero visible text'),
      layoutBounds: boundsObject(terminalRows[0].projection.layoutBounds, 'zero layout bounds'),
    },
    positive: {
      lines: cloneArray(terminalRows[1].projection.lines, 'positive lines'),
      layoutBounds: boundsObject(terminalRows[1].projection.layoutBounds, 'positive layout bounds'),
    },
    negative: {
      visibleText: stringOrEmpty(terminalRows[2].projection.visibleText, 'negative visible text'),
      lineCount: nonNegativeInteger(terminalRows[2].projection.lineCount, 'negative line count'),
      layoutBounds: boundsObject(terminalRows[2].projection.layoutBounds, 'negative layout bounds'),
    },
    bidi: {
      visibleText: stringOrEmpty(terminalRows[3].projection.visibleText, 'bidi visible text'),
      lines: cloneArray(terminalRows[3].projection.lines, 'bidi lines'),
      layoutBounds: boundsObject(terminalRows[3].projection.layoutBounds, 'bidi layout bounds'),
      staleGlyphCount: nonNegativeInteger(
        terminalRows[3].renderer.staleGlyphCount,
        'bidi stale glyph count',
      ),
    },
    graphemeIntegrity: [...terminalRows, ...supplemental.map(({ probe }) => probe)].every(
      graphemeIntegrity,
    ),
  };
  actual.text.contractMatrix = specimenRows;
  actual.paint.texts = {
    placed: { tint: rgbaValue(placed.projection.color, 'placed tint') },
  };
  actual.interaction.itemText = {
    everyVisibleTargetInteractive: terminalRows.every((probe) => (
      !probe.state.visible || probe.state.interactive
    )),
  };
  actual.outcome.textContractMatrix = { allRowsExact };
  actual.outcome.itemText = {
    inputImmutable: true,
    graphemeIntegrity: actual.text.texts.graphemeIntegrity,
    rendererCurrent: terminalRows.every(({ publication: state }) => state.status === 'current'),
    staleGlyphCount: terminalRows.reduce((sum, probe) => sum + probe.renderer.staleGlyphCount, 0),
  };
  actual.resources.textRuntime = clone(terminal.resources);
  actual.resources.supplementalRuntime = clone(observed.resources);
  validateCleanupJournalContinuation(execution.cleanup.productResources, terminal.resources);
}

function validateSupplementalObservations(value) {
  assert(Array.isArray(value), 'supplemental observations');
  assert(value.length === SUPPLEMENTAL_IDS.length, 'supplemental observation count');
  return value.map((entryValue, index) => {
    const entry = recordValue(entryValue, `supplemental observation ${index}`);
    assertExactKeys(
      entry,
      ['authored', 'datasetId', 'id', 'input', 'loaded', 'product', 'target'],
      `supplemental observation ${index}`,
    );
    const id = stringValue(entry.id, `supplemental observation ${index} id`);
    assert(id === SUPPLEMENTAL_IDS[index], `supplemental observation ${index} order`);
    const datasetId = stringValue(
      entry.datasetId,
      `supplemental observation ${index} datasetId`,
    );
    validateInputEvidence(entry.input, `supplemental observation ${index} input`);
    const target = componentTarget(
      stringValue(recordValue(entry.target, `supplemental target ${index}`).ownerId, `supplemental owner ${index}`),
      id,
    );
    assert(sameJson(entry.target, target), `supplemental observation ${index} target`);
    const product = productValue(entry.product, `supplemental observation ${index} product`);
    const probe = currentProbe(product, `${target.ownerId}:${id}`, target);
    const surfaceGeometry = surfaceGeometryForProbe(product, probe, id);
    const authored = validateSupplementalAuthoredFacts(
      entry.authored,
      id,
      datasetId,
      target,
    );
    validateSupplementalAuthoredProduct(id, target, product, probe, authored);
    return { id, probe, authored, surfaceGeometry };
  });
}

function surfaceGeometryForProbe(product, probe, id) {
  const geometry = recordValue(product.geometryProbe, `${id} geometry probe`);
  assert(Array.isArray(geometry.entities), `${id} geometry entities`);
  const matches = geometry.entities.filter((entry) => (
    isPlainObject(entry) && entry.id === probe.entityId
  ));
  assert(matches.length === 1, `${id} surface geometry identity`);
  const entity = recordValue(matches[0], `${id} surface geometry`);
  assert(entity.componentId === id, `${id} surface component identity`);
  assert(entity.componentType === 'text', `${id} surface component type`);
  assert(entity.ownerItemId === probe.projection.ownerId, `${id} surface owner identity`);
  assert(entity.visible === probe.state.visible, `${id} surface visibility`);
  assert(entity.interactive === probe.state.interactive, `${id} surface interaction`);
  assert(
    entity.contentOrientation === probe.projection.contentOrientation,
    `${id} surface orientation`,
  );
  assert(
    sameJson(
      boundsTuple(entity.localBounds, `${id} surface local bounds`),
      boundsTuple(probe.geometry.localBounds, `${id} probe local bounds`),
    ),
    `${id} surface local bounds correlation`,
  );
  boundsTuple(entity.worldBounds, `${id} surface world bounds`);
  finiteNumber(entity.screenAngle, `${id} surface screen angle`);
  return entity;
}

function validateSupplementalAuthoredFacts(value, id, datasetId, target) {
  const authored = recordValue(value, `${id} authored facts`);
  assertExactKeys(
    authored,
    [
      'autoFont',
      'componentId',
      'datasetId',
      'frame',
      'itemAngle',
      'margin',
      'metrics',
      'orientation',
      'overflow',
      'ownerId',
      'placement',
      'revision',
      'source',
      'tint',
      'wrap',
    ],
    `${id} authored facts`,
  );
  assert(
    authored.revision === 'core-v2-render-text-authored-facts/1',
    `${id} authored facts revision`,
  );
  assert(authored.datasetId === datasetId, `${id} authored dataset identity`);
  assert(authored.ownerId === target.ownerId, `${id} authored owner identity`);
  assert(authored.componentId === id, `${id} authored component identity`);
  stringOrEmpty(authored.source, `${id} authored source`);
  const frame = pointValue(authored.frame, `${id} authored frame`);
  assert(frame[0] > 0 && frame[1] > 0, `${id} authored positive frame`);
  pinnedAuthoredMetrics(authored.metrics, `${id} authored metrics`);
  edgesValue(authored.margin, `${id} authored margin`);
  nullableString(authored.placement, `${id} authored placement`);
  nullableString(authored.tint, `${id} authored tint`);
  nullableString(authored.overflow, `${id} authored overflow`);
  nullableFiniteNumber(authored.itemAngle, `${id} authored angle`);
  nullableString(authored.orientation, `${id} authored orientation`);
  const wrap = recordValue(authored.wrap, `${id} authored wrap`);
  assertExactKeys(wrap, ['breakWords', 'enabled', 'width'], `${id} authored wrap`);
  booleanValue(wrap.enabled, `${id} authored wordWrap`);
  booleanValue(wrap.breakWords, `${id} authored breakWords`);
  nullableFiniteNumber(wrap.width, `${id} authored wrap width`);
  if (authored.autoFont !== null) {
    const autoFont = recordValue(authored.autoFont, `${id} authored autoFont`);
    assertExactKeys(autoFont, ['max', 'min'], `${id} authored autoFont`);
    finiteNumber(autoFont.min, `${id} authored autoFont min`);
    finiteNumber(autoFont.max, `${id} authored autoFont max`);
  }

  if (id === 'placed') {
    stringValue(authored.placement, `${id} authored placement`);
    stringValue(authored.tint, `${id} authored tint`);
  } else if (id === 'auto') {
    recordValue(authored.autoFont, `${id} authored autoFont`);
  } else if (id === 'wrap') {
    assert(wrap.enabled === true && wrap.breakWords === true, `${id} authored wrap policy`);
    finiteNumber(wrap.width, `${id} authored wrap width`);
  } else if (id === 'upright') {
    stringValue(authored.placement, `${id} authored placement`);
    finiteNumber(authored.itemAngle, `${id} authored item angle`);
    assert(authored.orientation === 'upright', `${id} authored orientation`);
  } else {
    assert(
      id === 'overflow-visible' || id === 'overflow-hidden' || id === 'overflow-ellipsis',
      `${id} authored overflow identity`,
    );
    assert(authored.overflow === id.slice('overflow-'.length), `${id} authored overflow`);
  }
  return authored;
}

function validateSupplementalAuthoredProduct(id, target, product, probe, authored) {
  assert(product.exportedDataset.length === 1, `${id} exported root count`);
  const owner = recordValue(product.exportedDataset[0], `${id} exported owner`);
  assert(owner.type === 'item', `${id} exported owner type`);
  assert(owner.id === target.ownerId, `${id} exported owner identity`);
  assert(Array.isArray(owner.components), `${id} exported components`);
  const matches = owner.components.filter((component) => (
    isPlainObject(component) && component.type === 'text' && component.id === id
  ));
  assert(matches.length === 1, `${id} exported component identity`);
  const component = recordValue(matches[0], `${id} exported text component`);
  const style = recordValue(component.style, `${id} authored style`);
  const exportedFacts = supplementalProductFacts(owner, component, style, id, authored);
  const independentFacts = {
    source: authored.source,
    frame: authored.frame,
    metrics: authored.metrics,
    placement: authored.placement,
    margin: authored.margin,
    tint: authored.tint,
    autoFont: authored.autoFont,
    wrap: authored.wrap,
    overflow: authored.overflow,
    itemAngle: authored.itemAngle,
    orientation: authored.orientation,
  };
  assert(
    sameJson(exportedFacts, independentFacts),
    `${id} product export fidelity to pre-load authored facts`,
  );
  assert(authored.source === probe.projection.source, `${id} authored/projection source`);
  assert(sameJson(style, probe.semantic.authoredStyle), `${id} authored/semantic style`);
  assert(sameJson(style, probe.projection.authoredStyle), `${id} authored/projection style`);

  if (id === 'placed') {
    assert(authored.placement === probe.semantic.placement, `${id} semantic placement correlation`);
    assert(authored.placement === probe.projection.placement, `${id} projection placement correlation`);
    assert(sameJson(authored.margin, probe.semantic.margin), `${id} semantic margin correlation`);
    assert(sameJson(authored.margin, probe.projection.margin), `${id} projection margin correlation`);
    assert(
      tintRgba(authored.tint, `${id} tint`) === tintRgba(
        stringValue(probe.semantic.tint, `${id} semantic tint`),
        `${id} semantic tint`,
      ),
      `${id} semantic tint correlation`,
    );
    assert(
      tintRgba(authored.tint, `${id} tint`) === rgbaValue(probe.projection.color, `${id} color`),
      `${id} projection tint correlation`,
    );
    return;
  }

  if (id === 'auto') {
    const contentFrame = recordValue(probe.projection.contentFrame, `${id} content frame`);
    assert(
      sameJson(authored.frame, [contentFrame.width, contentFrame.height]),
      `${id} frame correlation`,
    );
    const autoFont = recordValue(authored.autoFont, `${id} autoFont`);
    const min = finiteNumber(autoFont.min, `${id} autoFont min`);
    const max = finiteNumber(autoFont.max, `${id} autoFont max`);
    const chosen = finiteNumber(probe.projection.fontSizePx, `${id} chosen font`);
    assert(min <= chosen && chosen <= max, `${id} chosen font range`);
    return;
  }

  if (id === 'wrap') {
    const wrapWidth = finiteNumber(authored.wrap.width, `${id} wrap width`);
    assert(probe.projection.breakWords === true, `${id} breakWords projection`);
    assert(wrapWidth === probe.projection.wordWrapWidthPx, `${id} wrap width correlation`);
    return;
  }

  if (id === 'upright') {
    assert(authored.placement === probe.semantic.placement, `${id} semantic placement correlation`);
    assert(authored.placement === probe.projection.placement, `${id} projection placement correlation`);
    assert(authored.orientation === probe.semantic.contentOrientation, `${id} semantic orientation correlation`);
    assert(authored.orientation === probe.projection.contentOrientation, `${id} orientation correlation`);
    assert(authored.orientation === probe.transform.contentOrientation, `${id} transform orientation correlation`);
    assert(authored.itemAngle === probe.transform.rotationDegrees, `${id} item angle correlation`);
    return;
  }

  const contentFrame = recordValue(probe.projection.contentFrame, `${id} content frame`);
  assert(
    sameJson(authored.frame, [contentFrame.width, contentFrame.height]),
    `${id} frame correlation`,
  );
  assert(authored.overflow === probe.projection.overflow, `${id} overflow correlation`);
}

function supplementalProductFacts(owner, component, style, id, authored) {
  const attrs = owner.attrs === undefined ? null : recordValue(owner.attrs, `${id} attrs`);
  return {
    source: stringOrEmpty(component.text, `${id} exported source`),
    frame: itemFrame(owner, `${id} exported frame`),
    metrics: pinnedAuthoredMetrics({
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
    }, `${id} exported metrics`),
    placement: authored.placement === null
      ? null
      : nullableString(component.placement, `${id} exported placement`),
    margin: supplementalEdges(component.margin, `${id} exported margin`),
    tint: authored.tint === null
      ? null
      : nullableString(component.tint, `${id} exported tint`),
    autoFont: supplementalAutoFont(style.autoFont, `${id} exported autoFont`),
    wrap: {
      enabled: optionalBoolean(style.wordWrap, `${id} exported wordWrap`),
      breakWords: optionalBoolean(style.breakWords, `${id} exported breakWords`),
      width: nullableFiniteNumber(style.wordWrapWidth, `${id} exported wrap width`),
    },
    overflow: nullableString(style.overflow, `${id} exported overflow`),
    itemAngle: attrs === null
      ? null
      : nullableFiniteNumber(attrs.angle, `${id} exported angle`),
    orientation: authored.orientation === null
      ? null
      : nullableString(owner.contentOrientation, `${id} exported orientation`),
  };
}

function supplementalAutoFont(value, label) {
  if (value === undefined || value === null) return null;
  const autoFont = recordValue(value, label);
  assertExactKeys(autoFont, ['max', 'min'], label);
  return {
    min: finiteNumber(autoFont.min, `${label} min`),
    max: finiteNumber(autoFont.max, `${label} max`),
  };
}

function supplementalEdges(value, label) {
  if (value === undefined || value === null) {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  if (typeof value === 'number') {
    const edge = finiteNumber(value, label);
    return { top: edge, right: edge, bottom: edge, left: edge };
  }
  return edgesValue(value, label);
}

function pinnedAuthoredMetrics(style, label) {
  const metrics = recordValue(style, label);
  assertExactKeys(
    metrics,
    ['fontFamily', 'fontSize', 'letterSpacing', 'lineHeight'],
    label,
  );
  const fontFamily = stringValue(metrics.fontFamily, `${label} fontFamily`);
  assert(fontFamily === 'Unifont', `${label} font`);
  const fontSize = finiteNumber(metrics.fontSize, `${label} fontSize`);
  const lineHeight = finiteNumber(metrics.lineHeight, `${label} lineHeight`);
  const letterSpacing = finiteNumber(metrics.letterSpacing, `${label} letterSpacing`);
  assert(fontSize > 0 && lineHeight > 0, `${label} positive metrics`);
  return { fontFamily, fontSize, lineHeight, letterSpacing };
}

function itemFrame(owner, label) {
  const size = recordValue(owner.size, label);
  return [
    finiteNumber(size.width, `${label} width`),
    finiteNumber(size.height, `${label} height`),
  ];
}

function edgesValue(value, label) {
  const edges = recordValue(value, label);
  assertExactKeys(edges, ['bottom', 'left', 'right', 'top'], label);
  return {
    top: finiteNumber(edges.top, `${label} top`),
    right: finiteNumber(edges.right, `${label} right`),
    bottom: finiteNumber(edges.bottom, `${label} bottom`),
    left: finiteNumber(edges.left, `${label} left`),
  };
}

function tintRgba(value, label) {
  assert(/^#[\da-f]{6}(?:[\da-f]{2})?$/iu.test(value), `${label} hex color`);
  const normalized = value.toLowerCase();
  return normalized.length === 7 ? `${normalized}ff` : normalized;
}

function projectSpecimen(id, probe, authored, surfaceGeometry) {
  const projection = probe.projection;
  const layoutBounds = boundsArray(projection.layoutBounds, `${id} layout bounds`);
  if (id === 'placed') {
    return {
      id,
      source: authored.source,
      placement: authored.placement,
      margin: compactEdges(authored.margin, `${id} margin`),
      tint: clone(authored.tint),
      localBounds: boundsTuple(probe.geometry.ownerLocalBounds, `${id} local bounds`),
      rgba: rgbaValue(projection.color, `${id} color`),
    };
  }
  if (id === 'auto') {
    return {
      id,
      source: authored.source,
      frame: clone(authored.frame),
      autoFont: {
        min: authored.autoFont.min,
        max: authored.autoFont.max,
        chosen: finiteNumber(projection.fontSizePx, `${id} fontSizePx`),
      },
      visibleText: stringOrEmpty(projection.visibleText, `${id} visible text`),
      layoutBounds,
    };
  }
  if (id === 'wrap') {
    return {
      id,
      source: authored.source,
      wrapWidth: authored.wrap.width,
      lines: cloneArray(projection.lines, `${id} lines`),
      layoutBounds,
    };
  }
  if (id === 'upright') {
    return {
      id,
      source: authored.source,
      placement: authored.placement,
      itemAngle: authored.itemAngle,
      orientation: authored.orientation,
      screenAngle: normalizeNumber(
        finiteNumber(surfaceGeometry.screenAngle, `${id} surface screen angle`),
      ),
      layoutBounds,
    };
  }
  return {
    id,
    source: authored.source,
    frame: clone(authored.frame),
    overflow: authored.overflow,
    visibleText: stringOrEmpty(projection.visibleText, `${id} visibleText`),
    layoutBounds,
  };
}

function specimenMatchesPinnedReference(entry, row) {
  if (!internallyCompleteCurrentProbe(entry.probe) || !isPlainObject(row)) return false;
  const reference = pinnedSpecimenReference(entry.id, entry.authored);
  const projection = entry.probe.projection;
  const probeFacts = {
    fontSizePx: normalizeNumber(projection.fontSizePx),
    lineCount: projection.lineCount,
    lines: clone(projection.lines),
    visibleLines: clone(projection.visibleLines),
    visibleText: projection.visibleText,
    layoutBounds: boundsArray(projection.layoutBounds, `${entry.id} oracle layout bounds`),
  };
  return sameJson(row, reference.row) && sameJson(probeFacts, reference.probeFacts);
}

function pinnedSpecimenReference(id, authored) {
  if (id === 'placed') {
    const layout = pinnedSingleLineLayout(authored.source, authored.metrics);
    const localBounds = pinnedPlacementBounds(
      authored.frame,
      layout.layoutBounds,
      authored.placement,
      authored.margin,
    );
    return pinnedReference({
      id,
      source: authored.source,
      placement: authored.placement,
      margin: compactEdges(authored.margin, `${id} oracle margin`),
      tint: clone(authored.tint),
      localBounds,
      rgba: tintRgba(authored.tint, `${id} oracle tint`),
    }, layout);
  }
  if (id === 'auto') {
    const chosen = pinnedAutoFontSize(
      authored.source,
      authored.metrics,
      authored.frame,
      authored.autoFont,
    );
    const layout = pinnedSingleLineLayout(authored.source, authored.metrics, chosen);
    return pinnedReference({
      id,
      source: authored.source,
      frame: clone(authored.frame),
      autoFont: {
        min: authored.autoFont.min,
        max: authored.autoFont.max,
        chosen,
      },
      visibleText: layout.visibleText,
      layoutBounds: clone(layout.layoutBounds),
    }, layout);
  }
  if (id === 'wrap') {
    const layout = pinnedWrappedLayout(
      authored.source,
      authored.metrics,
      authored.wrap.width,
    );
    return pinnedReference({
      id,
      source: authored.source,
      wrapWidth: authored.wrap.width,
      lines: clone(layout.lines),
      layoutBounds: clone(layout.layoutBounds),
    }, layout);
  }
  if (id === 'upright') {
    const layout = pinnedSingleLineLayout(authored.source, authored.metrics);
    return pinnedReference({
      id,
      source: authored.source,
      placement: authored.placement,
      itemAngle: authored.itemAngle,
      orientation: authored.orientation,
      screenAngle: 0,
      layoutBounds: clone(layout.layoutBounds),
    }, layout);
  }
  const layout = pinnedOverflowLayout(
    authored.source,
    authored.metrics,
    authored.frame,
    authored.overflow,
  );
  return pinnedReference({
    id,
    source: authored.source,
    frame: clone(authored.frame),
    overflow: authored.overflow,
    visibleText: layout.visibleText,
    layoutBounds: clone(layout.layoutBounds),
  }, layout);
}

function pinnedReference(row, layout) {
  return {
    row,
    probeFacts: {
      fontSizePx: layout.fontSizePx,
      lineCount: layout.lines.length,
      lines: clone(layout.lines),
      visibleLines: clone(layout.visibleLines),
      visibleText: layout.visibleText,
      layoutBounds: clone(layout.layoutBounds),
    },
  };
}

function pinnedSingleLineLayout(source, metrics, fontSize = metrics.fontSize) {
  const clusters = pinnedAsciiClusters(source);
  const width = pinnedLineWidth(clusters.length, metrics, fontSize);
  const height = pinnedLineHeight(metrics, fontSize);
  return {
    fontSizePx: fontSize,
    lines: [source],
    visibleLines: [source],
    visibleText: source,
    layoutBounds: [0, 0, width, height],
  };
}

function pinnedWrappedLayout(source, metrics, wrapWidth) {
  const clusters = pinnedAsciiClusters(source);
  const capacity = pinnedCapacity(wrapWidth, metrics, metrics.fontSize);
  const lines = [];
  for (let index = 0; index < clusters.length; index += capacity) {
    lines.push(clusters.slice(index, index + capacity).join(''));
  }
  if (lines.length === 0) lines.push('');
  const width = Math.max(...lines.map((line) => (
    pinnedLineWidth(pinnedAsciiClusters(line).length, metrics, metrics.fontSize)
  )));
  const height = pinnedLineHeight(metrics, metrics.fontSize) * lines.length;
  return {
    fontSizePx: metrics.fontSize,
    lines,
    visibleLines: lines,
    visibleText: lines.join('\n'),
    layoutBounds: [0, 0, normalizeNumber(width), normalizeNumber(height)],
  };
}

function pinnedOverflowLayout(source, metrics, frame, overflow) {
  const natural = pinnedSingleLineLayout(source, metrics);
  if (overflow === 'visible') return natural;
  const clusters = pinnedAsciiClusters(source);
  const capacity = pinnedCapacity(frame[0], metrics, metrics.fontSize);
  const truncated = clusters.length > capacity;
  const visible = overflow === 'ellipsis' && truncated
    ? `${clusters.slice(0, Math.max(0, capacity - 1)).join('')}…`
    : clusters.slice(0, capacity).join('');
  const visibleWidth = Math.min(
    frame[0],
    pinnedLineWidth(Array.from(visible).length, metrics, metrics.fontSize),
  );
  return {
    fontSizePx: metrics.fontSize,
    lines: [source],
    visibleLines: [visible],
    visibleText: visible,
    layoutBounds: [
      0,
      0,
      normalizeNumber(visibleWidth),
      normalizeNumber(Math.min(frame[1], pinnedLineHeight(metrics, metrics.fontSize))),
    ],
  };
}

function pinnedAutoFontSize(source, metrics, frame, autoFont) {
  const clusterCount = pinnedAsciiClusters(source).length;
  for (let candidate = Math.floor(autoFont.max); candidate >= Math.ceil(autoFont.min); candidate -= 1) {
    const width = pinnedLineWidth(clusterCount, metrics, candidate);
    const height = pinnedLineHeight(metrics, candidate);
    if (width <= frame[0] && height <= frame[1]) return candidate;
  }
  return autoFont.min;
}

function pinnedPlacementBounds(frame, layoutBounds, placement, margin) {
  const [, , width, height] = layoutBounds;
  if (placement === 'right-bottom') {
    return [
      normalizeNumber(frame[0] - margin.right - width),
      normalizeNumber(frame[1] - margin.bottom - height),
      width,
      height,
    ];
  }
  if (placement === 'center') {
    return [
      normalizeNumber((frame[0] - width) / 2),
      normalizeNumber((frame[1] - height) / 2),
      width,
      height,
    ];
  }
  return [0, 0, width, height];
}

function pinnedAsciiClusters(source) {
  assert(/^[\x20-\x7e]*$/u.test(source), 'pinned specimen source must be printable ASCII');
  return Array.from(source);
}

function pinnedCapacity(width, metrics, fontSize) {
  const advance = fontSize / 2;
  const capacity = Math.floor((width + metrics.letterSpacing) / (advance + metrics.letterSpacing));
  return Math.max(1, capacity);
}

function pinnedLineWidth(clusterCount, metrics, fontSize) {
  if (clusterCount === 0) return 0;
  return normalizeNumber(
    clusterCount * fontSize / 2 + (clusterCount - 1) * metrics.letterSpacing,
  );
}

function pinnedLineHeight(metrics, fontSize) {
  return normalizeNumber(metrics.lineHeight * fontSize / metrics.fontSize);
}

function compactEdges(value, label) {
  const edges = edgesValue(value, label);
  if (edges.top === edges.right && edges.top === edges.bottom && edges.top === edges.left) {
    return edges.top;
  }
  return edges;
}

function canonicalStandaloneTextStyle(projection) {
  const style = recordValue(projection.authoredStyle, 'primary authored text style');
  const projected = {
    fontFamily: stringValue(style.fontFamily, 'primary fontFamily'),
    fontSize: finiteNumber(style.fontSize, 'primary fontSize'),
    lineHeight: finiteNumber(style.lineHeight, 'primary lineHeight'),
    letterSpacing: finiteNumber(style.letterSpacing, 'primary letterSpacing'),
    fill: tintRgba(stringValue(style.fill, 'primary fill'), 'primary fill'),
  };
  assert(
    projected.fill === rgbaValue(projection.color, 'primary projected color'),
    'primary fill/color correlation',
  );
  return projected;
}

function phaseWithLines(probe, label) {
  return {
    source: probe.projection.source,
    lines: cloneArray(probe.projection.lines, `${label} lines`),
    layoutBounds: boundsArray(probe.projection.layoutBounds, `${label} layout bounds`),
  };
}

function currentProbe(product, key, target) {
  return validateTextProbe(probeAt(product, key), target, 'current');
}

function pendingProbe(product, key, target) {
  return validateTextProbe(probeAt(product, key), target, 'pending');
}

function productValue(value, label) {
  const product = recordValue(value, label);
  const snapshot = recordValue(product.snapshot, `${label} snapshot`);
  assert(snapshot.lifecycle === 'scene-ready', `${label} lifecycle`);
  recordValue(product.semanticProbe, `${label} semantic probe`);
  recordValue(product.geometryProbe, `${label} geometry probe`);
  assert(Array.isArray(product.exportedDataset), `${label} exported dataset`);
  assert(Array.isArray(product.textProbes), `${label} text probes`);
  validateTextRuntimeProbe(product.resources, `${label} resources`);
  return product;
}

function validateTextRuntimeProbe(value, label) {
  const resources = recordValue(value, label);
  assertExactKeys(
    resources,
    ['caseId', 'fontRuntime', 'journal', 'revision', 'supplemental', 'transport'],
    label,
  );
  assert(resources.revision === 'core-v2-text-runtime-probe/1', `${label} revision`);
  assert(resources.caseId === 'REN-006' || resources.caseId === 'REN-011', `${label} case ID`);
  const font = recordValue(resources.fontRuntime, `${label} fontRuntime`);
  assertExactKeys(
    font,
    ['assetLeaseCount', 'atlasLeaseCount', 'fontFaceCount', 'mode', 'pendingLoadCount'],
    `${label} fontRuntime`,
  );
  assert(font.mode === 'semantic-profile-only', `${label} font mode`);
  for (const field of ['fontFaceCount', 'atlasLeaseCount', 'assetLeaseCount', 'pendingLoadCount']) {
    assert(nonNegativeInteger(font[field], `${label} ${field}`) === 0, `${label} ${field} zero`);
  }
  const transport = recordValue(resources.transport, `${label} transport`);
  assertExactKeys(
    transport,
    ['externalFontRequestCount', 'networkRequestCount'],
    `${label} transport`,
  );
  assert(nonNegativeInteger(transport.networkRequestCount, `${label} network requests`) === 0, `${label} network requests zero`);
  assert(nonNegativeInteger(transport.externalFontRequestCount, `${label} external font requests`) === 0, `${label} external font requests zero`);
  const supplemental = recordValue(resources.supplemental, `${label} supplemental`);
  assertExactKeys(supplemental, ['factoryCallCount', 'specimenCount'], `${label} supplemental`);
  nonNegativeInteger(supplemental.factoryCallCount, `${label} factoryCallCount`);
  nonNegativeInteger(supplemental.specimenCount, `${label} specimenCount`);
  assert(Array.isArray(resources.journal), `${label} journal`);
  return resources;
}

function probeAt(product, key) {
  const matches = product.textProbes.filter((entry) => isPlainObject(entry) && entry.key === key);
  assert(matches.length === 1, `text probe ${key} count`);
  const entry = recordValue(matches[0], `text probe entry ${key}`);
  assert(sameJson(entry.target, recordValue(entry.probe, `text probe ${key}`).target), `text probe ${key} entry target`);
  return entry.probe;
}

function validateTextProbe(value, target, requiredStatus) {
  const probe = recordValue(value, `text probe ${targetKey(target)}`);
  assert(sameJson(probe.target, target), `text probe ${targetKey(target)} target`);
  stringValue(probe.semanticOwnerId, `text probe ${targetKey(target)} semantic owner`);
  stringValue(probe.entityId, `text probe ${targetKey(target)} entity ID`);
  const semantic = recordValue(probe.semantic, `text probe ${targetKey(target)} semantic`);
  const projection = recordValue(probe.projection, `text probe ${targetKey(target)} projection`);
  assert(semantic.source === projection.source, `text probe ${targetKey(target)} source parity`);
  assert(sameJson(semantic.authoredStyle, projection.authoredStyle), `text probe ${targetKey(target)} style parity`);
  assert(semantic.placement === projection.placement, `text probe ${targetKey(target)} placement parity`);
  assert(sameJson(semantic.margin, projection.margin), `text probe ${targetKey(target)} margin parity`);
  assert(
    semantic.contentOrientation === projection.contentOrientation,
    `text probe ${targetKey(target)} orientation parity`,
  );
  const authoredColor = semantic.tint ?? semantic.authoredStyle.fill;
  assert(
    tintRgba(
      stringValue(authoredColor, `text probe ${targetKey(target)} authored color`),
      `text probe ${targetKey(target)} authored color`,
    ) === rgbaValue(projection.color, `text probe ${targetKey(target)} projected color`),
    `text probe ${targetKey(target)} color parity`,
  );
  const geometry = recordValue(probe.geometry, `text probe ${targetKey(target)} geometry`);
  const localBounds = boundsTuple(geometry.localBounds, `text probe ${targetKey(target)} local bounds`);
  const ownerLocalBounds = boundsTuple(
    geometry.ownerLocalBounds,
    `text probe ${targetKey(target)} owner bounds`,
  );
  boundsTuple(geometry.worldBounds, `text probe ${targetKey(target)} world bounds`);
  assert(
    sameJson(geometry.worldBounds, geometry.hitBounds),
    `text probe ${targetKey(target)} hit geometry parity`,
  );
  const state = recordValue(probe.state, `text probe ${targetKey(target)} state`);
  booleanValue(state.visible, `text probe ${targetKey(target)} visible`);
  booleanValue(state.interactive, `text probe ${targetKey(target)} interactive`);
  finiteNumber(state.zIndex, `text probe ${targetKey(target)} zIndex`);
  finiteNumber(state.opacity, `text probe ${targetKey(target)} opacity`);
  const transform = recordValue(probe.transform, `text probe ${targetKey(target)} transform`);
  affineValue(transform.affine, `text probe ${targetKey(target)} affine`);
  basisValue(transform.worldBasis, `text probe ${targetKey(target)} world basis`);
  pointValue(transform.visibleCenter, `text probe ${targetKey(target)} visible center`);
  finiteNumber(transform.rotationDegrees, `text probe ${targetKey(target)} rotation`);
  finiteNumber(transform.scaleX, `text probe ${targetKey(target)} scaleX`);
  finiteNumber(transform.scaleY, `text probe ${targetKey(target)} scaleY`);
  assert(
    transform.contentOrientation === 'follow-item' || transform.contentOrientation === 'upright',
    `text probe ${targetKey(target)} orientation`,
  );
  validateProjection(projection, target);
  assert(
    sameJson(localBounds, boundsArray(projection.layoutBounds, `projection ${targetKey(target)} layout bounds`)),
    `text probe ${targetKey(target)} local layout correlation`,
  );
  assert(
    sameJson(
      ownerLocalBounds,
      boundsArray(projection.ownerLocalBounds, `projection ${targetKey(target)} owner bounds`),
    ),
    `text probe ${targetKey(target)} owner layout correlation`,
  );
  const renderer = validateRendererProbe(probe.renderer, projection, requiredStatus, target);
  const publication = recordValue(probe.publication, `text probe ${targetKey(target)} publication`);
  assert(publication.status === requiredStatus, `text probe ${targetKey(target)} publication status`);
  const revisions = recordValue(publication.revisions, `text probe ${targetKey(target)} revisions`);
  const current = recordValue(revisions.current, `text probe ${targetKey(target)} current revisions`);
  const published = recordValue(revisions.published, `text probe ${targetKey(target)} published revisions`);
  nonNegativeInteger(current.sceneRevision, `text probe ${targetKey(target)} scene revision`);
  nonNegativeInteger(current.viewRevision, `text probe ${targetKey(target)} view revision`);
  nonNegativeInteger(current.interactionRevision, `text probe ${targetKey(target)} interaction revision`);
  nonNegativeInteger(published.scene, `text probe ${targetKey(target)} published scene`);
  nonNegativeInteger(published.view, `text probe ${targetKey(target)} published view`);
  nonNegativeInteger(published.interaction, `text probe ${targetKey(target)} published interaction`);
  nonNegativeInteger(revisions.frameRevision, `text probe ${targetKey(target)} frame revision`);
  if (requiredStatus === 'current') {
    assert(published.scene === current.sceneRevision, `text probe ${targetKey(target)} scene correlation`);
    assert(published.view === current.viewRevision, `text probe ${targetKey(target)} view correlation`);
    assert(
      published.interaction === current.interactionRevision,
      `text probe ${targetKey(target)} interaction correlation`,
    );
    assert(
      revisions.surfaceSceneRevision === current.sceneRevision &&
        revisions.surfaceRenderedSceneRevision === current.sceneRevision,
      `text probe ${targetKey(target)} surface correlation`,
    );
    assert(revisions.rendererFrame === renderer.lastRenderedFrame, `text probe ${targetKey(target)} frame correlation`);
    assert(isPlainObject(probe.rendererPaint), `text probe ${targetKey(target)} renderer paint`);
    assert(isPlainObject(probe.renderLanes), `text probe ${targetKey(target)} render lanes`);
  }
  return probe;
}

function validateProjection(projection, target) {
  assert(typeof projection.source === 'string', `projection ${targetKey(target)} source`);
  assert(typeof projection.layoutSource === 'string', `projection ${targetKey(target)} layout source`);
  assert(projection.sourcePreserved === true, `projection ${targetKey(target)} source preserved`);
  assert(projection.unicodeNormalizationApplied === false, `projection ${targetKey(target)} normalization`);
  for (const field of [
    'graphemes',
    'layoutGraphemes',
    'hardLines',
    'splitLines',
    'lines',
    'visibleLines',
    'fontRuns',
    'sourceFontRuns',
    'visibleFontRuns',
    'missingGlyphs',
    'bidiLines',
    'diagnostics',
  ]) assert(Array.isArray(projection[field]), `projection ${targetKey(target)} ${field}`);
  assert(projection.graphemes.join('') === projection.source, `projection ${targetKey(target)} graphemes`);
  assert(projection.lines.length === projection.lineCount, `projection ${targetKey(target)} line count`);
  assert(
    projection.visibleLines.join('\n') === projection.visibleText,
    `projection ${targetKey(target)} visible text`,
  );
  assert(projection.baseDirection === 'ltr' || projection.baseDirection === 'rtl', `projection ${targetKey(target)} direction`);
  for (const field of [
    'fontSizePx',
    'lineHeightPx',
    'alphabeticBaselinePx',
    'letterSpacingPx',
    'split',
  ]) finiteNumber(projection[field], `projection ${targetKey(target)} ${field}`);
  boundsRecord(projection.naturalLayoutBounds, `projection ${targetKey(target)} natural bounds`);
  boundsRecord(projection.layoutBounds, `projection ${targetKey(target)} layout bounds`);
  boundsRecord(projection.ownerLocalBounds, `projection ${targetKey(target)} owner bounds`);
  assert(
    projection.rendererRoute === 'bitmap-text' || projection.rendererRoute === 'pixi-text',
    `projection ${targetKey(target)} semantic route`,
  );
  stringValue(projection.contentSignature, `projection ${targetKey(target)} content signature`);
  stringValue(projection.styleSignature, `projection ${targetKey(target)} style signature`);
  stringValue(projection.layoutSignature, `projection ${targetKey(target)} layout signature`);
  recordValue(projection.authoredStyle, `projection ${targetKey(target)} authored style`);
  finiteNumber(projection.color, `projection ${targetKey(target)} color`);
}

function validateRendererProbe(value, projection, requiredStatus, target) {
  const renderer = recordValue(value, `renderer ${targetKey(target)}`);
  assert(
    renderer.attachedRoute === 'bitmap-text' || renderer.attachedRoute === 'pixi-text',
    `renderer ${targetKey(target)} attached route`,
  );
  assert(
    renderer.plannedRoute === renderer.attachedRoute,
    `renderer ${targetKey(target)} planned route`,
  );
  assert(renderer.objectKind === renderer.attachedRoute, `renderer ${targetKey(target)} object kind`);
  assert(renderer.objectCount === 1, `renderer ${targetKey(target)} object count`);
  const semantic = signatureValue(renderer.semanticSignatures, `renderer ${targetKey(target)} semantic signatures`);
  assert(semantic.content === projection.contentSignature, `renderer ${targetKey(target)} content signature`);
  assert(semantic.style === projection.styleSignature, `renderer ${targetKey(target)} style signature`);
  assert(semantic.layout === projection.layoutSignature, `renderer ${targetKey(target)} layout signature`);
  const attached = attachedSignatureValue(renderer.attachedSignatures, `renderer ${targetKey(target)} attached signatures`);
  const rendered = attachedSignatureValue(
    renderer.lastRenderedSignatures,
    `renderer ${targetKey(target)} rendered signatures`,
  );
  nonNegativeInteger(renderer.lastRenderedFrame, `renderer ${targetKey(target)} frame`);
  nonNegativeInteger(renderer.staleGlyphCount, `renderer ${targetKey(target)} stale glyph count`);
  if (requiredStatus === 'current') {
    assert(signaturePrefixEqual(attached, semantic), `renderer ${targetKey(target)} attachment correlation`);
    assert(sameJson(attached, rendered), `renderer ${targetKey(target)} rendered correlation`);
    assert(renderer.staleGlyphCount === 0, `renderer ${targetKey(target)} stale glyph drain`);
  } else {
    assert(
      !signaturePrefixEqual(attached, semantic),
      `renderer ${targetKey(target)} pending semantic correlation`,
    );
    assert(sameJson(attached, rendered), `renderer ${targetKey(target)} prior frame retention`);
    assert(renderer.staleGlyphCount > 0, `renderer ${targetKey(target)} pending stale glyph proof`);
  }
  return renderer;
}

function internallyCompleteCurrentProbe(probe) {
  return probe.publication.status === 'current' &&
    probe.renderer.objectCount === 1 &&
    probe.renderer.staleGlyphCount === 0 &&
    sameJson(probe.renderer.attachedSignatures, probe.renderer.lastRenderedSignatures) &&
    graphemeIntegrity(probe) &&
    finiteTree(probe.geometry) &&
    finiteTree(probe.transform);
}

function stableTextSemantics(before, after) {
  return before.entityId === after.entityId &&
    sameJson(before.projection, after.projection) &&
    sameJson(before.geometry, after.geometry) &&
    sameJson(before.state, after.state) &&
    sameJson(before.transform, after.transform) &&
    sameJson(before.renderer.semanticSignatures, after.renderer.semanticSignatures) &&
    before.renderer.attachedRoute === after.renderer.attachedRoute &&
    before.renderer.objectCount === after.renderer.objectCount;
}

function graphemeIntegrity(probe) {
  return probe.projection.graphemes.join('') === probe.projection.source &&
    !hasUnpairedSurrogate(probe.projection.source);
}

function hasUnpairedSurrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return true;
  }
  return false;
}

function projectScene(snapshot) {
  const revisions = recordValue(snapshot.revisions, 'terminal revisions');
  return {
    _availability: { terminalSnapshot: 'available', publicTextProbe: 'available' },
    revision: nonNegativeInteger(revisions.sceneRevision, 'scene revision'),
    rootIds: cloneArray(snapshot.rootIds, 'root IDs'),
  };
}

function projectGeometryFoundation(semantic) {
  const geometry = recordValue(semantic.geometry, 'semantic geometry');
  return {
    _availability: { semanticProbe: 'available', publicTextProbe: 'available' },
    finiteValueCount: nonNegativeInteger(geometry.finiteValueCount, 'geometry finiteValueCount'),
  };
}

function projectPaintFoundation(semantic, snapshot) {
  const paint = recordValue(semantic.paint, 'semantic paint');
  return {
    _availability: { semanticProbe: 'available', rendererDebug: 'available' },
    intentCount: nonNegativeInteger(paint.intentCount, 'paint intentCount'),
    resolvedCount: nonNegativeInteger(paint.resolvedCount, 'paint resolvedCount'),
    unresolvedCount: nonNegativeInteger(paint.unresolvedCount, 'paint unresolvedCount'),
    commandCount: renderCommandCount(snapshot),
  };
}

function projectInteractionFoundation(semantic) {
  const interaction = recordValue(semantic.interaction, 'semantic interaction');
  return {
    _availability: { semanticProbe: 'available', publicTextProbe: 'available' },
    activeGestureCount: nonNegativeInteger(
      interaction.activeGestureCount,
      'interaction activeGestureCount',
    ),
  };
}

function projectHistory(semantic, snapshot) {
  const history = recordValue(semantic.history, 'semantic history');
  return {
    _availability: { semanticProbe: 'available', terminalSnapshot: 'available' },
    depth: nonNegativeInteger(history.depth, 'history depth'),
    snapshotDepth: nonNegativeInteger(snapshot.historyDepth, 'snapshot history depth'),
  };
}

function projectResources(execution, snapshot) {
  return {
    _availability: {
      cleanup: 'available',
      terminalSnapshot: 'available',
      textResourceProbe: 'available',
    },
    cleanup: clone(execution.cleanup),
    terminal: clone(recordValue(snapshot.resources, 'terminal resources')),
    retainedDelta: 0,
  };
}

function validateCleanupJournalContinuation(cleanupValue, terminalValue) {
  const cleanup = recordValue(cleanupValue, 'cleanup productResources');
  const terminal = validateTextRuntimeProbe(terminalValue, 'terminal text resources');
  assert(terminal.caseId === cleanup.caseId, 'terminal resource case correlation');
  assert(Array.isArray(cleanup.journal), 'cleanup product journal');
  assert(
    cleanup.journal.length === terminal.journal.length + 1,
    'cleanup journal adds exactly one release event',
  );
  assert(
    sameJson(cleanup.journal.slice(0, terminal.journal.length), terminal.journal),
    'cleanup journal extends terminal resources',
  );
}

function projectRevisions(snapshot) {
  const revisions = recordValue(snapshot.revisions, 'snapshot revisions');
  return {
    _availability: { terminalSnapshot: 'available' },
    scene: nonNegativeInteger(revisions.sceneRevision, 'scene revision'),
    view: nonNegativeInteger(revisions.viewRevision, 'view revision'),
    interaction: nonNegativeInteger(revisions.interactionRevision, 'interaction revision'),
    frame: { revision: nonNegativeInteger(snapshot.frameRevision, 'frame revision') },
    publishedTuple: cloneRecord(snapshot.publishedTuple, 'published tuple'),
  };
}

function projectCase(plan, execution) {
  return {
    id: plan.id,
    caseType: plan.caseType,
    params: cloneRecord(plan.routeParams, 'route params'),
    ...(typeof plan.fixtureSha256 === 'string' ? { fixtureSha256: plan.fixtureSha256 } : {}),
    ...(typeof plan.rootTestId === 'string' ? { rootTestId: plan.rootTestId } : {}),
    executedActions: execution.actionResults.map(({ index, type, status }) => ({
      index,
      type,
      status,
    })),
  };
}

function projectSafeFixtures(plan, definition) {
  return {
    datasetRef: definition.datasetRef,
    fixtureParamKeys: [...definition.fixtureKeys],
  };
}

function projectCaptures(plan, execution, definition) {
  assert(Array.isArray(execution.captures), 'execution captures');
  assert(execution.captures.length === definition.checkpoints.length, 'capture count');
  const captures = {};
  execution.captures.forEach((captureValue, index) => {
    const capture = recordValue(captureValue, `capture ${index}`);
    const checkpoint = definition.checkpoints[index];
    assert(capture.id === checkpoint.id, `capture ${index} ID`);
    assert(capture.phase === checkpoint.phase, `capture ${index} phase`);
    assert(capture.afterActionIndex === checkpoint.afterActionIndex, `capture ${index} action`);
    const values = recordValue(capture.values, `capture ${index} values`);
    assertExactKeys(values, checkpoint.paths, `capture ${index} values`);
    const projected = {};
    for (const path of checkpoint.paths) {
      projected[path] = path.endsWith('Bounds')
        ? boundsObject(values[path], `capture ${index} ${path}`)
        : clone(values[path]);
    }
    captures[capture.id] = projected;
  });
  return captures;
}

function validateInputEvidence(value, label) {
  const input = recordValue(value, label);
  stringValue(input.beforeFingerprint, `${label} before fingerprint`);
  stringValue(input.afterFingerprint, `${label} after fingerprint`);
  assert(input.beforeFingerprint === input.afterFingerprint, `${label} fingerprint parity`);
  assert(input.unchanged === true, `${label} immutable`);
  if (Object.hasOwn(input, 'datasetRef')) stringValue(input.datasetRef, `${label} datasetRef`);
  return input;
}

function actionActualAt(execution, index, type) {
  const result = execution.actionResults[index];
  assert(result?.type === type, `action ${index} must be ${type}`);
  return recordValue(recordValue(result.delta, `action ${index} delta`).actual, `action ${index} actual`);
}

function renderCommandCount(snapshotValue) {
  const snapshot = recordValue(snapshotValue, 'render snapshot');
  const resources = recordValue(snapshot.resources, 'render resources');
  const rendering = recordValue(resources.rendering, 'rendering resources');
  return nonNegativeInteger(rendering.commandCount, 'render command count');
}

function rgbaValue(value, label) {
  const packed = finiteNumber(value, label);
  assert(Number.isInteger(packed) && packed >= 0 && packed <= 0xffff_ffff, `${label} RGBA`);
  return `#${(packed >>> 0).toString(16).padStart(8, '0')}`;
}

function signatureValue(value, label) {
  const signatures = recordValue(value, label);
  return {
    content: stringValue(signatures.content, `${label}.content`),
    style: stringValue(signatures.style, `${label}.style`),
    layout: stringValue(signatures.layout, `${label}.layout`),
  };
}

function attachedSignatureValue(value, label) {
  const signatures = signatureValue(value, label);
  const record = recordValue(value, label);
  return { ...signatures, renderer: stringValue(record.renderer, `${label}.renderer`) };
}

function signaturePrefixEqual(attached, semantic) {
  return attached.content === semantic.content &&
    attached.style === semantic.style &&
    attached.layout === semantic.layout;
}

function boundsObject(value, label) {
  if (Array.isArray(value)) {
    const [x, y, width, height] = boundsTuple(value, label);
    return { x, y, width, height };
  }
  const bounds = boundsRecord(value, label);
  return {
    x: normalizeNumber(bounds.x),
    y: normalizeNumber(bounds.y),
    width: normalizeNumber(bounds.width),
    height: normalizeNumber(bounds.height),
  };
}

function boundsArray(value, label) {
  if (Array.isArray(value)) return boundsTuple(value, label);
  const bounds = boundsRecord(value, label);
  return [
    normalizeNumber(bounds.x),
    normalizeNumber(bounds.y),
    normalizeNumber(bounds.width),
    normalizeNumber(bounds.height),
  ];
}

function boundsTuple(value, label) {
  assert(Array.isArray(value) && value.length === 4, `${label} tuple`);
  return value.map((entry, index) => normalizeNumber(finiteNumber(entry, `${label}[${index}]`)));
}

function boundsRecord(value, label) {
  const bounds = recordValue(value, label);
  for (const field of ['x', 'y', 'width', 'height']) finiteNumber(bounds[field], `${label}.${field}`);
  return bounds;
}

function affineValue(value, label) {
  assert(Array.isArray(value) && value.length === 6, `${label} affine`);
  value.forEach((entry, index) => finiteNumber(entry, `${label}[${index}]`));
  return value;
}

function basisValue(value, label) {
  assert(Array.isArray(value) && value.length === 4, `${label} basis`);
  return value.map((entry, index) => finiteNumber(entry, `${label}[${index}]`));
}

function pointValue(value, label) {
  assert(Array.isArray(value) && value.length === 2, `${label} point`);
  value.forEach((entry, index) => finiteNumber(entry, `${label}[${index}]`));
  return value;
}

function finiteTree(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(finiteTree);
  if (!isPlainObject(value)) return true;
  return Object.values(value).every(finiteTree);
}

function elementTarget(id) {
  return Object.freeze({ kind: 'element', id });
}

function componentTarget(ownerId, id) {
  return Object.freeze({ kind: 'component', ownerId, id });
}

function targetKey(target) {
  return target.kind === 'element' ? target.id : `${target.ownerId}:${target.id}`;
}

function traceAction(type, operands) {
  return Object.freeze({ type, operands: deepFreeze(operands) });
}

function notExercised(reason) {
  return {
    _availability: { exercised: `not-exercised:${reason}` },
    exercised: false,
  };
}

function cloneRecord(value, label) {
  return clone(recordValue(value, label));
}

function cloneArray(value, label) {
  assert(Array.isArray(value), `${label} array`);
  return clone(value);
}

function recordValue(value, label) {
  assert(isPlainObject(value), `${label} must be an object`);
  return value;
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} non-empty string`);
  return value;
}

function stringOrEmpty(value, label) {
  assert(typeof value === 'string', `${label} string`);
  return value;
}

function nullableString(value, label) {
  if (value === null || value === undefined) return null;
  return stringValue(value, label);
}


function optionalBoolean(value, label) {
  if (value === null || value === undefined) return false;
  return booleanValue(value, label);
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} finite number`);
  return value;
}

function nullableFiniteNumber(value, label) {
  if (value === null || value === undefined) return null;
  return finiteNumber(value, label);
}

function nonNegativeInteger(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0, `${label} non-negative integer`);
  return value;
}

function uint32(value, label) {
  assert(Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff, `${label} uint32`);
  return value;
}

function normalizeNumber(value) {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function historicalTextRoute(route) {
  if (route === 'bitmap-text') return route;
  assert(route === 'pixi-text', 'historical text route source');
  // Immutable Core v2 normalized evidence predates the unambiguous Pixi object name.
  return 'fallback-text';
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
    assert(isPlainObject(value), `${label} JSON record`);
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

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}


function assert(condition, message) {
  if (!condition) throw new Error(`Core v2 render-text fold invalid: ${message}`);
}
