import { afterEach, describe, expect, it } from 'vitest';

import {
  PatchMap,
  type PatchMapEngineSurface,
  type PatchMapPoint,
  type PatchMapSurfaceDebug,
  type PatchMapSurfaceOptions,
  type PatchMapSurfaceReconcileOptions,
  type PatchMapSurfaceReconcileResult,
} from '../../src/patch-map/engine';
import type { PatchMapElement } from '../../src/patch-map/semantic/dataset';

class TransformerSurface implements PatchMapEngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  public loaded: readonly PatchMapElement[] = Object.freeze([]);
  public selectionIds: readonly string[] = Object.freeze([]);
  public frameCount = 0;
  public reconcileCount = 0;
  public refuseNextReconcile = false;
  public nextReconcileCallback: (() => void) | null = null;
  public lastReconcileOptions: PatchMapSurfaceReconcileOptions = Object.freeze({});
  private width: number;
  private height: number;
  private pixelRatio: number;

  public constructor(options: Pick<PatchMapSurfaceOptions, 'width' | 'height' | 'pixelRatio'>) {
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = options.pixelRatio;
  }

  public load(input: unknown): void {
    this.loaded = input as readonly PatchMapElement[];
    this.selectionIds = Object.freeze([]);
  }

  public reconcile(
    input: unknown,
    options: PatchMapSurfaceReconcileOptions = {},
  ): PatchMapSurfaceReconcileResult {
    this.reconcileCount += 1;
    this.lastReconcileOptions = Object.freeze({ ...options });
    const status = this.refuseNextReconcile ? 'refused' : 'committed';
    this.refuseNextReconcile = false;
    if (status === 'committed') {
      this.loaded = input as readonly PatchMapElement[];
      if (options.selectionIds !== undefined) {
        this.selectionIds = Object.freeze([...options.selectionIds]);
      }
      const callback = this.nextReconcileCallback;
      this.nextReconcileCallback = null;
      callback?.();
    }
    return Object.freeze({
      status,
      operationCount: status === 'committed' ? 1 : 0,
      denseChanged: status === 'committed',
      diagnostics: Object.freeze([]),
    });
  }

  public publishFrame(): void { this.frameCount += 1; }
  public resize(width: number, height: number, pixelRatio: number): boolean {
    const changed = width !== this.width || height !== this.height || pixelRatio !== this.pixelRatio;
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    return changed;
  }
  public setView(): void {}
  public select(ids: readonly string[]): void { this.selectionIds = Object.freeze([...ids]); }
  public hitTestScreen(): string | null { return null; }
  public screenToWorld(point: PatchMapPoint): PatchMapPoint { return Object.freeze({ ...point }); }
  public debugSnapshot(): PatchMapSurfaceDebug {
    return Object.freeze({
      cssSize: Object.freeze([this.width, this.height] as const),
      backingSize: Object.freeze([
        Math.round(this.width * this.pixelRatio),
        Math.round(this.height * this.pixelRatio),
      ] as const),
      selectionIds: this.selectionIds,
      activeAnimationCount: 0,
    });
  }
  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.canvasCount = 0;
    return Promise.resolve(true);
  }
}

