import { afterEach, describe, expect, it } from 'vitest';

import {
  PATCH_MAP_EDITOR_MUTATION_KINDS,
  PatchMapEditorWorkflowAuthority,
} from '../../src/patch-map/editor-workflow';
import {
  PatchMap,
  type PatchMapEngineSurface,
  type PatchMapPoint,
  type PatchMapSurfaceDebug,
  type PatchMapSurfaceOptions,
  type PatchMapSurfaceReconcileOptions,
  type PatchMapSurfaceReconcileResult,
} from '../../src/patch-map/engine';
import type { NormalizedPatchMapElement } from '../../src/patch-map/semantic/dataset';

class EditorSurface implements PatchMapEngineSurface {
  public canvasCount = 1;
  public loaded: readonly NormalizedPatchMapElement[] = Object.freeze([]);
  public selectionIds: readonly string[] = Object.freeze([]);
  private width: number;
  private height: number;
  private pixelRatio: number;
  public destroyed = false;

  public constructor(options: Pick<PatchMapSurfaceOptions, 'width' | 'height' | 'pixelRatio'>) {
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = options.pixelRatio;
  }

  public load(input: readonly NormalizedPatchMapElement[]): void {
    this.loaded = input;
    this.selectionIds = Object.freeze([]);
  }

  public reconcile(
    input: readonly NormalizedPatchMapElement[],
    options: PatchMapSurfaceReconcileOptions = {},
  ): PatchMapSurfaceReconcileResult {
    this.loaded = input;
    if (options.selectionIds !== undefined) {
      this.selectionIds = Object.freeze([...options.selectionIds]);
    }
    return Object.freeze({
      status: 'committed',
      operationCount: 1,
      denseChanged: true,
      diagnostics: Object.freeze([]),
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

  public select(ids: readonly string[]): void {
    this.selectionIds = Object.freeze([...ids]);
  }

  public hitTestScreen(): string | null {
    return null;
  }

  public screenToWorld(point: PatchMapPoint): PatchMapPoint {
    return Object.freeze({ ...point });
  }

  public debugSnapshot(): PatchMapSurfaceDebug {
    return Object.freeze({
      cssSize: Object.freeze([this.width, this.height] as const),
      backingSize: Object.freeze([
        Math.round(this.width * this.pixelRatio),
        Math.round(this.height * this.pixelRatio),
      ] as const),
      selectionIds: this.selectionIds,
      activeAnimationCount: 0,
      activeGestureCount: 0,
      renderCommandCount: 1,
      visiblePrimitiveCount: this.loaded.length,
    });
  }

  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.canvasCount = 0;
    return Promise.resolve(true);
  }
}

describe('PatchMapRuntime editor workflow product', () => {
  const engines: PatchMap[] = [];

  afterEach(async () => {
    await Promise.all(engines.splice(0).map((engine) => engine.destroy()));
  });

  it('groups grid edits into one history action and atomically rejects a linked cell disable', async () => {
    const engine = await createEngine(engines, 'editor-grid');
    const input = gridScene();
    const fingerprint = JSON.stringify(input);
    engine.loadDataset(input);

    expect(engine.editorWorkflow({
      type: 'enter-grid-edit',
      target: 'grid',
      linkedCellIds: ['grid.0.1'],
    })).toMatchObject({
      status: 'committed',
      probe: { mode: 'grid-edit', activeTargetId: 'grid' },
    });
    expect(engine.editorWorkflow({
      type: 'reveal-inactive-cells',
      target: 'grid',
    })).toMatchObject({
      status: 'committed',
      probe: { inactiveCellsVisible: true },
    });
    expect(engine.editorWorkflow({
      type: 'resize-grid',
      target: 'grid',
      rows: 3,
      columns: 3,
      gapX: 4,
      gapY: 6,
      actionId: 'grid-edit-1',
    })).toMatchObject({
      status: 'committed',
      history: { depth: 1 },
    });
    expect(engine.editorWorkflow({
      type: 'set-grid-cell-active',
      target: 'grid.1.0',
      active: true,
      actionId: 'grid-edit-1',
    })).toMatchObject({
      status: 'committed',
      facts: { appliedCells: ['grid.1.0'] },
      history: { depth: 1 },
    });
    const beforeReject = engine.exportDataset();
    expect(engine.editorWorkflow({
      type: 'set-grid-cell-active',
      target: 'grid.0.1',
      active: false,
      actionId: 'grid-edit-1',
    })).toMatchObject({
      status: 'rejected',
      changed: false,
      code: 'CONFLICT',
    });
    expect(engine.exportDataset()).toBe(beforeReject);
    expect(engine.editorWorkflow({
      type: 'exit-grid-edit',
      target: 'grid',
    })).toMatchObject({
      status: 'committed',
      selectionIds: ['grid'],
      probe: { mode: 'select', activeSessionCount: 0 },
    });

    expect(engine.undo()).toMatchObject({ status: 'committed', recordCount: 2 });
    expect(gridById(engine, 'grid')).toMatchObject({
      cells: [[1, 'B'], [0, 1]],
      gap: { x: 0, y: 0 },
    });
    expect(engine.historyState()).toMatchObject({ depth: 1, cursor: 0 });
    expect(JSON.stringify(input)).toBe(fingerprint);
  });

  it('deduplicates relation links, removes an empty relation on exit, and restores stable links', async () => {
    const engine = await createEngine(engines, 'editor-relation');
    engine.loadDataset(interactiveScene());

    engine.editorWorkflow({ type: 'enter-relation-edit', target: 'links' });
    expect(engine.editorWorkflow({
      type: 'add-relation-link',
      relationId: 'links',
      source: 'item-a',
      target: 'text-c',
      actionId: 'relation-edit-1',
    })).toMatchObject({ status: 'committed' });
    expect(engine.editorWorkflow({
      type: 'remove-relation-link',
      relationId: 'links',
      source: 'item-a',
      target: 'rect-b',
      actionId: 'relation-edit-1',
    })).toMatchObject({ status: 'committed', history: { depth: 1 } });
    expect(engine.editorWorkflow({
      type: 'add-relation-link',
      relationId: 'links',
      source: 'item-a',
      target: 'text-c',
      actionId: 'relation-edit-conflict',
    })).toMatchObject({ status: 'rejected', code: 'CONFLICT' });
    engine.editorWorkflow({ type: 'exit-relation-edit', relationId: 'links' });
    expect(relationById(engine, 'links').links).toEqual([
      { source: 'item-a', target: 'text-c' },
    ]);
    expect(engine.undo()).toMatchObject({ status: 'committed', recordCount: 2 });
    expect(relationById(engine, 'links').links).toEqual([
      { source: 'item-a', target: 'rect-b' },
    ]);

    const empty = await createEngine(engines, 'editor-relation-empty');
    empty.loadDataset([
      ...interactiveScene().filter((entry) => entry.id !== 'links'),
      { type: 'relations', id: 'links', links: [] },
    ]);
    empty.editorWorkflow({ type: 'enter-relation-edit', target: 'links' });
    expect(empty.editorWorkflow({
      type: 'exit-relation-edit',
      relationId: 'links',
    })).toMatchObject({
      status: 'committed',
      facts: { emptyRelationRemoved: true },
    });
    expect(findElement(empty.exportDataset(), 'links')).toBeNull();
  });

  it('recovers a text editor by stable ID across replacement and preserves source/style geometry', async () => {
    const engine = await createEngine(engines, 'editor-text');
    engine.loadDataset(interactiveScene(), { datasetRef: 'interactive-scene' });
    const styleBefore = textById(engine, 'text-c').style;

    engine.editorWorkflow({
      type: 'open-text-editor',
      target: 'text-c',
      hostOverlay: true,
    });
    engine.loadDataset(interactiveScene(), {
      datasetRef: 'interactive-scene',
    });
    expect(engine.editorWorkflowProbe()).toMatchObject({
      mode: 'text-edit',
      activeTargetId: 'text-c',
      replacementRecoveryCount: 1,
    });
    expect(engine.editorWorkflow({
      type: 'resolve-editor-target-by-id',
      target: 'text-c',
    })).toMatchObject({ status: 'committed', selectionIds: ['text-c'] });
    expect(engine.editorWorkflow({
      type: 'commit-text-edit',
      target: 'text-c',
      text: 'Line 1\r\nLine 2',
      preserveStyle: true,
      actionId: 'text-edit-1',
    })).toMatchObject({
      status: 'committed',
      facts: { appliedCount: 1, unchangedCount: 0 },
      probe: { textAppliedCount: 1, mode: 'select' },
    });
    expect(engine.editorWorkflow({
      type: 'commit-text-edit',
      target: 'text-c',
      text: 'Line 1\r\nLine 2',
      actionId: 'text-edit-noop',
    })).toMatchObject({
      status: 'unchanged',
      facts: { appliedCount: 0, unchangedCount: 1 },
      probe: { textUnchangedCount: 1 },
    });
    expect(textById(engine, 'text-c')).toMatchObject({
      text: 'Line 1\r\nLine 2',
      style: styleBefore,
      size: { width: 80, height: 20 },
      attrs: { x: 40, y: 140 },
    });
    expect(engine.historyState()).toMatchObject({ depth: 1 });
  });

  it('requires host cascade confirmation and restores the complete delete action on undo', async () => {
    const engine = await createEngine(engines, 'editor-delete');
    engine.loadDataset(interactiveScene());
    engine.editorWorkflow({
      type: 'select-targets',
      targets: ['item-a'],
      mode: 'replace',
    });
    expect(engine.editorWorkflow({
      type: 'request-delete-plan',
      targets: ['item-a'],
    })).toMatchObject({
      status: 'committed',
      facts: { deletePlan: ['item-a', 'links'] },
    });
    expect(engine.editorWorkflow({
      type: 'apply-host-cascade-confirmation',
      confirmed: true,
      cascadeTargets: ['links'],
      registryLoading: false,
    })).toMatchObject({ status: 'committed' });
    expect(engine.editorWorkflow({
      type: 'delete-transaction',
      targets: ['item-a', 'links'],
      actionId: 'delete-1',
    })).toMatchObject({
      status: 'committed',
      facts: { deletedIds: ['item-a', 'links'] },
      history: { depth: 1 },
      selectionIds: [],
    });
    expect(findElement(engine.exportDataset(), 'item-a')).toBeNull();
    expect(findElement(engine.exportDataset(), 'links')).toBeNull();
    expect(engine.undo()).toMatchObject({ status: 'committed' });
    expect(findElement(engine.exportDataset(), 'item-a')).not.toBeNull();
    expect(findElement(engine.exportDataset(), 'links')).not.toBeNull();
    expect(engine.snapshot().selectionIds).toEqual(['item-a']);

    const blocked = await createEngine(engines, 'editor-delete-blocked');
    blocked.loadDataset(interactiveScene());
    blocked.editorWorkflow({
      type: 'request-delete-plan',
      targets: ['item-a'],
    });
    expect(blocked.editorWorkflow({
      type: 'apply-host-cascade-confirmation',
      confirmed: true,
      cascadeTargets: ['links'],
      registryLoading: true,
    })).toMatchObject({ status: 'rejected', code: 'CONFLICT' });
    expect(blocked.historyState()).toMatchObject({ depth: 0 });
  });

  it('executes all twelve editor mutation kinds as real reversible history entries', async () => {
    const engine = await createEngine(engines, 'editor-matrix');
    const input = interactiveScene();
    const fingerprint = JSON.stringify(input);
    engine.loadDataset(input);
    const normalizedBefore = engine.exportDataset();
    const companion = {
      selectedIds: ['rect-b'],
      mode: 'select',
      transformerTargets: ['rect-b'],
      hostMetadata: { dirty: true },
    } as const;

    const result = engine.runEditorMutationMatrix({
      mutationKinds: PATCH_MAP_EDITOR_MUTATION_KINDS,
      oneActionEach: true,
      companion,
    });
    expect(result).toMatchObject({
      status: 'committed',
      requestedCount: 12,
      executedCount: 12,
      companionRestored: true,
      history: { depth: 12, cursor: 12 },
    });
    expect(result.transactions).toHaveLength(12);
    expect(result.transactions.every((transaction) => transaction.status === 'committed')).toBe(true);

    const undone = Array.from({ length: 12 }, () => engine.undo());
    expect(undone.every((entry) => entry.status === 'committed')).toBe(true);
    expect(engine.undo()).toMatchObject({ status: 'unavailable', changed: false });
    expect(engine.exportDataset()).toEqual(normalizedBefore);
    const redone = Array.from({ length: 12 }, () => engine.redo());
    expect(redone.every((entry) => entry.status === 'committed')).toBe(true);
    expect(engine.historyCompanionState()).toMatchObject({
      selectionIds: ['rect-b'],
      mode: 'select',
      hostCompanion: companion,
    });
    expect(findElement(engine.exportDataset(), 'matrix-grid')).not.toBeNull();
    expect(findElement(engine.exportDataset(), 'matrix-group')).not.toBeNull();
    expect(findElement(engine.exportDataset(), 'matrix-duplicate')).toBeNull();
    expect(JSON.stringify(input)).toBe(fingerprint);
  });

  it('destroys logical workflow sessions without retaining editor ownership', () => {
    const authority = new PatchMapEditorWorkflowAuthority();
    expect(authority.probe()).toMatchObject({
      activeSessionCount: 0,
      destroyed: false,
    });
    expect(authority.destroy()).toBe(true);
    expect(authority.destroy()).toBe(false);
    expect(authority.probe()).toMatchObject({
      activeSessionCount: 0,
      pendingDeleteCount: 0,
      destroyed: true,
    });
  });
});

async function createEngine(
  engines: PatchMap[],
  instanceId: string,
): Promise<PatchMap> {
  const engine = new PatchMap({
    surfaceFactory: (options) => Promise.resolve(new EditorSurface(options)),
  });
  engines.push(engine);
  await engine.initialize({
    instanceId,
    width: 320,
    height: 240,
    pixelRatio: 1,
    preference: 'webgl',
    strategy: 'mesh',
  });
  return engine;
}

function gridScene(): unknown[] {
  return [
    {
      type: 'grid',
      id: 'grid',
      cells: [[1, 'B'], [0, 1]],
      item: {
        size: 10,
        components: [],
      },
    },
  ];
}

function interactiveScene(): Array<Record<string, unknown>> {
  return [
    {
      type: 'item',
      id: 'item-a',
      label: 'Item A',
      size: { width: 100, height: 80 },
      padding: 4,
      components: [
        {
          type: 'background',
          id: 'bg',
          source: { type: 'rect', fill: '#336699' },
        },
        {
          type: 'text',
          id: 'label',
          text: 'Alpha',
          placement: 'center',
          style: { fontFamily: 'FiraCode', fontSize: 16, fill: '#111111' },
        },
      ],
      attrs: { x: 10, y: 20, zIndex: 1 },
    },
    {
      type: 'rect',
      id: 'rect-b',
      size: { width: 40, height: 30 },
      fill: '#ff8800',
      attrs: { x: 160, y: 40, zIndex: 2 },
    },
    {
      type: 'text',
      id: 'text-c',
      text: 'Bravo',
      style: { fontFamily: 'FiraCode', fontSize: 16, fill: '#222222' },
      size: { width: 80, height: 20 },
      attrs: { x: 40, y: 140 },
    },
    {
      type: 'relations',
      id: 'links',
      links: [{ source: 'item-a', target: 'rect-b' }],
      style: { color: '#222222', width: 2 },
    },
  ];
}

function findElement(
  values: readonly NormalizedPatchMapElement[],
  id: string,
): NormalizedPatchMapElement | null {
  for (const value of values) {
    if (value.id === id) return value;
    if (value.type === 'group') {
      const nested = findElement(value.children, id);
      if (nested !== null) return nested;
    }
  }
  return null;
}

function gridById(engine: PatchMap, id: string) {
  const value = findElement(engine.exportDataset(), id);
  if (value?.type !== 'grid') throw new Error(`missing grid ${id}`);
  return value;
}

function relationById(engine: PatchMap, id: string) {
  const value = findElement(engine.exportDataset(), id);
  if (value?.type !== 'relations') throw new Error(`missing relation ${id}`);
  return value;
}

function textById(engine: PatchMap, id: string) {
  const value = findElement(engine.exportDataset(), id);
  if (value?.type !== 'text') throw new Error(`missing text ${id}`);
  return value;
}
