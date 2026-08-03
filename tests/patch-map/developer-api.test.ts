import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPatchMapDeveloperApi } from '../../src/patch-map/developer-api';
import { PatchMap } from '../../src/patch-map/engine';
import * as PublicPackage from '../../src/index';
import { PatchMap as PublicPatchMap } from '../../src/index';
import type {
  PatchMapEngineInstanceBarHeightResult,
  PatchMapEngineQueryResult,
  PatchMapEngineTransactionResult,
} from '../../src/patch-map/engine/public-contracts';
import type { PatchMapLogicalTargetSnapshot } from '../../src/patch-map/query-selection';
import { createEngine } from './support/engine-update-transaction-surface';

const REVISIONS = Object.freeze({
  lifecycleGeneration: 1,
  sceneRevision: 2,
  viewRevision: 0,
  interactionRevision: 0,
});

function logicalTarget(
  value: Partial<PatchMapLogicalTargetSnapshot> &
    Pick<PatchMapLogicalTargetSnapshot, 'key' | 'kind' | 'id' | 'type'>,
): PatchMapLogicalTargetSnapshot {
  const ownerId = value.ownerId ?? null;
  return Object.freeze({
    target: value.kind === 'element'
      ? Object.freeze({ kind: 'element', id: value.id })
      : Object.freeze({ kind: 'component', ownerId: ownerId!, id: value.id }),
    selectionId: value.kind === 'element' ? value.id : ownerId!,
    ownerId,
    label: null,
    parentKey: null,
    ancestorKeys: Object.freeze([]),
    depth: 0,
    sceneOrder: 0,
    zIndex: 0,
    topLevel: false,
    locked: false,
    ancestorLocked: false,
    rendererObjectCount: 0,
    value: Object.freeze({}),
    identity: Object.freeze({ key: value.key, sceneOrder: 0 }),
    ...value,
  });
}

