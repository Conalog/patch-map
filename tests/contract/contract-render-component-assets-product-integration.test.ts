import normalizedExpectedCatalog from '../../contracts/evidence/catalog-normalized-expected.v1.json';
import {
  describe,
  expect,
  it,
  vi } from 'vitest';

import { createTestProjectionIndex } from '../support/projection-index';

// @ts-expect-error -- the independent comparator is an authored ESM JavaScript module.
import * as compareModule from '../../verification/contract/compare.mjs';

import { createPatchMapExecutableLabBridge } from '../../lab/contract/executable-bridge';
import { materializePatchMapExecutableCase } from '../../lab/contract/executable-cases';
import { resolvePatchMapExecutableRuntime } from '../../lab/contract/executable-runtime';
import type { CoreView,
  SlotRange } from '../../src/dense/contracts';
import type { RendererFlushResult,
  RenderStoreView } from '../../src/dense/renderer-types';
import { PatchMapRuntime,
  type PatchMapRuntimeOptions } from '../../src/core';
import type { PatchMapPresentationLayerRenderUpdate } from '../../src/presentation/layer-contracts';
import {
  type PatchMapEngineSurface,
  type PatchMapEngineSurfaceFactory,
  type PatchMapSurfaceOptions,
  } from '../../src/engine';
import { PixiEngineSurface } from '../../src/composition/pixi-engine-surface';
import { AggregateLeafLayer } from '../../src/rendering/leaf-layer';
import { AggregateMeshLayer } from '../../src/rendering/mesh-layer';
import type {
  PatchMapPixiInitializationMetrics,
  PatchMapPixiRenderer,
  } from '../../src/rendering/pixi-renderer';
import type { PatchMapRendererEntityPresentationOverride } from '../../src/rendering/contracts/presentation-store';
import type {
  PatchMapRenderLaneProbe,
  PatchMapRenderLaneRole,
  PatchMapRenderLaneSnapshot,
  PatchMapRendererDebug,
  RootInteractionHandlers,
} from '../../src/rendering-port';
import type {
  PatchMapProjectionRenderContext,
  PatchMapWorldOrientation,
} from '../../src/geometry/render-quads';

import type { PatchMapProjectionIndex } from '../../src/parsing/contracts';

type CaseId = 'REN-008' | 'REN-010';

interface ExpectedCase {
  readonly id: string;
  readonly caseType: string;
  readonly expected: Readonly<{
    readonly assertions: readonly Readonly<{ readonly path: string }> [];
  }>;
  readonly volatileFields: readonly string[];
}

interface ComparisonResult {
  readonly passed: number;
  readonly failed: number;
  readonly comparisonSha256: string;
  readonly assertions: readonly Readonly<{
    readonly path: string;
    readonly passed: boolean;
  }>[];
}

interface CompareRuntime {
  compareObservation(
    this: void,
    options: Readonly<{
      expectedCase: ExpectedCase;
      actual: Readonly<Record<string, unknown>>;
      fixtures: Readonly<Record<string, unknown>>;
      captures: Readonly<Record<string, unknown>>;
    }>,
  ): ComparisonResult;
}

const { compareObservation } = compareModule as unknown as CompareRuntime;
const CASES = Object.freeze([
  Object.freeze({ caseId: 'REN-008' as const, actionCount: 4, assertionCount: 9 }),
  Object.freeze({ caseId: 'REN-010' as const, actionCount: 3, assertionCount: 11 }),
]);

