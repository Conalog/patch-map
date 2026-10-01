import { describe, expect, it } from 'vitest';

import {
  PatchMap,
  type PatchMapEngineSurface,
  type PatchMapPoint,
  type PatchMapSurfaceDebug,
  type PatchMapSurfaceOptions,
  type PatchMapSurfaceReconcileOptions,
  type PatchMapSurfaceReconcileResult,
} from '../../src/engine';

class HistorySurface implements PatchMapEngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  public mode: 'committed' | 'refused' = 'committed';
  public selectionIds: readonly string[] = Object.freeze([]);
  public reconcileCount = 0;
  public reconcileOptions: readonly PatchMapSurfaceReconcileOptions[] = Object.freeze([]);
  public loaded: unknown = null;
  private width: number;
  private height: number;
  private pixelRatio: number;

  public constructor(options: Pick<PatchMapSurfaceOptions, 'width' | 'height' | 'pixelRatio'>) {
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = options.pixelRatio;
  }

  public load(input: unknown): void {
    this.loaded = input;
    this.selectionIds = Object.freeze([]);
  }

  public reconcile(
    input: unknown,
    options: PatchMapSurfaceReconcileOptions = {},
  ): PatchMapSurfaceReconcileResult {
    this.reconcileCount += 1;
    this.reconcileOptions = Object.freeze([...this.reconcileOptions, options]);
    if (this.mode === 'committed') this.loaded = input;
    return Object.freeze({
      status: this.mode,
      operationCount: this.mode === 'committed' ? 1 : 0,
      denseChanged: this.mode === 'committed',
      diagnostics: this.mode === 'committed'
        ? Object.freeze([])
        : Object.freeze([Object.freeze({
            severity: 'error' as const,
            code: 'UNPROJECTED_SEMANTIC_DELTA' as const,
            message: 'history test refusal',
            path: '$',
          })]),
    });
  }

  public publishFrame(): void {}
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

