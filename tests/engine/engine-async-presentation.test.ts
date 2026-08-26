import { afterEach, describe, expect, it } from 'vitest';

import type { SlotRange } from '../../src/dense/contracts';
import type {
  PatchMapSemanticRefreshResult,
} from '../../src/core';
import {
  PatchMap,
  type PatchMapEngineSurface,
  type PatchMapPoint,
  type PatchMapSurfaceDebug,
  type PatchMapSurfaceOptions,
  type PatchMapSurfaceReconcileResult,
} from '../../src/engine';
import {
  PATCH_MAP_PRESENTATION_POLICY_REVISION,
  type PatchMapPresentationPolicyInput,
  type PatchMapPresentationPolicyProductProbe,
} from '../../src/presentation/policy';
import type { PatchMapSemanticTarget } from '../../src/semantic/probe';

describe('PatchMap async and transient presentation substrate', () => {
  const engines: PatchMap[] = [];

  afterEach(async () => {
    await Promise.all(engines.splice(0).map((engine) => engine.destroy()));
  });

  it('coalesces ordered live overlay revisions into one latest visible publication', async () => {
    const { engine, surface } = await createEngine(engines, 'live-overlay');
    engine.loadDataset(scene());
    const accepted: number[] = [];
    const published: number[] = [];
    const frameOverlayStates: ReturnType<PatchMap['liveOverlayProbe']>[] = [];
    engine.on('overlayAccepted', ({ sourceRevision }) => accepted.push(sourceRevision));
    engine.on('overlayPublished', ({ sourceRevision }) => published.push(sourceRevision));
    engine.on('frame', () => frameOverlayStates.push(engine.liveOverlayProbe()));

    for (let sourceRevision = 2; sourceRevision <= 13; sourceRevision += 1) {
      const result = engine.applyLiveOverlay({
        sourceRevision,
        payloadHash: `overlay-319-${sourceRevision}`,
        transaction: {
          strict: true,
          recordHistory: false,
          actionId: `overlay-${sourceRevision}`,
          operations: [{
            op: 'merge',
            target: { kind: 'element', id: 'rect-b' },
            changes: [{ path: ['attrs', 'x'], value: sourceRevision * 10 }],
          }],
        },
      });
      expect(result).toMatchObject({
        status: 'accepted',
        publication: 'pending',
        tuple: {
          sourceRevision,
          payloadHash: `overlay-319-${sourceRevision}`,
        },
      });
    }

    expect(accepted).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(published).toEqual([]);
    expect(engine.liveOverlayProbe()).toMatchObject({
      latestAccepted: { sourceRevision: 13, payloadHash: 'overlay-319-13' },
      latestPublished: null,
      pendingPublicationCount: 1,
      acceptedCount: 12,
      publicationCount: 0,
    });
    expect(engine.historyState()).toMatchObject({ undoDepth: 0, redoDepth: 0 });
    expect(rectX(engine)).toBe(130);

    engine.publishFrame(200);

    expect(surface.frameCount).toBe(1);
    expect(frameOverlayStates).toMatchObject([{
      latestPublished: null,
      pendingPublicationCount: 1,
      publicationCount: 0,
    }]);
    expect(published).toEqual([13]);
    expect(engine.liveOverlayProbe()).toMatchObject({
      latestAccepted: { sourceRevision: 13, payloadHash: 'overlay-319-13' },
      latestPublished: {
        sourceRevision: 13,
        payloadHash: 'overlay-319-13',
        frameRevision: 1,
      },
      pendingPublicationCount: 0,
      acceptedCount: 12,
      publicationCount: 1,
    });
    const beforeStale = engine.snapshot();
    expect(engine.applyLiveOverlay({
      sourceRevision: 12,
      payloadHash: 'overlay-stale',
      transaction: {
        strict: true,
        recordHistory: false,
        operations: [{
          op: 'merge',
          target: { kind: 'element', id: 'rect-b' },
          changes: [{ path: ['attrs', 'x'], value: -1 }],
        }],
      },
    })).toMatchObject({ status: 'superseded', changed: false });
    expect(engine.snapshot()).toEqual(beforeStale);
    expect(rectX(engine)).toBe(130);
  });

  it('keeps host highlight and layer visibility outside persisted dataset state', async () => {
    const { engine } = await createEngine(engines, 'presentation-policy');
    engine.loadDataset(scene());
    const persisted = structuredClone(engine.exportDataset());
    const sceneRevision = engine.snapshot().revisions.sceneRevision;

    expect(engine.setPresentationPolicy({
      highlightIds: ['item-a', 'rect-b'],
      deEmphasisAlpha: 0.2,
    })).toMatchObject({ changed: true, publication: 'pending' });
    const hidden = engine.setPresentationPolicy({
      highlightIds: ['item-a', 'rect-b'],
      deEmphasisAlpha: 0.2,
      hiddenLayerIds: ['links'],
      fillOverrides: [{ id: 'item-a', packedColor: 0x00aa66ff }],
    });
    expect(hidden.policy.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'item-a', emphasis: 1, renderObjectCount: 1 }),
      expect.objectContaining({ id: 'rect-b', emphasis: 1, renderObjectCount: 1 }),
      expect.objectContaining({ id: 'text-c', emphasis: 0.2, renderObjectCount: 1 }),
      expect.objectContaining({ id: 'links', visible: false, renderObjectCount: 0 }),
    ]));
    expect(hidden.policy).toMatchObject({
      fillOverrides: [{ id: 'item-a', packedColor: 0x00aa66ff }],
    });
    expect(engine.exportDataset()).toEqual(persisted);
    expect(engine.snapshot().revisions.sceneRevision).toBe(sceneRevision);

    engine.publishFrame(16.666667);
    expect(engine.clearPresentationPolicy()).toMatchObject({
      changed: true,
      publication: 'pending',
      policy: { status: 'normal' },
    });
    engine.publishFrame(33.333334);
    expect(engine.presentationPolicyProbe()).toMatchObject({
      status: 'normal',
      deEmphasisAlpha: 1,
      hiddenLayerIds: [],
    });
    expect(engine.exportDataset()).toEqual(persisted);
  });

  it('refreshes selected semantic targets once without data, identity, selection, or history drift', async () => {
    const { engine, surface } = await createEngine(engines, 'semantic-refresh');
    engine.loadDataset(scene());
    engine.select(['item-a']);
    const persisted = structuredClone(engine.exportDataset());
    const before = engine.snapshot();
    const history = engine.historyState();

    expect(engine.replaceExternalDependency('font-fixture', 'font-fixture-2')).toEqual({
      changed: true,
      dependencyId: 'font-fixture',
      previousRevision: null,
      revision: 'font-fixture-2',
    });
    const refreshed = engine.refreshSemantic({
      targets: [
        { kind: 'component', ownerId: 'item-a', id: 'label' },
        { kind: 'element', id: 'links' },
      ],
      recordHistory: false,
    });

    expect(refreshed).toMatchObject({
      status: 'committed',
      changed: true,
      publication: 'pending',
      recomputedTargets: ['item-a/label', 'links'],
      missingTargets: [],
      dataDiffCount: 0,
      selectionIds: ['item-a'],
    });
    expect(refreshed.revisions.sceneRevision - before.revisions.sceneRevision).toBe(1);
    expect(surface.refreshCalls).toBe(1);
    expect(engine.exportDataset()).toEqual(persisted);
    expect(engine.snapshot().rootIds).toEqual(before.rootIds);
    expect(engine.snapshot().selectionIds).toEqual(before.selectionIds);
    expect(engine.historyState()).toEqual(history);

    engine.publishFrame(16.666667);
    expect(engine.snapshot().publishedTuple.scene).toBe(refreshed.revisions.sceneRevision);
    const revisionBeforeMissing = engine.snapshot().revisions.sceneRevision;
    expect(engine.refreshSemantic({
      targets: [{ kind: 'element', id: 'missing' }],
      recordHistory: false,
    })).toMatchObject({
      status: 'rejected',
      changed: false,
      missingTargets: ['missing'],
    });
    expect(engine.snapshot().revisions.sceneRevision).toBe(revisionBeforeMissing);
  });
});

