import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  CoreV2AssetRuntime,
  type CoreV2AssetAcquisition,
  type CoreV2AssetBackend,
  type CoreV2AssetBackendRequest,
  type CoreV2AssetSession,
} from '../../src/core-v2/assets';
import {
  CoreV2Engine,
  type CoreV2EngineSceneImageRecord,
  type CoreV2EngineSceneImagesProbe,
  type CoreV2EngineSurface,
  type CoreV2Point,
  type CoreV2SurfaceComponentVisualProbe,
  type CoreV2SurfaceDebug,
  type CoreV2SurfaceGeometrySnapshot,
  type CoreV2SurfaceOptions,
  type CoreV2SurfaceReconcileResult,
} from '../../src/core-v2/engine';
import type { CoreV2ComponentRenderRole } from '../../src/core-v2/contracts';
import type {
  CoreV2RenderLaneRole,
  CoreV2RenderLaneSnapshot,
} from '../../src/core-v2/renderers/types';

type JsonRecord = Record<string, unknown>;
type HandlerEntry = readonly [string, (context: unknown, action: unknown) => unknown];

const TEST_RENDER_LANE_ROLES = Object.freeze([
  'background-geometry',
  'background-assets',
  'ordinary-geometry',
  'relations-dynamic',
  'content-assets',
  'text',
  'interaction-overlay',
] as const satisfies readonly CoreV2RenderLaneRole[]);

interface ContractAction {
  readonly index: number;
  readonly type: string;
  readonly operands: Readonly<JsonRecord>;
}

interface CatalogCase {
  readonly id: string;
  readonly caseType: string;
  readonly fixture: Readonly<{
    readonly setup: Readonly<{ readonly params: Readonly<JsonRecord> }>;
    readonly actionTrace: readonly ContractAction[];
    readonly captureCheckpoints: readonly unknown[];
    readonly cleanupTrace: readonly unknown[];
  }>;
}

interface MaterializedCase extends CatalogCase {
  readonly actionTrace: readonly ContractAction[];
  readonly routeParams: Readonly<{ readonly size: string; readonly seed: number }>;
}

interface ActionDefinition {
  readonly type: string;
  readonly handlerId: string;
}

interface ExecutorCatalog {
  readonly actionDefinitions: readonly ActionDefinition[];
  readonly cases: readonly CatalogCase[];
}

interface CatalogRuntime {
  loadExecutorCatalog(this: void): Promise<ExecutorCatalog>;
  selectCatalogCases(
    this: void,
    catalog: ExecutorCatalog,
    selection: Readonly<{ readonly caseIds: readonly string[] }>,
  ): readonly CatalogCase[];
}

interface MaterializeRuntime {
  materializeCase(
    this: void,
    record: CatalogCase,
    options: Readonly<{ readonly size: string; readonly seed: string }>,
  ): MaterializedCase;
}

interface HandlerRuntime {
  readonly UPDATE_TRANSACTIONS_ACTION_TYPES: readonly string[];
  readonly UPDATE_TRANSACTIONS_CASE_IDS: readonly string[];
  createUpdateTransactionHandlerEntries(
    this: void,
    product: Readonly<JsonRecord>,
  ): readonly HandlerEntry[];
}

interface ClockContract {
  now(): number;
  advanceTo(timeMs: number): Promise<void>;
  withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T>;
}

interface CaseExecution extends JsonRecord {
  readonly caseId: string;
  readonly status: string;
  readonly actionResults: readonly Readonly<{
    readonly index: number;
    readonly type: string;
    readonly status: string;
    readonly delta: Readonly<{ readonly actual: JsonRecord }>;
  }>[];
  readonly captures: readonly Readonly<JsonRecord>[];
  readonly cleanup: Readonly<JsonRecord>;
  readonly eventJournalFailures: readonly unknown[];
}

interface WorkerRuntime {
  executeContractCase(
    this: void,
    options: Readonly<{
      readonly caseRecord: MaterializedCase;
      readonly actionDefinitions: readonly ActionDefinition[];
      readonly engineFactory: () => CoreV2Engine;
      readonly datasets: ReadonlyMap<string, unknown>;
      readonly clock: ClockContract;
      readonly handlerEntries: readonly HandlerEntry[];
    }>,
  ): Promise<CaseExecution>;
}

type SurfaceFault =
  | 'missing-component'
  | 'missing-interaction'
  | 'missing-scene-images'
  | 'missing-rendering'
  | 'ownership-leak'
  | 'root-drop'
  | 'stale-publication'
  | 'lane-orphan'
  | 'retain-resource';
type AdapterFault =
  | 'duplicate-subscription'
  | 'subscription-drop'
  | 'zero-asset-session';

interface ExecuteCaseOptions {
  readonly surfaceFault?: SurfaceFault;
  readonly adapterFault?: AdapterFault;
  readonly resourceJournal?: string[];
}

async function loadRuntime<T>(relativePath: string): Promise<T> {
  const namespace: unknown = await import(
    /* @vite-ignore */ new URL(relativePath, import.meta.url).href
  );
  return namespace as T;
}

