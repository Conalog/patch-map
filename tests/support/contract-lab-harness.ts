import type {
  PatchMapContractLabBridgeV1,
  PatchMapContractLabRunResult,
} from '../../lab/contract/bridge';
import {
  createPatchMapExecutableLabBridge,
  type PatchMapExecutableLabBridgeOptions,
} from '../../lab/contract/executable-bridge';
import type { SlotRange } from '../../src/dense/contracts';
import { parsePatchMap } from '../../src/parsing';
import type {
  PatchMapBarPresentationProductProbe,
  PatchMapComponentVisualTarget,
  PatchMapSemanticRefreshResult,
} from '../../src/core/contracts';
import {
  createPatchMapSurfaceGeometrySnapshot,
  hitTestPatchMapSurfaceRelations,
} from '../../src/engine';
import type {
  PatchMapEngineSurface,
  PatchMapEngineSurfaceFactory,
  PatchMapPoint,
  PatchMapRelationHit,
  PatchMapRelationHitOptions,
  PatchMapSurfaceComponentVisualProbe,
  PatchMapSurfaceDebug,
  PatchMapSurfaceGeometrySnapshot,
  PatchMapSurfaceOptions,
  PatchMapSurfaceReconcileOptions,
  PatchMapSurfaceReconcileResult,
  PatchMapSurfaceView,
} from '../../src/engine';
import {
  PATCH_MAP_PRESENTATION_POLICY_REVISION,
  type PatchMapPresentationPolicyInput,
  type PatchMapPresentationPolicyProductProbe,
} from '../../src/presentation/policy';
import type {
  PatchMapRendererPublicSurfaceProbe,
  PatchMapRendererLossProbe,
  PatchMapRenderLaneRole,
  PatchMapRenderLaneSnapshot,
} from '../../src/rendering-port';
import type { PatchMapSemanticTarget } from '../../src/semantic/probe';

export interface PatchMapContractCaseHarnessRun {
  readonly bridge: PatchMapContractLabBridgeV1;
  readonly run: Readonly<PatchMapContractLabRunResult>;
}

export async function runPatchMapContractCase(
  options: Omit<PatchMapExecutableLabBridgeOptions, 'rootTestId'>,
): Promise<PatchMapContractCaseHarnessRun> {
  const bridge = createPatchMapExecutableLabBridge({
    ...options,
    rootTestId: `scenario-${options.caseId.toLowerCase()}`,
  });
  return Object.freeze({
    bridge,
    run: await bridge.runCase(),
  });
}

export function createSurfaceHost(): HTMLElement {
  return {
    querySelector(): null {
      return null;
    },
  } as unknown as HTMLElement;
}

export function createFakeSurfaceFactory(
  surfaces: FakeSurface[],
  receivedTargets: Array<HTMLElement | undefined>,
  geometryMode: 'flat' | 'projection' = 'flat',
  pixiIntegrationMode = false,
): PatchMapEngineSurfaceFactory {
  return (options) => {
    receivedTargets.push(options.target);
    const surface = new FakeSurface(options, geometryMode, pixiIntegrationMode);
    surfaces.push(surface);
    return Promise.resolve(surface);
  };
}