describe('PatchMap semantic history integration', () => {
  it('records an accepted patch and restores exact stable-ID data through undo and redo', async () => {
    const { engine, surface } = await createEngine();
    engine.loadDataset(stacking());
    engine.select(['first']);
    const events: string[] = [];
    engine.on('historyUndone', (result) => {
      events.push(`undo:${zIndex(engine, 'low')}:${result.revisions.sceneRevision}`);
    });
    engine.on('historyRedone', (result) => {
      events.push(`redo:${zIndex(engine, 'low')}:${result.revisions.sceneRevision}`);
    });

    expect(engine.patch({ kind: 'element', id: 'low' }, { attrs: { zIndex: 6 } }))
      .toMatchObject({ status: 'committed' });
    expect(engine.snapshot()).toMatchObject({ historyDepth: 1, selectionIds: ['first'] });
    expect(engine.historyState()).toMatchObject({ undoDepth: 1, redoDepth: 0 });
    expect(zIndex(engine, 'low')).toBe(6);

    expect(engine.undo()).toMatchObject({
      status: 'committed',
      changed: true,
      direction: 'undo',
      sceneRevision: 3,
      history: { undoDepth: 0, redoDepth: 1 },
    });
    expect(zIndex(engine, 'low')).toBe(-1);
    expect(engine.snapshot()).toMatchObject({ historyDepth: 0, selectionIds: ['first'] });

    expect(engine.redo()).toMatchObject({
      status: 'committed',
      changed: true,
      direction: 'redo',
      sceneRevision: 4,
      history: { undoDepth: 1, redoDepth: 0 },
    });
    expect(zIndex(engine, 'low')).toBe(6);
    expect(events).toEqual(['undo:-1:3', 'redo:6:4']);
    expect(surface.reconcileCount).toBe(3);
    expect(surface.reconcileOptions.map(({ incrementalRootIds }) => incrementalRootIds))
      .toEqual([['low'], ['low'], ['low']]);
    await engine.destroy();
  });

  it('keeps history, semantic authority, and revisions atomic when undo reconcile refuses', async () => {
    const { engine, surface } = await createEngine();
    engine.loadDataset(stacking());
    engine.patch({ kind: 'element', id: 'low' }, { attrs: { zIndex: 6 } });
    const before = engine.snapshot();
    const datasetBefore = engine.exportDataset();
    surface.mode = 'refused';

    expect(engine.undo()).toMatchObject({
      status: 'refused',
      changed: false,
      direction: 'undo',
      diagnostic: { code: 'CONFLICT', category: 'CONFLICT', operation: 'undo' },
      reconcileDiagnostics: [{ code: 'UNPROJECTED_SEMANTIC_DELTA', path: '$' }],
      history: { undoDepth: 1, redoDepth: 0 },
    });
    expect(engine.snapshot()).toEqual(before);
    expect(engine.exportDataset()).toBe(datasetBefore);
    expect(zIndex(engine, 'low')).toBe(6);
    await engine.destroy();
  });

  it('drops redo on a new branch, clears on scene replacement, and honors zero capacity', async () => {
    const { engine } = await createEngine({ historyLimit: 2 });
    engine.loadDataset(stacking());
    engine.patch({ kind: 'element', id: 'low' }, { attrs: { zIndex: 1 } });
    engine.patch({ kind: 'element', id: 'low' }, { attrs: { zIndex: 2 } });
    engine.undo();
    expect(engine.historyState()).toMatchObject({ undoDepth: 1, redoDepth: 1 });
    engine.patch({ kind: 'element', id: 'low' }, { attrs: { zIndex: 8 } });
    expect(engine.historyState()).toMatchObject({ depth: 2, undoDepth: 2, redoDepth: 0 });
    expect(engine.redo()).toMatchObject({ status: 'unavailable', changed: false });
    engine.loadDataset(stacking());
    expect(engine.historyState()).toMatchObject({ depth: 0, canUndo: false, canRedo: false });
    await engine.destroy();

    const disabled = await createEngine({ historyLimit: 0 });
    disabled.engine.loadDataset(stacking());
    disabled.engine.patch({ kind: 'element', id: 'low' }, { attrs: { zIndex: 6 } });
    expect(disabled.engine.snapshot().historyDepth).toBe(0);
    expect(disabled.engine.undo()).toMatchObject({ status: 'unavailable' });
    await disabled.engine.destroy();
  });

  it('restores selection, mode, and detached host companion through one compound action', async () => {
    const { engine } = await createEngine();
    engine.loadDataset(stacking());
    const hostBefore = {
      selectedIds: ['first'],
      mode: 'select',
      dirty: false,
    };
    const hostAfter = {
      selectedIds: ['first'],
      mode: 'transform',
      dirty: true,
    };
    const events: string[] = [];
    engine.on('semanticRestored', ({ direction }) => events.push(`semantic:${direction}`));
    engine.on('selectionReconciled', ({ direction }) => events.push(`selection:${direction}`));
    engine.on('historyUndone', () => events.push('history:undo:pending'));
    engine.on('historyRedone', () => events.push('history:redo:pending'));
    engine.on('frame', () => events.push('frame:published'));
    engine.on('historyVisible', ({ direction }) => events.push(`visible:${direction}:published`));

    expect(engine.setHistoryCompanion(hostBefore)).toEqual({
      selectionIds: ['first'],
      mode: 'select',
      hostCompanion: hostBefore,
    });
    expect(Object.isFrozen(engine.historyCompanionState().hostCompanion)).toBe(true);
    expect(engine.transact({
      actionId: 'compound-editor-1',
      strict: true,
      operations: [{
        op: 'merge',
        target: { kind: 'element', id: 'first' },
        changes: [
          { path: ['attrs', 'x'], value: 180 },
          { path: ['attrs', 'y'], value: 50 },
        ],
      }],
      history: hostAfter,
    })).toMatchObject({
      status: 'committed',
      history: { recorded: true, commandId: 'compound-editor-1' },
    });
    expect(engine.historyCompanionState()).toEqual({
      selectionIds: ['first'],
      mode: 'transform',
      hostCompanion: hostAfter,
    });
    hostBefore.selectedIds.push('late-before');
    hostAfter.selectedIds.push('late-after');

    expect(engine.undo()).toMatchObject({
      status: 'committed',
      direction: 'undo',
      actionId: 'compound-editor-1',
      recordCount: 1,
      publication: 'pending',
    });
    expect(engine.historyCompanionState()).toEqual({
      selectionIds: ['first'],
      mode: 'select',
      hostCompanion: {
        selectedIds: ['first'],
        mode: 'select',
        dirty: false,
      },
    });
    engine.publishFrame(10);
    expect(events).toEqual([
      'semantic:undo',
      'selection:undo',
      'history:undo:pending',
      'frame:published',
      'visible:undo:published',
    ]);

    expect(engine.redo()).toMatchObject({
      status: 'committed',
      direction: 'redo',
      actionId: 'compound-editor-1',
      recordCount: 1,
    });
    expect(engine.historyCompanionState()).toEqual({
      selectionIds: ['first'],
      mode: 'transform',
      hostCompanion: {
        selectedIds: ['first'],
        mode: 'transform',
        dirty: true,
      },
    });
    await engine.destroy();
  });

  it('groups consecutive action IDs, exposes operation order, and applies an unrecorded barrier', async () => {
    const { engine } = await createEngine();
    engine.loadDataset(stacking());
    for (const entry of [
      { actionId: 'drag-1', value: 170, recordHistory: true },
      { actionId: 'drag-1', value: 180, recordHistory: true },
      { actionId: undefined, value: 185, recordHistory: false },
      { actionId: 'drag-1', value: 190, recordHistory: true },
      { actionId: 'other', value: 200, recordHistory: true },
    ] as const) {
      expect(engine.transact({
        strict: true,
        ...(entry.actionId === undefined ? {} : { actionId: entry.actionId }),
        recordHistory: entry.recordHistory,
        operations: [{
          op: 'merge',
          target: { kind: 'element', id: 'first' },
          changes: [{ path: ['attrs', 'x'], value: entry.value }],
        }],
      })).toMatchObject({ status: 'committed' });
    }

    const inspection = engine.historyInspection();
    expect(inspection.commands.map(({ id }) => id)).toEqual([
      'drag-1',
      'drag-1',
      'other',
    ]);
    expect(inspection.state).toMatchObject({ depth: 3, undoDepth: 3 });
    const firstGroup = inspection.commands[0]!;
    expect(firstGroup.records.map(({ after }) => elementX(after.dataset, 'first')))
      .toEqual([170, 180]);
    expect([...firstGroup.records].reverse().map(({ after }) =>
      elementX(after.dataset, 'first'))).toEqual([180, 170]);

    expect(engine.undo()).toMatchObject({ actionId: 'other' });
    expect(engine.undo()).toMatchObject({ actionId: 'drag-1' });
    expect(engine.redo()).toMatchObject({ actionId: 'drag-1' });
    expect(engine.redo()).toMatchObject({ actionId: 'other' });
    expect(elementX(engine.exportDataset(), 'first')).toBe(200);
    await engine.destroy();
  });

  it('offers structured capacity, shortcut, clear, replace, and destroy boundaries', async () => {
    const { engine } = await createEngine();
    engine.loadDataset(stacking());
    engine.transact({
      strict: true,
      actionId: 'move',
      operations: [{
        op: 'merge',
        target: { kind: 'element', id: 'first' },
        changes: [{ path: ['attrs', 'x'], value: 10 }],
      }],
    });
    expect(pendingHistoryPlanCount(engine)).toBe(0);

    const invalidBefore = engine.historyInspection();
    expect(engine.setHistoryCapacity(-1)).toEqual({
      status: 'rejected',
      changed: false,
      code: 'INVALID_VALUE',
      capacity: -1,
      history: invalidBefore.state,
    });
    expect(engine.historyInspection()).toEqual(invalidBefore);
    expect(engine.handleHistoryShortcut({
      key: 'z',
      code: 'KeyZ',
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      pathKind: 'input',
    })).toEqual({
      action: 'undo',
      handled: false,
      preventDefault: false,
      result: null,
    });
    expect(engine.handleHistoryShortcut({
      key: 'z',
      code: 'KeyZ',
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      pathKind: 'canvas',
    })).toMatchObject({
      action: 'undo',
      handled: true,
      preventDefault: true,
      result: { status: 'committed', direction: 'undo' },
    });

    const lifecycle: string[] = [];
    engine.on('historyCleared', ({ reason }) => lifecycle.push(`history-cleared:${reason}`));
    engine.on('destroyed', () => lifecycle.push('destroyed'));
    expect(engine.clearHistory()).toMatchObject({
      changed: true,
      reason: 'host',
      history: { depth: 0 },
    });
    engine.loadDataset(stacking());
    expect(engine.historyState().depth).toBe(0);
    await engine.destroy();
    expect(pendingHistoryPlanCount(engine)).toBe(0);
    expect(lifecycle).toEqual([
      'history-cleared:host',
      'history-cleared:destroy',
      'destroyed',
    ]);
  });
});