function createHost() {
  const root = logicalTarget({
    key: 'element:rack-grid',
    kind: 'element',
    id: 'rack-grid',
    type: 'grid',
    topLevel: true,
  });
  const cell = logicalTarget({
    key: 'element:rack-grid.12.3',
    kind: 'element',
    id: 'rack-grid.12.3',
    type: 'grid-cell',
    parentKey: root.key,
    ancestorKeys: Object.freeze([root.key]),
  });
  const usage = logicalTarget({
    key: 'component:rack-grid.12.3/usage',
    kind: 'component',
    id: 'usage',
    ownerId: cell.id,
    type: 'bar',
    parentKey: cell.key,
    ancestorKeys: Object.freeze([root.key, cell.key]),
  });
  const rack = logicalTarget({
    key: 'element:rack',
    kind: 'element',
    id: 'rack',
    type: 'item',
    topLevel: true,
  });
  const rackUsage = logicalTarget({
    key: 'component:rack/usage',
    kind: 'component',
    id: 'usage',
    ownerId: rack.id,
    type: 'bar',
    parentKey: rack.key,
    ancestorKeys: Object.freeze([rack.key]),
  });
  const rackLabel = logicalTarget({
    key: 'component:rack/label',
    kind: 'component',
    id: 'label',
    ownerId: rack.id,
    type: 'text',
    parentKey: rack.key,
    ancestorKeys: Object.freeze([rack.key]),
  });
  const ambiguous = logicalTarget({
    key: 'element:ambiguous',
    kind: 'element',
    id: 'ambiguous',
    type: 'item',
    topLevel: true,
  });
  const primaryBar = logicalTarget({
    key: 'component:ambiguous/primary',
    kind: 'component',
    id: 'primary',
    ownerId: ambiguous.id,
    type: 'bar',
    parentKey: ambiguous.key,
    ancestorKeys: Object.freeze([ambiguous.key]),
  });
  const secondaryBar = logicalTarget({
    key: 'component:ambiguous/secondary',
    kind: 'component',
    id: 'secondary',
    ownerId: ambiguous.id,
    type: 'bar',
    parentKey: ambiguous.key,
    ancestorKeys: Object.freeze([ambiguous.key]),
  });
  const query = Object.freeze({
    schemaRevision: 'core-v2-query-selection/1',
    status: 'matched',
    code: null,
    lifecycleGeneration: 1,
    sceneRevision: 2,
    targets: Object.freeze([
      root,
      cell,
      usage,
      rack,
      rackUsage,
      rackLabel,
      ambiguous,
      primaryBar,
      secondaryBar,
    ]),
  }) as PatchMapEngineQueryResult;
  let reusable = true;
  let lastBarRequest: unknown = null;
  let lastInstanceRequest: unknown = null;
  let lastTextRequest: unknown = null;
  let lastTransactionRequest: unknown = null;
  let lastTransformRequest: unknown = null;
  const fitViewport = vi.fn(() => Object.freeze({ status: 'applied' }));
  const resize = vi.fn(() => true);
  let selectionListener: ((change: Readonly<{
    readonly current: readonly string[];
  }>) => void) | null = null;
  const applySelection = vi.fn((input: { readonly op: string; readonly ids?: readonly string[] }) =>
    Object.freeze({
      changed: true,
      source: 'external' as const,
      current: input.op === 'clear' ? Object.freeze([]) : Object.freeze([...(input.ids ?? [])]),
      added: Object.freeze([]),
      removed: Object.freeze([]),
    }));
  const host = {
    selectionIds: Object.freeze([]),
    loadDataset: () => Object.freeze({
      lifecycle: 'scene-ready' as const,
      sceneRevision: 2,
      semanticHash: 'hash',
      rootIds: Object.freeze(['rack-grid']),
    }),
    loadDatasetAsync: () => Promise.resolve(Object.freeze({
      lifecycle: 'scene-ready' as const,
      sceneRevision: 2,
      semanticHash: 'hash',
      rootIds: Object.freeze(['rack-grid']),
    })),
    exportDataset: () => Object.freeze([]),
    transact: (request: Readonly<{ readonly operations: readonly Readonly<{ readonly target?: unknown }>[] }>) => {
      lastTransactionRequest = request;
      return Object.freeze({
        status: 'committed',
        changed: true,
        applied: Object.freeze(request.operations.flatMap((operation) =>
          operation.target === undefined ? [] : [operation.target])),
        missing: Object.freeze([]),
      }) as unknown as PatchMapEngineTransactionResult;
    },
    updateBarHeights: (request: unknown) => {
      lastBarRequest = request;
      return Object.freeze({
        status: 'committed',
        changed: true,
        applied: Object.freeze([{ kind: 'component', ownerId: 'rack', id: 'usage' }]),
        missing: Object.freeze([]),
      }) as unknown as PatchMapEngineTransactionResult;
    },
    updateInstanceBarHeights: (request: unknown) => {
      lastInstanceRequest = request;
      return Object.freeze({
        status: 'committed',
        changed: true,
        appliedTargets: Object.freeze([{ id: cell.id, componentId: 'usage' }]),
        missingTargets: Object.freeze([]),
      }) as unknown as PatchMapEngineInstanceBarHeightResult;
    },
    updateTexts: (request: unknown) => {
      lastTextRequest = request;
      return Object.freeze({
        status: 'committed',
        changed: true,
        applied: Object.freeze([{ kind: 'component', ownerId: 'rack', id: 'label' }]),
        missing: Object.freeze([]),
      }) as unknown as PatchMapEngineTransactionResult;
    },
    queryScene: () => query,
    reuseQueryResult: () => Object.freeze({ status: reusable ? 'accepted' : 'rejected' }),
    on: (_event: 'selectionChanged', listener: typeof selectionListener) => {
      selectionListener = listener;
      return () => { selectionListener = null; };
    },
    applySelection,
    applyTransformerEdit: (request: unknown) => {
      lastTransformRequest = request;
      return Object.freeze({ status: 'committed', changed: true });
    },
    fitViewport,
    focusViewport: vi.fn(),
    restoreViewport: vi.fn(),
    panViewport: vi.fn(),
    zoomViewportAt: vi.fn(),
    viewportProbe: () => Object.freeze({ centerWorld: Object.freeze([0, 0]), scale: 1 }),
    resize,
    historyState: () => Object.freeze({
      capacity: 20,
      depth: 0,
      cursor: 0,
      undoDepth: 0,
      redoDepth: 0,
      canUndo: false,
      canRedo: false,
      destroyed: false,
    }),
    undo: vi.fn(),
    redo: vi.fn(),
    clearHistory: vi.fn(),
    registerAssets: vi.fn(),
    assetProbe: vi.fn(),
    captureManagedPng: vi.fn(() => Promise.resolve(Object.freeze({
      dataUrl: 'data:image/png;base64,AAAA',
      mime: 'image/png' as const,
      cssSize: Object.freeze([640, 360] as const),
    }))),
    snapshot: () => Object.freeze({
      instanceId: 'developer-api-test',
      revisions: REVISIONS,
      resources: Object.freeze({
        canvas: Object.freeze({ cssSize: Object.freeze([640, 360] as const) }),
      }),
    }),
  };
  return {
    host: host as unknown as Parameters<typeof createPatchMapDeveloperApi>[0],
    fitViewport,
    resize,
    applySelection,
    setReusable: (value: boolean) => { reusable = value; },
    lastBarRequest: () => lastBarRequest,
    lastInstanceRequest: () => lastInstanceRequest,
    lastTextRequest: () => lastTextRequest,
    lastTransactionRequest: () => lastTransactionRequest,
    lastTransformRequest: () => lastTransformRequest,
    publishSelection: (ids: readonly string[]) => selectionListener?.(Object.freeze({ current: ids })),
  };
}