describe('PatchMap transformer edit integration', () => {
  const engines: PatchMap[] = [];

  afterEach(async () => {
    await Promise.all(engines.splice(0).map(async (engine) => engine.destroy()));
  });

  it('applies direct move, resize, and mixed rotation through one transaction authority', async () => {
    const { engine } = await createEngine(engines);
    engine.loadDataset(scene());

    expect(engine.applyTransformerEdit({
      kind: 'move',
      selectionIds: ['rect-b'],
      deltaWorld: [10.4, 5.4],
    }, { actionId: 'move-1' })).toMatchObject({
      status: 'committed',
      changed: true,
      historyDepthDelta: 1,
      plan: { after: { 'rect-b': { x: 170, y: 45 } } },
    });
    expect(geometry(engine, 'rect-b')).toMatchObject({ x: 170, y: 45 });

    expect(engine.applyTransformerEdit({
      kind: 'resize',
      selectionIds: ['image-a'],
      handle: 'se',
      deltaWorld: [10, 10],
    }, { actionId: 'resize-1' })).toMatchObject({
      status: 'committed',
      historyDepthDelta: 1,
      plan: { after: { 'image-a': { width: 90, height: 50 } } },
    });

    expect(engine.applyTransformerEdit({
      kind: 'rotate',
      selectionIds: ['rect-b', 'text-c', 'item-a', 'links'],
      lockedIds: ['text-c'],
      deltaDegrees: 45,
      centerWorld: [105, 90],
    }, { actionId: 'rotate-1' })).toMatchObject({
      status: 'committed',
      historyDepthDelta: 1,
      plan: {
        eligibleIds: ['rect-b', 'item-a'],
        lockedIds: ['text-c'],
        ineligibleIds: ['links'],
      },
    });
    expect(geometry(engine, 'rect-b')).toMatchObject({
      angle: 45,
    });
    expect(engine.historyState()).toMatchObject({ undoDepth: 3, redoDepth: 0 });
  });

  it('keeps previews outside semantic authority and commits many moves as one history action', async () => {
    const { engine, surface } = await createEngine(engines);
    engine.loadDataset(scene());
    engine.applySelection({ op: 'replace', ids: ['rect-b'], source: 'programmatic' });
    const semanticBefore = engine.exportDataset();
    const historyBefore = engine.historyState().undoDepth;
    const changes: unknown[] = [];
    let cancellationDuringChange: ReturnType<PatchMap['cancelTransformerEdit']> | null = null;
    engine.on('change', (event) => {
      changes.push(event);
      cancellationDuringChange = engine.cancelTransformerEdit(7, 'redraw');
    });

    expect(engine.beginTransformerEdit({
      pointerId: 7,
      actionId: 'gesture-1',
      kind: 'resize',
      handle: 'se',
      selectionIds: ['rect-b'],
    })).toMatchObject({
      activeSessionCount: 1,
      activePointerId: 7,
      previewOverlayCount: 0,
    });
    for (const delta of [[5, 5], [10, 10], [15, 15], [20, 20], [30, 30]] as const) {
      expect(engine.previewTransformerEdit(7, {
        kind: 'resize',
        selectionIds: ['rect-b'],
        handle: 'se',
        deltaWorld: delta,
      })).toMatchObject({ status: 'previewed', changed: true });
    }
    expect(geometryFromDataset(surface.loaded, 'rect-b')).toMatchObject({
      width: 70,
      height: 60,
    });
    expect(engine.exportDataset()).toBe(semanticBefore);
    expect(engine.historyState().undoDepth).toBe(historyBefore);
    expect(changes).toHaveLength(0);

    expect(engine.completeTransformerEdit(7)).toMatchObject({
      status: 'committed',
      changed: true,
      mutationCount: 1,
      historyDepthDelta: 1,
      probe: {
        activeSessionCount: 0,
        committedMutationCount: 1,
        previewOverlayCount: 0,
      },
    });
    expect(changes).toHaveLength(1);
    expect(cancellationDuringChange).toMatchObject({
      status: 'stale',
      cancelled: false,
      probe: { activeSessionCount: 0, committedMutationCount: 1 },
    });
    expect(geometry(engine, 'rect-b')).toMatchObject({ width: 70, height: 60 });

    expect(engine.undo()).toMatchObject({ status: 'committed', actionId: 'gesture-1' });
    expect(geometry(engine, 'rect-b')).toMatchObject({ width: 40, height: 30 });
    expect(engine.redo()).toMatchObject({ status: 'committed', actionId: 'gesture-1' });
    expect(geometry(engine, 'rect-b')).toMatchObject({ width: 70, height: 60 });
  });

  it('publishes flat-root previews through the incremental reconcile seam', async () => {
    const { engine, surface } = await createEngine(engines);
    engine.loadDataset([
      {
        type: 'rect',
        id: 'flat-a',
        size: { width: 40, height: 30 },
        fill: '#ff8800',
        attrs: { x: 10, y: 20 },
      },
      {
        type: 'rect',
        id: 'flat-b',
        size: { width: 20, height: 20 },
        fill: '#0088ff',
        attrs: { x: 80, y: 20 },
      },
    ]);
    engine.beginTransformerEdit({
      pointerId: 77,
      actionId: 'flat-preview',
      kind: 'move',
      handle: 'frame',
      selectionIds: ['flat-a'],
    });

    expect(engine.previewTransformerEdit(77, {
      kind: 'move',
      selectionIds: ['flat-a'],
      deltaWorld: [5, 3],
    })).toMatchObject({ status: 'previewed', changed: true });
    expect(surface.lastReconcileOptions.incrementalRootIds).toEqual(['flat-a']);
  });

  it('restores a refused completion before clearing and counting its session', async () => {
    const { engine, surface } = await createEngine(engines);
    engine.loadDataset(scene());
    engine.applySelection({ op: 'replace', ids: ['rect-b'], source: 'programmatic' });
    beginMovePreview(engine, 78);
    expect(geometryFromDataset(surface.loaded, 'rect-b')).toMatchObject({ x: 170, y: 45 });

    surface.refuseNextReconcile = true;
    expect(engine.completeTransformerEdit(78)).toMatchObject({
      status: 'refused',
      changed: false,
      mutationCount: 0,
      historyDepthDelta: 0,
      probe: {
        activeSessionCount: 0,
        previewOverlayCount: 0,
        committedMutationCount: 0,
        cancelledSessionCount: 1,
      },
    });
    expect(geometry(engine, 'rect-b')).toMatchObject({ x: 160, y: 40 });
    expect(geometryFromDataset(surface.loaded, 'rect-b')).toMatchObject({ x: 160, y: 40 });
    expect(engine.historyState()).toMatchObject({ undoDepth: 0, redoDepth: 0 });
    expect(engine.transformerGestureProbe()).toMatchObject({
      activeGestureCount: 0,
      pointerCaptureCount: 0,
    });
  });

  it('returns a refused completion when reentrant selection already cancels the session', async () => {
    const { engine, surface } = await createEngine(engines);
    engine.loadDataset(scene());
    engine.applySelection({ op: 'replace', ids: ['rect-b'], source: 'programmatic' });
    beginMovePreview(engine, 79);
    surface.nextReconcileCallback = () => {
      engine.applySelection({ op: 'replace', ids: ['image-a'], source: 'programmatic' });
    };

    expect(engine.completeTransformerEdit(79)).toMatchObject({
      status: 'refused',
      changed: false,
      gesture: null,
      transaction: { status: 'refused' },
      probe: {
        activeSessionCount: 0,
        cancelledSessionCount: 1,
        committedMutationCount: 0,
      },
    });
    expect(geometry(engine, 'rect-b')).toMatchObject({ x: 160, y: 40 });
    expect(geometryFromDataset(surface.loaded, 'rect-b')).toMatchObject({ x: 160, y: 40 });
    expect(engine.snapshot().selectionIds).toEqual(['image-a']);
  });

  it('reverts every explicit cancellation reason without history or retained resources', async () => {
    const { engine } = await createEngine(engines);
    const reasons = [
      'escape',
      'pointer-cancel',
      'lost-capture',
      'blur',
      'redraw',
      'selection-change',
      'lock-change',
    ] as const;

    for (const [index, reason] of reasons.entries()) {
      engine.loadDataset(scene());
      engine.applySelection({ op: 'replace', ids: ['rect-b'], source: 'programmatic' });
      const before = JSON.stringify(engine.exportDataset());
      const pointerId = index + 1;
      engine.beginTransformerEdit({
        pointerId,
        actionId: `cancel-${reason}`,
        kind: 'move',
        handle: 'frame',
        selectionIds: ['rect-b'],
      });
      engine.previewTransformerEdit(pointerId, {
        kind: 'move',
        selectionIds: ['rect-b'],
        deltaWorld: [10, 5],
      });
      expect(engine.cancelTransformerEdit(pointerId, reason)).toMatchObject({
        status: 'cancelled',
        cancelled: true,
        historyDepthDelta: 0,
        probe: {
          activeSessionCount: 0,
          previewOverlayCount: 0,
          edgePanActiveCount: 0,
        },
      });
      expect(JSON.stringify(engine.exportDataset())).toBe(before);
      expect(engine.snapshot().selectionIds).toEqual(['rect-b']);
      expect(engine.historyState()).toMatchObject({ depth: 0 });
      expect(engine.transformerGestureProbe()).toMatchObject({
        activeGestureCount: 0,
        pointerCaptureCount: 0,
        staleCompletionCount: 0,
      });
    }
  });

  it('commits or cancels an owned transformer session from root pointer terminals', async () => {
    const { engine } = await createEngine(engines);
    engine.loadDataset(scene());
    engine.applySelection({ op: 'replace', ids: ['rect-b'], source: 'programmatic' });

    beginMovePreview(engine, 17);
    expect(engine.dispatchPointerInput(pointerInput('up-outside', 17))).toMatchObject({
      clickSuppressed: true,
      semanticCompletionCount: 0,
    });
    expect(geometry(engine, 'rect-b')).toMatchObject({ x: 170, y: 45 });
    expect(engine.historyState().undoDepth).toBe(1);
    expect(engine.transformerEditProbe()).toMatchObject({
      activeSessionCount: 0,
      committedMutationCount: 1,
      staleCompletionCount: 0,
    });
    expect(engine.transformerGestureProbe()).toMatchObject({
      activeGestureCount: 0,
      pointerCaptureCount: 0,
      staleCompletionCount: 0,
    });

    engine.loadDataset(scene());
    engine.applySelection({ op: 'replace', ids: ['rect-b'], source: 'programmatic' });
    beginMovePreview(engine, 18);
    expect(engine.dispatchPointerInput(pointerInput('cancel', 18))).toMatchObject({
      clickSuppressed: true,
      semanticCompletionCount: 0,
    });
    expect(geometry(engine, 'rect-b')).toMatchObject({ x: 160, y: 40 });
    expect(engine.historyState().undoDepth).toBe(0);
    expect(engine.transformerEditProbe()).toMatchObject({
      activeSessionCount: 0,
      cancelledSessionCount: 1,
      staleCompletionCount: 0,
    });
    expect(engine.transformerGestureProbe()).toMatchObject({
      activeGestureCount: 0,
      pointerCaptureCount: 0,
      staleCompletionCount: 0,
    });
  });

  it('interrupts preview ownership on selection, replacement, mutation, and destroy', async () => {
    const { engine } = await createEngine(engines);
    engine.loadDataset(scene());
    engine.applySelection({ op: 'replace', ids: ['rect-b'], source: 'programmatic' });

    beginMovePreview(engine, 21);
    engine.applySelection({ op: 'clear', source: 'external' });
    expect(engine.transformerEditProbe()).toMatchObject({
      activeSessionCount: 0,
      previewOverlayCount: 0,
      cancelledSessionCount: 1,
    });
    expect(engine.snapshot().selectionIds).toEqual([]);
    expect(geometry(engine, 'rect-b')).toMatchObject({ x: 160, y: 40 });

    engine.applySelection({ op: 'replace', ids: ['rect-b'], source: 'programmatic' });
    beginMovePreview(engine, 22);
    engine.patch({ kind: 'element', id: 'rect-b' }, { attrs: { x: 165 } });
    expect(engine.transformerEditProbe()).toMatchObject({
      activeSessionCount: 0,
      cancelledSessionCount: 2,
    });
    expect(geometry(engine, 'rect-b')).toMatchObject({ x: 165, y: 40 });

    engine.applySelection({ op: 'replace', ids: ['rect-b'], source: 'programmatic' });
    beginMovePreview(engine, 23);
    engine.loadDataset(scene());
    expect(engine.transformerEditProbe()).toMatchObject({
      activeSessionCount: 0,
      cancelledSessionCount: 3,
    });
    expect(engine.historyState().depth).toBe(0);

    engine.applySelection({ op: 'replace', ids: ['rect-b'], source: 'programmatic' });
    beginMovePreview(engine, 24);
    await engine.destroy();
    expect(engine.transformerEditProbe()).toMatchObject({
      activeSessionCount: 0,
      previewOverlayCount: 0,
      cancelledSessionCount: 4,
    });
    expect(engine.transformerGestureProbe()).toMatchObject({
      activeGestureCount: 0,
      pointerCaptureCount: 0,
      destroyed: true,
    });
  });

  it('keeps an active preview intact when replacement or mutation preflight rejects', async () => {
    const { engine, surface } = await createEngine(engines);
    engine.loadDataset(scene());
    engine.applySelection({ op: 'replace', ids: ['rect-b'], source: 'programmatic' });
    beginMovePreview(engine, 25);
    const previewDataset = surface.loaded;

    await expect(engine.loadDatasetAsync([
      { type: 'rect', id: 'duplicate', size: 10 },
      { type: 'rect', id: 'duplicate', size: 10 },
    ], { strict: true })).rejects.toMatchObject({ code: 'DUPLICATE_ID' });
    expect(engine.transact({ strict: true, operations: [] })).toMatchObject({
      status: 'rejected',
      changed: false,
    });
    expect(engine.patch({ kind: 'element', id: 'missing' }, {})).toMatchObject({
      status: 'rejected',
      changed: false,
    });
    expect(engine.destroyTarget({ kind: 'element', id: 'missing' })).toMatchObject({
      status: 'rejected',
      changed: false,
    });

    expect(engine.transformerEditProbe()).toMatchObject({
      activeSessionCount: 1,
      activePointerId: 25,
      previewOverlayCount: 1,
      cancelledSessionCount: 0,
    });
    expect(surface.loaded).toBe(previewDataset);
    expect(geometryFromDataset(surface.loaded, 'rect-b')).toMatchObject({ x: 170, y: 45 });

    expect(engine.patch(
      { kind: 'element', id: 'rect-b' },
      { attrs: { x: 165 } },
    )).toMatchObject({ status: 'committed' });
    expect(engine.transformerEditProbe()).toMatchObject({
      activeSessionCount: 0,
      cancelledSessionCount: 1,
    });
  });

  it('does not replace selection when pointer gesture acquisition fails', async () => {
    const { engine } = await createEngine(engines);
    engine.loadDataset(scene());
    engine.applySelection({ op: 'replace', ids: ['rect-b'], source: 'programmatic' });
    engine.beginOwnedPointerGesture('pan', 40);

    expect(() => engine.beginTransformerEdit({
      pointerId: 41,
      actionId: 'blocked-transformer',
      kind: 'move',
      handle: 'frame',
      selectionIds: ['image-a'],
    })).toThrow();

    expect(engine.selectionIds).toEqual(['rect-b']);
    expect(engine.transformerEditProbe()).toMatchObject({ activeSessionCount: 0 });
    expect(engine.transformerGestureProbe()).toMatchObject({ activeGestureCount: 0 });
    engine.cancelOwnedPointerGesture('pointer-cancel');
  });

  it('keeps explicit selection and root pointer ownership when transformer start changes target', async () => {
    const { engine } = await createEngine(engines);
    engine.loadDataset(scene());
    engine.applySelection({ op: 'replace', ids: ['rect-b'], source: 'programmatic' });

    expect(engine.beginTransformerEdit({
      pointerId: 42,
      actionId: 'switch-target-transformer',
      kind: 'move',
      handle: 'frame',
      selectionIds: ['image-a'],
    })).toMatchObject({ activeSessionCount: 1, activePointerId: 42 });
    expect(engine.selectionIds).toEqual(['image-a']);
    expect(engine.transformerGestureProbe()).toMatchObject({ activeGestureCount: 1 });

    expect(engine.dispatchPointerInput(pointerInput('cancel', 42))).toMatchObject({
      clickSuppressed: true,
    });
    expect(engine.selectionIds).toEqual(['image-a']);
    expect(engine.transformerEditProbe()).toMatchObject({ activeSessionCount: 0 });
    expect(engine.transformerGestureProbe()).toMatchObject({ activeGestureCount: 0 });
  });

  it('restores authoritative geometry when the first preview is cancelled reentrantly', async () => {
    const { engine, surface } = await createEngine(engines);
    engine.loadDataset(scene());
    engine.applySelection({ op: 'replace', ids: ['rect-b'], source: 'programmatic' });
    engine.beginTransformerEdit({
      pointerId: 43,
      actionId: 'reentrant-first-preview',
      kind: 'move',
      handle: 'frame',
      selectionIds: ['rect-b'],
    });
    surface.nextReconcileCallback = () => {
      engine.applySelection({ op: 'replace', ids: ['image-a'], source: 'programmatic' });
    };

    expect(() => engine.previewTransformerEdit(43, {
      kind: 'move',
      selectionIds: ['rect-b'],
      deltaWorld: [10, 5],
    })).toThrow(/CONFLICT/u);
    expect(geometry(engine, 'rect-b')).toMatchObject({ x: 160, y: 40 });
    expect(geometryFromDataset(surface.loaded, 'rect-b')).toMatchObject({ x: 160, y: 40 });
    expect(engine.selectionIds).toEqual(['image-a']);
    expect(engine.transformerEditProbe()).toMatchObject({ activeSessionCount: 0 });
    expect(engine.transformerGestureProbe()).toMatchObject({ activeGestureCount: 0 });
  });

  it('preserves the pointer world point while temporary edge-pan returns inactive', async () => {
    const { engine } = await createEngine(engines);
    engine.loadDataset(scene());
    engine.setViewport({ centerWorld: [400, 300], scale: 1 });
    expect(engine.resolveTransformerRotationSnap(350, 7, true, 15)).toEqual({
      startDegrees: 350,
      pointerDegrees: 7,
      continuousDeltaDegrees: 17,
      appliedDegrees: 0,
      snapped: true,
    });
    expect(engine.edgeAutoPanTransformer([799, 300], [20, 0])).toMatchObject({
      pointerWorldBefore: [799, 300],
      pointerWorldAfter: [799, 300],
      centerWorld: [420, 300],
      adjustedPointerScreen: [779, 300],
      policyRestored: true,
      edgePanActiveCount: 0,
    });
    expect(engine.viewportProbe()).toMatchObject({ centerWorld: [420, 300], scale: 1 });
  });
});

