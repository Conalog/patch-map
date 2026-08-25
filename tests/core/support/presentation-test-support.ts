import type { CoreView, SlotRange } from '../../../src/dense/contracts';
import {
  type RendererFlushResult,
  type RenderStoreView,
} from '../../../src/dense/renderer-types';
import { PatchMapRuntime, type PatchMapRuntimeOptions } from '../../../src/core';
import type { PatchMapProjectionIndex } from '../../../src/parsing/contracts';
import type {
  PatchMapRendererPresentationEntityProbe,
  PatchMapResolvedPresentationPolicy,
} from '../../../src/presentation/policy';
import type {
  PatchMapPixiInitializationMetrics,
  PatchMapPixiRenderer,
} from '../../../src/rendering/pixi-renderer';
import type {
  PatchMapRendererEntityPresentationOverride,
} from '../../../src/rendering/contracts/presentation-store';
import type {
  PatchMapPresentationLayerRenderUpdate,
} from '../../../src/core/presentation-layers';
import type {
  PatchMapRendererDebug,
  RootInteractionHandlers,
  RootPointerInput,
} from '../../../src/rendering-port';
import { materializePatchMapDataset } from '../../../src/semantic/dataset';
import { applyPatchMapAffine } from '../../../src/semantic/geometry';

class RendererTestDouble {
  public readonly strategy = 'mesh' as const;
  public readonly preference = 'webgl' as const;
  public readonly initializationMetrics: PatchMapPixiInitializationMetrics = Object.freeze({
    applicationInitMs: 0,
    rendererBuildMs: 0,
  });
  public readonly width = 800;
  public readonly height = 600;
  public readonly pixelRatio = 1;
  public readonly projectionCalls: Array<Readonly<{
    index: PatchMapProjectionIndex;
    ranges: readonly SlotRange[] | null;
    staleIds: readonly string[] | null;
  }>> = [];
  public readonly presentationPolicies: Array<PatchMapResolvedPresentationPolicy | null> = [];
  public readonly presentationOverrides: Array<ReadonlyMap<
    string,
    PatchMapRendererEntityPresentationOverride
  >> = [];
  public readonly presentationLayerUpdates: PatchMapPresentationLayerRenderUpdate[] = [];
  public destroyed = false;
  private view: CoreView = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });
  private rootInteractions: RootInteractionHandlers | null = null;
  private visibilityRevision = 0;
  private visibility: {
    chunkSize: number;
    visibleChunks: Uint8Array;
    visibleSlots: Uint8Array;
  } | null = null;

  public markChanges(): void {}
  public markOverlayChanges(): void {}

  public capturePublicationCheckpoint(): Readonly<{
    projectionCallCount: number;
    presentationPolicyCount: number;
    presentationOverrideCount: number;
    presentationLayerUpdateCount: number;
  }> {
    return Object.freeze({
      projectionCallCount: this.projectionCalls.length,
      presentationPolicyCount: this.presentationPolicies.length,
      presentationOverrideCount: this.presentationOverrides.length,
      presentationLayerUpdateCount: this.presentationLayerUpdates.length,
    });
  }

  public restorePublicationCheckpoint(checkpoint: Readonly<{
    projectionCallCount: number;
    presentationPolicyCount: number;
    presentationOverrideCount: number;
    presentationLayerUpdateCount: number;
  }>): void {
    this.projectionCalls.length = checkpoint.projectionCallCount;
    this.presentationPolicies.length = checkpoint.presentationPolicyCount;
    this.presentationOverrides.length = checkpoint.presentationOverrideCount;
    this.presentationLayerUpdates.length = checkpoint.presentationLayerUpdateCount;
  }

  public setProjection(
    index: PatchMapProjectionIndex,
    ranges?: readonly SlotRange[],
    staleIds?: ReadonlySet<string>,
  ): boolean {
    this.projectionCalls.push(Object.freeze({
      index,
      ranges: ranges === undefined ? null : Object.freeze([...ranges]),
      staleIds: staleIds === undefined ? null : Object.freeze([...staleIds].sort()),
    }));
    return true;
  }

  public setPresentationPolicy(policy: PatchMapResolvedPresentationPolicy | null): boolean {
    this.presentationPolicies.push(policy);
    return true;
  }

  public setInstancePresentationOverrides(
    overrides: ReadonlyMap<string, PatchMapRendererEntityPresentationOverride>,
  ): boolean {
    this.presentationOverrides.push(overrides);
    return true;
  }

  public setPresentationLayerMultipliers(
    update: PatchMapPresentationLayerRenderUpdate,
  ): boolean {
    this.presentationLayerUpdates.push(update);
    return true;
  }

  public presentationEntityProbe(
    entityId: string,
  ): PatchMapRendererPresentationEntityProbe {
    const packedFill = this.presentationPolicies.at(-1)?.fillOverrides
      .find(({ id }) => id === entityId)?.packedColor ?? 0;
    return Object.freeze({
      entityId,
      emphasis: 1,
      visible: true,
      renderObjectCount: 1,
      packedFill,
    });
  }

  public setWorldOrientation(): boolean { return true; }
  public resize(): boolean { return false; }
  public setView(view: CoreView): boolean {
    this.view = Object.freeze({ ...view });
    return true;
  }
  public setVisibleSlots(slots: readonly number[]): void {
    const maximum = Math.max(0, ...slots);
    const visibleChunks = new Uint8Array(maximum + 1);
    const visibleSlots = new Uint8Array(maximum + 1);
    for (const slot of slots) {
      visibleChunks[slot] = 1;
      visibleSlots[slot] = 1;
    }
    this.visibility = { chunkSize: 1, visibleChunks, visibleSlots };
    this.visibilityRevision += 1;
  }
  public prepareBarPresentationVisibility(): Readonly<{
    revision: number;
    visibility: {
      chunkSize: number;
      visibleChunks: Uint8Array;
      visibleSlots: Uint8Array;
    } | null;
  }> {
    return { revision: this.visibilityRevision, visibility: this.visibility };
  }
  public flush(_store: RenderStoreView): RendererFlushResult {
    return Object.freeze({ rendered: true, commandCount: 1 });
  }
  public synchronizeNextFlush(): void {}
  public prepareGpu(): Promise<void> { return Promise.resolve(); }
  public bindSceneAsset(key: string): Promise<Readonly<{
    key: string;
    generation: number;
    status: 'attached';
    cacheIdentity: string;
    normalizedResourceIdentity: string;
    reusedResolvedResource: boolean;
    naturalSize: readonly [number, number];
  }>> {
    return Promise.resolve(Object.freeze({
      key,
      generation: 1,
      status: 'attached' as const,
      cacheIdentity: key,
      normalizedResourceIdentity: key,
      reusedResolvedResource: false,
      naturalSize: Object.freeze([24, 24] as const),
    }));
  }
  public unbindSceneAsset(): Promise<boolean> { return Promise.resolve(true); }
  public sceneAssetBindingProbe(): null { return null; }
  public sceneImageProbe(): null { return null; }
  public loadAsset(): Promise<void> { return Promise.resolve(); }
  public unloadAsset(): Promise<boolean> { return Promise.resolve(false); }
  public finalizeAssetUnloads(): Promise<void> { return Promise.resolve(); }
  public captureBase64(): Promise<string> { return Promise.resolve('data:image/png;base64,'); }
  public bindRootInteractions(handlers: RootInteractionHandlers): () => void {
    this.rootInteractions = handlers;
    return () => {
      if (this.rootInteractions === handlers) this.rootInteractions = null;
    };
  }
  public dispatchRootPointer(
    type: RootPointerInput['type'],
    screenX: number,
    screenY: number,
    pointerId: number,
    button: number,
  ): void {
    if (this.rootInteractions === null) throw new Error('root interactions are not bound');
    this.rootInteractions.pointer(Object.freeze({
      type,
      screenX,
      screenY,
      pointerId,
      pointerType: 'mouse',
      button,
      buttons: type === 'down' || type === 'move' ? 1 : 0,
      timeMs: 0,
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
    }));
  }
  public debugSnapshot(): PatchMapRendererDebug {
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
  public whenDestroyed(): Promise<void> { return Promise.resolve(); }
}