const [catalogRuntime, materializeRuntime, handlerRuntime, workerRuntime] = await Promise.all([
  loadRuntime<CatalogRuntime>('../../scripts/verification/core-v2-contract/catalog.mjs'),
  loadRuntime<MaterializeRuntime>('../../scripts/verification/core-v2-contract/materialize.mjs'),
  loadRuntime<HandlerRuntime>(
    '../../scripts/verification/core-v2-contract/handlers/update-transactions.mjs',
  ),
  loadRuntime<WorkerRuntime>('../../scripts/verification/core-v2-contract/execute-worker.mjs'),
]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
const {
  UPDATE_TRANSACTIONS_ACTION_TYPES,
  UPDATE_TRANSACTIONS_CASE_IDS,
  createUpdateTransactionHandlerEntries,
} = handlerRuntime;
const { executeContractCase } = workerRuntime;

let catalog: ExecutorCatalog;

beforeAll(async () => {
  catalog = await loadExecutorCatalog();
});

describe('Core v2 shared update transaction action handlers', () => {
  it('registers one browser-safe product handler family with no answer-data imports', async () => {
    const source = await readFile(fileURLToPath(new URL(
      '../../scripts/verification/core-v2-contract/handlers/update-transactions.mjs',
      import.meta.url,
    )), 'utf8');
    const adapter = createProductAdapter();
    const entries = createUpdateTransactionHandlerEntries(adapter);

    expect(UPDATE_TRANSACTIONS_CASE_IDS).toEqual([
      'UPD-001',
      'UPD-002',
      'UPD-003',
      'UPD-004',
      'UPD-006',
      'UPD-007',
      'UPD-008',
      'UPD-010',
    ]);
    expect(entries.map(([id]) => id)).toEqual(
      UPDATE_TRANSACTIONS_ACTION_TYPES.map((type) => `contract/${type}`),
    );
    expect(source).not.toMatch(/^\s*import\s/mu);
    expect(source).not.toMatch(/from\s+['"][^'"]*(?:compare|observe)\.mjs['"]/u);
    expect(source).not.toContain('catalog-normalized-expected');
    expect(source).not.toContain('/evidence/');
    expect(source).toContain("callSync(engine, 'transact'");
    expect(source).toContain("callSync(engine, 'bulkPatch'");
    expect(source).not.toContain('emptyBulkResult');
    expect(source).toContain("callSync(engine, 'resolveTarget'");
    expect(source).toContain("callSync(engine, 'relationProbe'");
  });

  it.each(UPDATE_TRANSACTIONS_CASE_IDS)(
    'executes %s against public CoreV2Engine state without mutating action inputs',
    async (caseId) => {
      const plan = selectedCase(caseId);
      const before = JSON.stringify(plan);
      const execution = await executeCase(plan);

      expect(execution.status).toBe('completed');
      expect(execution.eventJournalFailures).toEqual([]);
      expect(execution.cleanup).toMatchObject({ status: 'completed', errors: [] });
      expect(execution.actionResults).toHaveLength(plan.actionTrace.length);
      expect(execution.actionResults.every(({ status }) => status === 'completed')).toBe(true);
      expect(JSON.stringify(plan)).toBe(before);
      for (const result of execution.actionResults) {
        const actual = result.delta.actual;
        if (isRecord(actual.input)) expect(actual.input).toMatchObject({ unchanged: true });
        expect(requireRecord(actual.product, `${caseId} action product`)).toHaveProperty('snapshot');
      }

      assertCaseFacts(caseId, execution);
    },
    20_000,
  );

  it('routes all UPD-006 target sets, including the empty set, through Engine.bulkPatch()', async () => {
    const bulkPatch = vi.spyOn(CoreV2Engine.prototype, 'bulkPatch');
    try {
      const execution = await executeCase(selectedCase('UPD-006'));
      expect(execution.status).toBe('completed');
      expect(bulkPatch).toHaveBeenCalledTimes(4);
      expect(bulkPatch.mock.calls[2]?.[0]).toMatchObject({
        strict: true,
        targets: [],
        changes: [{ path: ['attrs', 'x'], value: 200 }],
      });
      expect(actualAt(execution, 2)).toMatchObject({
        revisionDelta: 0,
        result: { status: 'unchanged', changed: false, applied: [] },
      });
    } finally {
      bulkPatch.mockRestore();
    }
  });

  it.each([
    ['component visual', 'missing-component'],
    ['interaction ownership', 'missing-interaction'],
    ['scene image', 'missing-scene-images'],
    ['renderer resource', 'missing-rendering'],
  ] as const)('fails closed when the UPD-008 %s probe is missing', async (_label, surfaceFault) => {
    await expect(executeCase(selectedCase('UPD-008'), { surfaceFault }))
      .rejects.toThrow(/Invalid Core v2 update transaction handler/u);
  });

  it('reports retained image target, renderer, binding, consumer, and lease facts without cancellation', async () => {
    const execution = await executeCase(selectedCase('UPD-008'), {
      surfaceFault: 'retain-resource',
    });
    const reconcile = actualAt(execution, 1);
    expect(reconcile).toMatchObject({
      retainedDelta: 8,
      resources: {
        violations: {
          retainedImageTargets: 1,
          retainedActiveImageTargets: 1,
          retainedBindings: 1,
          retainedLeases: 1,
          retainedAcquisitions: 1,
          retainedRendererObjects: 1,
          retainedConsumers: 1,
          retainedAssetLaneObjects: 1,
        },
      },
      removed: {
        icon: {
          logicalCount: 0,
          resources: { retainedDelta: 8 },
        },
      },
    });
  });

  it('uses a real registered asset session and settle-publish-settle ordering for UPD-008', async () => {
    const registerAssets = vi.spyOn(CoreV2Engine.prototype, 'registerAssets');
    const resourceJournal: string[] = [];
    try {
      const execution = await executeCase(selectedCase('UPD-008'), { resourceJournal });
      expect(registerAssets).toHaveBeenCalledTimes(1);
      expect(registerAssets).toHaveBeenCalledWith('contract-upd-008');
      const initialProduct = requireRecord(actualAt(execution, 0).product, 'initial product');
      const snapshot = requireRecord(initialProduct.snapshot, 'initial snapshot');
      const resources = requireRecord(snapshot.resources, 'initial resources');
      expect(resources.assets).toMatchObject({
        instanceId: 'contract-upd-008',
        pendingCount: 0,
        leaseCount: 1,
        acquisitionCount: 1,
        cleanupPendingCount: 0,
      });
      const sceneImages = requireRecord(initialProduct.sceneImages, 'initial scene images');
      expect(sceneImages).toMatchObject({
        targetCount: 2,
        activeTargetCount: 2,
        bindingCount: 2,
      });
      const initialImages = requireRecord(sceneImages.images, 'initial images');
      expect(initialImages['item-a::icon:icon'])
        .toMatchObject({
          active: true,
          state: 'resolved',
          attachmentState: 'current',
          publication: { rendererFacts: 'current' },
          renderObjectCount: 1,
          bindingConsumerCount: 1,
        });
      expect(initialImages['image-a']).toMatchObject({
        active: true,
        state: 'failed',
        attachmentState: 'current',
        publication: { rendererFacts: 'current' },
        renderObjectCount: 1,
        placeholderCount: 1,
        bindingConsumerCount: 1,
        role: 'asset-placeholder',
      });
      const publishes = resourceJournal
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => entry === 'publish');
      expect(publishes).toHaveLength(4);
      for (const { index } of publishes) {
        expect(resourceJournal[index - 1]).toBe('settle');
        expect(resourceJournal[index + 1]).toBe('settle');
      }
    } finally {
      registerAssets.mockRestore();
    }
  });

  it.each([
    ['zero lease/acquisition', { adapterFault: 'zero-asset-session' }],
    ['root binding growth/entity callback', { surfaceFault: 'ownership-leak' }],
    ['root binding drop', { surfaceFault: 'root-drop' }],
    ['subscription drop', { adapterFault: 'subscription-drop' }],
    ['duplicate subscription', { adapterFault: 'duplicate-subscription' }],
    ['stale renderer publication', { surfaceFault: 'stale-publication' }],
    ['asset render lane orphan', { surfaceFault: 'lane-orphan' }],
  ] as const)('fails closed for UPD-008 %s', async (_label, options) => {
    await expect(executeCase(selectedCase('UPD-008'), options))
      .rejects.toThrow(/Invalid Core v2 update transaction handler/u);
  });
});

