import { describe, expect, it, vi } from 'vitest';

import { createPatchMapDeveloperApi } from '../../src/patch-map/developer-api';
import { PatchMap } from '../../src/patch-map/engine';
import {
  PatchMap as PublicPatchMap,
  PatchMapAdvanced,
} from '../../src/index';
import type {
  PatchMapEngineInstanceBarHeightResult,
  PatchMapEngineQueryResult,
  PatchMapEngineTransactionResult,
} from '../../src/patch-map/engine/public-contracts';
import type { PatchMapLogicalTargetSnapshot } from '../../src/patch-map/query-selection';

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
  const query = Object.freeze({
    schemaRevision: 'core-v2-query-selection/1',
    status: 'matched',
    code: null,
    lifecycleGeneration: 1,
    sceneRevision: 2,
    targets: Object.freeze([root, cell, usage]),
  }) as PatchMapEngineQueryResult;
  let reusable = true;
  let lastBarRequest: unknown = null;
  let lastInstanceRequest: unknown = null;
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
    updateTexts: () => Object.freeze({
      status: 'unchanged',
      changed: false,
      applied: Object.freeze([]),
      missing: Object.freeze([]),
    }) as unknown as PatchMapEngineTransactionResult,
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
    lastTransformRequest: () => lastTransformRequest,
    publishSelection: (ids: readonly string[]) => selectionListener?.(Object.freeze({ current: ids })),
  };
}

describe('PatchMap high-level developer API', () => {
  it('compiles semantic instance targets once and reuses stable id/componentId addresses', () => {
    const harness = createHost();
    const map = createPatchMapDeveloperApi(harness.host);
    const usage = map.targets.compile({
      within: 'rack-grid',
      componentId: 'usage',
      type: 'bar',
      scope: 'instances',
    });

    expect(usage.targets).toEqual([{
      id: 'rack-grid.12.3',
      componentId: 'usage',
      kind: 'component',
      type: 'bar',
      label: null,
      value: {},
    }]);
    expect(map.bars.setInstanceBatch(usage, new Float32Array([72]), {
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

    expect(map.bars.set({
      id: 'rack',
      componentId: 'usage',
      height: 44,
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

  it('rejects stale compiled selectors instead of updating a new scene by accident', () => {
    const harness = createHost();
    const map = createPatchMapDeveloperApi(harness.host);
    const targets = map.targets.compile({ type: 'bar', scope: 'instances' });
    harness.setReusable(false);

    expect(() => map.bars.setInstanceBatch(targets, [30])).toThrow(
      'compiled targets are stale; compile the selector again after loading data',
    );
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

  it('keeps one runtime implementation behind high-level and advanced package names', () => {
    expect(PublicPatchMap).toBe(PatchMapAdvanced);
    expect(PublicPatchMap).toBe(PatchMap);
    expect(typeof PublicPatchMap.mount).toBe('function');
  });

  it('explains a missing mount target before allocating renderer resources', async () => {
    await expect(PatchMap.mount({ target: '#missing-patch-map-host' })).rejects.toThrow(
      'Create the host element before mounting',
    );
  });
});
