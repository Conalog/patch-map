import { describe, expect, it } from 'vitest';

import {
  CoreV2Engine,
  type CoreV2EngineSurface,
  type CoreV2Point,
  type CoreV2SurfaceDebug,
  type CoreV2SurfaceOptions,
  type CoreV2SurfaceReconcileResult,
} from '../../src/core-v2/engine';

class HistorySurface implements CoreV2EngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  public mode: 'committed' | 'refused' = 'committed';
  public selectionIds: readonly string[] = Object.freeze([]);
  public reconcileCount = 0;
  public loaded: unknown = null;
  private width: number;
  private height: number;
  private pixelRatio: number;

  public constructor(options: Pick<CoreV2SurfaceOptions, 'width' | 'height' | 'pixelRatio'>) {
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = options.pixelRatio;
  }

  public load(input: unknown): void {
    this.loaded = input;
    this.selectionIds = Object.freeze([]);
  }

  public reconcile(input: unknown): CoreV2SurfaceReconcileResult {
    this.reconcileCount += 1;
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
  public screenToWorld(point: CoreV2Point): CoreV2Point { return Object.freeze({ ...point }); }
  public debugSnapshot(): CoreV2SurfaceDebug {
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

describe('CoreV2Engine semantic history integration', () => {
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
});

async function createEngine(
  options: Readonly<{ historyLimit?: number }> = {},
): Promise<Readonly<{ engine: CoreV2Engine; surface: HistorySurface }>> {
  const surface = new HistorySurface({ width: 800, height: 600, pixelRatio: 1 });
  const engine = new CoreV2Engine({
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

function zIndex(engine: CoreV2Engine, id: string): number {
  const element = engine.exportDataset().find((entry) => entry.id === id);
  const value = element?.attrs?.zIndex;
  if (typeof value !== 'number') throw new Error(`missing zIndex for ${id}`);
  return value;
}