function assertCaseFacts(caseId: string, execution: CaseExecution): void {
  switch (caseId) {
    case 'UPD-001': {
      expect(actualAt(execution, 3).currentTarget).toMatchObject({
        ownerId: 'item-a',
        id: 'bar',
        lifecycleGeneration: 2,
      });
      expect(actualAt(execution, 4)).toMatchObject({
        diagnostic: { code: 'STALE_TARGET' },
        currentTarget: { id: 'bar' },
      });
      break;
    }
    case 'UPD-002': {
      expect(actualAt(execution, 1)).toMatchObject({
        record: { id: 'bar', size: { width: 60, height: 30 } },
        revisionDelta: 1,
      });
      expect(actualAt(execution, 2)).toMatchObject({
        revisionDelta: 0,
        events: { change: [] },
      });
      expect(captureValues(execution, 'before')).toMatchObject({
        'target/size/width': 60,
        'target/source': { type: 'rect' },
      });
      break;
    }
    case 'UPD-003': {
      expect(actualAt(execution, 0).record).toMatchObject({
        type: 'rect',
        id: 'rect-b',
        size: { width: 60, height: 20 },
      });
      expect(actualAt(execution, 1).record).toMatchObject({ type: 'text', id: 'rect-b' });
      expect(actualAt(execution, 2)).toMatchObject({
        diagnostic: { code: 'INVALID_RECORD_KIND' },
        publicationCount: 0,
      });
      break;
    }
    case 'UPD-004': {
      expect(actualAt(execution, 0).record).toMatchObject({ attrs: { x: 200, y: 100 } });
      expect(actualAt(execution, 1).record).toMatchObject({ attrs: { x: 210, y: 95, angle: 45 } });
      expect(actualAt(execution, 2)).toMatchObject({
        record: { size: { width: 80, height: 50 } },
        hit: { id: 'rect-b' },
      });
      const resize = actualAt(execution, 2);
      expect(resize.centerAfter).toEqual(resize.centerBefore);
      expect(resize.selectionOverlay).not.toBeNull();
      break;
    }
    case 'UPD-006': {
      expect(actualAt(execution, 0).result).toMatchObject({ applied: [], missing: [{ id: 'missing' }] });
      expect(actualAt(execution, 1).result).toMatchObject({
        applied: [{ id: 'rect-b' }],
        missing: [{ id: 'missing' }],
      });
      expect(actualAt(execution, 2)).toMatchObject({
        revisionDelta: 0,
        result: { status: 'unchanged', applied: [] },
      });
      expect(actualAt(execution, 3).result).toMatchObject({
        status: 'rejected',
        transactionDiagnostic: { code: 'MISSING_TARGET' },
      });
      break;
    }
    case 'UPD-007': {
      expect(actualAt(execution, 1)).toMatchObject({
        revisionDelta: 1,
        intermediatePublicationCount: 0,
        queryRevision: 2,
        eventRevision: 2,
        result: { history: { depthDelta: 1 } },
      });
      expect(captureValues(execution, 'valid')['frameRevision']).toBe(2);
      expect(actualAt(execution, 3)).toMatchObject({
        result: { status: 'rejected', transactionDiagnostic: { code: 'MISSING_TARGET' } },
        semanticHashUnchanged: true,
      });
      break;
    }
    case 'UPD-008': {
      expect(actualAt(execution, 0).binding).toEqual({ bar: { id: 'bar' } });
      expect(actualAt(execution, 1)).toMatchObject({
        components: {
          order: ['label', 'bar', 'bg', 'status'],
          byId: {
            bar: { visual: { renderRole: 'ordinary-geometry' } },
            label: { visual: { renderRole: 'text' } },
          },
        },
        removed: { icon: { eventCallbacks: 0 } },
        retainedDelta: 0,
      });
      expect(actualAt(execution, 2)).toMatchObject({
        componentVisual: {
          logicalCount: 1,
          renderObjectCount: 0,
          show: false,
          rendererPaint: { primitiveCount: 0, renderObjectCount: 0 },
        },
      });
      expect(actualAt(execution, 3)).toMatchObject({ currentTarget: { id: 'bar', show: true } });
      break;
    }
    case 'UPD-010': {
      expect(actualAt(execution, 1)).toMatchObject({
        relationState: { counts: { 'a>a': 1, 'a>b': 1, 'b>a': 1 } },
      });
      expect(segment(actualAt(execution, 1), 'a>b').endWorld).toEqual([150, 70]);
      expect(actualAt(execution, 2)).toMatchObject({
        relationState: { visibleSegments: ['a>a'] },
      });
      expect(actualAt(execution, 4)).toMatchObject({
        relationState: { visibleSegments: ['a>a'] },
      });
      expect(segmentCountTo(actualAt(execution, 4), 'b')).toBe(0);
      break;
    }
    default:
      throw new Error(`Unknown update case ${caseId}`);
  }
}

