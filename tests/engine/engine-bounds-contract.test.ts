import catalogProfiles from '../../contracts/evidence/catalog-fixture-profiles.v1.json';
import { describe, expect, it } from 'vitest';

import { CoreScene } from '../../src/patch-map/dense/scene';
import {
  PatchMap,
  createPatchMapSurfaceGeometrySnapshot,
  type PatchMapEngineSurface,
  type PatchMapPoint,
  type PatchMapSurfaceDebug,
  type PatchMapSurfaceOptions,
  type PatchMapSurfaceReconcileResult,
} from '../../src/patch-map/engine';
import { parsePatchMap } from '../../src/patch-map/parser';
import { materializePatchMapDataset } from '../../src/patch-map/semantic/dataset';
import { removePatchMapSemanticTarget } from '../../src/patch-map/semantic/mutation';
import { planPatchMapSceneReconcile } from '../../src/patch-map/semantic/reconcile';
import { screenToWorld } from '../../src/patch-map/view';

const boundsDataset = catalogProfiles.datasets.bounds;

describe('PatchMap LAY-005 bounds product contract', () => {
  it('publishes exact local, world, screen, visibility, and signed-scale geometry', () => {
    const materialized = materializePatchMapDataset(boundsDataset);
    const parsed = parsePatchMap(materialized.dataset);
    const scene = new CoreScene();
    scene.load(parsed.document);
    const geometry = createPatchMapSurfaceGeometrySnapshot(scene.snapshot(), parsed.projection);
    const byId = new Map(geometry.entities.map((entity) => [entity.id, entity]));

    expect(geometry.revision).toBe(scene.snapshot().revision);
    expect(byId.get('rotated')).toMatchObject({
      localBounds: [0, 0, 40, 20],
      scaleX: 1,
      scaleY: 1,
      visible: true,
    });
    expect(roundBounds(byId.get('rotated')?.worldBounds)).toEqual([
      -14.142136,
      0,
      42.426407,
      42.426407,
    ]);
    expect(roundBounds(byId.get('rotated')?.screenBounds)).toEqual([
      -14.142136,
      0,
      42.426407,
      42.426407,
    ]);
    expect(byId.get('flipped')).toMatchObject({
      localBounds: [0, 0, 40, 20],
      worldBounds: [40, 0, 40, 20],
      screenBounds: [40, 0, 40, 20],
      scaleX: -1,
      scaleY: 1,
    });
    expect(byId.get('overflow-text')?.worldBounds).toEqual([0, 80, 272, 20]);
    expect(byId.get('hidden')).toMatchObject({
      worldBounds: [160, 0, 20, 20],
      visibleBounds: null,
      visible: false,
    });
    expect(byId.get('transparent-interactive')).toMatchObject({
      worldBounds: [200, 0, 20, 20],
      visibleBounds: [200, 0, 20, 20],
      visible: true,
      interactive: true,
    });
    expect(byId.get('zero-size')).toMatchObject({
      localBounds: [0, 0, 0, 0],
      worldBounds: [240, 0, 0, 0],
      visibleBounds: [240, 0, 0, 0],
    });
    expect(parsed.document.entities.find((entity) => entity.id === 'flipped')).toMatchObject({
      x: 40,
      y: 0,
      width: 40,
      height: 20,
    });
    expect(parsed.diagnostics).not.toContainEqual(expect.objectContaining({
      path: '$[1].attrs.scaleX',
    }));
  });

  it('uses transformed dense hit testing for transparent interactive targets only', () => {
    const parsed = parsePatchMap(
      materializePatchMapDataset(boundsDataset).dataset,
    );
    const scene = new CoreScene();
    scene.load(parsed.document);
    const view = { x: 50, y: 30, scale: 2, rotation: 0 };
    const transparentWorld = screenToWorld({ x: 470, y: 50 }, view);
    const hiddenWorld = screenToWorld({ x: 390, y: 50 }, view);

    const transparent = scene.hitTest(transparentWorld, { interactiveOnly: true });
    expect(transparent ? scene.get(transparent)?.id : null).toBe('transparent-interactive');
    expect(scene.hitTest(hiddenWorld, { interactiveOnly: true })).toBeNull();
    expect(scene.hitTest({ x: 240, y: 0 }, { interactiveOnly: true })).toBeNull();
  });

  it('plans one atomic removal while preserving unaffected dense identity', () => {
    const current = materializePatchMapDataset(boundsDataset);
    const inputBefore = JSON.stringify(boundsDataset);
    const removal = removePatchMapSemanticTarget(current, { kind: 'element', id: 'rotated' });
    if (removal.status !== 'changed') throw new Error('expected removal candidate');
    const currentParsed = parsePatchMap(current.dataset);
    const candidateParsed = parsePatchMap(removal.candidate.dataset);
    const plan = planPatchMapSceneReconcile(currentParsed.document, candidateParsed.document);
    const scene = new CoreScene();
    scene.load(currentParsed.document);
    const unaffectedRef = scene.ref('flipped');

    expect(plan).toMatchObject({
      safeToCommit: true,
      summary: { operationCount: 1, removed: 1, added: 0, replaced: 0 },
    });
    scene.commit(plan.batch);
    expect(scene.ref('rotated')).toBeNull();
    expect(scene.ref('flipped')).toEqual(unaffectedRef);
    expect(JSON.stringify(boundsDataset)).toBe(inputBefore);
  });
});