export class FakeSurface implements PatchMapEngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  public readonly preference: PatchMapSurfaceOptions['preference'];

  private readonly canvas = {} as HTMLCanvasElement;
  private readonly devtools: boolean;
  private readonly lanes = fakeRenderLanes();
  private width: number;
  private height: number;
  private pixelRatio: number;
  private selectionIds: readonly string[] = Object.freeze([]);
  private dataset: readonly Readonly<Record<string, unknown>>[] = Object.freeze([]);
  private activeAnimationCount = 0;
  private geometryRevision = 0;
  private presentationInput: PatchMapPresentationPolicyInput | null = null;
  private presentationRevision = 0;
  private rendererLossState: PatchMapRendererLossProbe['state'] = 'healthy';
  private rendererLossEventCount = 0;
  private rendererRestorationEventCount = 0;
  private recoveredRendererFrameCount = 0;
  private view: PatchMapSurfaceView = Object.freeze({
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    flipX: false,
    flipY: false,
  });

  public constructor(
    options: PatchMapSurfaceOptions,
    private readonly geometryMode: 'flat' | 'projection' = 'flat',
    private readonly pixiIntegrationMode = false,
  ) {
    this.preference = options.preference;
    this.devtools = options.devtools ?? false;
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = options.pixelRatio;
  }

  public canvasElement(): HTMLCanvasElement {
    return this.canvas;
  }

  public captureBase64(): Promise<string> {
    return Promise.resolve('data:image/png;base64,cGl4aQ==');
  }

  public load(input: unknown): void {
    this.replaceDataset(input);
    this.selectionIds = Object.freeze([]);
    this.activeAnimationCount = 0;
  }

  public reconcile(
    input: unknown,
    options: PatchMapSurfaceReconcileOptions = {},
  ): PatchMapSurfaceReconcileResult {
    this.replaceDataset(input);
    this.activeAnimationCount = options.animateBarChanges === true
      ? Math.max(1, options.animatedBarTargets?.length ?? 0)
      : 0;
    return Object.freeze({
      status: 'committed',
      operationCount: 1,
      denseChanged: true,
      diagnostics: Object.freeze([]),
    });
  }

  public publishFrame(_timeMs: number): void {
    if (
      this.rendererLossState === 'lost'
      || this.rendererLossState === 'restored-pending-frame'
    ) {
      this.rendererLossState = 'healthy';
      this.rendererRestorationEventCount += 1;
      this.recoveredRendererFrameCount += 1;
    }
  }

  public suspendPresentation(timeMs: number): Readonly<{
    readonly state: 'suspended';
    readonly timeMs: number;
    readonly settledCount: number;
    readonly activeAnimationCount: number;
  }> {
    const settledCount = this.activeAnimationCount;
    this.activeAnimationCount = 0;
    return Object.freeze({
      state: 'suspended',
      timeMs,
      settledCount,
      activeAnimationCount: 0,
    });
  }

  public resumePresentation(timeMs: number): Readonly<{
    readonly state: 'running';
    readonly timeMs: number;
    readonly settledCount: number;
    readonly activeAnimationCount: number;
  }> {
    this.activeAnimationCount = 0;
    return Object.freeze({
      state: 'running',
      timeMs,
      settledCount: 0,
      activeAnimationCount: 0,
    });
  }

  public resize(width: number, height: number, pixelRatio: number): boolean {
    const changed = width !== this.width || height !== this.height || pixelRatio !== this.pixelRatio;
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    return changed;
  }

  public setView(view: PatchMapSurfaceView): void {
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
    const labels = targets.map((target) => (
      target.kind === 'component' ? `${target.ownerId}/${target.id}` : target.id
    ));
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

  public hitTestScreen(point: PatchMapPoint): string | null {
    return this.geometrySnapshot().entities.filter((entity) => (
      entity.visible
      && entity.interactive
      && fakeBoundsContain(entity.screenBounds, point)
    )).at(-1)?.id ?? null;
  }

  public relationHitTestScreen(
    point: PatchMapPoint,
    options?: PatchMapRelationHitOptions,
  ): PatchMapRelationHit | null {
    return hitTestPatchMapSurfaceRelations(this.geometrySnapshot().relations, point, options);
  }

  public screenToWorld(point: PatchMapPoint): PatchMapPoint {
    const radians = this.view.rotation * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const translatedX = (point.x - this.view.x) / this.view.scale *
      (this.view.flipX === true ? -1 : 1);
    const translatedY = (point.y - this.view.y) / this.view.scale *
      (this.view.flipY === true ? -1 : 1);
    return Object.freeze({
      x: translatedX * cosine + translatedY * sine,
      y: -translatedX * sine + translatedY * cosine,
    });
  }

  public interactionOwnershipProbe(): Readonly<{
    readonly rootBindingCount: number;
    readonly entityCallbackCount: number;
  }> {
    return Object.freeze({ rootBindingCount: 6, entityCallbackCount: 0 });
  }

  public componentVisualProbe(
    target: Readonly<{ readonly ownerId: string; readonly componentId: string }>,
  ): PatchMapSurfaceComponentVisualProbe | null {
    if (!this.pixiIntegrationMode) return null;
    if (target.ownerId !== 'item-a' || target.componentId !== 'bar') return null;
    return Object.freeze({
      target: Object.freeze({ ownerId: 'item-a', componentId: 'bar' }),
      semanticOwnerId: 'item-a',
      entityId: 'item-a/bar',
      logicalIdentity: 'component:item-a/bar',
      componentType: 'bar',
      renderRole: 'ordinary-geometry',
      entityKind: 'bar',
      geometry: Object.freeze({
        localBounds: Object.freeze([0, 0, 60, 10] as const),
        worldBounds: Object.freeze([10, 90, 60, 10] as const),
        visibleBounds: Object.freeze([10, 90, 60, 10] as const),
        visible: true,
        interactive: true,
      }),
      publication: Object.freeze({ rendererFacts: 'current' }),
      sceneImage: null,
      rendererPaint: Object.freeze({
        entityId: 'item-a/bar',
        lane: 'ordinary-geometry',
        rendererKind: 'mesh',
        primitiveCount: 1,
        renderObjectCount: 1,
        packedTint: 0x00aa66ff,
        rgbTint: 0x00aa66,
        alpha: 1,
      }),
      renderLanes: this.lanes,
    });
  }

  public barPresentationProbe(
    target: PatchMapComponentVisualTarget,
  ): PatchMapBarPresentationProductProbe | null {
    const owner = this.dataset.find((element) => element.id === target.ownerId);
    const components: readonly unknown[] = Array.isArray(owner?.components)
      ? owner.components
      : [];
    const component = components.find((entry) =>
      isRecord(entry) && entry.id === target.componentId);
    if (!isRecord(component) || component.type !== 'bar') return null;
    const size = isRecord(component.size) ? component.size : {};
    const height = fakeNumber(size.height, 0);
    const durationMs = fakeNumber(component.animationDuration, 200);
    return Object.freeze({
      target: Object.freeze({ ...target }),
      entityId: `${target.ownerId}::bar:${target.componentId}`,
      policy: Object.freeze({
        enabled: component.animation === true,
        durationMs,
      }),
      semanticHeight: height,
      presentationHeight: height,
      active: false,
      startHeight: height,
      destinationHeight: height,
      startTimeMs: null,
      controller: Object.freeze({
        lifecycleGeneration: 1,
        presentationRevision: this.geometryRevision,
        clockMs: 0,
        activeCount: 0,
        indexedCount: 0,
        capacity: 0,
        totalSettlementCount: 0,
        totalCancellationCount: 0,
        totalSupersessionCount: 0,
        publishedFrameCount: 0,
        destroyed: this.destroyed,
      }),
      ghostPublicationCount: 0,
    });
  }

  public rendererPublicSurfaceProbe(): PatchMapRendererPublicSurfaceProbe {
    return Object.freeze({
      rendererLibrary: 'pixi.js-v8',
      rendererVersion: '8.test',
      backend: 'webgl2',
      applicationInitialized: true,
      manualRender: true,
      canvas: Object.freeze({
        authoritative: true,
        attached: true,
        patchMapProduct: 'patch-map',
      }),
      stage: Object.freeze({
        label: 'PatchMap',
        authoritative: true,
        discoverableByDevTools: this.devtools,
        worldAttached: true,
        childCount: 1,
      }),
      aggregateLayers: Object.freeze(
        FAKE_RENDER_LANE_ROLES.map((role) => this.lanes[role]),
      ),
    });
  }

  public rendererLossProbe(): PatchMapRendererLossProbe {
    return Object.freeze({
      backend: 'webgl2',
      webGLVersion: 2,
      state: this.destroyed ? 'destroyed' : this.rendererLossState,
      contextLost: this.rendererLossState === 'lost',
      lossEventCount: this.rendererLossEventCount,
      restorationEventCount: this.rendererRestorationEventCount,
      recoveredFrameCount: this.recoveredRendererFrameCount,
      listenerCount: this.destroyed ? 0 : 2,
      lastLossFrame: this.rendererLossEventCount === 0 ? null : 0,
      lastRecoveryFrame: this.recoveredRendererFrameCount === 0 ? null : 1,
      destroyed: this.destroyed,
    });
  }

  public forceRendererLoss(): boolean {
    this.rendererLossEventCount += 1;
    this.rendererLossState = 'lost';
    return true;
  }

  public debugSnapshot(): PatchMapSurfaceDebug {
    const geometry = this.geometrySnapshot();
    const visibleRelationCount = geometry.relations.filter(({ visible }) => visible).length;
    return Object.freeze({
      cssSize: Object.freeze([this.width, this.height] as const),
      backingSize: Object.freeze([
        Math.round(this.width * this.pixelRatio),
        Math.round(this.height * this.pixelRatio),
      ] as const),
      selectionIds: this.selectionIds,
      activeAnimationCount: this.activeAnimationCount,
      activeGestureCount: 0,
      renderCommandCount: geometry.entities.length + visibleRelationCount,
      visiblePrimitiveCount: geometry.entities.length + visibleRelationCount,
    });
  }

  public geometrySnapshot(): PatchMapSurfaceGeometrySnapshot {
    if (this.geometryMode === 'projection') {
      const parsed = parsePatchMap(this.dataset);
      const projected = createPatchMapSurfaceGeometrySnapshot(
        fakeSceneSnapshot(parsed.document, this.geometryRevision, this.selectionIds),
        parsed.projection,
        this.view,
      );
      return Object.freeze({ ...projected, revision: this.geometryRevision });
    }
    return Object.freeze({
      revision: this.geometryRevision,
      sceneRevision: this.geometryRevision,
      entities: Object.freeze(this.geometryEntities()),
      relations: Object.freeze([]),
      selectionOverlay: null,
    });
  }

  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.canvasCount = 0;
    this.selectionIds = Object.freeze([]);
    this.dataset = Object.freeze([]);
    this.activeAnimationCount = 0;
    this.presentationInput = null;
    this.rendererLossState = 'destroyed';
    return Promise.resolve(true);
  }

  private replaceDataset(input: unknown): void {
    if (!Array.isArray(input)) throw new Error('FakeSurface requires an array dataset');
    this.dataset = input.filter(isRecord);
    this.geometryRevision += 1;
  }

  private geometryEntities(): PatchMapSurfaceGeometrySnapshot['entities'][number][] {
    return this.dataset.flatMap((element) => fakeGeometryEntity(element, this.view));
  }
}