async function executeCase(
  plan: MaterializedCase,
  options: ExecuteCaseOptions = {},
): Promise<CaseExecution> {
  const adapter = createProductAdapter(options.adapterFault);
  const entries = createUpdateTransactionHandlerEntries(adapter);
  const required = new Set(plan.actionTrace.map((action) => `contract/${action.type}`));
  return executeContractCase({
    caseRecord: plan,
    actionDefinitions: catalog.actionDefinitions,
    engineFactory: () => new CoreV2Engine({
      historyLimit: 32,
      assetRuntime: createTestAssetRuntime(),
      surfaceFactory: (surfaceOptions) => Promise.resolve(new UpdateContractSurface(
        surfaceOptions,
        plan.id === 'UPD-008',
        options.surfaceFault,
        options.resourceJournal,
      )),
    }),
    datasets: testDatasets(),
    clock: new ManualClock(),
    handlerEntries: entries.filter(([id]) => required.has(id)),
  });
}

function selectedCase(caseId: string): MaterializedCase {
  const selected = selectCatalogCases(catalog, { caseIds: [caseId] });
  const record = selected[0];
  if (record === undefined) throw new Error(`Missing case ${caseId}`);
  return materializeCase(record, { size: '100', seed: '319' });
}

function createProductAdapter(fault?: AdapterFault): Readonly<JsonRecord> {
  let probeCount = 0;
  return Object.freeze({
    createSyntheticScene(inputValue: unknown) {
      const input = requireRecord(inputValue, 'synthetic request');
      const size = requireInteger(input.size, 'synthetic size');
      expect(input).toMatchObject({ caseId: 'UPD-007', seed: 319 });
      return deepFreeze(Array.from({ length: size }, (_, index) => ({
        type: 'item',
        id: `node-${index}`,
        size: { width: 80, height: 50 },
        padding: 2,
        attrs: { x: (index % 40) * 90, y: Math.floor(index / 40) * 60 },
        components: [
          { type: 'background', id: 'bg', source: { type: 'rect', fill: '#eeeeee' } },
          {
            type: 'bar',
            id: 'bar',
            source: { type: 'rect', fill: '#22aa66' },
            size: { width: 60, height: 10 },
            placement: 'bottom',
          },
          {
            type: 'text',
            id: 'label',
            text: `Node ${index}`,
            placement: 'center',
            style: { fontFamily: 'FiraCode', fontSize: 12, fill: '#111111' },
          },
        ],
      })));
    },
    resourceProbe(inputValue: unknown) {
      const input = requireRecord(inputValue, 'resource probe request');
      const engine = input.engine as CoreV2Engine;
      probeCount += 1;
      const snapshot = structuredClone(engine.snapshot());
      if (input.caseId === 'UPD-008') {
        const hasIcon = engine.exportDataset().some((element) => (
          Array.isArray(element.components) && element.components.some((component: unknown) => (
            isRecord(component) && component.id === 'icon'
          ))
        ));
        const resources = requireRecord(snapshot.resources, 'snapshot resources');
        if (fault === 'zero-asset-session') {
          const assets = requireRecord(resources.assets, 'snapshot assets');
          resources.assets = { ...assets, pendingCount: 0, leaseCount: 0, acquisitionCount: 0 };
        }
        const subscriptions = requireRecord(resources.subscriptions, 'snapshot subscriptions');
        if (fault === 'subscription-drop') {
          resources.subscriptions = { ...subscriptions, active: hasIcon ? 1 : 0 };
        } else if (fault === 'duplicate-subscription' && !hasIcon) {
          resources.subscriptions = { ...subscriptions, duplicates: 1 };
        }
      }
      return deepFreeze({
        revision: 'test-update-resource-probe/1',
        caseId: input.caseId,
        engine: {
          snapshot,
          semantic: engine.semanticProbe(),
          interactionOwnership: engine.interactionOwnershipProbe(),
        },
        runtime: {
          ownership: zeroOwnership(),
          stats: { probeCount },
        },
        journal: [{ sequence: probeCount, event: 'public-engine-observed' }],
      });
    },
  });
}

