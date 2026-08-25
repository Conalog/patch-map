import normalizedExpectedCatalog from '../../contracts/patch-map/evidence/catalog-normalized-expected.v1.json';
import { describe, expect, it, vi } from 'vitest';

import { createTestProjectionIndex } from './support/projection-index';

// @ts-expect-error -- the independent comparator is an authored ESM JavaScript module.
import * as compareModule from '../../scripts/verification/patch-map-contract/compare.mjs';

import { createPatchMapExecutableLabBridge } from '../../lab/patch-map/contract/executable-bridge';
import {
  materializePatchMapExecutableCase,
} from '../../lab/patch-map/contract/executable-cases';
import { resolvePatchMapExecutableRuntime } from '../../lab/patch-map/contract/executable-runtime';
import {
  PATCH_MAP_RENDER_TEXT_CLEANUP_REVISION,
  PATCH_MAP_RENDER_TEXT_RUNTIME_REVISION,
  createPatchMapRenderTextRuntime,
} from '../../lab/patch-map/contract/render-text-runtime';
import type { CoreView, SlotRange } from '../../src/patch-map/dense/contracts';
import type { RendererFlushResult, RenderStoreView } from '../../src/patch-map/dense/renderer-types';
import { PatchMapRuntime, type PatchMapRuntimeOptions } from '../../src/patch-map/core';
import {
  PixiEngineSurface,
  type PatchMapEngineSurface,
  type PatchMapEngineSurfaceFactory,
  type PatchMapSurfaceOptions,
} from '../../src/patch-map/engine';
import type { PatchMapProjectionIndex } from '../../src/patch-map/contracts';
import type { PatchMapPresentationLayerRenderUpdate } from '../../src/patch-map/presentation-layer-contracts';
import { AggregateLeafLayer } from '../../src/patch-map/renderers/leaf-layer';
import type {
  PatchMapPixiInitializationMetrics,
  PatchMapPixiRenderer,
} from '../../src/patch-map/renderers/pixi-renderer';
import type { PatchMapRendererEntityPresentationOverride } from '../../src/patch-map/renderers/presentation-store';
import type {
  PatchMapProjectionRenderContext,
  PatchMapRenderLaneProbe,
  PatchMapRenderLaneRole,
  PatchMapRenderLaneSnapshot,
  PatchMapTextAttachedSignatures,
  PatchMapTextRendererProbe,
  PatchMapTextSemanticSignatures,
  PatchMapWorldOrientation,
  PatchMapPixiRendererDebug,
  RootInteractionHandlers,
} from '../../src/patch-map/renderers/types';

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