export class FailingDestroySurface extends FakeSurface {
  public override destroy(): Promise<boolean> {
    return Promise.reject(new Error('synthetic supplemental teardown failure'));
  }
}

const FAKE_RENDER_LANE_ROLES: readonly PatchMapRenderLaneRole[] = [
  'background-geometry',
  'background-assets',
  'ordinary-geometry',
  'relations-dynamic',
  'content-assets',
  'text',
  'interaction-overlay',
];

function fakeRenderLanes(): PatchMapRenderLaneSnapshot {
  return Object.freeze(Object.fromEntries(FAKE_RENDER_LANE_ROLES.map((role) => [
    role,
    Object.freeze({
      role,
      label: `PatchMap / ${role}`,
      renderObjectCount: role === 'ordinary-geometry' ? 1 : 0,
      visiblePrimitiveCount: role === 'ordinary-geometry' ? 1 : 0,
    }),
  ])) as unknown as PatchMapRenderLaneSnapshot);
}

function fakeSceneSnapshot(
  document: ReturnType<typeof parsePatchMap>['document'],
  revision: number,
  selectionIds: readonly string[],
): Parameters<typeof createPatchMapSurfaceGeometrySnapshot>[0] {
  const entities = document.entities.map((entity, slot) => Object.freeze({
    ref: Object.freeze({ slot, generation: 1 }),
    id: entity.id,
    kind: entity.kind,
    bounds: entity.kind === 'relation'
      ? Object.freeze({ x: 0, y: 0, width: 0, height: 0 })
      : Object.freeze({
          x: entity.x,
          y: entity.y,
          width: entity.width,
          height: entity.height,
        }),
    rotation: entity.kind === 'relation' ? 0 : entity.rotation ?? 0,
    opacity: entity.opacity ?? 1,
    visible: entity.visible ?? true,
    interactive: entity.interactive ?? false,
    zIndex: entity.zIndex ?? 0,
    tags: entity.tags ?? Object.freeze([]),
    data: entity.kind === 'relation'
      ? Object.freeze({
          from: entity.from,
          to: entity.to,
          color: entity.color,
          lineWidth: entity.lineWidth ?? 1,
        })
      : Object.freeze({}),
  }));
  return Object.freeze({
    revision,
    view: Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 }),
    entityCount: entities.length,
    entities: Object.freeze(entities),
    selection: Object.freeze({
      revision,
      refs: Object.freeze(
        entities.filter((entity) => selectionIds.includes(entity.id)).map(({ ref }) => ref),
      ),
    }),
  });
}