describe('PatchMap REN-008 / REN-010 executable product integration', () => {
  it.each(CASES)(
    'executes $caseId through the canonical bridge, Engine, Pixi Texture/Sprite lane, and exact fold',
    async ({ caseId, actionCount, assertionCount }) => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      const surfaces: PatchMapEngineSurface[] = [];
      const renderers: HeadlessComponentAssetRenderer[] = [];
      const surfaceFactory = createHeadlessSurfaceFactory(surfaces, renderers);
      const bridge = createPatchMapExecutableLabBridge({
        caseId,
        rootTestId: `scenario-${caseId.toLowerCase()}`,
        size: '100',
        seed: 319,
        surfaceFactory,
        environment: {
          browser: 'vitest-headless-pixi',
          browserVersion: 'unit',
          os: 'unit',
          backend: 'webgl2',
          routeSize: '100',
        },
      });

      try {
        const descriptor = resolvePatchMapExecutableRuntime(caseId);
        expect(descriptor).toMatchObject({
          key: 'render-component-assets',
          needsSupplementalWebGLLease: false,
        });
        const detachedRun = descriptor.createRun(
          materializePatchMapExecutableCase(caseId, '100', 319),
        );
        expect(detachedRun.engineOptions.assetRuntime).toBeDefined();
        expect(detachedRun.engineOptions.assetPolicy).toEqual(expect.any(Function));
        expect(detachedRun.postDestroyProductProbe).toEqual(expect.any(Function));

        const first = await bridge.runCase();
        const second = await bridge.repeatCase();
        const expectedCase = normalizedExpectedCatalog.cases.find(({ id }) => id === caseId);
        if (expectedCase === undefined) throw new Error(`Missing approved ${caseId} expected record`);
        const comparisonDigests: string[] = [];

        for (const run of [first, second]) {
          expect(run.execution).toMatchObject({
            caseId,
            status: 'completed',
            cleanup: { status: 'completed', errors: [] },
          });
          expect(run.execution.actionResults).toHaveLength(actionCount);
          const executionCleanup = requireRecord(run.execution.cleanup, `${caseId} cleanup`);
          const productResources = requireRecord(
            executionCleanup.productResources,
            `${caseId} product cleanup`,
          );
          expect(run.cleanup.productResources).toBe(productResources);
          expect(executionCleanup.releases).toHaveLength(1);
          expect(executionCleanup).not.toHaveProperty('supplementalWebGLLease');
          expect(countText(
            JSON.stringify(run.execution),
            'patch-map-component-assets-product-cleanup/1',
          )).toBe(1);
          expect(productResources).toMatchObject({
            revision: 'patch-map-component-assets-product-cleanup/1',
            caseId,
            runtimeCounts: zeroRuntimeCounts(),
            backendCounts: {
              pendingRequestCount: 0,
              resolvedLiveResourceCount: 0,
              retainedLeaseCount: 0,
              pendingReleaseCount: 0,
            },
            controllerCounts: {
              targetCount: 0,
              bindingCount: 0,
              pendingSettlementCount: 0,
              pendingReleaseCount: 0,
              staleAttachmentCount: 0,
            },
          });
          expect(run.actualObservation).toMatchObject({
            case: { id: caseId, params: { size: '100', seed: 319 } },
            resources: {
              retainedDelta: {
                executor: { canvasCount: 0, subscriptions: 0, pendingWork: 0 },
                runtime: zeroRuntimeCounts(),
              },
            },
          });
          expect(isFiniteNumber(
            requireRecord(run.actualObservation.scene, `${caseId} scene`).revision,
          )).toBe(true);
          expect(isFiniteNumber(
            requireRecord(run.actualObservation.geometry, `${caseId} geometry`).finiteValueCount,
          )).toBe(true);
          expect(isFiniteNumber(
            requireRecord(run.actualObservation.paint, `${caseId} paint`).commandCount,
          )).toBe(true);
          assertCaseProjection(caseId, run.actualObservation, run.captures);
          expect(journalEvents(productResources)).toContain('backend-texture-resolved');
          expect(journalEvents(productResources)).toContain('post-destroy-resource-drain');

          const comparison = compareObservation({
            expectedCase: expectedCase as unknown as ExpectedCase,
            actual: run.actualObservation,
            fixtures: run.fixtures,
            captures: run.captures,
          });
          expect(expectedCase.expected.assertions).toHaveLength(assertionCount);
          expect(comparison).toMatchObject({ passed: assertionCount, failed: 0 });
          expect(comparison.assertions.every(({ passed }) => passed)).toBe(true);
          comparisonDigests.push(comparison.comparisonSha256);
        }

        expect(JSON.stringify(second.actualObservation)).toBe(JSON.stringify(first.actualObservation));
        expect(comparisonDigests[1]).toBe(comparisonDigests[0]);
        expect(surfaces).toHaveLength(2);
        expect(surfaces.every(({ destroyed, canvasCount }) => destroyed && canvasCount === 0)).toBe(true);
        expect(renderers).toHaveLength(2);
        expect(renderers.every(({ preference }) => preference === 'webgl')).toBe(true);
        expect(renderers.every(({ sawSprite, maxImageCount }) => sawSprite && maxImageCount === 1)).toBe(true);
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(await bridge.destroyCase()).toMatchObject({
          status: 'completed',
          runCount: 2,
          completedRunCount: 2,
          releasedEngineCount: 1,
          retainedCanvasCount: 0,
          retainedSubscriptionCount: 0,
          retainedPendingWork: 0,
        });
      } finally {
        await bridge.destroyCase();
        vi.unstubAllGlobals();
      }
    },
  );
});