class FeatureSurface implements PatchMapEngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  public frameCount = 0;
  public refreshCalls = 0;
  private width: number;
  private height: number;
  private pixelRatio: number;
  private selectionIds: readonly string[] = Object.freeze([]);
  private view: Readonly<{ x: number; y: number; scale: number; rotation: number }> =
    Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });
  private presentationRevision = 0;
  private presentationInput: PatchMapPresentationPolicyInput | null = null;

  public constructor(options: Pick<PatchMapSurfaceOptions, 'width' | 'height' | 'pixelRatio'>) {
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = options.pixelRatio;
  }

  public load(): void {
    this.selectionIds = Object.freeze([]);
  }

  public reconcile(): PatchMapSurfaceReconcileResult {
    return Object.freeze({
      status: 'committed',
      operationCount: 1,
      denseChanged: true,
      diagnostics: Object.freeze([]),
    });
  }

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

  public setView(view: Readonly<{ x: number; y: number; scale: number; rotation: number }>): void {
    this.view = Object.freeze({ ...view });
  }

  public select(ids: readonly string[]): void {
    this.selectionIds = Object.freeze([...ids]);
  }

  public setPresentationPolicy(
    input: PatchMapPresentationPolicyInput,
  ): PatchMapPresentationPolicyProductProbe {
    this.presentationInput = Object.freeze({
      highlightIds: input.highlightIds === null
        ? null
        : Object.freeze([...(input.highlightIds ?? [])]),
      deEmphasisAlpha: input.deEmphasisAlpha ?? 0.2,
      hiddenLayerIds: Object.freeze([...(input.hiddenLayerIds ?? [])]),
      fillOverrides: Object.freeze((input.fillOverrides ?? []).map((entry) =>
        Object.freeze({ ...entry }),
      )),
    });
    this.presentationRevision += 1;
    return this.presentationPolicyProbe();
  }

  public clearPresentationPolicy(): PatchMapPresentationPolicyProductProbe {
    if (this.presentationInput !== null) this.presentationRevision += 1;
    this.presentationInput = null;
    return this.presentationPolicyProbe();
  }

  public presentationPolicyProbe(): PatchMapPresentationPolicyProductProbe {
    const highlightIds = this.presentationInput?.highlightIds ?? null;
    const highlighted = new Set(highlightIds ?? []);
    const hidden = new Set(this.presentationInput?.hiddenLayerIds ?? []);
    const fillOverrides = this.presentationInput?.fillOverrides ?? Object.freeze([]);
    const fillById = new Map(fillOverrides.map(({ id, packedColor }) => [id, packedColor]));
    const deEmphasisAlpha = this.presentationInput?.deEmphasisAlpha ?? 1;
    return Object.freeze({
      schemaRevision: PATCH_MAP_PRESENTATION_POLICY_REVISION,
      revision: this.presentationRevision,
      status: this.presentationInput === null ? 'normal' : 'active',
      highlightIds,
      deEmphasisAlpha,
      hiddenLayerIds: this.presentationInput?.hiddenLayerIds ?? Object.freeze([]),
      fillOverrides,
      entities: Object.freeze(['item-a', 'rect-b', 'text-c', 'links'].map((id) => {
        const visible = !hidden.has(id);
        return Object.freeze({
          id,
          denseEntityIds: Object.freeze([id]),
          emphasis: highlightIds === null || highlighted.has(id) ? 1 : deEmphasisAlpha,
          visible,
          renderObjectCount: visible ? 1 : 0,
          packedFills: Object.freeze([fillById.get(id) ?? 0]),
        });
      })),
    });
  }

  public refreshSemanticTargets(
    targets: readonly PatchMapSemanticTarget[],
    options: Readonly<{ readonly strict?: boolean }> = {},
  ): PatchMapSemanticRefreshResult {
    this.refreshCalls += 1;
    const labels = targets.map(refreshLabel);
    const missingTargets = labels.filter((label) => !['item-a/label', 'links'].includes(label));
    if (options.strict === true && missingTargets.length > 0) {
      return Object.freeze({
        changed: false,
        recomputedTargets: Object.freeze([]),
        missingTargets: Object.freeze(missingTargets),
        dirtyRanges: Object.freeze([]),
        dataDiffCount: 0,
      });
    }
    const recomputedTargets = labels.filter((label) => !missingTargets.includes(label));
    const dirtyRanges: readonly SlotRange[] = recomputedTargets.length === 0
      ? Object.freeze([])
      : Object.freeze([{ start: 0, end: recomputedTargets.length }]);
    return Object.freeze({
      changed: recomputedTargets.length > 0,
      recomputedTargets: Object.freeze(recomputedTargets),
      missingTargets: Object.freeze(missingTargets),
      dirtyRanges,
      dataDiffCount: 0,
    });
  }

  public hitTestScreen(): string | null {
    return null;
  }

  public screenToWorld(point: PatchMapPoint): PatchMapPoint {
    return Object.freeze({
      x: (point.x - this.view.x) / this.view.scale,
      y: (point.y - this.view.y) / this.view.scale,
    });
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
      renderCommandCount: 4,
      visiblePrimitiveCount: 4,
    });
  }

  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.canvasCount = 0;
    return Promise.resolve(true);
  }
}