async function createEngine(
  options: Readonly<{ historyLimit?: number }> = {},
): Promise<Readonly<{ engine: PatchMap; surface: HistorySurface }>> {
  const surface = new HistorySurface({ width: 800, height: 600, pixelRatio: 1 });
  const engine = new PatchMap({
    surfaceFactory: () => Promise.resolve(surface),
    ...(options.historyLimit === undefined ? {} : { historyLimit: options.historyLimit }),
  });
  await engine.initialize({ instanceId: 'history-engine', width: 800, height: 600 });
  return Object.freeze({ engine, surface });
}

function stacking(): readonly unknown[] {
  return [
    rect('low', -1),
    rect('first', 4),
    rect('second', 4),
    rect('high', 10),
  ];
}

function rect(id: string, zIndexValue: number): Readonly<Record<string, unknown>> {
  return {
    type: 'rect',
    id,
    size: { width: 40, height: 40 },
    fill: '#336699',
    attrs: { x: 0, y: 0, zIndex: zIndexValue },
  };
}

function zIndex(engine: PatchMap, id: string): number {
  const element = engine.exportDataset().find((entry) => entry.id === id);
  const value = element?.attrs?.zIndex;
  if (typeof value !== 'number') throw new Error(`missing zIndex for ${id}`);
  return value;
}

function elementX(
  dataset: readonly Readonly<Record<string, unknown>>[],
  id: string,
): number {
  const element = dataset.find((entry) => entry.id === id);
  const attrs = element?.attrs;
  if (attrs === null || typeof attrs !== 'object' || Array.isArray(attrs)) {
    throw new Error(`missing attrs for ${id}`);
  }
  const value = (attrs as Readonly<Record<string, unknown>>).x;
  if (typeof value !== 'number') throw new Error(`missing x for ${id}`);
  return value;
}

function pendingHistoryPlanCount(engine: PatchMap): number {
  const history = (engine as unknown as Readonly<{
    historyAuthority: Readonly<{ pendingPreparedRecords: ReadonlySet<unknown> }>;
  }>).historyAuthority;
  return history.pendingPreparedRecords.size;
}
