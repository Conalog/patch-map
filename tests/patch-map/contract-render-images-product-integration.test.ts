import normalizedExpectedCatalog from '../../docs/reference/core-v2-functional-contract/evidence/catalog-normalized-expected.v1.json';
import { describe, expect, it } from 'vitest';

// @ts-expect-error -- the independent comparator is an authored ESM JavaScript module.
import * as compareModule from '../../scripts/verification/core-v2-contract/compare.mjs';

import { createPatchMapExecutableLabBridge } from '../../lab/patch-map/contract/executable-bridge';
import type { CoreView, SlotRange } from '../../src/patch-map/dense/contracts';
import type { RendererFlushResult, RenderStoreView } from '../../src/patch-map/dense/renderer-types';
import { PatchMapRuntime, type PatchMapRuntimeOptions } from '../../src/patch-map/core';
import {
  PixiEngineSurface,
  type PatchMapEngineSurface,
  type PatchMapEngineSurfaceFactory,
  type PatchMapSurfaceOptions,
} from '../../src/patch-map/engine';
import { AggregateLeafLayer } from '../../src/patch-map/renderers/leaf-layer';
import type {
  PatchMapPixiInitializationMetrics,
  PatchMapPixiRenderer,
} from '../../src/patch-map/renderers/pixi-renderer';
import type {
  PatchMapProjectionRenderContext,
  PatchMapWorldOrientation,
  PatchMapPixiRendererDebug,
  RootInteractionHandlers,
} from '../../src/patch-map/renderers/types';
import type { PatchMapProjectionIndex } from '../../src/patch-map/contracts';

interface ExpectedCase {
  readonly id: string;
  readonly caseType: string;
  readonly expected: Readonly<{
    readonly assertions: readonly Readonly<{ readonly path: string }>[];
  }>;
  readonly volatileFields: readonly string[];
}