function fakeGeometryEntity(
  element: Readonly<Record<string, unknown>>,
  view: Readonly<{ x: number; y: number; scale: number; rotation: number }>,
): PatchMapSurfaceGeometrySnapshot['entities'] {
  if (element.type === 'relations' || element.type === 'group' || element.type === 'grid') return [];
  const attrs = isRecord(element.attrs) ? element.attrs : {};
  const x = fakeNumber(attrs.x, 0);
  const y = fakeNumber(attrs.y, 0);
  const scaleX = fakeNumber(attrs.scaleX, 1);
  const scaleY = fakeNumber(attrs.scaleY, 1);
  const angle = fakeNumber(attrs.angle ?? attrs.rotation, 0);
  const size = fakeRenderedSize(element);
  const localBounds = fakeBounds(0, 0, size.width, size.height);
  const worldBounds = fakeTransformedBounds(
    x,
    y,
    size.width,
    size.height,
    scaleX,
    scaleY,
    angle,
  );
  const screenBounds = fakeBounds(
    worldBounds[0] * view.scale + view.x,
    worldBounds[1] * view.scale + view.y,
    worldBounds[2] * view.scale,
    worldBounds[3] * view.scale,
  );
  const visible = element.show !== false;
  return [Object.freeze({
    id: String(element.id),
    kind: String(element.type),
    localBounds,
    worldBounds,
    screenBounds,
    visibleBounds: visible ? worldBounds : null,
    visible,
    interactive: element.eventMode === 'static',
    scaleX,
    scaleY,
  })];
}

