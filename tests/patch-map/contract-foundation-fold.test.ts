import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

interface FoldRuntime {
  readonly FOUNDATION_FOLD_REVISION: string;
  foldFoundationExecution(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): Readonly<{
    actual: Readonly<Record<string, unknown>>;
    fixtures: Readonly<Record<string, unknown>>;
    captures: Readonly<Record<string, unknown>>;
  }>;
}

interface ObserverRuntime {
  createSemanticObservation(
    this: void,
    options: Readonly<{ observation: unknown }>,
  ): Readonly<{ actualSemanticSha256: string; actualObservationSha256: string }>;
}

const [foldRuntime, observerRuntime] = await Promise.all([
  loadRuntime<FoldRuntime>('../../scripts/verification/core-v2-contract/fold-foundation.mjs'),
  loadRuntime<ObserverRuntime>('../../scripts/verification/core-v2-contract/observe.mjs'),
]);

const { FOUNDATION_FOLD_REVISION, foldFoundationExecution } = foldRuntime;
const { createSemanticObservation } = observerRuntime;

const ACTIONS = {
  'LIF-001': ['initialize', 'initialize'],
  'LIF-002': [
    'initialize',
    'snapshot-resolved-dataset',
    'exercise-authoritative-draw-races',
    'publishFrame',
  ],
  'DAT-001': ['loadDataset', 'queryAll', 'attemptStrictLoadVariant'],
  'DAT-002': ['freezeInput', 'loadDataset', 'snapshot', 'loadDataset', 'snapshot'],
  'CSM-001': [
    'initialize-engine',
    'load-scene',
    'await-first-useful-frame',
    'probe-declared-failure',
  ],
  'CSM-003': [
    'set-host-state',
    'set-host-state',
    'load-scene',
    'query-target',
    'probe-declared-failure',
  ],
} as const;

type FoundationCaseId = keyof typeof ACTIONS;

type JsonRecord = Record<string, unknown>;

interface MutableAction {
  index: number;
  type: string;
  operands: JsonRecord;
}

interface MutableCheckpoint {
  id: string;
  phase: string;
  afterActionIndex: number;
  paths: string[];
}

interface MutablePlan extends JsonRecord {
  id: FoundationCaseId;
  caseType: string;
  rootTestId: string;
  fixtureSha256: string;
  routeParams: { size: string; seed: number };
  actionTrace: MutableAction[];
  fixture: {
    setup: { params: JsonRecord };
    actionTrace: MutableAction[];
    captureCheckpoints: MutableCheckpoint[];
  };
}

interface MutableCapture extends JsonRecord {
  id: string;
  phase: string;
  afterActionIndex: number;
  values: JsonRecord;
}

interface MutableDelta extends JsonRecord {
  actual: JsonRecord;
  semanticProbe: JsonRecord | null;
}

interface MutableActionResult extends JsonRecord {
  status: string;
  delta: MutableDelta;
}

interface MutableExecution extends JsonRecord {
  actionResults: MutableActionResult[];
  bindings: Record<string, unknown>;
  captures: MutableCapture[];
  eventJournal: JsonRecord[];
  terminalSemanticProbe: JsonRecord | null;
}

const DOMAINS = [
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
] as const;