async function createEngine(
  engines: PatchMap[],
  instanceId: string,
): Promise<Readonly<{ engine: PatchMap; surface: FeatureSurface }>> {
  let surface: FeatureSurface | null = null;
  const engine = new PatchMap({
    surfaceFactory: (options) => {
      surface = new FeatureSurface(options);
      return Promise.resolve(surface);
    },
  });
  engines.push(engine);
  await engine.initialize({ instanceId, width: 800, height: 600 });
  if (surface === null) throw new Error('surface was not initialized');
  return { engine, surface };
}

function refreshLabel(target: PatchMapSemanticTarget): string {
  return target.kind === 'component' ? `${target.ownerId}/${target.id}` : target.id;
}

function rectX(engine: PatchMap): number | null {
  const rect = engine.exportDataset().find(({ id }) => id === 'rect-b');
  if (rect?.type !== 'rect') return null;
  const value = rect.attrs?.x;
  return typeof value === 'number' ? value : null;
}

function scene(): readonly unknown[] {
  return [
    {
      type: 'item',
      id: 'item-a',
      size: { width: 100, height: 80 },
      components: [{
        type: 'text',
        id: 'label',
        text: 'Status',
        style: { fontFamily: 'FiraCode', fontSize: 14 },
      }],
    },
    {
      type: 'rect',
      id: 'rect-b',
      attrs: { x: 120, y: 0 },
      size: { width: 40, height: 40 },
      fill: '#336699',
    },
    {
      type: 'text',
      id: 'text-c',
      text: 'Telemetry',
      attrs: { x: 0, y: 100 },
      style: { fontFamily: 'FiraCode', fontSize: 14 },
    },
    {
      type: 'relations',
      id: 'links',
      links: [{ source: 'item-a', target: 'rect-b' }],
    },
  ];
}