describe('PatchMap atomic destroyTarget seam', () => {
  it('advances semantic authority only after one incremental surface reconcile', async () => {
    const surface = new ReconcileSurface({ width: 640, height: 480, pixelRatio: 1 });
    const engine = new PatchMap({ surfaceFactory: () => Promise.resolve(surface) });
    await engine.initialize({ instanceId: 'bounds-remove', width: 640, height: 480 });
    engine.loadDataset(boundsDataset, { datasetRef: 'bounds' });
    const events: unknown[] = [];
    engine.on('targetDestroyed', (event) => events.push(event));
    engine.select(['rotated']);

    const result = engine.destroyTarget({ kind: 'element', id: 'rotated' });

    expect(result).toMatchObject({
      status: 'committed',
      changed: true,
      target: { kind: 'element', id: 'rotated' },
      previousRevisions: { sceneRevision: 1 },
      revisions: { sceneRevision: 2 },
      applied: [{ kind: 'element', id: 'rotated' }],
      missing: [],
      unchanged: [],
      publication: 'pending',
      denseOperationCount: 1,
      denseChanged: true,
      reconcileDiagnostics: [],
    });
    expect(surface).toMatchObject({ loadCount: 1, reconcileCount: 1 });
    expect(engine.query({ id: 'rotated' })).toBeNull();
    expect(engine.query({ id: 'flipped' })).not.toBeNull();
    expect(engine.snapshot().selectionIds).toEqual([]);
    expect(engine.exportDataset()).toHaveLength(boundsDataset.length - 1);
    expect(events).toEqual([result]);
    engine.publishFrame(1);
    expect(engine.snapshot()).toMatchObject({
      revisions: { sceneRevision: 2 },
      publishedTuple: { scene: 2 },
    });
    await engine.destroy();
  });

  it('keeps authority and revisions unchanged when reconcile refuses', async () => {
    const surface = new ReconcileSurface({ width: 640, height: 480, pixelRatio: 1 });
    surface.mode = 'refused';
    const engine = new PatchMap({ surfaceFactory: () => Promise.resolve(surface) });
    await engine.initialize({ instanceId: 'bounds-refusal', width: 640, height: 480 });
    engine.loadDataset(boundsDataset);
    const authorityBefore = engine.exportDataset();
    const snapshotBefore = engine.snapshot();

    const result = engine.destroyTarget({ kind: 'element', id: 'rotated' });

    expect(result).toMatchObject({
      status: 'refused',
      changed: false,
      revisions: { sceneRevision: 1 },
      diagnostic: { code: 'CONFLICT', category: 'CONFLICT' },
    });
    expect(engine.exportDataset()).toBe(authorityBefore);
    expect(engine.snapshot()).toEqual(snapshotBefore);
    expect(engine.query({ id: 'rotated' })).not.toBeNull();
    expect(surface).toMatchObject({ loadCount: 1, reconcileCount: 1 });
    await engine.destroy();
  });

  it('rejects missing targets without reconciling the surface', async () => {
    const surface = new ReconcileSurface({ width: 640, height: 480, pixelRatio: 1 });
    const engine = new PatchMap({ surfaceFactory: () => Promise.resolve(surface) });
    await engine.initialize({ instanceId: 'bounds-missing', width: 640, height: 480 });
    engine.loadDataset(boundsDataset);
    const missing = engine.destroyTarget({ kind: 'element', id: 'missing' });
    expect(missing).toMatchObject({
      status: 'rejected',
      missing: [{ kind: 'element', id: 'missing' }],
      diagnostic: { code: 'MISSING_TARGET', category: 'MISSING_TARGET' },
    });
    expect(surface).toMatchObject({ loadCount: 1, reconcileCount: 0 });
    await engine.destroy();
  });
});

abstract class SurfaceBase implements PatchMapEngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  public loadCount = 0;
  public frameCount = 0;
  public selectionIds: readonly string[] = Object.freeze([]);
  protected width: number;
  protected height: number;
  protected pixelRatio: number;

  public constructor(options: Pick<PatchMapSurfaceOptions, 'width' | 'height' | 'pixelRatio'>) {
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = options.pixelRatio;
  }

  public load(): void {
    this.loadCount += 1;
  }

  public abstract reconcile(input: unknown): PatchMapSurfaceReconcileResult;

  public publishFrame(): void {
    this.frameCount += 1;
  }

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
    });
  }

  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.canvasCount = 0;
    return Promise.resolve(true);
  }
}

class ReconcileSurface extends SurfaceBase {
  public reconcileCount = 0;
  public mode: 'committed' | 'refused' = 'committed';

  public reconcile(): PatchMapSurfaceReconcileResult {
    this.reconcileCount += 1;
    return Object.freeze({
      status: this.mode,
      operationCount: this.mode === 'committed' ? 1 : 0,
      denseChanged: this.mode === 'committed',
      diagnostics: Object.freeze([]),
    });
  }
}

function roundBounds(
  bounds: readonly [number, number, number, number] | undefined,
): readonly [number, number, number, number] | undefined {
  return bounds?.map((value) => Number(value.toFixed(6))) as
    | readonly [number, number, number, number]
    | undefined;
}