describe('PatchMap actual-only foundation observation fold', () => {
  it('is a browser-safe pure projector behind the verifier dependency firewall', async () => {
    expect(FOUNDATION_FOLD_REVISION).toBe('core-v2-foundation-fold/1');
    const source = await readFile(
      fileURLToPath(new URL('../../scripts/verification/core-v2-contract/fold-foundation.mjs', import.meta.url)),
      'utf8',
    );
    const forbiddenCatalog = ['catalog', 'normalized', 'expected', 'v1', 'json'].join('-');

    expect(source).not.toContain(forbiddenCatalog);
    expect(source).not.toMatch(/from\s+['"][^'"]*compare\.mjs['"]/);
    expect(source).not.toMatch(/from\s+['"][^'"]*observe\.mjs['"]/);
    expect(source).not.toMatch(/node:/);
    expect(source).not.toMatch(/^\s*import\s/m);
  });

  it.each(Object.keys(ACTIONS) as FoundationCaseId[])(
    'emits all fourteen domains for %s and passes external observation validation',
    (caseId) => {
      const result = fold(caseId);
      const observed = createSemanticObservation({ observation: result.actual });

      expect(DOMAINS.every((domain) => isRecord(result.actual[domain]))).toBe(true);
      expect(observed.actualSemanticSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(observed.actualObservationSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(isDeepFrozen(result)).toBe(true);
      expect(valueAt(result.actual, 'outcome.recorded')).toBe(true);
      expect(JSON.stringify(result.actual)).not.toContain('"status":"pass"');
    },
  );

  it('leaves missing product, browser, and packed-host facts unresolved instead of inventing defaults', () => {
    const execution = makeExecution('CSM-001', { semanticProbe: false });
    const result = fold('CSM-001', { execution });

    expect(valueAt(result.actual, 'scene._availability.semanticProbe')).toBe('unavailable');
    expect(result.actual.scene).not.toHaveProperty('nodes');
    expect(result.actual.geometry).not.toHaveProperty('finiteValueCount');
    expect(result.actual.paint).not.toHaveProperty('unresolvedIntentCount');
    expect(result.actual.interaction).not.toHaveProperty('staleGestureCount');
    expect(result.actual.outcome).not.toHaveProperty('hostEngineSeam');
    expect(valueAt(result.actual, 'provenance.hostEvidence.promotionEligible')).toBe(false);
    expect(valueAt(result.actual, 'extensions.foundationHostSeam.promotionEligible')).toBe(false);
  });

  it('detaches fixture and capture roots and rejects every duplicate capture name', () => {
    const plan = makePlan('LIF-002');
    plan.fixture.captureCheckpoints = [{
      id: 'afterLatestSuccess',
      phase: 'after-action',
      afterActionIndex: 2,
      paths: ['sceneSemanticHash'],
    }];
    const execution = makeExecution('LIF-002');
    execution.bindings = {
      inputBefore: { dataset: [{ type: 'item', id: 'item-a' }] },
    };
    execution.captures = [{
      id: 'afterLatestSuccess',
      phase: 'after-action',
      afterActionIndex: 2,
      values: { sceneSemanticHash: 'fnv1a64:1111111111111111' },
    }];
    const result = fold('LIF-002', { casePlan: plan, execution });

    expect(result.fixtures).toEqual(plan.fixture.setup.params);
    expect(valueAt(result.captures, 'inputBefore.dataset.0.id')).toBe('item-a');
    expect(valueAt(result.captures, 'afterLatestSuccess.sceneSemanticHash')).toBe(
      'fnv1a64:1111111111111111',
    );
    (plan.fixture.setup.params.minimalDataset as unknown[]).push({ type: 'rect' });
    expect(result.fixtures.minimalDataset).toEqual([{ type: 'item', id: 'fixture-item' }]);

    const collisionExecution = structuredClone(execution);
    collisionExecution.bindings.afterLatestSuccess = { sceneSemanticHash: 'collision' };
    expect(() => fold('LIF-002', { casePlan: makePlanWithCheckpoint('LIF-002'), execution: collisionExecution }))
      .toThrow(/collides/);

    const duplicateExecution = structuredClone(execution);
    const duplicateCapture = duplicateExecution.captures[0];
    if (!duplicateCapture) throw new Error('missing duplicate capture fixture');
    duplicateExecution.captures.push(structuredClone(duplicateCapture));
    expect(() => fold('LIF-002', { casePlan: makePlanWithCheckpoint('LIF-002'), execution: duplicateExecution }))
      .toThrow(/duplicate capture/);
  });

  it('is deterministic, deeply frozen, and detached from every caller-owned input', () => {
    const plan = makePlan('DAT-001');
    const execution = makeExecution('DAT-001');
    const first = fold('DAT-001', { casePlan: plan, execution });
    const second = fold('DAT-001', {
      casePlan: structuredClone(plan),
      execution: structuredClone(execution),
    });

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(isDeepFrozen(first)).toBe(true);
    const callerDiagnostic = valueAt(execution, 'actionResults.2.delta.actual.diagnostic');
    if (!isRecord(callerDiagnostic)) throw new Error('missing caller diagnostic');
    callerDiagnostic.code = 'CALLER_MUTATION';
    expect(valueAt(first.actual, 'outcome.validation.unsupportedType.code')).toBe('INVALID_RECORD_KIND');
  });

  it('preserves closed product diagnostics and their actual paths without aliases', () => {
    const lifecycle = fold('LIF-002');
    const dataset = fold('DAT-001');

    expect(valueAt(lifecycle.actual, 'outcome.failedLater.diagnostic.code')).toBe('INVALID_VALUE');
    expect(valueAt(lifecycle.actual, 'outcome.failedLater.code')).toBe('INVALID_VALUE');
    expect(valueAt(dataset.actual, 'outcome.validation.unsupportedType.code')).toBe('INVALID_RECORD_KIND');
    expect(valueAt(dataset.actual, 'outcome.validation.unsupportedType.path')).toBe('$[7].type');
    expect(JSON.stringify(lifecycle.actual)).not.toContain('INVALID_DATASET');
    expect(JSON.stringify(dataset.actual)).not.toContain('INVALID_DISCRIMINATOR');
  });

  it('projects post-use input observations, actual completion order, and fresh-session exports', () => {
    const lifecycle = fold('LIF-002');
    const defaults = fold('DAT-002');

    expect(valueAt(lifecycle.actual, 'outcome.pending.completionOrder')).toEqual(['draw-b', 'draw-a']);
    expect(valueAt(lifecycle.actual, 'outcome.input.dataset')).toEqual([{ type: 'item', id: 'item-a' }]);
    expect(valueAt(lifecycle.actual, 'outcome.input.authoritativeSubmitted.postUseGraph')).toEqual([
      { type: 'item', id: 'item-b' },
    ]);
    expect(valueAt(defaults.actual, 'outcome.input.minimal')).toEqual([{ type: 'item' }]);
    expect(valueAt(defaults.actual, 'outcome.session1.item')).toMatchObject({
      show: true,
      locked: false,
      padding: [0, 0, 0, 0],
      contentOrientation: 'upright',
    });
    expect(valueAt(defaults.actual, 'outcome.session1.bar')).toMatchObject({
      placement: 'bottom',
      animationDuration: 200,
    });
    expect(valueAt(defaults.actual, 'outcome.session1.text.split')).toBe(0);
    expect(valueAt(defaults.actual, 'outcome.session2.item')).toMatchObject({
      show: true,
      locked: false,
      padding: [0, 0, 0, 0],
      contentOrientation: 'upright',
    });
    expect(valueAt(defaults.actual, 'outcome.session2.bar')).toMatchObject({
      placement: 'bottom',
      animationDuration: 200,
    });
    expect(valueAt(defaults.actual, 'outcome.session2.text.split')).toBe(0);
    expect(valueAt(defaults.actual, 'outcome.session1.semanticHash')).toBe(
      valueAt(defaults.actual, 'outcome.session2.semanticHash'),
    );
    expect(valueAt(fold('CSM-003').actual, 'outcome.missingQuery')).toBeNull();
  });

  it('classifies the public event journal without inferring events from action returns', () => {
    const execution = makeExecution('LIF-002');
    execution.eventJournal = [
      event(1, 'ready', { lifecycle: 'ready-empty' }),
      event(2, 'drawComplete', { requestId: 'draw-b', sceneRevision: 1 }),
      event(3, 'frame', { frameRevision: 1 }),
    ];
    const result = fold('LIF-002', { execution });

    expect(valueAt(result.actual, 'events.ready.count')).toBe(1);
    expect(valueAt(result.actual, 'events.drawComplete.count')).toBe(1);
    expect(valueAt(result.actual, 'events.drawComplete.0.requestId')).toBe('draw-b');
    expect(valueAt(result.actual, 'events.drawComplete.0.revision')).toBe(1);
    expect(valueAt(result.actual, 'events.staleCompletionCount')).toBe(0);
    expect(valueAt(result.actual, 'events.unclassifiedCount')).toBe(0);
    expect(valueAt(result.actual, 'events.ordered')).toHaveLength(3);
  });

  it('promotes host facts only from an explicit packed-host probe', () => {
    const hostProbe = {
      $schema: 'core-v2-packed-host-probe/1',
      caseId: 'CSM-001',
      promotionEligible: true,
      engineReturns: { lifecycle: 'scene-ready' },
      failureRollback: { retainedSceneRevision: 1 },
      finalState: { lifecycle: 'scene-ready', selectedIds: [] },
    };
    const result = fold('CSM-001', { hostProbe });

    expect(valueAt(result.actual, 'outcome.hostEngineSeam')).toEqual({
      engineReturns: hostProbe.engineReturns,
      failureRollback: hostProbe.failureRollback,
      finalState: hostProbe.finalState,
    });
    expect(valueAt(result.actual, 'provenance.hostEvidence.promotionEligible')).toBe(true);
    expect(result.actual).not.toHaveProperty('extensions');
  });

  it('merges independently observed browser interaction and history quality facts', () => {
    const result = fold('CSM-001', {
      browserProbe: {
        $schema: 'patch-map-browser-probe/1',
        caseId: 'CSM-001',
        history: { corruptEntryCount: 0 },
        interaction: { staleGestureCount: 0 },
      },
    });

    expect(valueAt(result.actual, 'history.corruptEntryCount')).toBe(0);
    expect(valueAt(result.actual, 'interaction.staleGestureCount')).toBe(0);
  });

  it('rejects wrong order/status, malformed probes, and source collisions', () => {
    const wrongOrder = makePlan('LIF-001');
    wrongOrder.actionTrace[0]!.type = 'snapshot';
    wrongOrder.fixture.actionTrace = structuredClone(wrongOrder.actionTrace);
    expect(() => fold('LIF-001', { casePlan: wrongOrder })).toThrow(/action 0 type/);

    const failed = makeExecution('LIF-001');
    failed.actionResults[0]!.status = 'failed';
    expect(() => fold('LIF-001', { execution: failed })).toThrow(/action 0 status/);

    const malformed = makeExecution('DAT-001');
    const malformedGeometry = valueAt(malformed, 'terminalSemanticProbe.geometry');
    if (!isRecord(malformedGeometry)) throw new Error('missing malformed geometry');
    malformedGeometry.allFinite = false;
    expect(() => fold('DAT-001', { execution: malformed })).toThrow(/allFinite consistency/);

    expect(() => fold('DAT-001', {
      browserProbe: {
        $schema: 'patch-map-browser-probe/1',
        caseId: 'DAT-001',
        geometry: { finiteValueCount: 999 },
      },
    })).toThrow(/collides at finiteValueCount/);
  });
});

async function loadRuntime<T>(relativePath: string): Promise<T> {
  const moduleNamespace: unknown = await import(
    /* @vite-ignore */ new URL(relativePath, import.meta.url).href
  );
  return moduleNamespace as T;
}

function fold(
  caseId: FoundationCaseId,
  overrides: Readonly<Record<string, unknown>> = {},
): ReturnType<FoldRuntime['foldFoundationExecution']> {
  return foldFoundationExecution({
    casePlan: makePlan(caseId),
    execution: makeExecution(caseId),
    provenance: { codeCommit: 'test-commit', runnerRevision: FOUNDATION_FOLD_REVISION },
    environment: { browser: 'test-browser', backend: 'webgl2' },
    ...overrides,
  });
}

function makePlan(caseId: FoundationCaseId): MutablePlan {
  const actions = ACTIONS[caseId].map((type, index) => ({ index, type, operands: {} }));
  return {
    id: caseId,
    caseType: caseId.startsWith('CSM') ? 'consumer-journey' : 'capability',
    rootTestId: `scenario-${caseId.toLowerCase()}`,
    fixtureSha256: 'a'.repeat(64),
    routeParams: { size: '100', seed: 319 },
    actionTrace: structuredClone(actions),
    fixture: {
      setup: { params: { minimalDataset: [{ type: 'item', id: 'fixture-item' }] } },
      actionTrace: structuredClone(actions),
      captureCheckpoints: [],
    },
  };
}

function makePlanWithCheckpoint(caseId: 'LIF-002'): MutablePlan {
  const plan = makePlan(caseId);
  plan.fixture.captureCheckpoints = [{
    id: 'afterLatestSuccess',
    phase: 'after-action',
    afterActionIndex: 2,
    paths: ['sceneSemanticHash'],
  }];
  return plan;
}

function makeExecution(
  caseId: FoundationCaseId,
  options: Readonly<{ semanticProbe?: boolean }> = {},
): MutableExecution {
  const probe = options.semanticProbe === false ? null : semanticProbe(caseId);
  const terminal = terminalSnapshot(caseId);
  const actionResults = ACTIONS[caseId].map((type, index) => ({
    index,
    type,
    handlerId: `contract/${type}`,
    status: 'completed',
    startedAtMs: index,
    completedAtMs: index + 1,
    delta: {
      $schema: 'core-v2-semantic-observation-delta/1',
      caseId,
      actionIndex: index,
      actionType: type,
      actual: actionActual(caseId, type, index, terminal),
      semanticProbe: probe,
    },
  }));
  const journey = caseId.startsWith('CSM');
  return {
    $schema: 'core-v2-contract-case-execution/1',
    caseId,
    caseType: journey ? 'consumer-journey' : 'capability',
    status: 'completed',
    actionResults,
    captures: [],
    bindings: {},
    datasetObservations: caseId === 'DAT-002'
      ? {
          'minimal-defaults': datasetObservation('minimal-defaults', [{ type: 'item' }]),
        }
      : {},
    eventJournal: [event(1, 'ready', { lifecycle: terminal.lifecycle })],
    hostSeamDelta: journey
      ? {
          $schema: 'core-v2-host-seam-delta/1',
          caseId,
          capabilityPassInherited: false,
          status: 'completed',
          actions: [],
        }
      : null,
    terminalSnapshot: terminal,
    terminalSemanticProbe: probe,
    cleanup: {
      status: 'completed',
      declaredActions: ['destroy-case'],
      releases: [{
        role: 'main',
        remainingResources: { canvasCount: 0, subscriptions: 0, pendingWork: 0 },
      }],
      errors: [],
    },
    error: null,
  };
}

function actionActual(
  caseId: FoundationCaseId,
  type: string,
  index: number,
  terminal: JsonRecord,
): JsonRecord {
  if (caseId === 'LIF-002' && type === 'exercise-authoritative-draw-races') {
    return {
      preReady: { status: 'rejected', diagnostic: { code: 'NOT_READY', appliedCount: 0 } },
      pending: [
        { requestId: 'draw-a', result: { status: 'superseded' } },
        { requestId: 'draw-b', result: { status: 'committed' } },
      ],
      completionOrder: [
        { requestId: 'draw-b', completedAtMs: 8 },
        { requestId: 'draw-a', completedAtMs: 12 },
      ],
      submittedInputs: [
        {
          requestId: 'draw-a',
          datasetRef: 'all-kinds-scene',
          beforeFingerprint: 'fnv1a64:2222222222222222',
          postUseFingerprint: 'fnv1a64:2222222222222222',
          unchanged: true,
          postUseGraph: [{ type: 'item', id: 'item-a' }],
          deeplyFrozen: false,
        },
        {
          requestId: 'draw-b',
          datasetRef: 'interactive-scene-revision-2',
          beforeFingerprint: 'fnv1a64:3333333333333333',
          postUseFingerprint: 'fnv1a64:3333333333333333',
          unchanged: true,
          postUseGraph: [{ type: 'item', id: 'item-b' }],
          deeplyFrozen: false,
        },
      ],
      failedLater: { status: 'rejected', diagnostic: { code: 'INVALID_VALUE', datasetPath: '$' } },
      authoritative: { sceneSemanticHash: 'fnv1a64:1111111111111111' },
      authoritativeSubmittedInput: {
        requestId: 'draw-b',
        datasetRef: 'interactive-scene-revision-2',
        beforeFingerprint: 'fnv1a64:1111111111111111',
        postUseFingerprint: 'fnv1a64:1111111111111111',
        unchanged: true,
        postUseGraph: [{ type: 'item', id: 'item-b' }],
        deeplyFrozen: false,
      },
    };
  }
  if (caseId === 'LIF-002' && type === 'snapshot-resolved-dataset') {
    return { datasetRef: 'all-kinds-scene' };
  }
  if (caseId === 'DAT-001' && type === 'attemptStrictLoadVariant') {
    return {
      accepted: false,
      atomicRetained: true,
      diagnostic: {
        category: 'INVALID_INPUT',
        code: 'INVALID_RECORD_KIND',
        datasetPath: '$[7].type',
        recoverable: false,
        retryable: false,
        appliedCount: 0,
        missingCount: 0,
        unchangedCount: 0,
      },
    };
  }
  if (caseId === 'DAT-002') {
    if (type === 'freezeInput') {
      return { datasetId: 'minimal-defaults', deeplyFrozen: true };
    }
    if (type === 'loadDataset') {
      const session = index < 3 ? 1 : 2;
      return {
        session,
        snapshot: terminal,
        exportedDataset: normalizedDefaultsDataset(),
        exportedDatasetDeeplyFrozen: true,
      };
    }
    if (type === 'snapshot') {
      return { session: index < 3 ? 1 : 2, snapshot: terminal };
    }
  }
  if (caseId === 'CSM-003' && type === 'query-target') {
    return { target: { id: 'missing' }, result: null, found: false, snapshot: terminal };
  }
  return { snapshot: terminal };
}

function normalizedDefaultsDataset(): unknown[] {
  return [{
    type: 'item',
    id: 'item-default',
    show: true,
    locked: false,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    contentOrientation: 'upright',
    components: [
      { type: 'bar', id: 'bar-default', placement: 'bottom', animationDuration: 200 },
      { type: 'text', id: 'text-default', split: 0 },
    ],
  }];
}

function semanticProbe(caseId: FoundationCaseId): JsonRecord {
  const empty = caseId === 'CSM-003';
  const nodes = empty ? [] : [
    semanticNode(0, { kind: 'element', id: 'item-a' }, 'item'),
    semanticNode(1, { kind: 'component', ownerId: 'item-a', id: 'bar' }, 'bar', 1),
    semanticNode(2, { kind: 'component', ownerId: 'item-a', id: 'hidden-label' }, 'text', 1, false),
  ];
  return {
    revision: 'core-v2-semantic-probe/1',
    lifecycle: empty ? 'ready-empty' : 'scene-ready',
    dataset: {
      state: empty ? 'empty' : 'loaded',
      ref: empty ? 'empty-scene' : 'fixture-scene',
      semanticHash: 'fnv1a64:1111111111111111',
      rootIds: empty ? [] : ['item-a'],
      graphDeepFrozen: true,
    },
    scene: {
      nodes,
      elementTypes: empty ? [] : ['item'],
      componentTypes: empty ? [] : ['bar', 'text'],
      counts: {
        rootElements: empty ? 0 : 1,
        elements: empty ? 0 : 1,
        components: empty ? 0 : 2,
        hierarchyEdges: empty ? 0 : 2,
        maxDepth: empty ? 0 : 1,
        hiddenLogicalComponents: empty ? 0 : 1,
      },
    },
    geometry: { finiteValueCount: empty ? 0 : 8, nonFiniteValueCount: 0, allFinite: true },
    text: {
      sourceCount: empty ? 0 : 1,
      codeUnitCount: empty ? 0 : 5,
      sourcesWithUnpairedSurrogate: 0,
      unpairedSurrogateCount: 0,
    },
    paint: { intentCount: 0, resolvedCount: 0, unresolvedCount: 0, intents: [] },
    interaction: { mode: 'select', selectionIds: [], activeAnimationCount: 0 },
    history: { depth: 0 },
  };
}

function semanticNode(
  order: number,
  target: JsonRecord,
  type: string,
  depth = 0,
  show = true,
): JsonRecord {
  return {
    order,
    target,
    parent: target.kind === 'component' ? { kind: 'element', id: target.ownerId } : null,
    type,
    depth,
    authoredShow: show,
    visible: show,
    locked: false,
  };
}

function terminalSnapshot(caseId: FoundationCaseId): JsonRecord {
  const empty = caseId === 'CSM-003';
  return {
    lifecycle: empty ? 'ready-empty' : 'scene-ready',
    revisions: {
      lifecycleGeneration: 1,
      sceneRevision: 1,
      viewRevision: 0,
      interactionRevision: 0,
    },
    publishedTuple: { scene: 1, view: 0, interaction: 0 },
    frameRevision: 1,
    datasetRef: empty ? 'empty-scene' : 'fixture-scene',
    semanticHash: 'fnv1a64:1111111111111111',
    rootIds: empty ? [] : ['item-a'],
    historyDepth: 0,
    pendingWork: 0,
    zoomLimits: [0.5, 30],
    viewport: { centerWorld: [0, 0], scale: 1, screenBounds: [0, 0, 800, 600] },
    selectionIds: [],
    facilities: ['renderer', 'viewport'],
    resources: {
      canvasCount: 1,
      canvas: { cssSize: [800, 600], backingSize: [800, 600] },
      renderer: { resolution: 1, antialias: true, background: '#FAFAFA', backend: 'webgl' },
      subscriptions: { active: 6, duplicates: 0 },
    },
  };
}

function datasetObservation(reference: string, graph: unknown): JsonRecord {
  return {
    reference,
    beforeFingerprint: 'fnv1a64:1111111111111111',
    currentFingerprint: 'fnv1a64:1111111111111111',
    unchanged: true,
    beforeGraph: structuredClone(graph),
    currentGraph: structuredClone(graph),
    currentDeeplyFrozen: true,
  };
}

function event(sequence: number, name: string, actual: unknown): JsonRecord {
  return { sequence, generation: 1, role: 'main', event: name, actual };
}

function valueAt(value: unknown, path: string): unknown {
  let cursor = value;
  for (const segment of path.split('.')) {
    if (Array.isArray(cursor)) {
      cursor = cursor[Number(segment)];
      continue;
    }
    if (!isRecord(cursor) || !Object.hasOwn(cursor, segment)) {
      throw new Error(`unresolved path ${path}`);
    }
    cursor = cursor[segment];
  }
  return cursor;
}

function isDeepFrozen(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value !== 'object' || seen.has(value)) return true;
  seen.add(value);
  return Object.isFrozen(value)
    && Object.values(value).every((nested) => isDeepFrozen(nested, seen));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