class UpdateContractSurface implements CoreV2EngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  private dataset: readonly JsonRecord[] = Object.freeze([]);
  private selectionIds: readonly string[] = Object.freeze([]);
  private geometryRevision = 0;
  private retainedIcon: Readonly<{ ownerId: string; component: JsonRecord }> | null = null;
  private assetAcquisition: CoreV2AssetAcquisition | null = null;
  private assetAlias: string | null = null;
  private assetSettlement: Promise<void> = Promise.resolve();
  private readonly width: number;
  private readonly height: number;
  private readonly pixelRatio: number;
  private readonly assetSession: CoreV2AssetSession;
  private readonly assetOwnershipEnabled: boolean;
  private readonly fault: SurfaceFault | undefined;
  private readonly resourceJournal: string[] | undefined;

  public constructor(
    options: CoreV2SurfaceOptions,
    assetOwnershipEnabled: boolean,
    fault?: SurfaceFault,
    resourceJournal?: string[],
  ) {
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = options.pixelRatio;
    if (options.assetSession === undefined) throw new Error('UPD test surface requires asset session');
    this.assetSession = options.assetSession;
    this.assetOwnershipEnabled = assetOwnershipEnabled;
    this.fault = fault;
    this.resourceJournal = resourceJournal;
  }

  public load(input: unknown): void {
    this.dataset = asDataset(input);
    const icon = this.findComponent('item-a', 'icon');
    this.retainedIcon = icon === null
      ? null
      : Object.freeze({ ownerId: 'item-a', component: structuredClone(icon) });
    this.selectionIds = Object.freeze([]);
    this.geometryRevision += 1;
    if (this.assetOwnershipEnabled) this.queueAssetSynchronization();
  }

  public reconcile(input: unknown): CoreV2SurfaceReconcileResult {
    this.dataset = asDataset(input);
    this.selectionIds = Object.freeze(
      this.selectionIds.filter((id) => this.dataset.some((record) => record.id === id)),
    );
    this.geometryRevision += 1;
    if (this.assetOwnershipEnabled) this.queueAssetSynchronization();
    return Object.freeze({
      status: 'committed',
      operationCount: 1,
      denseChanged: true,
      diagnostics: Object.freeze([]),
    });
  }

  public publishFrame(): void {
    this.resourceJournal?.push('publish');
  }

  public async settleSceneImages(): Promise<void> {
    this.resourceJournal?.push('settle');
    await this.assetSettlement;
  }

  public resize(): boolean {
    return false;
  }

  public setView(): void {}

  public select(ids: readonly string[]): void {
    this.selectionIds = Object.freeze([...ids]);
  }

  public hitTestScreen(point: CoreV2Point): string | null {
    const entities = this.geometrySnapshot().entities;
    for (let index = entities.length - 1; index >= 0; index -= 1) {
      const entity = entities[index];
      if (!entity?.visible || !entity.interactive) continue;
      const [x, y, width, height] = entity.worldBounds;
      if (point.x >= x && point.y >= y && point.x <= x + width && point.y <= y + height) {
        return entity.id;
      }
    }
    return null;
  }

  public screenToWorld(point: CoreV2Point): CoreV2Point {
    return Object.freeze({ ...point });
  }

  public geometrySnapshot(): CoreV2SurfaceGeometrySnapshot {
    const nodes = this.dataset.filter((record) => record.type !== 'relations');
    const entities = nodes.map((record) => entityGeometry(record));
    const entityById = new Map(entities.map((entity) => [entity.id, entity]));
    const recordById = new Map(nodes.map((record) => [String(record.id), record]));
    const relations = [];
    const omittedRelations = [];
    for (const relationRecord of this.dataset.filter((record) => record.type === 'relations')) {
      const seen = new Set<string>();
      const links = Array.isArray(relationRecord.links) ? relationRecord.links : [];
      for (const [index, linkValue] of links.entries()) {
        const link = requireRecord(linkValue, 'relation link');
        const sourceId = String(link.source);
        const targetId = String(link.target);
        const key = `${sourceId}>${targetId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const source = entityById.get(sourceId);
        const target = entityById.get(targetId);
        if (source === undefined || target === undefined) {
          omittedRelations.push({
            id: `${String(relationRecord.id)}:${index}`,
            relationId: String(relationRecord.id),
            key,
            identityKey: key,
            sourceId,
            targetId,
            authoredIndex: index,
            reason: source === undefined && target === undefined
              ? 'missing-source-and-target' as const
              : source === undefined
                ? 'missing-source' as const
                : 'missing-target' as const,
          });
          continue;
        }
        const start = center(source.worldBounds);
        const end = center(target.worldBounds);
        const visible = recordById.get(sourceId)?.show !== false &&
          recordById.get(targetId)?.show !== false;
        relations.push({
          id: `${String(relationRecord.id)}:${index}`,
          relationId: String(relationRecord.id),
          key,
          identityKey: key,
          sourceId,
          targetId,
          worldEndpoints: [start, end] as const,
          screenEndpoints: [start, end] as const,
          worldPoints: [start, end],
          screenPoints: [start, end],
          worldBounds: relationBounds(start, end),
          screenBounds: relationBounds(start, end),
          visible,
          style: { color: 0x222222, colorHex: '#222222ff', width: 2, opacity: 1, zIndex: 0 },
          visibleStrokeWidthsCssPx: [2],
        });
      }
    }
    const selected = this.selectionIds[0];
    const selectedEntity = selected === undefined ? undefined : entityById.get(selected);
    return deepFreeze({
      revision: this.geometryRevision,
      sceneRevision: this.geometryRevision,
      entities,
      relations,
      omittedRelations,
      selectionOverlay: selectedEntity === undefined
        ? null
        : { screenBounds: selectedEntity.screenBounds },
    });
  }

  public interactionOwnershipProbe(): Readonly<{ rootBindingCount: number; entityCallbackCount: number }> {
    if (this.fault === 'missing-interaction') return null as never;
    const iconRemoved = this.findComponent('item-a', 'icon') === null;
    const leaked = this.fault === 'ownership-leak' && iconRemoved;
    const disconnected = this.fault === 'root-drop' && iconRemoved;
    return Object.freeze({
      rootBindingCount: leaked ? 7 : disconnected ? 5 : 6,
      entityCallbackCount: leaked ? 1 : 0,
    });
  }

  public componentVisualProbe(
    target: Readonly<{ ownerId: string; componentId: string }>,
  ): CoreV2SurfaceComponentVisualProbe | null {
    if (this.fault === 'missing-component') return null;
    const current = this.findComponent(target.ownerId, target.componentId);
    const retained = current === null && this.fault === 'retain-resource' &&
      this.retainedIcon?.ownerId === target.ownerId &&
      this.retainedIcon.component.id === target.componentId
      ? this.retainedIcon.component
      : null;
    const component = current ?? retained;
    if (component === null) return null;
    const show = component.show !== false;
    const componentType = String(component.type);
    const entityId = `${target.ownerId}::${componentType}:${target.componentId}`;
    const owner = this.dataset.find((element) => element.id === target.ownerId);
    const geometry = owner === undefined
      ? Object.freeze([0, 0, 0, 0] as const)
      : entityGeometry(owner).worldBounds;
    const aggregateMesh = componentType === 'background' || componentType === 'bar';
    const rendererKind = aggregateMesh
      ? 'mesh'
      : show
        ? componentType === 'icon'
          ? 'sprite'
          : componentType === 'text'
            ? 'text'
            : 'mesh'
        : 'none';
    const renderObjectCount: 0 | 1 = show && rendererKind !== 'mesh' ? 1 : 0;
    const sceneImage = typeof component.source === 'string'
      ? this.imageRecord(target.ownerId, component, show)
      : null;
    const renderLanes = this.renderLaneSnapshot();
    const visual: CoreV2SurfaceComponentVisualProbe = {
      target: { ownerId: target.ownerId, componentId: target.componentId },
      semanticOwnerId: target.ownerId,
      entityId,
      logicalIdentity: `component:${target.ownerId}:${target.componentId}`,
      componentType,
      renderRole: componentProductRenderRole(componentType, component),
      entityKind: componentType === 'icon' ? 'image' : componentType === 'text' ? 'text' : 'rect',
      geometry: {
        localBounds: geometry,
        worldBounds: geometry,
        visibleBounds: show ? geometry : null,
        visible: show,
        interactive: show,
      },
      publication: {
        rendererFacts: this.fault === 'stale-publication' ? 'pending' : 'current',
      },
      sceneImage,
      rendererPaint: show || aggregateMesh
        ? {
            entityId,
            lane: componentRenderLane(componentType, component),
            rendererKind,
            primitiveCount: show ? 1 : 0,
            renderObjectCount,
            packedTint: null,
            rgbTint: null,
            alpha: show ? 1 : null,
          }
        : null,
      renderLanes,
    };
    return deepFreeze(visual);
  }

  public sceneImageProbe(): CoreV2EngineSceneImagesProbe {
    if (this.fault === 'missing-scene-images') return null as never;
    const images: Record<string, CoreV2EngineSceneImageRecord> = Object.create(null) as Record<
      string,
      CoreV2EngineSceneImageRecord
    >;
    for (const element of this.dataset) {
      if (element.type === 'image' && typeof element.source === 'string') {
        const record = this.failedImageRecord(element);
        images[String(record.entityId)] = record;
        continue;
      }
      if (!Array.isArray(element.components)) continue;
      for (const componentValue of element.components) {
        if (!isRecord(componentValue) || typeof componentValue.source !== 'string') continue;
        const show = componentValue.show !== false;
        const record = this.imageRecord(String(element.id), componentValue, show);
        images[String(record.entityId)] = record;
      }
    }
    if (
      this.fault === 'retain-resource' &&
      this.retainedIcon !== null &&
      this.findComponent(this.retainedIcon.ownerId, String(this.retainedIcon.component.id)) === null
    ) {
      const record = this.imageRecord(
        this.retainedIcon.ownerId,
        this.retainedIcon.component,
        true,
      );
      images[String(record.entityId)] = record;
    }
    const values = Object.values(images);
    const activeTargetCount = values.filter((image) => image.active === true).length;
    const activeBindingCount = new Set(values.filter(({ active }) => active).map(({ bindingKey }) => (
      bindingKey
    ))).size;
    const failed = values.filter(({ state }) => state === 'failed');
    const probe: CoreV2EngineSceneImagesProbe = {
      destroyed: this.destroyed,
      targetCount: values.length,
      activeTargetCount,
      bindingCount: activeBindingCount,
      pendingBindingCount: 0,
      pendingSettlementCount: 0,
      pendingReleaseCount: 0,
      diagnosticCount: failed.length,
      staleAttachCount: 0,
      staleCompletionCount: 0,
      images: Object.freeze(images),
      diagnostics: Object.freeze(failed.map((image) => Object.freeze({
        level: 'warning' as const,
        code: 'ASSET_LOAD_FAILED' as const,
        targetId: image.entityId,
        bindingKey: image.bindingKey,
        generation: image.generation,
        message: 'fixture scheme is outside the package-owned asset policy',
      }))),
      abandonedRequests: {
        pendingSettlementCount: 0,
        pendingReleaseCount: 0,
        staleAttachmentCount: 0,
      },
    };
    return deepFreeze(probe);
  }

  public debugSnapshot(): CoreV2SurfaceDebug {
    const renderLanes = this.renderLaneSnapshot();
    const laneValues = Object.values(renderLanes);
    const snapshot = {
      cssSize: Object.freeze([this.width, this.height] as const),
      backingSize: Object.freeze([
        Math.round(this.width * this.pixelRatio),
        Math.round(this.height * this.pixelRatio),
      ] as const),
      selectionIds: this.selectionIds,
      activeAnimationCount: 0,
      activeGestureCount: 0,
      ...(this.fault === 'missing-rendering'
        ? {}
        : {
            renderCommandCount: laneValues.reduce(
              (sum, lane) => sum + lane.renderObjectCount,
              0,
            ),
            visiblePrimitiveCount: laneValues.reduce(
              (sum, lane) => sum + lane.visiblePrimitiveCount,
              0,
            ),
          }),
    };
    return Object.freeze(snapshot);
  }

  private renderLaneSnapshot(): CoreV2RenderLaneSnapshot {
    const counts = new Map<CoreV2RenderLaneRole, number>(TEST_RENDER_LANE_ROLES.map((role) => (
      [role, 0] as const
    )));
    const increment = (role: CoreV2RenderLaneRole): void => {
      counts.set(role, (counts.get(role) ?? 0) + 1);
    };
    for (const element of this.dataset) {
      if (element.show === false) continue;
      if (element.type === 'item' && Array.isArray(element.components)) {
        for (const componentValue of element.components) {
          if (!isRecord(componentValue) || componentValue.show === false) continue;
          const componentType = String(componentValue.type);
          if (
            componentType === 'icon' &&
            (this.assetAcquisition === null || this.assetAlias !== componentValue.source)
          ) continue;
          increment(componentRenderLane(componentType, componentValue));
        }
      } else if (element.type === 'image') {
        increment('content-assets');
      } else if (element.type !== 'relations') {
        increment('ordinary-geometry');
      }
    }
    if (this.fault === 'retain-resource' && this.findComponent('item-a', 'icon') === null) {
      increment('content-assets');
    }
    if (this.fault === 'lane-orphan' && this.findComponent('item-a', 'icon') === null) {
      increment('content-assets');
    }
    return deepFreeze(Object.fromEntries(TEST_RENDER_LANE_ROLES.map((role) => {
      const count = counts.get(role) ?? 0;
      return [role, {
        role,
        label: `PATCH MAP Core v2 / ${role}`,
        renderObjectCount: count,
        visiblePrimitiveCount: count,
      }];
    }))) as CoreV2RenderLaneSnapshot;
  }

  public async destroy(): Promise<boolean> {
    if (this.destroyed) return false;
    await this.assetSettlement;
    if (this.assetAcquisition !== null) await this.assetAcquisition.release();
    this.assetAcquisition = null;
    this.assetAlias = null;
    this.destroyed = true;
    this.canvasCount = 0;
    this.dataset = Object.freeze([]);
    this.selectionIds = Object.freeze([]);
    return true;
  }

  private queueAssetSynchronization(): void {
    this.assetSettlement = this.assetSettlement.then(async () => {
      const desiredAlias = this.desiredAssetAlias();
      if (this.assetAcquisition !== null && this.assetAlias !== desiredAlias) {
        await this.assetAcquisition.release();
        this.assetAcquisition = null;
        this.assetAlias = null;
      }
      if (desiredAlias !== null && this.assetAcquisition === null) {
        this.assetAcquisition = await this.assetSession.acquire(desiredAlias);
        this.assetAlias = desiredAlias;
      }
    });
  }

  private desiredAssetAlias(): string | null {
    const current = this.findComponent('item-a', 'icon');
    if (current !== null && current.show !== false && typeof current.source === 'string') {
      return current.source;
    }
    if (
      this.fault === 'retain-resource' &&
      this.retainedIcon !== null &&
      typeof this.retainedIcon.component.source === 'string'
    ) {
      return this.retainedIcon.component.source;
    }
    return null;
  }

  private findComponent(ownerId: string, componentId: string): JsonRecord | null {
    const owner = this.dataset.find((element) => element.id === ownerId);
    if (owner === undefined || !Array.isArray(owner.components)) return null;
    for (const value of owner.components as unknown[]) {
      if (isRecord(value) && value.id === componentId) return value;
    }
    return null;
  }

  private imageRecord(
    ownerId: string,
    component: JsonRecord,
    show: boolean,
  ): CoreV2EngineSceneImageRecord {
    const componentId = String(component.id);
    const source = String(component.source);
    const resolved = show && this.assetAcquisition !== null && this.assetAlias === source;
    const record: CoreV2EngineSceneImageRecord = {
      entityId: `${ownerId}::icon:${componentId}`,
      active: resolved,
      generation: this.geometryRevision,
      authoredSource: source,
      sourceKind: 'alias',
      dimensionMode: 'authored',
      bindingKey: `alias:${source}`,
      sourceCacheIdentity: `alias:${source}`,
      state: resolved ? 'resolved' : show ? 'pending' : 'absent',
      attachmentState: resolved ? 'current' : 'unbound',
      cacheIdentity: resolved ? this.assetAcquisition?.cacheIdentity ?? null : null,
      normalizedResourceIdentity: resolved
        ? this.assetAcquisition?.normalizedResourceIdentity ?? null
        : null,
      naturalSize: Object.freeze([16, 16] as const),
      reusedResolvedResource: false,
      publication: {
        rendererFacts: resolved && this.fault !== 'stale-publication' ? 'current' : 'pending',
      },
      renderObjectCount: resolved ? 1 : 0,
      placeholderCount: 0,
      bindingConsumerCount: resolved ? 1 : 0,
      role: resolved ? 'image' : 'none',
      rendererGeneration: resolved ? this.geometryRevision : null,
      staleAttachCount: 0,
      staleCompletionCount: 0,
      diagnosticCount: 0,
      opacity: 1,
      zIndex: 0,
      hitBounds: null,
      initial: null,
      attempts: Object.freeze([]),
    };
    return deepFreeze(record);
  }

  private failedImageRecord(image: JsonRecord): CoreV2EngineSceneImageRecord {
    const entityId = String(image.id);
    const source = String(image.source);
    const bindingKey = `url:${source}`;
    const active = image.show !== false;
    const record: CoreV2EngineSceneImageRecord = {
      entityId,
      active,
      generation: this.geometryRevision,
      authoredSource: source,
      sourceKind: 'url',
      dimensionMode: 'authored',
      bindingKey,
      sourceCacheIdentity: bindingKey,
      state: active ? 'failed' : 'absent',
      attachmentState: active ? 'current' : 'unbound',
      cacheIdentity: null,
      normalizedResourceIdentity: null,
      naturalSize: null,
      reusedResolvedResource: false,
      publication: { rendererFacts: 'current' },
      renderObjectCount: active ? 1 : 0,
      placeholderCount: active ? 1 : 0,
      bindingConsumerCount: active ? 1 : 0,
      role: active ? 'asset-placeholder' : 'none',
      rendererGeneration: active ? this.geometryRevision : null,
      staleAttachCount: 0,
      staleCompletionCount: 0,
      diagnosticCount: active ? 1 : 0,
      opacity: 1,
      zIndex: 0,
      hitBounds: null,
      initial: null,
      attempts: Object.freeze([]),
    };
    return deepFreeze(record);
  }
}

function entityGeometry(record: JsonRecord) {
  const attrs = isRecord(record.attrs) ? record.attrs : {};
  const size = isRecord(record.size) ? record.size : { width: 0, height: 0 };
  const x = numberOr(attrs.x, 0);
  const y = numberOr(attrs.y, 0);
  const width = numberOr(size.width, 0);
  const height = numberOr(size.height, 0);
  const angle = numberOr(attrs.angle, 0);
  const radians = angle * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const corners = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ].map(([localX = 0, localY = 0]) => [
    x + localX * cosine - localY * sine,
    y + localX * sine + localY * cosine,
  ] as const);
  const xs = corners.map(([cornerX]) => cornerX);
  const ys = corners.map(([, cornerY]) => cornerY);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const bounds = Object.freeze([minX, minY, maxX - minX, maxY - minY] as const);
  return deepFreeze({
    id: String(record.id),
    kind: String(record.type),
    localBounds: [0, 0, width, height] as const,
    worldBounds: bounds,
    screenBounds: bounds,
    visibleBounds: bounds,
    visible: record.show !== false,
    interactive: record.interactive !== false,
    visibleCenter: [
      x + width / 2 * cosine - height / 2 * sine,
      y + width / 2 * sine + height / 2 * cosine,
    ] as const,
    screenAngle: angle,
  });
}

function componentProductRenderRole(
  componentType: string,
  component: JsonRecord,
): CoreV2ComponentRenderRole {
  if (componentType === 'background') {
    return isRecord(component.source) && component.source.type === 'rect'
      ? 'background-geometry'
      : 'background-asset';
  }
  if (componentType === 'icon') return 'content-asset';
  if (componentType === 'text') return 'text';
  return 'ordinary-geometry';
}

function componentRenderLane(
  componentType: string,
  component: JsonRecord,
): CoreV2RenderLaneRole {
  switch (componentType) {
    case 'background':
      return isRecord(component.source) && component.source.type === 'rect'
        ? 'background-geometry'
        : 'background-assets';
    case 'icon':
      return 'content-assets';
    case 'text':
      return 'text';
    default:
      return 'ordinary-geometry';
  }
}

function relationBounds(
  start: readonly [number, number],
  end: readonly [number, number],
): readonly [number, number, number, number] {
  return Object.freeze([
    Math.min(start[0], end[0]),
    Math.min(start[1], end[1]),
    Math.abs(end[0] - start[0]),
    Math.abs(end[1] - start[1]),
  ]);
}

function center(bounds: readonly [number, number, number, number]): readonly [number, number] {
  return Object.freeze([bounds[0] + bounds[2] / 2, bounds[1] + bounds[3] / 2]);
}

function testDatasets(): ReadonlyMap<string, unknown> {
  return new Map([
    ['all-kinds-scene', allKindsScene()],
    ['replacement-interactive-scene', replacementScene()],
    ['relation-variants-scene', relationScene()],
  ]);
}

function allKindsScene(): readonly unknown[] {
  return deepFreeze([
    {
      type: 'item',
      id: 'item-a',
      size: { width: 100, height: 80 },
      padding: 4,
      attrs: { x: 10, y: 20 },
      components: [
        { type: 'background', id: 'bg', source: { type: 'rect', fill: '#336699' } },
        {
          type: 'bar',
          id: 'bar',
          source: { type: 'rect', fill: '#00aa66' },
          size: { width: 60, height: 10 },
          placement: 'bottom',
          animation: true,
          animationDuration: 200,
        },
        { type: 'icon', id: 'icon', source: 'warning', size: 16, placement: 'left' },
        {
          type: 'text',
          id: 'label',
          text: 'Alpha',
          placement: 'center',
          style: { fontFamily: 'FiraCode', fontSize: 16, fill: '#111111' },
        },
        {
          type: 'text',
          id: 'hidden-label',
          text: 'Hidden',
          show: false,
          placement: 'center',
          style: { fontFamily: 'FiraCode', fontSize: 12, fill: '#222222' },
        },
      ],
    },
    rect('rect-b', 160, 40, 40, 30),
    {
      type: 'image',
      id: 'image-a',
      source: 'fixture://image-a.png',
      size: { width: 80, height: 40 },
      attrs: { x: -20, y: 200 },
    },
  ]);
}

function replacementScene(): readonly unknown[] {
  return deepFreeze([
    {
      type: 'item',
      id: 'item-a',
      size: { width: 120, height: 90 },
      padding: 5,
      attrs: { x: 20, y: 30 },
      components: [
        {
          type: 'bar',
          id: 'bar',
          source: { type: 'rect', fill: '#228866' },
          size: { width: 70, height: 14 },
          placement: 'bottom',
        },
      ],
    },
    rect('rect-c', 240, 60, 30, 20),
  ]);
}

function relationScene(): readonly unknown[] {
  return deepFreeze([
    rect('a', 0, 0, 20, 20),
    rect('b', 100, 0, 20, 20),
    {
      type: 'relations',
      id: 'links',
      links: [
        { source: 'a', target: 'a' },
        { source: 'a', target: 'b' },
        { source: 'a', target: 'b' },
        { source: 'b', target: 'a' },
      ],
      style: { color: '#222222', width: 2 },
    },
  ]);
}

function rect(id: string, x: number, y: number, width: number, height: number): JsonRecord {
  return {
    type: 'rect',
    id,
    size: { width, height },
    fill: '#ff8800',
    attrs: { x, y, zIndex: 2 },
  };
}

class ManualClock implements ClockContract {
  private timeMs = 0;

  public now(): number {
    return this.timeMs;
  }

  public advanceTo(timeMs: number): Promise<void> {
    if (!Number.isFinite(timeMs) || timeMs < this.timeMs) {
      return Promise.reject(new Error('clock cannot move backwards'));
    }
    this.timeMs = timeMs;
    return Promise.resolve();
  }

  public withTimeout<T>(promise: Promise<T>): Promise<T> {
    return promise;
  }
}

function actualAt(execution: CaseExecution, index: number): JsonRecord {
  const result = execution.actionResults[index];
  if (result === undefined) throw new Error(`Missing action ${index}`);
  return result.delta.actual;
}

function captureValues(execution: CaseExecution, id: string): JsonRecord {
  const capture = execution.captures.find((entry) => entry.id === id);
  return requireRecord(capture?.values, `capture ${id}`);
}

function segment(actual: JsonRecord, key: string): JsonRecord {
  const relationState = requireRecord(actual.relationState, 'relation state');
  const segments = requireArray(relationState.segments, 'relation segments');
  const found = segments.find((value) => requireRecord(value, 'relation segment').key === key);
  return requireRecord(found, `relation segment ${key}`);
}

function segmentCountTo(actual: JsonRecord, targetId: string): number {
  const relationState = requireRecord(actual.relationState, 'relation state');
  return requireArray(relationState.segments, 'relation segments').filter((value) => (
    requireRecord(value, 'relation segment').targetId === targetId ||
    requireRecord(value, 'relation segment').sourceId === targetId
  )).length;
}

let testAssetBackendSequence = 0;

function createTestAssetRuntime(): CoreV2AssetRuntime {
  const backend: CoreV2AssetBackend = Object.freeze({
    keyNamespace: `core-v2-update-handler-test-${++testAssetBackendSequence}`,
    get(_request: CoreV2AssetBackendRequest) {
      return undefined;
    },
    load(request: CoreV2AssetBackendRequest) {
      return Promise.resolve(Object.freeze({ key: request.key }));
    },
    describe(request: CoreV2AssetBackendRequest) {
      return Object.freeze({
        normalizedResourceIdentity: `decoded:${request.cacheIdentity}`,
        cacheIdentity: request.cacheIdentity,
      });
    },
    unload(_key: string) {
      return Promise.resolve();
    },
  });
  return new CoreV2AssetRuntime(backend);
}

function zeroOwnership(): Readonly<JsonRecord> {
  return Object.freeze({
    activeSessionCount: 0,
    tickerCount: 0,
    schedulerCount: 0,
    listenerCount: 0,
    animationClosureCount: 0,
    pendingWorkCount: 0,
  });
}

function asDataset(value: unknown): readonly JsonRecord[] {
  if (!Array.isArray(value)) throw new Error('Surface dataset must be an array');
  return value as readonly JsonRecord[];
}

function requireArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function requireRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`${label} must be a record`);
  return value;
}

function requireInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`${label} must be positive`);
  }
  return value as number;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value as object)) return value;
  seen.add(value as object);
  for (const key of Reflect.ownKeys(value as object)) {
    deepFreeze(Reflect.get(value as object, key), seen);
  }
  return Object.freeze(value);
}
