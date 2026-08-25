import { vi } from 'vitest';

import type {
  createPatchMapApi,
  type PatchMapPointerHoverEvent,
  type PatchMapPointerSelectionChange,
  type PatchMapPointerTooltipEvent,
} from '../../src/public';
import type {
  PatchMapEngineInstanceBarHeightResult,
  PatchMapEngineTransactionResult,
} from '../../src/engine/contracts/mutation';
import type {
  PatchMapEngineQueryResult,
} from '../../src/engine/contracts/query-selection';
import type {
  PatchMapViewportChangeResult,
  PatchMapViewportState,
} from '../../src/engine/contracts/viewport';
import type { PatchMapLogicalTargetSnapshot } from '../../src/query-selection';

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

export function createHost() {
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
  const cellBackground = logicalTarget({
    key: 'component:rack-grid.12.3/surface',
    kind: 'component',
    id: 'surface',
    ownerId: cell.id,
    type: 'background',
    parentKey: cell.key,
    ancestorKeys: Object.freeze([root.key, cell.key]),
  });
  const statusIcon = logicalTarget({
    key: 'component:rack-grid.12.3/status',
    kind: 'component',
    id: 'status',
    ownerId: cell.id,
    type: 'icon',
    parentKey: cell.key,
    ancestorKeys: Object.freeze([root.key, cell.key]),
  });
  const cellLabel = logicalTarget({
    key: 'component:rack-grid.12.3/label',
    kind: 'component',
    id: 'label',
    ownerId: cell.id,
    type: 'text',
    parentKey: cell.key,
    ancestorKeys: Object.freeze([root.key, cell.key]),
  });
  const secondCell = logicalTarget({
    key: 'element:rack-grid.12.4',
    kind: 'element',
    id: 'rack-grid.12.4',
    type: 'grid-cell',
    parentKey: root.key,
    ancestorKeys: Object.freeze([root.key]),
  });
  const secondCellBackground = logicalTarget({
    key: 'component:rack-grid.12.4/surface',
    kind: 'component',
    id: 'surface',
    ownerId: secondCell.id,
    type: 'background',
    parentKey: secondCell.key,
    ancestorKeys: Object.freeze([root.key, secondCell.key]),
  });
  const secondUsage = logicalTarget({
    key: 'component:rack-grid.12.4/usage',
    kind: 'component',
    id: 'usage',
    ownerId: secondCell.id,
    type: 'bar',
    parentKey: secondCell.key,
    ancestorKeys: Object.freeze([root.key, secondCell.key]),
  });
  const secondStatusIcon = logicalTarget({
    key: 'component:rack-grid.12.4/status',
    kind: 'component',
    id: 'status',
    ownerId: secondCell.id,
    type: 'icon',
    parentKey: secondCell.key,
    ancestorKeys: Object.freeze([root.key, secondCell.key]),
  });
  const secondCellLabel = logicalTarget({
    key: 'component:rack-grid.12.4/label',
    kind: 'component',
    id: 'label',
    ownerId: secondCell.id,
    type: 'text',
    parentKey: secondCell.key,
    ancestorKeys: Object.freeze([root.key, secondCell.key]),
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
    schemaRevision: 'patch-map-query-selection/1',
    status: 'matched',
    code: null,
    lifecycleGeneration: 1,
    sceneRevision: 2,
    targets: Object.freeze([
      root,
      cell,
      cellBackground,
      usage,
      statusIcon,
      cellLabel,
      secondCell,
      secondCellBackground,
      secondUsage,
      secondStatusIcon,
      secondCellLabel,
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
  let lastPresentationRequest: unknown = null;
  let presentationRevision = 0;
  const presentationKeys = new Set<string>();
  const fitViewport = vi.fn(() => Object.freeze({ status: 'applied' }));
  const resize = vi.fn(() => true);
  let selectionListener: ((change: Readonly<{
    readonly current: readonly string[];
  }>) => void) | null = null;
  let pointerHoverListener: ((event: PatchMapPointerHoverEvent) => void) | null = null;
  let pointerSelectionListener: ((change: PatchMapPointerSelectionChange) => void) | null = null;
  let pointerTooltipListener: ((event: PatchMapPointerTooltipEvent) => void) | null = null;
  let viewportChangeListener: ((change: PatchMapViewportChangeResult) => void) | null = null;
  let destroyedListener: (() => void) | null = null;
  let viewportState: PatchMapViewportState = Object.freeze({
    centerWorld: Object.freeze([0, 0] as const),
    scale: 1,
    screenBounds: Object.freeze([0, 0, 640, 360] as const),
  });
  const setViewportAbsolute = vi.fn((input: Readonly<{
    readonly centerWorld: readonly [number, number];
    readonly scale: number;
  }>) => {
    const previous = viewportState;
    viewportState = Object.freeze({
      centerWorld: Object.freeze([...input.centerWorld] as [number, number]),
      scale: input.scale,
      screenBounds: previous.screenBounds,
    });
    return Object.freeze({
      changed: true,
      blocked: false,
      source: 'programmatic' as const,
      previous,
      viewport: viewportState,
      previousRevisions: REVISIONS,
      revisions: REVISIONS,
    });
  });
  const applySelection = vi.fn((input: { readonly op: string; readonly ids?: readonly string[] }) =>
    Object.freeze({
      changed: true,
      source: 'external' as const,
      current: input.op === 'clear' ? Object.freeze([]) : Object.freeze([...(input.ids ?? [])]),
      added: Object.freeze([]),
      removed: Object.freeze([]),
    }));
  const loadDataset = vi.fn(() => Object.freeze({
    lifecycle: 'scene-ready' as const,
    sceneRevision: 2,
    semanticHash: 'hash',
    rootIds: Object.freeze(['rack-grid']),
  }));
  const loadDatasetAsync = vi.fn(() => Promise.resolve(Object.freeze({
    lifecycle: 'scene-ready' as const,
    sceneRevision: 2,
    semanticHash: 'hash',
    rootIds: Object.freeze(['rack-grid']),
  })));
  const host = {
    selectionIds: Object.freeze([]),
    loadDataset,
    loadDatasetAsync,
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
      const columns = request as Readonly<Record<
        'background' | 'bar' | 'icon' | 'text',
        Readonly<{
          readonly targets?: readonly Readonly<{
            readonly id: string;
            readonly componentId: string;
          }>[];
        }>
      >>;
      const appliedTargets = (['background', 'bar', 'icon', 'text'] as const)
        .flatMap((type) => columns[type]?.targets ?? []);
      return Object.freeze({
        status: 'committed',
        changed: true,
        appliedTargets: Object.freeze(appliedTargets.length > 0
          ? appliedTargets
          : [{ id: cell.id, componentId: 'usage' }]),
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
    onPointerHover: (listener: typeof pointerHoverListener) => {
      pointerHoverListener = listener;
      return () => { pointerHoverListener = null; };
    },
    onPointerSelectionChange: (listener: typeof pointerSelectionListener) => {
      pointerSelectionListener = listener;
      return () => { pointerSelectionListener = null; };
    },
    onPointerTooltip: (listener: typeof pointerTooltipListener) => {
      pointerTooltipListener = listener;
      return () => { pointerTooltipListener = null; };
    },
    onViewportChange: (listener: typeof viewportChangeListener) => {
      viewportChangeListener = listener;
      return () => { viewportChangeListener = null; };
    },
    onDestroyed: (listener: typeof destroyedListener) => {
      destroyedListener = listener;
      return () => { destroyedListener = null; };
    },
    applySelection,
    applyTransformerEdit: (request: unknown) => {
      lastTransformRequest = request;
      return Object.freeze({ status: 'committed', changed: true });
    },
    setPresentationLayer: (request: Readonly<{ readonly key: string }>) => {
      lastPresentationRequest = request;
      presentationKeys.add(request.key);
      presentationRevision += 1;
      return Object.freeze({
        changed: true,
        revision: presentationRevision,
        layerCount: presentationKeys.size,
        render: Object.freeze({
          revision: presentationRevision,
          layerCount: presentationKeys.size,
          full: false,
          alphaMultipliers: new Float32Array(0),
          dirtyRanges: Object.freeze([]),
        }),
      });
    },
    clearPresentationLayer: (key: string) => {
      const changed = presentationKeys.delete(key);
      if (changed) presentationRevision += 1;
      return Object.freeze({
        changed,
        revision: presentationRevision,
        layerCount: presentationKeys.size,
        render: Object.freeze({
          revision: presentationRevision,
          layerCount: presentationKeys.size,
          full: false,
          alphaMultipliers: new Float32Array(0),
          dirtyRanges: Object.freeze([]),
        }),
      });
    },
    fitViewport,
    focusViewport: vi.fn(),
    restoreViewport: vi.fn(),
    panViewport: vi.fn(),
    setViewportAbsolute,
    zoomViewportAt: vi.fn(),
    viewportProbe: () => viewportState,
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
    host: host as unknown as Parameters<typeof createPatchMapApi>[0],
    loadDataset,
    loadDatasetAsync,
    fitViewport,
    resize,
    setViewportAbsolute,
    applySelection,
    setReusable: (value: boolean) => { reusable = value; },
    lastBarRequest: () => lastBarRequest,
    lastInstanceRequest: () => lastInstanceRequest,
    lastTextRequest: () => lastTextRequest,
    lastTransactionRequest: () => lastTransactionRequest,
    lastTransformRequest: () => lastTransformRequest,
    lastPresentationRequest: () => lastPresentationRequest,
    publishSelection: (ids: readonly string[]) => selectionListener?.(Object.freeze({ current: ids })),
    publishPointerHover: (event: PatchMapPointerHoverEvent) => pointerHoverListener?.(event),
    publishPointerSelection: (change: PatchMapPointerSelectionChange) =>
      pointerSelectionListener?.(change),
    publishPointerTooltip: (event: PatchMapPointerTooltipEvent) =>
      pointerTooltipListener?.(event),
    publishViewportChange: (state: PatchMapViewportState) => {
      const previous = viewportState;
      viewportState = state;
      viewportChangeListener?.(Object.freeze({
        changed: true,
        blocked: false,
        source: 'pointer',
        previous,
        viewport: state,
        previousRevisions: REVISIONS,
        revisions: REVISIONS,
      }));
    },
    publishDestroyed: () => destroyedListener?.(),
  };
}