async function createEngine(
  engines: PatchMap[],
): Promise<Readonly<{ engine: PatchMap; surface: TransformerSurface }>> {
  const surface = new TransformerSurface({ width: 800, height: 600, pixelRatio: 1 });
  const engine = new PatchMap({
    surfaceFactory: () => Promise.resolve(surface),
    historyLimit: 20,
  });
  engines.push(engine);
  await engine.initialize({ instanceId: `transformer-${engines.length}`, width: 800, height: 600 });
  return Object.freeze({ engine, surface });
}

function beginMovePreview(engine: PatchMap, pointerId: number): void {
  engine.beginTransformerEdit({
    pointerId,
    actionId: `move-${pointerId}`,
    kind: 'move',
    handle: 'frame',
    selectionIds: ['rect-b'],
  });
  engine.previewTransformerEdit(pointerId, {
    kind: 'move',
    selectionIds: ['rect-b'],
    deltaWorld: [10, 5],
  });
}

function pointerInput(
  type: 'up-outside' | 'cancel',
  pointerId: number,
): Parameters<PatchMap['dispatchPointerInput']>[0] {
  return {
    type,
    pointerId,
    pointerType: 'mouse',
    button: 0,
    buttons: 0,
    screen: [170, 50],
    timeMs: 32,
    modifiers: {
      shift: false,
      ctrl: false,
      alt: false,
      meta: false,
    },
  };
}