function createHeadlessSurfaceFactory(
  surfaces: PatchMapEngineSurface[],
  renderers: HeadlessComponentAssetRenderer[],
): PatchMapEngineSurfaceFactory {
  return (options) => {
    const renderer = new HeadlessComponentAssetRenderer(options);
    const TestPatchMap = PatchMapRuntime as unknown as new (
      rendererValue: PatchMapPixiRenderer,
      coreOptions: PatchMapRuntimeOptions,
    ) => PatchMapRuntime;
    const core = new TestPatchMap(renderer as unknown as PatchMapPixiRenderer, {
      autoRender: false,
    });
    const surface = new PixiEngineSurface(core);
    renderers.push(renderer);
    surfaces.push(surface);
    return Promise.resolve(surface);
  };
}

class HeadlessComponentAssetRenderer {
  public readonly strategy = 'mesh' as const;
  public readonly preference = 'webgl' as const;
  public readonly initializationMetrics: PatchMapPixiInitializationMetrics = Object.freeze({
    applicationInitMs: 0,
    rendererBuildMs: 0,
  });
  public width: number;
  public height: number;
  public pixelRatio: number;
  public maxImageCount = 0;
  public sawSprite = false;

  private readonly leaves: AggregateLeafLayer;
  private readonly aggregate = new AggregateMeshLayer({
    label: 'PatchMap component assets executable integration mesh',
    applyStoreView: false,
  });
  private projection: PatchMapProjectionIndex = createTestProjectionIndex();
  private projectionRevision = 0;
  private presentationOverrides: ReadonlyMap<
    string,
    PatchMapRendererEntityPresentationOverride
  > = new Map();
  private presentationLayerUpdate: PatchMapPresentationLayerRenderUpdate | null = null;
  private view: CoreView = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });
  private world: PatchMapWorldOrientation = Object.freeze({
    rotationDegrees: 0,
    flipX: false,
    flipY: false,
  });
  private cleanup: Promise<void> = Promise.resolve();
  private destroyedValue = false;
  private frame = 0;

  public constructor(options: PatchMapSurfaceOptions) {
    if (!options.assetSession) throw new Error('component asset surface requires an asset session');
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = options.pixelRatio;
    this.leaves = new AggregateLeafLayer(options.assetSession, false);
  }

  public markChanges(_ranges: readonly SlotRange[], _reason: string): void {}
  public markOverlayChanges(): void {}
  public capturePublicationCheckpoint(): Readonly<{
    projection: PatchMapProjectionIndex;
    projectionRevision: number;
    presentationOverrides: ReadonlyMap<string, PatchMapRendererEntityPresentationOverride>;
    presentationLayerUpdate: PatchMapPresentationLayerRenderUpdate | null;
  }> {
    return Object.freeze({
      projection: this.projection,
      projectionRevision: this.projectionRevision,
      presentationOverrides: this.presentationOverrides,
      presentationLayerUpdate: this.presentationLayerUpdate,
    });
  }
  public restorePublicationCheckpoint(checkpoint: Readonly<{
    projection: PatchMapProjectionIndex;
    projectionRevision: number;
    presentationOverrides: ReadonlyMap<string, PatchMapRendererEntityPresentationOverride>;
    presentationLayerUpdate: PatchMapPresentationLayerRenderUpdate | null;
  }>): void {
    this.projection = checkpoint.projection;
    this.projectionRevision = checkpoint.projectionRevision;
    this.presentationOverrides = checkpoint.presentationOverrides;
    this.presentationLayerUpdate = checkpoint.presentationLayerUpdate;
  }
  public setProjection(projection: PatchMapProjectionIndex): boolean {
    if (projection === this.projection) return false;
    this.projection = projection;
    this.projectionRevision += 1;
    return true;
  }
  public setInstancePresentationOverrides(
    overrides: ReadonlyMap<string, PatchMapRendererEntityPresentationOverride>,
  ): boolean {
    this.presentationOverrides = overrides;
    return true;
  }
  public setPresentationLayerMultipliers(
    update: PatchMapPresentationLayerRenderUpdate,
  ): boolean {
    this.presentationLayerUpdate = update;
    return true;
  }
  public setWorldOrientation(world: PatchMapWorldOrientation): boolean {
    this.world = Object.freeze({ ...world });
    return true;
  }
  public resize(width: number, height: number, pixelRatio: number): boolean {
    const changed = width !== this.width || height !== this.height || pixelRatio !== this.pixelRatio;
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    return changed;
  }
  public setView(view: CoreView): boolean {
    this.view = Object.freeze({ ...view });
    return true;
  }
  public flush(store: RenderStoreView): RendererFlushResult {
    const aggregate = this.aggregate.sync(store, {
      fullRebuildEpoch: 1,
      projectionContext: this.projectionContext(),
    });
    const debug = this.leaves.sync(store, {
      fullRebuildEpoch: 1,
      projectionContext: this.projectionContext(),
    });
    this.leaves.confirmRenderedFrame();
    this.frame += 1;
    this.maxImageCount = Math.max(this.maxImageCount, debug.imageCount);
    for (const entityId of store.ids) {
      if (entityId && this.leaves.entityPaintProbe(entityId)?.rendererKind === 'sprite') {
        this.sawSprite = true;
      }
    }
    return Object.freeze({
      rendered: true,
      commandCount: aggregate.meshCount
        + debug.imageCount
        + debug.bitmapTextCount
        + debug.fallbackTextCount,
    });
  }
  public synchronizeNextFlush(): void {}
  public prepareGpu(): Promise<void> { return Promise.resolve(); }
  public loadAsset(alias: string, url: string): Promise<void> {
    return this.leaves.loadAsset(alias, url);
  }
  public unloadAsset(alias: string): Promise<boolean> { return this.leaves.unloadAsset(alias); }
  public finalizeAssetUnloads(): Promise<void> { return this.leaves.finalizeAssetUnloads(); }
  public bindSceneAsset = this.bindLeafAsset.bind(this);
  public unbindSceneAsset(key: string) { return this.leaves.unbindSceneAsset(key); }
  public sceneAssetBindingProbe(key: string) { return this.leaves.sceneAssetBindingProbe(key); }
  public sceneImageProbe(entityId: string) { return this.leaves.sceneImageProbe(entityId); }
  public entityPaintProbe(entityId: string) {
    return this.leaves.entityPaintProbe(entityId) ?? this.aggregate.entityPaintProbe(entityId);
  }
  public renderLaneProbe(): PatchMapRenderLaneSnapshot {
    const leaves = this.leaves.renderLaneProbe();
    const aggregate = this.aggregate.renderLaneProbe();
    return Object.freeze({
      'background-geometry': aggregate.backgroundGeometry,
      'background-assets': leaves.backgroundAssets,
      'ordinary-geometry': aggregate.ordinaryGeometry,
      'relations-dynamic': aggregate.relationsDynamic,
      'content-assets': leaves.contentAssets,
      text: leaves.text,
      'interaction-overlay': emptyLane('interaction-overlay'),
    });
  }
  public captureBase64(): Promise<string> { return Promise.resolve('data:image/png;base64,'); }
  public bindRootInteractions(_handlers: RootInteractionHandlers): () => void {
    return () => undefined;
  }
  public debugSnapshot(): PatchMapRendererDebug {
    const leaves = this.leaves.debugSnapshot();
    return Object.freeze({
      strategy: this.strategy,
      backend: 'webgl',
      frame: this.frame,
      storeEpoch: 1,
      entityCount: 0,
      aggregateRenderObjects: leaves.imageCount + leaves.bitmapTextCount + leaves.fallbackTextCount,
      visiblePrimitives: leaves.imageCount,
      uploadedChunks: 0,
      uploadedBytes: 0,
      dynamicFullUploadCount: 0,
      staticInvalidatedUploadCount: 0,
      particleFullUploadCount: 0,
      uploadObservation: 'dirty-chunk-bytes',
      bitmapTextCount: leaves.bitmapTextCount,
      fallbackTextCount: leaves.fallbackTextCount,
      imageCount: leaves.imageCount,
      loadedAssetCount: leaves.loadedAssetCount,
      unresolvedAssetCount: leaves.unresolvedAssetCount,
      view: this.view,
      lastInvalidation: 'component-assets-executable-integration',
      destroyed: this.destroyedValue,
    });
  }
  public destroy(): boolean {
    if (this.destroyedValue) return false;
    this.destroyedValue = true;
    this.aggregate.destroy();
    this.cleanup = this.leaves.destroy();
    return true;
  }
  public whenDestroyed(): Promise<void> { return this.cleanup; }

  private bindLeafAsset(
    key: Parameters<AggregateLeafLayer['bindSceneAsset']>[0],
    request: Parameters<AggregateLeafLayer['bindSceneAsset']>[1],
  ) {
    return this.leaves.bindSceneAsset(key, request);
  }

  private projectionContext(): PatchMapProjectionRenderContext {
    return Object.freeze({
      index: this.projection,
      revision: this.projectionRevision,
      world: this.world,
    });
  }
}

