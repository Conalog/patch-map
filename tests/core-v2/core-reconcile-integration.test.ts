import { afterEach, describe, expect, it } from 'vitest';

import type {
  CoreView,
  SlotRange,
} from '../../src/core-v1/contracts';
import type {
  RendererFlushResult,
  RenderStoreView,
} from '../../src/core-v1/renderer/types';
import {
  CoreV2,
  type CoreV2Options,
} from '../../src/core-v2/core';
import { PatchMapParseError } from '../../src/core-v2/contracts';
import type {
  PixiCoreV2InitializationMetrics,
  PixiCoreV2Renderer,
} from '../../src/core-v2/renderers/pixi-renderer';
import type {
  PixiCoreV2RendererDebug,
  RootInteractionHandlers,
} from '../../src/core-v2/renderers/types';

describe('Core v2 runtime dense reconcile', () => {
  const allocated: CoreV2[] = [];

  afterEach(async () => {
    await Promise.all(allocated.splice(0).map((core) => core.destroy()));
  });

  it('patches the loaded authority in one batch while preserving ref, slot, and selection', () => {
    const { core, renderer } = createTestCore(allocated);
    const current = [directRect('box', { x: 4, width: 20, fill: '#112233' })];
    const candidate = [directRect('box', { x: 18, width: 42, fill: '#aabbcc' })];
    const candidateBefore = structuredClone(candidate);
    core.load(current);
    core.flush('settle-load');
    const refBefore = core.ref('box');
    core.commit({ operations: [{ type: 'selection', targets: ['box'] }] });
    core.flush('settle-selection');
    renderer.markCalls.length = 0;
    const revisionBefore = core.snapshot().revision;

    const result = core.reconcile(candidate, { id: 'patch-box' });

    expect(result.status).toBe('committed');
    expect(result.plan.batch).toEqual({
      id: 'patch-box',
      operations: [{
        type: 'patch',
        target: 'box',
        changes: { x: 18, width: 42, fill: 0xaabbccff },
      }],
    });
    expect(result.commit).toMatchObject({
      revision: revisionBefore + 1,
      operationCount: 1,
      added: 0,
      changed: 1,
      removed: 0,
    });
    expect(core.ref('box')).toEqual(refBefore);
    expect(core.get('box')).toMatchObject({
      bounds: { x: 18, width: 42 },
      data: { fill: 0xaabbccff },
    });
    expect(core.selection().refs).toEqual([refBefore]);
    expect(result.facts).toMatchObject({
      semanticChanged: true,
      denseChanged: true,
      structuralChanged: false,
      structuralReplacement: false,
      fullRebuild: false,
      selectionCountBefore: 1,
      selectionCountAfter: 1,
    });
    expect(renderer.markCalls).toEqual([{
      ranges: result.commit?.changedRanges,
      reason: 'commit',
      fullRebuild: false,
    }]);
    expect(candidate).toEqual(candidateBefore);
    Reflect.set(candidate[0] as object, 'fill', '#000000');
    expect(core.get('box')?.data.fill).toBe(0xaabbccff);
  });

  it('preserves owner-local component entity identity through a parsed component patch', () => {
    const { core } = createTestCore(allocated);
    core.load([itemWithText('Status', 100)]);
    core.flush('settle-load');
    const entityId = 'item-a::text:caption';
    const refBefore = core.ref(entityId);

    const result = core.reconcile([itemWithText('Ready', 160)]);

    expect(result.status).toBe('committed');
    expect(result.plan.batch.operations).toHaveLength(1);
    expect(result.plan.batch.operations[0]).toMatchObject({
      type: 'patch',
      target: entityId,
      changes: { text: 'Ready', width: 40 },
    });
    expect(core.ref(entityId)).toEqual(refBefore);
    expect(core.get(entityId)?.data.text).toBe('Ready');
    expect(core.get(entityId)?.bounds.width).toBe(40);
    expect(core.projection?.textsByEntityId?.[entityId]).toMatchObject({
      authoredStyle: { wordWrapWidth: 160 },
      wordWrapWidthPx: null,
      layoutBounds: { x: 0, y: 0, width: 40, height: 20 },
    });
  });

  it('commits structural relation removals in dependency order without a scene reload', () => {
    const { core, renderer } = createTestCore(allocated);
    core.load([
      directRect('a'),
      directRect('b', { x: 30 }),
      relations('links', 'a', 'b'),
    ]);
    core.flush('settle-load');
    renderer.markCalls.length = 0;
    const aRefBefore = core.ref('a');

    const result = core.reconcile([directRect('a')]);

    expect(result.status).toBe('committed');
    expect(result.plan.batch.operations).toEqual([
      { type: 'remove', target: '@relation:5:links1:a1:b' },
      { type: 'remove', target: 'b' },
    ]);
    expect(result.commit).toMatchObject({ operationCount: 2, removed: 2 });
    expect(result.facts).toMatchObject({
      structuralChanged: true,
      structuralReplacement: false,
      fullRebuild: false,
      entityCountBefore: 3,
      entityCountAfter: 1,
    });
    expect(core.ref('a')).toEqual(aRefBefore);
    expect(renderer.markCalls).toHaveLength(1);
    expect(renderer.markCalls[0]?.fullRebuild).toBe(false);

    const added = core.reconcile([
      directRect('a'),
      directRect('c', { x: 60 }),
      relations('links', 'a', 'c'),
    ]);
    expect(added.status).toBe('committed');
    expect(added.plan.batch.operations.map((operation) =>
      operation.type === 'add' ? `${operation.type}:${operation.entity.id}` : operation.type,
    )).toEqual([
      'add:c',
      'add:@relation:5:links1:a1:c',
    ]);
    expect(core.get('@relation:5:links1:a1:c')?.data).toMatchObject({ from: 'a', to: 'c' });
  });

  it('keeps relation identity while endpoints resize/hide/show and omits one new missing link', () => {
    const { core, renderer } = createTestCore(allocated);
    const initial = relationMatrixScene();
    core.load(initial);
    core.flush('settle-relations');
    const forwardId = '@relation:12:nested-links11:nested-item8:grid.0.0';
    const reverseId = '@relation:12:nested-links8:grid.0.011:nested-item';
    const forwardRef = core.ref(forwardId);
    const endpointRef = core.ref('nested-item');
    renderer.markCalls.length = 0;

    const resizedScene = structuredClone(initial);
    const group = resizedScene[0];
    if (!group || group.type !== 'group') throw new Error('expected relation group');
    group.children[0]!.size = { width: 40, height: 20 };
    const resized = core.reconcile(resizedScene);
    expect(resized.status).toBe('committed');
    expect(core.ref('nested-item')).toEqual(endpointRef);
    expect(core.projection?.byEntityId['nested-item']?.visibleCenter).toEqual([130, 80]);
    expect(core.ref(forwardId)).toEqual(forwardRef);

    const hiddenScene = structuredClone(resizedScene);
    hiddenScene[1]!.show = false;
    expect(core.reconcile(hiddenScene).status).toBe('committed');
    expect(core.get('grid.0.0')?.visible).toBe(false);
    expect(core.get(forwardId)).not.toBeNull();

    const shownScene = structuredClone(hiddenScene);
    shownScene[1]!.show = true;
    expect(core.reconcile(shownScene).status).toBe('committed');
    expect(core.get('grid.0.0')?.visible).toBe(true);
    expect(core.ref(forwardId)).toEqual(forwardRef);

    const changedLinks = structuredClone(shownScene);
    const relationElement = changedLinks[2];
    if (!relationElement || relationElement.type !== 'relations') {
      throw new Error('expected relations element');
    }
    relationElement.links = [
      { source: 'nested-item', target: 'grid.0.0' },
      { source: 'nested-item', target: 'missing-endpoint' },
    ];
    const changed = core.reconcile(changedLinks);
    expect(changed.status).toBe('committed');
    expect(core.ref(forwardId)).toEqual(forwardRef);
    expect(core.ref(reverseId)).toBeNull();
    expect(core.projection?.omittedRelations).toEqual([
      expect.objectContaining({
        key: 'nested-item>missing-endpoint',
        reason: 'missing-target',
      }),
    ]);
    expect(renderer.markCalls.every((call) => call.fullRebuild === false)).toBe(true);
  });

  it('preserves a surviving ordered-pair ref when an earlier authored link is removed', () => {
    const { core } = createTestCore(allocated);
    core.load([
      directRect('a'),
      directRect('b', { x: 30 }),
      {
        type: 'relations',
        id: 'links',
        links: [
          { source: 'a', target: 'b' },
          { source: 'b', target: 'a' },
        ],
      },
    ]);
    core.flush('settle-pair-identity');
    const survivingId = '@relation:5:links1:b1:a';
    const survivingRef = core.ref(survivingId);

    const result = core.reconcile([
      directRect('a'),
      directRect('b', { x: 30 }),
      {
        type: 'relations',
        id: 'links',
        links: [{ source: 'b', target: 'a' }],
      },
    ]);
    expect(result.status).toBe('committed');
    expect(core.ref(survivingId)).toEqual(survivingRef);
    expect(core.ref('@relation:5:links1:a1:b')).toBeNull();
  });

  it('uses an incremental changed range for an explicit same-ID kind replacement', () => {
    const { core, renderer } = createTestCore(allocated);
    core.load([directRect('content')]);
    core.flush('settle-load');
    const refBefore = core.ref('content');
    renderer.markCalls.length = 0;

    const result = core.reconcile([directText('content', 'replacement')]);

    expect(result.status).toBe('committed');
    expect(result.plan.batch.operations.map((operation) => operation.type)).toEqual(['remove', 'add']);
    expect(result.facts).toMatchObject({
      structuralChanged: true,
      structuralReplacement: true,
      fullRebuild: false,
    });
    expect(core.ref('content')).not.toEqual(refBefore);
    expect(core.get('content')?.kind).toBe('text');
    expect(renderer.markCalls).toEqual([{
      ranges: result.commit?.changedRanges,
      reason: 'commit',
      fullRebuild: false,
    }]);
  });

  it('refuses an unsafe authored-order plan without changing any authority', () => {
    const { core, renderer } = createTestCore(allocated);
    const current = [directRect('a'), directRect('b')];
    core.load(current);
    core.flush('settle-load');
    core.commit({ operations: [{ type: 'selection', targets: ['b'] }] });
    core.setView({ x: 12, y: 18, scale: 1.5, rotation: 0 });
    core.flush('settle-interaction');
    renderer.markCalls.length = 0;
    const identityBefore = core.identity;
    const snapshotBefore = core.snapshot();
    const viewBefore = core.view;

    const result = core.reconcile([directRect('b'), directRect('a')]);

    expect(result.status).toBe('refused');
    expect(result.commit).toBeNull();
    expect(result.plan.safeToCommit).toBe(false);
    expect(result.plan.diagnostics).toContainEqual(expect.objectContaining({
      code: 'ENTITY_ORDER_CHANGE_UNSUPPORTED',
      severity: 'error',
    }));
    expect(result.facts.revisionAfter).toBe(result.facts.revisionBefore);
    expect(core.snapshot()).toEqual(snapshotBefore);
    expect(core.identity).toBe(identityBefore);
    expect(core.view).toBe(viewBefore);
    expect(renderer.markCalls).toEqual([]);
  });

  it('commits empty plans once and distinguishes exact no-op from semantic-only authority', () => {
    const { core } = createTestCore(allocated);
    const current = [directRect('box', { label: 'Before' })];
    core.load(current);
    core.flush('settle-load');
    const loadedRevision = core.snapshot().revision;

    const noOp = core.reconcile(structuredClone(current));

    expect(noOp.status).toBe('committed');
    expect(noOp.plan.batch.operations).toEqual([]);
    expect(noOp.commit).toMatchObject({ operationCount: 0, revision: loadedRevision + 1 });
    expect(noOp.facts).toMatchObject({ semanticChanged: false, denseChanged: false });

    const semanticOnly = core.reconcile([directRect('box', { label: 'After' })]);

    expect(semanticOnly.status).toBe('committed');
    expect(semanticOnly.plan.batch.operations).toEqual([]);
    expect(semanticOnly.commit).toMatchObject({
      operationCount: 0,
      revision: loadedRevision + 2,
    });
    expect(semanticOnly.facts).toMatchObject({
      semanticChanged: true,
      denseChanged: false,
      entityCountBefore: 1,
      entityCountAfter: 1,
    });
    expect(core.identity?.elements[0]?.label).toBe('After');
    expect(Object.isFrozen(semanticOnly)).toBe(true);
    expect(Object.isFrozen(semanticOnly.timings)).toBe(true);
    expect(Object.isFrozen(semanticOnly.facts)).toBe(true);
    expect(Object.values(semanticOnly.timings).every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
  });

  it('keeps the loaded authority atomic when candidate parsing fails', () => {
    const { core, renderer } = createTestCore(allocated);
    core.load([directRect('box')]);
    core.flush('settle-load');
    renderer.markCalls.length = 0;
    const identityBefore = core.identity;
    const snapshotBefore = core.snapshot();

    expect(() => core.reconcile({ invalid: 'root' })).toThrow(PatchMapParseError);

    expect(core.snapshot()).toEqual(snapshotBefore);
    expect(core.identity).toBe(identityBefore);
    expect(renderer.markCalls).toEqual([]);
  });

  it('inverts screen-axis flips after rotation for transformed pointer coordinates', () => {
    const { core } = createTestCore(allocated);
    core.load([directRect('endpoint', { x: 110, width: 20, height: 20 })]);
    core.setWorldTransform({
      x: 10,
      y: 20,
      scale: 2,
      rotationDegrees: 90,
      flipX: true,
      flipY: false,
    });

    const world = core.screenToWorld({ x: 170, y: 260 });
    expect(world.x).toBeCloseTo(120, 10);
    expect(world.y).toBeCloseTo(80, 10);
  });
});

type RelationMatrixElement =
  | {
      type: 'group';
      id: string;
      attrs: { x: number; y: number };
      children: Array<{
        type: 'rect';
        id: string;
        size: { width: number; height: number };
        fill: string;
        attrs: { x: number; y: number };
      }>;
      show?: boolean;
    }
  | {
      type: 'grid';
      id: string;
      cells: number[][];
      item: { size: number; components: unknown[] };
      attrs: { x: number; y: number };
      show?: boolean;
    }
  | {
      type: 'relations';
      id: string;
      links: Array<{ source: string; target: string }>;
      style: { color: string; width: number; opacity: number };
      attrs: { x: number; y: number; angle: number; zIndex: number };
      show?: boolean;
    };

function relationMatrixScene(): RelationMatrixElement[] {
  return [
    {
      type: 'group',
      id: 'nested-group',
      attrs: { x: 100, y: 50 },
      children: [{
        type: 'rect',
        id: 'nested-item',
        size: { width: 20, height: 20 },
        fill: '#336699',
        attrs: { x: 10, y: 20 },
      }],
    },
    {
      type: 'grid',
      id: 'grid',
      cells: [[1]],
      item: { size: 20, components: [] },
      attrs: { x: 200, y: 100 },
    },
    {
      type: 'relations',
      id: 'nested-links',
      links: [
        { source: 'nested-item', target: 'grid.0.0' },
        { source: 'grid.0.0', target: 'nested-item' },
      ],
      style: { color: '#123456', width: 3, opacity: 0.75 },
      attrs: { x: 30, y: -10, angle: 90, zIndex: -4 },
    },
  ];
}

interface RendererMarkCall {
  readonly ranges: readonly SlotRange[];
  readonly reason: string;
  readonly fullRebuild: boolean;
}

class RendererTestDouble {
  public readonly strategy = 'mesh' as const;
  public readonly preference = 'webgl' as const;
  public readonly initializationMetrics: PixiCoreV2InitializationMetrics = Object.freeze({
    applicationInitMs: 0,
    rendererBuildMs: 0,
  });
  public readonly markCalls: RendererMarkCall[] = [];
  public readonly width = 800;
  public readonly height = 600;
  public readonly pixelRatio = 1;
  public destroyed = false;
  private view: CoreView = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });

  public markChanges(
    ranges: readonly SlotRange[],
    reason: string,
    options: { readonly fullRebuild?: boolean } = {},
  ): void {
    this.markCalls.push({
      ranges: Object.freeze([...ranges]),
      reason,
      fullRebuild: options.fullRebuild ?? false,
    });
  }

  public markOverlayChanges(): void {}

  public setProjection(): boolean {
    return true;
  }

  public setWorldOrientation(): boolean {
    return true;
  }

  public resize(): boolean {
    return false;
  }

  public setView(view: CoreView): boolean {
    const changed = this.view.x !== view.x ||
      this.view.y !== view.y ||
      this.view.scale !== view.scale ||
      (this.view.rotation ?? 0) !== (view.rotation ?? 0);
    this.view = Object.freeze({ ...view });
    return changed;
  }

  public flush(_store: RenderStoreView): RendererFlushResult {
    return Object.freeze({ rendered: true, commandCount: 1 });
  }

  public synchronizeNextFlush(): void {}

  public prepareGpu(): Promise<void> {
    return Promise.resolve();
  }

  public loadAsset(): Promise<void> {
    return Promise.resolve();
  }

  public unloadAsset(): Promise<boolean> {
    return Promise.resolve(false);
  }

  public finalizeAssetUnloads(): Promise<void> {
    return Promise.resolve();
  }

  public captureBase64(): Promise<string> {
    return Promise.resolve('data:image/png;base64,');
  }

  public bindRootInteractions(_handlers: RootInteractionHandlers): () => void {
    return () => undefined;
  }

  public debugSnapshot(): PixiCoreV2RendererDebug {
    return Object.freeze({
      strategy: this.strategy,
      backend: 'webgl',
      frame: 0,
      storeEpoch: 0,
      entityCount: 0,
      aggregateRenderObjects: 0,
      visiblePrimitives: 0,
      uploadedChunks: 0,
      uploadedBytes: 0,
      dynamicFullUploadCount: 0,
      staticInvalidatedUploadCount: 0,
      particleFullUploadCount: 0,
      uploadObservation: 'dirty-chunk-bytes',
      bitmapTextCount: 0,
      fallbackTextCount: 0,
      imageCount: 0,
      loadedAssetCount: 0,
      unresolvedAssetCount: 0,
      view: this.view,
      lastInvalidation: 'test',
      destroyed: this.destroyed,
    });
  }

  public destroy(): boolean {
    if (this.destroyed) return false;
    this.destroyed = true;
    return true;
  }

  public whenDestroyed(): Promise<void> {
    return Promise.resolve();
  }
}