function geometry(
  engine: PatchMap,
  id: string,
): Readonly<Record<string, unknown>> {
  return geometryFromDataset(engine.exportDataset(), id);
}

function geometryFromDataset(
  dataset: readonly PatchMapElement[],
  id: string,
): Readonly<Record<string, unknown>> {
  const element = findElement(dataset, id);
  if (element === undefined) throw new Error(`missing ${id}`);
  const size = 'size' in element &&
      element.size !== null &&
      typeof element.size === 'object'
    ? element.size as Readonly<{ width?: unknown; height?: unknown }>
    : {};
  return {
    x: element.attrs?.x ?? 0,
    y: element.attrs?.y ?? 0,
    angle: element.attrs?.angle ?? 0,
    width: typeof size.width === 'number' ? size.width : 0,
    height: typeof size.height === 'number' ? size.height : 0,
  };
}

function findElement(
  dataset: readonly PatchMapElement[],
  id: string,
): PatchMapElement | undefined {
  for (const element of dataset) {
    if (element.id === id) return element;
    if (element.type === 'group') {
      const nested = findElement(element.children, id);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

function scene(): readonly unknown[] {
  return [
    {
      type: 'group',
      id: 'group-a',
      children: [
        {
          type: 'item',
          id: 'item-a',
          size: { width: 100, height: 80 },
          padding: 4,
          components: [],
          attrs: { x: 10, y: 20 },
        },
        {
          type: 'rect',
          id: 'rect-b',
          size: { width: 40, height: 30 },
          fill: '#ff8800',
          attrs: { x: 160, y: 40 },
        },
      ],
      attrs: { x: 0, y: 0 },
    },
    {
      type: 'relations',
      id: 'links',
      links: [{ source: 'item-a', target: 'rect-b' }],
      style: { color: '#222222', width: 2 },
    },
    {
      type: 'image',
      id: 'image-a',
      source: 'fixture://image-a.png',
      size: { width: 80, height: 40 },
      attrs: { x: -20, y: 200 },
    },
    {
      type: 'text',
      id: 'text-c',
      text: 'Bravo',
      style: { fontFamily: 'FiraCode', fontSize: 16, fill: '#222222' },
      size: { width: 80, height: 20 },
      attrs: { x: 40, y: 140 },
    },
  ];
}