export function createTestCore(allocated: PatchMapRuntime[]): Readonly<{
  core: PatchMapRuntime;
  renderer: RendererTestDouble;
}> {
  const renderer = new RendererTestDouble();
  const TestPatchMap = PatchMapRuntime as unknown as new (
    renderer: PatchMapPixiRenderer,
    options: PatchMapRuntimeOptions,
  ) => PatchMapRuntime;
  const core = new TestPatchMap(renderer as unknown as PatchMapPixiRenderer, { autoRender: false });
  allocated.push(core);
  return { core, renderer };
}

export function scene(height: number, animation = true): readonly unknown[] {
  return [{
    type: 'item',
    id: 'item-a',
    size: { width: 100, height: 80 },
    components: [{
      type: 'bar',
      id: 'level',
      source: { type: 'rect', fill: '#336699' },
      size: { width: 60, height },
      placement: 'bottom',
      animation,
      animationDuration: 200,
    }],
  }];
}

export function gridScene(height: number): readonly unknown[] {
  return [{
    type: 'grid',
    id: 'grid-a',
    cells: [[1, 1], [1, 0]],
    gap: 4,
    item: {
      size: { width: 100, height: 80 },
      components: [{
        type: 'bar',
        id: 'level',
        source: { type: 'rect', fill: '#336699' },
        size: { width: 60, height },
        placement: 'bottom',
        animation: true,
        animationDuration: 200,
      }],
    },
  }];
}