describe('PatchMap REN-006 / REN-011 expected-blind runtime', () => {
  it('owns only independent specimens and zero external font or transport resources', () => {
    const runtime = createPatchMapRenderTextRuntime('REN-011');
    const before = runtime.product.resourceProbe({ caseId: 'REN-011' });
    expect(before).toMatchObject({
      revision: PATCH_MAP_RENDER_TEXT_RUNTIME_REVISION,
      caseId: 'REN-011',
      fontRuntime: zeroFontRuntime(),
      transport: zeroTransport(),
      supplemental: { factoryCallCount: 0, specimenCount: 0 },
    });

    const specimens = runtime.product.createSupplementalSpecimens();
    expect(specimens.map(({ id }) => id)).toEqual([
      'placed',
      'auto',
      'wrap',
      'overflow-visible',
      'overflow-hidden',
      'overflow-ellipsis',
      'upright',
    ]);
    expect(new Set(specimens.map(({ datasetId }) => datasetId)).size).toBe(7);
    expect(specimens.every(({ dataset }) => Object.isFrozen(dataset))).toBe(true);
    expect(JSON.stringify(specimens)).not.toContain('itemTextContractMatrix');
    expect(JSON.stringify(specimens)).not.toContain('expected');

    const active = runtime.product.resourceProbe({ caseId: 'REN-011' });
    expect(active).toMatchObject({
      fontRuntime: zeroFontRuntime(),
      transport: zeroTransport(),
      supplemental: { factoryCallCount: 1, specimenCount: 7 },
    });
    expect(Object.isFrozen(active)).toBe(true);
    expect(() => runtime.product.resourceProbe({ caseId: 'REN-006' })).toThrow(
      /case identity/u,
    );

    const cleanup = runtime.postDestroyProductProbe();
    expect(cleanup).toMatchObject({
      revision: PATCH_MAP_RENDER_TEXT_CLEANUP_REVISION,
      caseId: 'REN-011',
      runtimeCounts: zeroRuntimeCounts(),
      transport: zeroTransport(),
      supplemental: { factoryCallCount: 1, specimenCount: 7 },
    });
    expect(journalEvents(cleanup)).toEqual([
      'text-runtime-observed',
      'supplemental-specimens-created',
      'text-runtime-observed',
      'text-runtime-released',
    ]);
    expect(runtime.postDestroyProductProbe()).toBe(cleanup);
    expect(() => runtime.product.createSupplementalSpecimens()).toThrow(/active runtime/u);
  });

  it('promotes its exact cases and handler types without a supplemental WebGL lease', () => {
    for (const caseId of ['REN-006', 'REN-011'] as const) {
      const plan = materializePatchMapExecutableCase(caseId, '100', 319);
      const descriptor = resolvePatchMapExecutableRuntime(caseId);
      const run = descriptor.createRun(plan);
      expect(descriptor).toMatchObject({ key: 'render-text', needsSupplementalWebGLLease: false });
      expect(run.engineOptions).toEqual({});
      expect(run.postDestroyProductProbe).toEqual(expect.any(Function));
      expect(run.handlerEntries.map(([handlerId]) => handlerId).sort()).toEqual(
        [...new Set(plan.actionTrace.map(({ type }) => `contract/${type}`))].sort(),
      );
    }
  });

  it.each([
    {
      caseId: 'REN-006' as const,
      actionCount: 6,
      assertionCount: 30,
      engineCountPerRun: 1,
      expectedConflictPaths: [],
    },
    {
      caseId: 'REN-011' as const,
      actionCount: 4,
      assertionCount: 17,
      engineCountPerRun: 1,
      expectedConflictPaths: [
        '/paint/commandCount',
        '/text/contractMatrix',
        '/geometry/texts/upright/screenAngle',
        '/outcome/textContractMatrix/allRowsExact',
      ],
    },
  ])(
    'executes and repeats $caseId through the canonical bridge and public Engine text probe',
    async ({
      caseId,
      actionCount,
      assertionCount,
      engineCountPerRun,
      expectedConflictPaths,
    }) => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      const surfaces: PatchMapEngineSurface[] = [];
      const renderers: HeadlessTextRenderer[] = [];
      const bridge = createPatchMapExecutableLabBridge({
        caseId,
        rootTestId: `scenario-${caseId.toLowerCase()}`,
        size: '100',
        seed: 319,
        surfaceFactory: createHeadlessTextSurfaceFactory(surfaces, renderers),
        environment: {
          browser: 'vitest-headless-pixi-text',
          browserVersion: 'unit',
          os: 'unit',
          backend: 'webgl2',
          routeSize: '100',
        },
      });

      try {
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
          expect(run.actualObservation).toMatchObject({
            $schema: 'patch-map-semantic-observation/1',
            case: { id: caseId, params: { size: '100', seed: 319 } },
            text: {
              _availability: {
                semanticLayout: 'available',
                publicTextProbe: 'available',
                rendererPublication: 'available',
              },
            },
          });
          const cleanup = requireRecord(run.execution.cleanup, `${caseId} cleanup`);
          expect(cleanup.releases).toHaveLength(engineCountPerRun);
          expect(cleanup).not.toHaveProperty('supplementalWebGLLease');
          expect(cleanup.productResources).toMatchObject({
            revision: PATCH_MAP_RENDER_TEXT_CLEANUP_REVISION,
            caseId,
            runtimeCounts: zeroRuntimeCounts(),
            transport: zeroTransport(),
          });
          expect(JSON.stringify(run)).not.toContain('catalog-normalized-expected');
          expect(JSON.stringify(run)).not.toContain('"status":"pass"');

          const comparison = compareObservation({
            expectedCase: expectedCase as unknown as ExpectedCase,
            actual: run.actualObservation,
            fixtures: run.fixtures,
            captures: run.captures,
          });
          const failures = comparison.assertions.filter(({ passed }) => !passed);
          expect(expectedCase.expected.assertions).toHaveLength(assertionCount);
          expect(failures.map(({ path }) => path)).toEqual(expectedConflictPaths);
          expect(comparison).toMatchObject({
            passed: assertionCount - expectedConflictPaths.length,
            failed: expectedConflictPaths.length,
          });
          comparisonDigests.push(comparison.comparisonSha256);
        }

        expect(JSON.stringify(second.actualObservation)).toBe(JSON.stringify(first.actualObservation));
        expect(comparisonDigests[1]).toBe(comparisonDigests[0]);
        expect(surfaces).toHaveLength(engineCountPerRun * 2);
        expect(surfaces.every(({ destroyed, canvasCount }) => destroyed && canvasCount === 0)).toBe(true);
        expect(renderers).toHaveLength(engineCountPerRun * 2);
        expect(renderers.every(({ preference }) => preference === 'webgl')).toBe(true);
        expect(renderers.every(({ maxTextObjectCount }) => maxTextObjectCount > 0)).toBe(true);
        expect(renderers.every(({ maxBitmapTextCount }) => maxBitmapTextCount === 0)).toBe(true);
        expect(renderers.every(({ maxFallbackTextCount }) => maxFallbackTextCount > 0)).toBe(true);
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(await bridge.destroyCase()).toMatchObject({
          status: 'completed',
          runCount: 2,
          completedRunCount: 2,
          releasedEngineCount: engineCountPerRun,
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

function createHeadlessTextSurfaceFactory(
  surfaces: PatchMapEngineSurface[],
  renderers: HeadlessTextRenderer[],
): PatchMapEngineSurfaceFactory {
  return (options) => {
    const renderer = new HeadlessTextRenderer(options);
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

class HeadlessTextRenderer {
  public readonly strategy = 'mesh' as const;
  public readonly preference = 'webgl' as const;
  public readonly initializationMetrics: PatchMapPixiInitializationMetrics = Object.freeze({
    applicationInitMs: 0,
    rendererBuildMs: 0,
  });
  public width: number;
  public height: number;
  public pixelRatio: number;
  public maxTextObjectCount = 0;
  public maxBitmapTextCount = 0;
  public maxFallbackTextCount = 0;

  private readonly leaves: AggregateLeafLayer;
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
  private textProjectionSynchronizedRevision = -1;
  private lastRenderedTextProjectionRevision = -1;
  private lastRenderedTextStoreRevision = -1;
  private lastStoreRevision = -1;

  public constructor(options: PatchMapSurfaceOptions) {
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = options.pixelRatio;
    this.leaves = options.assetSession
      ? new AggregateLeafLayer(options.assetSession, false)
      : new AggregateLeafLayer();
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
    const debug = this.leaves.sync(store, {
      fullRebuildEpoch: 1,
      projectionContext: this.projectionContext(),
    });
    this.textProjectionSynchronizedRevision = this.projectionRevision;
    this.frame += 1;
    this.leaves.confirmRenderedFrame(this.frame);
    this.lastRenderedTextProjectionRevision = this.projectionRevision;
    this.lastRenderedTextStoreRevision = store.revision;
    this.lastStoreRevision = store.revision;
    const textObjectCount = debug.bitmapTextCount + debug.pixiTextCount;
    this.maxTextObjectCount = Math.max(this.maxTextObjectCount, textObjectCount);
    this.maxBitmapTextCount = Math.max(this.maxBitmapTextCount, debug.bitmapTextCount);
    this.maxFallbackTextCount = Math.max(this.maxFallbackTextCount, debug.pixiTextCount);
    return Object.freeze({ rendered: true, commandCount: textObjectCount });
  }
  public synchronizeNextFlush(): void {}
  public prepareGpu(): Promise<void> { return Promise.resolve(); }
  public loadAsset(alias: string, url: string): Promise<void> { return this.leaves.loadAsset(alias, url); }
  public unloadAsset(alias: string): Promise<boolean> { return this.leaves.unloadAsset(alias); }
  public finalizeAssetUnloads(): Promise<void> { return this.leaves.finalizeAssetUnloads(); }
  public bindSceneAsset = this.bindLeafAsset.bind(this);
  public unbindSceneAsset(key: string) { return this.leaves.unbindSceneAsset(key); }
  public sceneAssetBindingProbe(key: string) { return this.leaves.sceneAssetBindingProbe(key); }
  public sceneImageProbe(entityId: string) { return this.leaves.sceneImageProbe(entityId); }
  public textRendererProbe(entityId: string): PatchMapTextRendererProbe | null {
    if (this.destroyedValue) return null;
    const semantic = this.projection.textsByEntityId?.[entityId];
    if (semantic === undefined) return null;
    const leaf = this.leaves.textRendererProbe(entityId);
    const semanticSignatures: PatchMapTextSemanticSignatures = Object.freeze({
      content: semantic.contentSignature,
      style: semantic.styleSignature,
      layout: semantic.layoutSignature,
    });
    if (leaf === null) {
      return Object.freeze({
        entityId,
        attachedRoute: 'none',
        objectKind: 'none',
        routeDecisionReason: 'not-attached',
        objectCount: 0,
        semanticSignatures,
        attachedSignatures: null,
        lastRenderedSignatures: null,
        publicationStatus: 'pending',
        lastRenderedFrame: null,
        staleGlyphCount: 0,
      });
    }
    const attachedMatchesSemantic = sameSemanticSignatures(
      semanticSignatures,
      leaf.attachedSignatures,
    );
    const renderedMatchesAttached = sameAttachedSignatures(
      leaf.attachedSignatures,
      leaf.lastRenderedSignatures,
    );
    const current = this.textProjectionSynchronizedRevision === this.projectionRevision
      && this.lastRenderedTextProjectionRevision === this.projectionRevision
      && this.lastRenderedTextStoreRevision === this.lastStoreRevision
      && leaf.objectCount === 1
      && attachedMatchesSemantic
      && renderedMatchesAttached
      && leaf.lastRenderedFrame !== null;
    return Object.freeze({
      ...leaf,
      semanticSignatures,
      publicationStatus: current ? 'current' : 'pending',
      staleGlyphCount: leaf.lastRenderedSignatures !== null
        && (!attachedMatchesSemantic || !renderedMatchesAttached)
        ? this.leaves.lastRenderedTextGraphemeCount(entityId)
        : 0,
    });
  }
  public entityPaintProbe(entityId: string) { return this.leaves.entityPaintProbe(entityId); }
  public renderLaneProbe(): PatchMapRenderLaneSnapshot {
    const leaves = this.leaves.renderLaneProbe();
    return Object.freeze({
      'background-geometry': emptyLane('background-geometry'),
      'background-assets': leaves.backgroundAssets,
      'ordinary-geometry': emptyLane('ordinary-geometry'),
      'relations-dynamic': emptyLane('relations-dynamic'),
      'content-assets': leaves.contentAssets,
      text: leaves.text,
      'interaction-overlay': emptyLane('interaction-overlay'),
    });
  }
  public captureBase64(): Promise<string> { return Promise.resolve('data:image/png;base64,'); }
  public bindRootInteractions(_handlers: RootInteractionHandlers): () => void {
    return () => undefined;
  }
  public debugSnapshot(): PatchMapPixiRendererDebug {
    const leaves = this.leaves.debugSnapshot();
    const textObjectCount = leaves.bitmapTextCount + leaves.pixiTextCount;
    return Object.freeze({
      strategy: this.strategy,
      backend: 'webgl',
      frame: this.frame,
      storeEpoch: 1,
      entityCount: textObjectCount,
      aggregateRenderObjects: textObjectCount,
      visiblePrimitives: textObjectCount,
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
      lastInvalidation: 'render-text-runtime-test',
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

function emptyLane(role: PatchMapRenderLaneRole): PatchMapRenderLaneProbe {
  return Object.freeze({
    role,
    label: `patch-map:${role}`,
    renderObjectCount: 0,
    visiblePrimitiveCount: 0,
  });
}

function sameSemanticSignatures(
  semantic: PatchMapTextSemanticSignatures,
  attached: PatchMapTextAttachedSignatures | null,
): boolean {
  return attached !== null
    && semantic.content === attached.content
    && semantic.style === attached.style
    && semantic.layout === attached.layout;
}

function sameAttachedSignatures(
  attached: PatchMapTextAttachedSignatures | null,
  rendered: PatchMapTextAttachedSignatures | null,
): boolean {
  return attached !== null
    && rendered !== null
    && sameSemanticSignatures(attached, rendered)
    && attached.renderer === rendered.renderer;
}

function zeroFontRuntime(): Readonly<Record<string, unknown>> {
  return {
    mode: 'semantic-profile-only',
    fontFaceCount: 0,
    atlasLeaseCount: 0,
    assetLeaseCount: 0,
    pendingLoadCount: 0,
  };
}

function zeroTransport(): Readonly<Record<string, number>> {
  return { networkRequestCount: 0, externalFontRequestCount: 0 };
}

function zeroRuntimeCounts(): Readonly<Record<string, number>> {
  return {
    activeSessionCount: 0,
    fontFaceCount: 0,
    atlasLeaseCount: 0,
    assetLeaseCount: 0,
    pendingLoadCount: 0,
    pendingWorkCount: 0,
  };
}

function journalEvents(value: Readonly<Record<string, unknown>>): readonly string[] {
  if (!Array.isArray(value.journal)) throw new Error('Missing render-text runtime journal');
  return value.journal.map((entry) => {
    const record = requireRecord(entry, 'render-text runtime journal entry');
    if (typeof record.event !== 'string') throw new Error('Missing render-text runtime event');
    return record.event;
  });
}

function requireRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}