function fakeRenderedSize(
  element: Readonly<Record<string, unknown>>,
): Readonly<{ width: number; height: number }> {
  const authored = fakeFixedSize(element.size);
  if (element.type !== 'text' || element.overflow !== 'visible') return authored;
  const style = isRecord(element.style) ? element.style : {};
  const text = typeof element.text === 'string' ? element.text : '';
  return {
    width: text.length * fakeNumber(style.fontSize, 16) / 2,
    height: authored.height,
  };
}

function fakeTransformedBounds(
  x: number,
  y: number,
  width: number,
  height: number,
  scaleX: number,
  scaleY: number,
  angle: number,
): readonly [number, number, number, number] {
  const radians = angle * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const corners = ([
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ] as const).map(([localX, localY]) => {
    const scaledX = localX * scaleX;
    const scaledY = localY * scaleY;
    return [
      x + scaledX * cosine - scaledY * sine,
      y + scaledX * sine + scaledY * cosine,
    ] as const;
  });
  const xs = corners.map(([cornerX]) => cornerX);
  const ys = corners.map(([, cornerY]) => cornerY);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return fakeBounds(left, top, Math.max(...xs) - left, Math.max(...ys) - top);
}

function fakeFixedSize(value: unknown): Readonly<{ width: number; height: number }> {
  if (typeof value === 'number') return { width: value, height: value };
  if (!isRecord(value)) return { width: 0, height: 0 };
  return { width: fakeNumber(value.width, 0), height: fakeNumber(value.height, 0) };
}

function fakeBounds(
  x: number,
  y: number,
  width: number,
  height: number,
): readonly [number, number, number, number] {
  return Object.freeze([
    fakeCleanNumber(x),
    fakeCleanNumber(y),
    fakeCleanNumber(width),
    fakeCleanNumber(height),
  ]);
}

function fakeBoundsContain(
  bounds: readonly [number, number, number, number],
  point: PatchMapPoint,
): boolean {
  return bounds[2] > 0
    && bounds[3] > 0
    && point.x >= bounds[0]
    && point.y >= bounds[1]
    && point.x <= bounds[0] + bounds[2]
    && point.y <= bounds[1] + bounds[3];
}

function fakeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function fakeCleanNumber(value: number): number {
  const rounded = Math.round(value * 1_000_000_000) / 1_000_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