export function gridSceneExpanded(height: number): readonly unknown[] {
  return [{
    type: 'grid',
    id: 'grid-a',
    cells: [[1, 1], [1, 1]],
    gap: 4,
    item: {
      size: { width: 100, height: 80 },
      components: [{
        type: 'bar',
        id: 'level',
        source: { type: 'rect', fill: '#336699' },
        size: { width: 60, height },
        placement: 'bottom',
        animation: true,
        animationDuration: 200,
      }],
    },
  }];
}

export function gridPresentationScene(): readonly unknown[] {
  return materializePatchMapDataset([{
    type: 'grid',
    id: 'grid-presentation',
    cells: [[1, 1]],
    item: {
      size: { width: 100, height: 80 },
      components: [
        {
          type: 'background',
          id: 'surface',
          source: { type: 'rect', fill: '#111827', radius: 2 },
          tint: '#ffffff',
        },
        {
          type: 'bar',
          id: 'level',
          source: { type: 'rect', fill: '#ffffff' },
          size: { width: 60, height: 20 },
          placement: 'bottom',
          tint: '#7c3aed',
        },
        {
          type: 'icon',
          id: 'status',
          source: 'offline',
          size: { width: 24, height: 24 },
          placement: 'center',
          tint: '#ffffff',
          show: false,
        },
        {
          type: 'text',
          id: 'label',
          text: '0\n%',
          placement: 'center',
          margin: 2,
          tint: '#e5e7eb',
          style: { fontSize: 14, align: 'center' },
          show: false,
        },
      ],
    },
  }]).dataset;
}

export function transformedBarScene(
  height: number,
  placement: 'top' | 'bottom' | 'center' | 'left-bottom' | 'right',
): readonly unknown[] {
  return [{
    type: 'item',
    id: 'item-a',
    size: { width: 100, height: 80 },
    attrs: { x: 60, y: 30, angle: 37, scaleX: -1, scaleY: 1.25 },
    components: [{
      type: 'bar',
      id: 'level',
      source: { type: 'rect', fill: '#336699' },
      size: { width: 60, height },
      placement,
      animation: true,
      animationDuration: 200,
    }],
  }];
}

export function panelScene(): readonly unknown[] {
  return [{
    type: 'item',
    id: 'item-a',
    size: { width: 100, height: 80 },
    components: [
      {
        type: 'background',
        id: 'bg',
        source: { type: 'rect', fill: '#336699' },
      },
      {
        type: 'bar',
        id: 'level',
        source: { type: 'rect', fill: '#336699' },
        size: { width: 60, height: 20 },
      },
    ],
  }];
}

export function percentScene(itemHeight: number): readonly unknown[] {
  return [{
    type: 'item',
    id: 'item-a',
    size: { width: 100, height: itemHeight },
    components: [{
      type: 'bar',
      id: 'level',
      source: { type: 'rect', fill: '#336699' },
      size: { width: 60, height: '25%' },
      placement: 'bottom',
      animation: true,
      animationDuration: 200,
    }],
  }];
}

export function twoBarScene(firstHeight: number, secondHeight: number): readonly unknown[] {
  return [{
    type: 'item',
    id: 'item-a',
    size: { width: 100, height: 80 },
    components: [
      {
        type: 'bar',
        id: 'first',
        source: { type: 'rect', fill: '#336699' },
        size: { width: 60, height: firstHeight },
        placement: 'bottom',
        animation: true,
        animationDuration: 200,
      },
      {
        type: 'bar',
        id: 'second',
        source: { type: 'rect', fill: '#663399' },
        size: { width: 60, height: secondHeight },
        placement: 'top',
        animation: true,
        animationDuration: 200,
      },
    ],
  }];
}

export function bottomLeft(index: PatchMapProjectionIndex, entityId: string): readonly [number, number] {
  const projection = index.byEntityId[entityId];
  if (projection === undefined) throw new Error(`missing ${entityId}`);
  return applyPatchMapAffine(projection.affine, [0, projection.localBounds[3]]);
}

export function nonIdentityMultipliers(
  update: PatchMapPresentationLayerRenderUpdate,
): readonly number[] {
  return Array.from(update.alphaMultipliers).filter((value) => !Object.is(value, 1));
}

export function roundGeometry(value: unknown): unknown {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value * 1e12) / 1e12 : value;
  }
  if (Array.isArray(value)) return value.map(roundGeometry);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, roundGeometry(entry)]),
    );
  }
  return value;
}