describe('PatchMap high-level developer API', () => {
  const engines: PatchMap[] = [];

  afterEach(async () => {
    await Promise.all(engines.splice(0).map((engine) => engine.destroy()));
  });

  it('queries a reusable semantic target set with stable id/componentId addresses', () => {
    const harness = createHost();
    const map = createPatchMapDeveloperApi(harness.host);
    const usage = map.targets.query({
      within: 'rack-grid',
      componentId: 'usage',
      type: 'bar',
      scope: 'instances',
    });

    expect('compile' in map.targets).toBe(false);
    expect(usage.count).toBe(1);
    expect(usage.matches).toEqual([{
      id: 'rack-grid.12.3',
      componentId: 'usage',
      kind: 'component',
      type: 'bar',
      label: null,
      value: {},
    }]);
    expect(map.updateBatch({
      targets: usage,
      bar: { height: new Float32Array([72]) },
    }, {
      animate: true,
    })).toMatchObject({ status: 'committed', appliedCount: 1 });
    expect(harness.lastInstanceRequest()).toEqual({
      targets: [{ id: 'rack-grid.12.3', componentId: 'usage' }],
      heights: new Float32Array([72]),
      animate: true,
    });
    expect(map.selection.set(usage)).toEqual(['rack-grid.12.3']);
  });

  it('keeps the low-level ownerId translation behind the ergonomic bar API', () => {
    const harness = createHost();
    const map = createPatchMapDeveloperApi(harness.host);

    expect(map.update({
      id: 'rack',
      bar: { height: 44 },
    }, { actionId: 'refresh' })).toMatchObject({
      status: 'committed',
      changed: true,
      appliedCount: 1,
    });
    expect(harness.lastBarRequest()).toEqual({
      targets: [{ ownerId: 'rack', componentId: 'usage' }],
      heights: [44],
      actionId: 'refresh',
    });
  });

  it('requires componentId only when the component type is ambiguous', () => {
    const harness = createHost();
    const map = createPatchMapDeveloperApi(harness.host);

    expect(() => map.update({
      id: 'ambiguous',
      bar: { height: 44 },
    })).toThrow(
      'ambiguous has multiple bar components. Set bar.componentId to choose one.',
    );
    expect(map.update({
      id: 'ambiguous',
      bar: { componentId: 'secondary', height: 44 },
    })).toMatchObject({ status: 'committed' });
    expect(harness.lastBarRequest()).toEqual({
      targets: [{ ownerId: 'ambiguous', componentId: 'secondary' }],
      heights: [44],
    });
  });

  it('rejects stale target sets instead of updating a new scene by accident', () => {
    const harness = createHost();
    const map = createPatchMapDeveloperApi(harness.host);
    const targets = map.targets.query({ type: 'bar', scope: 'instances' });
    harness.setReusable(false);

    expect(() => map.updateBatch({ targets, bar: { height: [30] } })).toThrow(
      'target set is stale; run targets.query() again after loading data',
    );
  });

  it('merges heterogeneous owner changes through one low-level atomic transaction', () => {
    const harness = createHost();
    const map = createPatchMapDeveloperApi(harness.host);

    expect(map.update({
      id: 'rack',
      changes: { attrs: { x: 40 } },
      bar: {
        changes: {
          size: { width: 88 },
          source: { fill: '#22c55e' },
        },
      },
      text: { text: '정상', style: { fill: '#ffffff' } },
    }, { actionId: 'refresh-rack' })).toMatchObject({
      status: 'committed',
      changed: true,
      appliedCount: 3,
    });

    expect(harness.lastTransactionRequest()).toEqual({
      operations: [
        {
          op: 'merge',
          target: { kind: 'element', id: 'rack' },
          changes: [{ path: ['attrs', 'x'], value: 40 }],
        },
        {
          op: 'merge',
          target: { kind: 'component', ownerId: 'rack', id: 'usage' },
          changes: [
            { path: ['size', 'width'], value: 88 },
            { path: ['source', 'fill'], value: '#22c55e' },
          ],
        },
        {
          op: 'merge',
          target: { kind: 'component', ownerId: 'rack', id: 'label' },
          changes: [
            { path: ['text'], value: '정상' },
            { path: ['style', 'fill'], value: '#ffffff' },
          ],
        },
      ],
      strict: true,
      actionId: 'refresh-rack',
    });
  });

  it('keeps columnar batches distinct from heterogeneous structural transactions', () => {
    const harness = createHost();
    const map = createPatchMapDeveloperApi(harness.host);

    expect(map.updateBatch({
      targets: ['rack'],
      text: {
        text: ['점검 필요'],
        style: [{ fill: '#ef4444' }],
      },
    })).toMatchObject({ status: 'committed', appliedCount: 1 });
    expect(harness.lastTextRequest()).toEqual({
      targets: [{ ownerId: 'rack', componentId: 'label' }],
      texts: ['점검 필요'],
      styles: [{ fill: '#ef4444' }],
    });

    expect(map.transaction([
      {
        type: 'update',
        id: 'rack',
        bar: { changes: { source: { fill: '#f97316' } } },
      },
      { type: 'move', id: 'rack', parentId: null, index: 0 },
    ], {
      actionId: 'reorder-rack',
      selectedIds: ['rack'],
    })).toMatchObject({ status: 'committed' });
    expect(harness.lastTransactionRequest()).toMatchObject({
      strict: true,
      actionId: 'reorder-rack',
      history: { selectedIds: ['rack'] },
      operations: [
        { op: 'merge', target: { kind: 'component', ownerId: 'rack', id: 'usage' } },
        { op: 'move', target: { kind: 'element', id: 'rack' }, parent: null, index: 0 },
      ],
    });
  });

  it('rejects malformed batch columns before committing any mutation', () => {
    const harness = createHost();
    const map = createPatchMapDeveloperApi(harness.host);

    expect(() => map.updateBatch({
      targets: ['rack'],
      bar: { height: [20, 30] },
    })).toThrow('bar.height column length must match 1 targets');
    expect(harness.lastBarRequest()).toBeNull();
    expect(harness.lastTransactionRequest()).toBeNull();
  });

  it('keeps non-hot-path bar fields behind component changes', () => {
    const harness = createHost();
    const map = createPatchMapDeveloperApi(harness.host);

    expect(() => map.update({
      id: 'rack',
      bar: { fill: '#22c55e' },
    } as never)).toThrow('$.update.bar.fill is not a supported field');
    expect(() => map.updateBatch({
      targets: ['rack'],
      bar: { width: [92] },
    } as never)).toThrow('$.updateBatch.bar.width is not a supported field');
    expect(harness.lastBarRequest()).toBeNull();
    expect(harness.lastTransactionRequest()).toBeNull();
  });

  it('keeps identity-bearing collections behind explicit structural transactions', () => {
    const harness = createHost();
    const map = createPatchMapDeveloperApi(harness.host);

    expect(() => map.update({
      id: 'rack',
      changes: { components: [] },
    })).toThrow(
      'update() cannot change protected components; use transaction() for structural changes',
    );
    expect(harness.lastTransactionRequest()).toBeNull();
  });

  it('reports mutation field typos instead of silently ignoring them', () => {
    const harness = createHost();
    const map = createPatchMapDeveloperApi(harness.host);

    expect(() => map.update({
      id: 'rack',
      bar: { height: 40, colour: '#22c55e' },
    } as never)).toThrow('$.update.bar.colour is not a supported field');
    expect(() => map.updateBatch({
      targets: ['rack'],
      bars: { height: [40] },
    } as never)).toThrow('$.updateBatch.bars is not a supported field');
    expect(() => map.transaction([{
      type: 'reparent',
      id: 'rack',
    }] as never)).toThrow('$.transaction[0].type is not supported: reparent');
    expect(harness.lastBarRequest()).toBeNull();
    expect(harness.lastTransactionRequest()).toBeNull();
  });

  it('rejects accessor-backed mutation envelopes without evaluating getters', () => {
    const harness = createHost();
    const map = createPatchMapDeveloperApi(harness.host);
    let reads = 0;
    const input = { id: 'rack' } as Record<string, unknown>;
    Object.defineProperty(input, 'bar', {
      enumerable: true,
      get: () => {
        reads += 1;
        return { height: 40 };
      },
    });

    expect(() => map.update(input as never)).toThrow();
    expect(reads).toBe(0);
    expect(harness.lastBarRequest()).toBeNull();
  });

  it('rejects accessor-backed columns without evaluating them or committing', () => {
    const harness = createHost();
    const map = createPatchMapDeveloperApi(harness.host);
    let reads = 0;
    const heights = { length: 1 };
    Object.defineProperty(heights, '0', {
      enumerable: true,
      get: () => {
        reads += 1;
        return 20;
      },
    });

    expect(() => map.updateBatch({
      targets: ['rack'],
      bar: { height: heights as ArrayLike<number> },
    })).toThrow('bar.height[0] must be a present data property');
    expect(reads).toBe(0);
    expect(harness.lastBarRequest()).toBeNull();
    expect(harness.lastTransactionRequest()).toBeNull();
  });

  it('lowers a heterogeneous columnar row into one strict commit', () => {
    const harness = createHost();
    const map = createPatchMapDeveloperApi(harness.host);

    expect(map.updateBatch({
      targets: ['rack'],
      changes: { attrs: [{ x: 64 }] },
      bar: {
        changes: {
          size: [{ width: 92 }],
          source: [{ fill: '#16a34a' }],
        },
      },
      text: { text: ['가동'], style: [{ fill: '#f8fafc' }] },
    }, { actionId: 'columnar-rack' })).toMatchObject({
      status: 'committed',
      appliedCount: 3,
    });
    expect(harness.lastTransactionRequest()).toMatchObject({
      strict: true,
      actionId: 'columnar-rack',
      operations: [
        {
          op: 'merge',
          target: { kind: 'element', id: 'rack' },
          changes: [{ path: ['attrs', 'x'], value: 64 }],
        },
        {
          op: 'merge',
          target: { kind: 'component', ownerId: 'rack', id: 'usage' },
          changes: [
            { path: ['size', 'width'], value: 92 },
            { path: ['source', 'fill'], value: '#16a34a' },
          ],
        },
        {
          op: 'merge',
          target: { kind: 'component', ownerId: 'rack', id: 'label' },
          changes: [
            { path: ['text'], value: '가동' },
            { path: ['style', 'fill'], value: '#f8fafc' },
          ],
        },
      ],
    });
  });

  it('publishes one real atomic scene commit without mutating the caller update', async () => {
    const { engine, surface } = await createEngine(engines, 'developer-api-atomic');
    engine.loadDataset([{
      type: 'item',
      id: 'rack',
      attrs: { x: 0, y: 0 },
      size: { width: 100, height: 120 },
      components: [
        {
          type: 'bar',
          id: 'usage',
          source: { type: 'rect', fill: '#2563eb' },
          size: { width: 80, height: 40 },
          placement: 'bottom',
          animation: true,
        },
        {
          type: 'text',
          id: 'label',
          text: '40',
          placement: 'top',
          style: { fontSize: 12, fill: '#111827' },
        },
      ],
    }]);
    const input = Object.freeze({
      id: 'rack',
      bar: Object.freeze({
        height: 72,
        changes: Object.freeze({
          source: Object.freeze({ fill: '#22c55e' }),
        }),
      }),
      text: Object.freeze({
        text: '정상',
        style: Object.freeze({ fill: '#ffffff' }),
      }),
    });

    expect(engine.update(input, { actionId: 'rack-live-state' })).toMatchObject({
      status: 'committed',
      changed: true,
      appliedCount: 2,
    });
    expect(surface.reconcileCalls).toHaveLength(1);
    expect(input).toEqual({
      id: 'rack',
      bar: { height: 72, changes: { source: { fill: '#22c55e' } } },
      text: { text: '정상', style: { fill: '#ffffff' } },
    });
    const rack = engine.exportDataset()[0];
    expect(rack?.type).toBe('item');
    if (rack?.type !== 'item') throw new Error('expected item result');
    expect(rack.components[0]).toMatchObject({
      id: 'usage',
      size: { width: 80, height: 72 },
      source: { type: 'rect', fill: '#22c55e' },
    });
    expect(rack.components[1]).toMatchObject({
      id: 'label',
      text: '정상',
      style: { fontSize: 12, fill: '#ffffff' },
    });
  });

  it('loads and fits through one high-level call', () => {
    const harness = createHost();
    const map = createPatchMapDeveloperApi(harness.host);

    expect(map.data.load([], { datasetRef: 'dashboard' })).toEqual({
      rootIds: ['rack-grid'],
      semanticHash: 'hash',
      sceneRevision: 2,
    });
    expect(harness.fitViewport).toHaveBeenCalledOnce();
  });

  it('maps common editor and capture work without exposing low-level request envelopes', async () => {
    const harness = createHost();
    const map = createPatchMapDeveloperApi(harness.host);

    expect(map.transform.move({ id: 'rack-grid.12.3' }, [8, 4], {
      actionId: 'drag-rack',
    })).toMatchObject({ status: 'committed' });
    expect(harness.lastTransformRequest()).toEqual({
      kind: 'move',
      selectionIds: ['rack-grid.12.3'],
      deltaWorld: [8, 4],
    });
    expect(map.selection.set('rack-grid.12.3')).toEqual(['rack-grid.12.3']);
    const selectionChanges: Array<readonly string[]> = [];
    const releaseSelection = map.selection.onChange((ids) => selectionChanges.push(ids));
    harness.publishSelection(['rack-grid.12.3']);
    expect(selectionChanges).toEqual([['rack-grid.12.3']]);
    releaseSelection();
    expect(map.viewport.resize(720, 480, 2)).toBe(true);
    expect(harness.resize).toHaveBeenCalledWith(720, 480, 2);
    await expect(map.capture.png()).resolves.toEqual({
      dataUrl: 'data:image/png;base64,AAAA',
      mime: 'image/png',
      size: [640, 360],
    });
  });

  it('ships one PatchMap name without exposing the low-level implementation alias', () => {
    expect(PublicPatchMap).toBe(PatchMap);
    expect(typeof PublicPatchMap.mount).toBe('function');
    expect('PatchMapAdvanced' in PublicPackage).toBe(false);
  });

  it('explains a missing mount target before allocating renderer resources', async () => {
    await expect(PatchMap.mount({ target: '#missing-patch-map-host' })).rejects.toThrow(
      'Create the host element before mounting',
    );
  });
});