interface ComparisonResult {
  readonly passed: number;
  readonly failed: number;
  readonly stableActualSha256: string;
  readonly comparisonSha256: string;
  readonly assertions: readonly Readonly<{
    readonly path: string;
    readonly passed: boolean;
    readonly failure: Readonly<{ readonly code: string }> | null;
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
const IMMUTABLE_PARENT_CONFLICTS = [
  '/resources/images/alias',
  '/resources/images/data-uri',
  '/resources/images/url',
] as const;

class HeadlessLeafRenderer {
  public readonly strategy = 'mesh' as const;
  public readonly preference = 'webgl' as const;
  public readonly initializationMetrics: PatchMapPixiInitializationMetrics = Object.freeze({
    applicationInitMs: 0,
    rendererBuildMs: 0,
  });
  public width: number;
  public height: number;
  public pixelRatio: number;

  private readonly leaves: AggregateLeafLayer;
  private projection: PatchMapProjectionIndex = Object.freeze({ byEntityId: Object.freeze({}) });
  private projectionRevision = 0;
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
    if (!options.assetSession) throw new Error('REN-005 headless surface requires an asset session');
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = options.pixelRatio;
    this.leaves = new AggregateLeafLayer(options.assetSession, false);
  }

  public markChanges(_ranges: readonly SlotRange[], _reason: string): void {}
  public markOverlayChanges(): void {}
  public setProjection(projection: PatchMapProjectionIndex): boolean {
    if (this.projection === projection) return false;
    this.projection = projection;
    this.projectionRevision += 1;
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
    const debug = this.leaves.sync(store, {
      fullRebuildEpoch: 1,
      projectionContext: this.projectionContext(),
    });
    this.leaves.confirmRenderedFrame();
    this.frame += 1;
    return Object.freeze({
      rendered: true,
      commandCount: debug.imageCount + debug.bitmapTextCount + debug.pixiTextCount,
    });
  }
  public synchronizeNextFlush(): void {}
  public prepareGpu(): Promise<void> { return Promise.resolve(); }
  public loadAsset(alias: string, url: string): Promise<void> {
    return this.leaves.loadAsset(alias, url);
  }
  public unloadAsset(alias: string): Promise<boolean> { return this.leaves.unloadAsset(alias); }
  public finalizeAssetUnloads(): Promise<void> { return this.leaves.finalizeAssetUnloads(); }
  public bindSceneAsset = this.leavesBind.bind(this);
  public unbindSceneAsset(key: string) { return this.leaves.unbindSceneAsset(key); }
  public sceneAssetBindingProbe(key: string) { return this.leaves.sceneAssetBindingProbe(key); }
  public sceneImageProbe(entityId: string) { return this.leaves.sceneImageProbe(entityId); }
  public captureBase64(): Promise<string> { return Promise.resolve('data:image/png;base64,'); }
  public bindRootInteractions(_handlers: RootInteractionHandlers): () => void {
    return () => undefined;
  }
  public debugSnapshot(): PatchMapPixiRendererDebug {
    const leaves = this.leaves.debugSnapshot();
    return Object.freeze({
      strategy: this.strategy,
      backend: 'webgl',
      frame: this.frame,
      storeEpoch: 1,
      entityCount: 0,
      aggregateRenderObjects: leaves.imageCount + leaves.bitmapTextCount + leaves.pixiTextCount,
      visiblePrimitives: 0,
      uploadedChunks: 0,
      uploadedBytes: 0,
      dynamicFullUploadCount: 0,
      staticInvalidatedUploadCount: 0,
      particleFullUploadCount: 0,
      uploadObservation: 'dirty-chunk-bytes',
      bitmapTextCount: leaves.bitmapTextCount,
      pixiTextCount: leaves.pixiTextCount,
      imageCount: leaves.imageCount,
      loadedAssetCount: leaves.loadedAssetCount,
      unresolvedAssetCount: leaves.unresolvedAssetCount,
      view: this.view,
      lastInvalidation: 'headless-ren-005',
      destroyed: this.destroyedValue,
    });
  }
  public destroy(): boolean {
    if (this.destroyedValue) return false;
    this.destroyedValue = true;
    this.cleanup = this.leaves.destroy();
    return true;
  }
  public whenDestroyed(): Promise<void> { return this.cleanup; }

  private leavesBind(
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

describe('PatchMap REN-005 product integration', () => {
  it('executes the exact handler and fold through Core, Engine, Pixi Texture, Sprite, and asset leases', async () => {
    const surfaces: PatchMapEngineSurface[] = [];
    const surfaceFactory: PatchMapEngineSurfaceFactory = (options) => {
      const renderer = new HeadlessLeafRenderer(options);
      const TestPatchMap = PatchMapRuntime as unknown as new (
        renderer: PatchMapPixiRenderer,
        coreOptions: PatchMapRuntimeOptions,
      ) => PatchMapRuntime;
      const core = new TestPatchMap(renderer as unknown as PatchMapPixiRenderer, {
        autoRender: false,
      });
      const surface = new PixiEngineSurface(core);
      surfaces.push(surface);
      return Promise.resolve(surface);
    };
    const bridge = createPatchMapExecutableLabBridge({
      caseId: 'REN-005',
      rootTestId: 'scenario-ren-005',
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

    const first = await bridge.runCase();
    const second = await bridge.repeatCase();
    const expectedCase = normalizedExpectedCatalog.cases.find(({ id }) => id === 'REN-005');
    if (expectedCase === undefined) throw new Error('Missing approved REN-005 expected record');
    const comparisonDigests: string[] = [];

    for (const run of [first, second]) {
      expect(run.execution).toMatchObject({
        caseId: 'REN-005',
        status: 'completed',
        cleanup: { status: 'completed', errors: [] },
      });
      expect(run.execution.actionResults).toHaveLength(4);
      expect(run.actualObservation).toMatchObject({
        case: { id: 'REN-005', params: { size: '100', seed: 319 } },
        scene: {
          images: {
            'data-uri': { zIndex: 3 },
            transformed: { zIndex: 4 },
            'hidden-image': { renderObjectCount: 0 },
          },
        },
        geometry: {
          images: {
            'data-uri': { worldBounds: [100, 120, 16, 8] },
            transformed: { worldBounds: [145, 115, 10, 20] },
            'failed-image': { placeholderBounds: [220, 40, 32, 32] },
          },
        },
        paint: {
          images: {
            'data-uri': { opacity: 0.5 },
            'hidden-image': { opacity: 0.25 },
            'failed-image': { role: 'asset-placeholder' },
          },
        },
        interaction: {
          images: {
            'hidden-image': { hit: false },
            'failed-image': { hitProbe: { point: [236, 56], target: 'failed-image' } },
          },
        },
        outcome: { images: { 'failed-image': { diagnosticCount: 1 } } },
        resources: {
          images: {
            alias: { bounds: [0, 0, 80, 40], state: 'resolved' },
            url: { bounds: { width: 64 }, state: 'resolved' },
            descriptor: {
              source: 'fixture-image',
              staleAttachCount: 0,
              hitBounds: [0, 0, 32, 32],
              initial: { state: 'resolved' },
            },
            'data-uri': { sourceKind: 'data-uri', state: 'resolved' },
            transformed: { reusedResolvedResource: true, state: 'resolved' },
          },
          abandonedRequests: {
            pendingSettlementCount: 0,
            pendingReleaseCount: 0,
            staleAttachmentCount: 0,
            controlledOldRequest: {
              pendingCount: 0,
              leaseCount: 0,
              liveResourceCount: 0,
              nonStaleAttachmentCount: 0,
            },
            postDestroy: {
              resourceCount: 0,
              pendingCount: 0,
              leaseCount: 0,
              cleanupPendingCount: 0,
              backendPendingCount: 0,
              backendResolvedLiveResourceCount: 0,
            },
          },
        },
      });
      const executionCleanup = run.execution.cleanup;
      if (!isRecord(executionCleanup)) throw new Error('Missing REN-005 cleanup');
      expect(run.cleanup.productResources).toBe(executionCleanup.productResources);
      expect(executionCleanup.productResources).toMatchObject({
        revision: 'core-v2-ren-005-product-cleanup/1',
        assetRuntime: {
          resourceCount: 0,
          pendingCount: 0,
          leaseCount: 0,
          cleanupPendingCount: 0,
        },
        backend: {
          requestCount: 5,
          pendingCount: 0,
          resolvedLiveResourceCount: 0,
          unloadedCount: 4,
          rejectedCount: 1,
        },
        controlledRequests: [{
          requestId: 'old',
          targetId: 'descriptor',
          generation: 1,
          backendToken: 'image-request-3',
          backendState: 'unloaded',
          attemptState: 'resolved',
          attachmentState: 'stale',
          retainedPendingCount: 0,
          retainedLeaseCount: 0,
        }],
        journal: {
          unloadRequestTokens: [
            'image-request-1',
            'image-request-2',
            'image-request-3',
            'image-request-5',
          ],
          rejectedRequestTokens: ['image-request-4'],
        },
      });
      const comparison = compareObservation({
        expectedCase: expectedCase as unknown as ExpectedCase,
        actual: run.actualObservation,
        fixtures: run.fixtures,
        captures: run.captures,
      });
      const failures = comparison.assertions
        .filter(({ passed }) => !passed)
        .map(({ path, failure }) => ({ path, code: failure?.code }))
        .sort((left, right) => left.path.localeCompare(right.path));
      expect(expectedCase.expected.assertions).toHaveLength(28);
      expect(comparison).toMatchObject({ passed: 25, failed: 3 });
      expect(failures).toEqual(IMMUTABLE_PARENT_CONFLICTS.map((path) => ({
        path,
        code: 'VALUE_MISMATCH',
      })));
      comparisonDigests.push(comparison.comparisonSha256);
    }

    expect(JSON.stringify(second.actualObservation)).toBe(JSON.stringify(first.actualObservation));
    expect(comparisonDigests).toHaveLength(2);
    expect(comparisonDigests[1]).toBe(comparisonDigests[0]);
    expect(surfaces).toHaveLength(2);
    expect(surfaces.every(({ destroyed, canvasCount }) => destroyed && canvasCount === 0)).toBe(true);
    expect(await bridge.destroyCase()).toMatchObject({
      status: 'completed',
      runCount: 2,
      completedRunCount: 2,
      releasedEngineCount: 1,
      retainedCanvasCount: 0,
      retainedSubscriptionCount: 0,
      retainedPendingWork: 0,
    });
  });
});

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