function createTestCore(allocated: CoreV2[]): Readonly<{
  core: CoreV2;
  renderer: RendererTestDouble;
}> {
  const renderer = new RendererTestDouble();
  const TestCoreV2 = CoreV2 as unknown as new (
    renderer: PixiCoreV2Renderer,
    options: CoreV2Options,
  ) => CoreV2;
  const core = new TestCoreV2(
    renderer as unknown as PixiCoreV2Renderer,
    { autoRender: false, historyLimit: 8 },
  );
  allocated.push(core);
  return { core, renderer };
}

function directRect(
  id: string,
  options: Readonly<{
    x?: number;
    width?: number;
    height?: number;
    fill?: string;
    label?: string;
  }> = {},
): Record<string, unknown> {
  return {
    type: 'rect',
    id,
    ...(options.label === undefined ? {} : { label: options.label }),
    attrs: { x: options.x ?? 0, y: 0 },
    size: { width: options.width ?? 20, height: options.height ?? 10 },
    fill: options.fill ?? '#ffffff',
  };
}

function directText(id: string, text: string): Record<string, unknown> {
  return {
    type: 'text',
    id,
    text,
    attrs: { x: 0, y: 0 },
    style: { fill: '#223344', fontSize: 14, wordWrapWidth: 80 },
  };
}

function relations(id: string, from: string, to: string): Record<string, unknown> {
  return {
    type: 'relations',
    id,
    links: [{ source: from, target: to }],
    style: { color: '#334455', width: 1 },
  };
}

function itemWithText(text: string, width: number): Record<string, unknown> {
  return {
    type: 'item',
    id: 'item-a',
    size: { width: 200, height: 80 },
    components: [{
      type: 'text',
      id: 'caption',
      text,
      placement: 'left',
      style: { fontSize: 16, wordWrapWidth: width },
    }],
  };
}