function assertCaseProjection(
  caseId: CaseId,
  actual: Readonly<Record<string, unknown>>,
  captures: Readonly<Record<string, unknown>>,
): void {
  if (caseId === 'REN-008') {
    expect(actual).toMatchObject({
      scene: {
        hidden: { renderObjectCount: 0 },
        shown: { id: 'bg' },
      },
      paint: {
        background: {
          visibleBounds: [0, 0, 100, 80],
          source: 'fixture-image',
          staleTextureCount: 0,
        },
      },
    });
    expect(captures).toEqual({ initial: { id: 'bg' } });
    return;
  }
  expect(actual).toMatchObject({
    paint: {
      icon: {
        bounds: { width: 40, height: 15, right: 87, top: 12 },
        source: 'fixture-icon-2',
        tint: '#00ff00ff',
        staleTextureCount: 0,
      },
    },
  });
  expect(captures).toEqual({});
}

function emptyLane(role: PatchMapRenderLaneRole): PatchMapRenderLaneProbe {
  return Object.freeze({
    role,
    label: `patch-map:${role}`,
    renderObjectCount: 0,
    visiblePrimitiveCount: 0,
  });
}

function journalEvents(value: Readonly<Record<string, unknown>>): readonly string[] {
  if (!Array.isArray(value.journal)) throw new Error('Missing component asset cleanup journal');
  return value.journal.map((entry) => {
    const record = requireRecord(entry, 'component asset cleanup journal entry');
    if (typeof record.event !== 'string') throw new Error('Missing component asset journal event');
    return record.event;
  });
}

function zeroRuntimeCounts(): Readonly<Record<string, number>> {
  return {
    canvasCount: 0,
    subscriptionCount: 0,
    pendingWorkCount: 0,
    bindingCount: 0,
    resourceCount: 0,
    leaseCount: 0,
    pendingSettlementCount: 0,
    pendingReleaseCount: 0,
    staleAttachmentCount: 0,
    rendererObjectCount: 0,
    cleanupFailureCount: 0,
  };
}

function countText(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function requireRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}
