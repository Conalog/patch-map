import {
  PatchMapAssetRuntime,
  type PatchMapAssetAcquisition,
  type PatchMapAssetBackend,
  type PatchMapAssetBackendRequest,
  type PatchMapAssetSession,
} from '../../src/assets';
import type {
  PatchMapEngineSceneImageRecord,
  PatchMapEngineSceneImagesProbe,
  PatchMapEngineSurface,
  PatchMapPoint,
  PatchMapSurfaceComponentVisualProbe,
  PatchMapSurfaceDebug,
  PatchMapSurfaceGeometrySnapshot,
  PatchMapSurfaceOptions,
  PatchMapSurfaceReconcileOptions,
  PatchMapSurfaceReconcileResult,
} from '../../src/engine';
import type { SlotRange } from '../../src/dense/contracts';
import type { PatchMapSemanticRefreshResult } from '../../src/core';
import type { PatchMapComponentRenderRole } from '../../src/parsing/contracts';
import {
  PATCH_MAP_PRESENTATION_POLICY_REVISION,
  type PatchMapPresentationPolicyInput,
  type PatchMapPresentationPolicyProductProbe,
} from '../../src/presentation/policy';
import type {
  PatchMapRenderLaneRole,
  PatchMapRenderLaneSnapshot,
} from '../../src/rendering-port';
import type { PatchMapSemanticTarget } from '../../src/semantic/probe';

export type JsonRecord = Record<string, unknown>;

export type SurfaceFault =
  | 'missing-component'
  | 'missing-interaction'
  | 'missing-scene-images'
  | 'missing-rendering'
  | 'ownership-leak'
  | 'root-drop'
  | 'stale-publication'
  | 'lane-orphan'
  | 'retain-resource';

const TEST_RENDER_LANE_ROLES = Object.freeze([
  'background-geometry',
  'background-assets',
  'ordinary-geometry',
  'relations-dynamic',
  'content-assets',
  'text',
  'interaction-overlay',
] as const satisfies readonly PatchMapRenderLaneRole[]);

export class UpdateContractSurface implements PatchMapEngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  private dataset: readonly JsonRecord[] = Object.freeze([]);
  private selectionIds: readonly string[] = Object.freeze([]);
  private geometryRevision = 0;
  private retainedIcon: Readonly<{ ownerId: string; component: JsonRecord }> | null = null;
  private assetAcquisition: PatchMapAssetAcquisition | null = null;
  private assetAlias: string | null = null;
  private assetSettlement: Promise<void> = Promise.resolve();
  private presentationInput: PatchMapPresentationPolicyInput | null = null;
  private presentationRevision = 0;
  private readonly width: number;
  private readonly height: number;
  private readonly pixelRatio: number;
  private readonly assetSession: PatchMapAssetSession;
  private readonly assetOwnershipEnabled: boolean;
  private readonly fault: SurfaceFault | undefined;
  private readonly resourceJournal: string[] | undefined;

  public constructor(
    options: PatchMapSurfaceOptions,
    assetOwnershipEnabled: boolean,
    fault?: SurfaceFault,
    resourceJournal?: string[],
  ) {
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = options.pixelRatio;
    if (options.assetSession === undefined) throw new Error('UPD test surface requires asset session');
    this.assetSession = options.assetSession;
    this.assetOwnershipEnabled = assetOwnershipEnabled;
    this.fault = fault;
    this.resourceJournal = resourceJournal;
  }

  public load(input: unknown): void {
    this.dataset = asDataset(input);
    const icon = this.findComponent('item-a', 'icon');
    this.retainedIcon = icon === null
      ? null
      : Object.freeze({ ownerId: 'item-a', component: structuredClone(icon) });
    this.selectionIds = Object.freeze([]);
    this.geometryRevision += 1;
    if (this.assetOwnershipEnabled) this.queueAssetSynchronization();
  }

  public reconcile(
    input: unknown,
    options: PatchMapSurfaceReconcileOptions = {},
  ): PatchMapSurfaceReconcileResult {
    this.dataset = asDataset(input);
    this.selectionIds = options.selectionIds === undefined
      ? Object.freeze(this.selectionIds.filter((id) => hasElementId(this.dataset, id)))
      : Object.freeze([...options.selectionIds]);
    this.geometryRevision += 1;
    if (this.assetOwnershipEnabled) this.queueAssetSynchronization();
    return Object.freeze({
      status: 'committed',
      operationCount: 1,
      denseChanged: true,
      diagnostics: Object.freeze([]),
    });
  }

  public publishFrame(): void {
    this.resourceJournal?.push('publish');
  }

  public async settleSceneImages(): Promise<void> {
    this.resourceJournal?.push('settle');
    await this.assetSettlement;
  }

  public resize(): boolean {
    return false;
  }

  public setView(): void {}

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
    return deepFreeze({
      schemaRevision: PATCH_MAP_PRESENTATION_POLICY_REVISION,
      revision: this.presentationRevision,
      status: this.presentationInput === null ? 'normal' : 'active',
      highlightIds,
      deEmphasisAlpha,
      hiddenLayerIds: this.presentationInput?.hiddenLayerIds ?? Object.freeze([]),
      fillOverrides,
      entities: ['item-a', 'rect-b', 'text-c', 'links'].map((id) => {
        const visible = !hidden.has(id);
        return {
          id,
          denseEntityIds: [id],
          emphasis: highlightIds === null || highlighted.has(id) ? 1 : deEmphasisAlpha,
          visible,
          renderObjectCount: visible ? 1 : 0,
          packedFills: [fillById.get(id) ?? 0],
        };
      }),
    });
  }

  public refreshSemanticTargets(
    targets: readonly PatchMapSemanticTarget[],
    options: Readonly<{ readonly strict?: boolean }> = {},
  ): PatchMapSemanticRefreshResult {
    const labels = targets.map(refreshTargetLabel);
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
    const entities = this.geometrySnapshot().entities;
    for (let index = entities.length - 1; index >= 0; index -= 1) {
      const entity = entities[index];
      if (!entity?.visible || !entity.interactive) continue;
      const [x, y, width, height] = entity.worldBounds;
      if (point.x >= x && point.y >= y && point.x <= x + width && point.y <= y + height) {
        return entity.id;
      }
    }
    return null;
  }

  public screenToWorld(point: PatchMapPoint): PatchMapPoint {
    return Object.freeze({ ...point });
  }

  public geometrySnapshot(): PatchMapSurfaceGeometrySnapshot {
    const nodes = flattenGeometryNodes(this.dataset);
    const entities = nodes.map(({ record, affine }) => entityGeometry(record, affine));
    const entityById = new Map(entities.map((entity) => [entity.id, entity]));
    const recordById = new Map(nodes.map(({ record }) => [String(record.id), record]));
    const relations = [];
    const omittedRelations = [];
    for (const relationRecord of this.dataset.filter((record) => record.type === 'relations')) {
      const seen = new Set<string>();
      const links = Array.isArray(relationRecord.links) ? relationRecord.links : [];
      for (const [index, linkValue] of links.entries()) {
        const link = requireRecord(linkValue, 'relation link');
        const sourceId = String(link.source);
        const targetId = String(link.target);
        const key = `${sourceId}>${targetId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const source = entityById.get(sourceId);
        const target = entityById.get(targetId);
        if (source === undefined || target === undefined) {
          omittedRelations.push({
            id: `${String(relationRecord.id)}:${index}`,
            relationId: String(relationRecord.id),
            key,
            identityKey: key,
            sourceId,
            targetId,
            authoredIndex: index,
            reason: source === undefined && target === undefined
              ? 'missing-source-and-target' as const
              : source === undefined
                ? 'missing-source' as const
                : 'missing-target' as const,
          });
          continue;
        }
        const start = center(source.worldBounds);
        const end = center(target.worldBounds);
        const visible = recordById.get(sourceId)?.show !== false &&
          recordById.get(targetId)?.show !== false;
        relations.push({
          id: `${String(relationRecord.id)}:${index}`,
          relationId: String(relationRecord.id),
          key,
          identityKey: key,
          sourceId,
          targetId,
          worldEndpoints: [start, end] as const,
          screenEndpoints: [start, end] as const,
          worldPoints: [start, end],
          screenPoints: [start, end],
          worldBounds: relationBounds(start, end),
          screenBounds: relationBounds(start, end),
          visible,
          style: { color: 0x222222, colorHex: '#222222ff', width: 2, opacity: 1, zIndex: 0 },
          visibleStrokeWidthsCssPx: [2],
        });
      }
    }
    const selected = this.selectionIds[0];
    const selectedEntity = selected === undefined ? undefined : entityById.get(selected);
    return deepFreeze({
      revision: this.geometryRevision,
      sceneRevision: this.geometryRevision,
      entities,
      relations,
      omittedRelations,
      selectionOverlay: selectedEntity === undefined
        ? null
        : { screenBounds: selectedEntity.screenBounds },
    });
  }

  public interactionOwnershipProbe(): Readonly<{ rootBindingCount: number; entityCallbackCount: number }> {
    if (this.fault === 'missing-interaction') return null as never;
    const iconRemoved = this.findComponent('item-a', 'icon') === null;
    const leaked = this.fault === 'ownership-leak' && iconRemoved;
    const disconnected = this.fault === 'root-drop' && iconRemoved;
    return Object.freeze({
      rootBindingCount: leaked ? 7 : disconnected ? 5 : 6,
      entityCallbackCount: leaked ? 1 : 0,
    });
  }

  public componentVisualProbe(
    target: Readonly<{ ownerId: string; componentId: string }>,
  ): PatchMapSurfaceComponentVisualProbe | null {
    if (this.fault === 'missing-component') return null;
    const current = this.findComponent(target.ownerId, target.componentId);
    const retained = current === null && this.fault === 'retain-resource' &&
      this.retainedIcon?.ownerId === target.ownerId &&
      this.retainedIcon.component.id === target.componentId
      ? this.retainedIcon.component
      : null;
    const component = current ?? retained;
    if (component === null) return null;
    const show = component.show !== false;
    const componentType = String(component.type);
    const entityId = `${target.ownerId}::${componentType}:${target.componentId}`;
    const owner = this.dataset.find((element) => element.id === target.ownerId);
    const geometry = owner === undefined
      ? Object.freeze([0, 0, 0, 0] as const)
      : entityGeometry(owner).worldBounds;
    const aggregateMesh = componentType === 'background' || componentType === 'bar';
    const rendererKind = aggregateMesh
      ? 'mesh'
      : show
        ? componentType === 'icon'
          ? 'sprite'
          : componentType === 'text'
            ? 'text'
            : 'mesh'
        : 'none';
    const renderObjectCount: 0 | 1 = show && rendererKind !== 'mesh' ? 1 : 0;
    const sceneImage = typeof component.source === 'string'
      ? this.imageRecord(target.ownerId, component, show)
      : null;
    const renderLanes = this.renderLaneSnapshot();
    const visual: PatchMapSurfaceComponentVisualProbe = {
      target: { ownerId: target.ownerId, componentId: target.componentId },
      semanticOwnerId: target.ownerId,
      entityId,
      logicalIdentity: `component:${target.ownerId}:${target.componentId}`,
      componentType,
      renderRole: componentProductRenderRole(componentType, component),
      entityKind: componentType === 'icon' ? 'image' : componentType === 'text' ? 'text' : 'rect',
      geometry: {
        localBounds: geometry,
        worldBounds: geometry,
        visibleBounds: show ? geometry : null,
        visible: show,
        interactive: show,
      },
      publication: {
        rendererFacts: this.fault === 'stale-publication' ? 'pending' : 'current',
      },
      sceneImage,
      rendererPaint: show || aggregateMesh
        ? {
            entityId,
            lane: componentRenderLane(componentType, component),
            rendererKind,
            primitiveCount: show ? 1 : 0,
            renderObjectCount,
            packedTint: null,
            rgbTint: null,
            alpha: show ? 1 : null,
          }
        : null,
      renderLanes,
    };
    return deepFreeze(visual);
  }

  public sceneImageProbe(): PatchMapEngineSceneImagesProbe {
    if (this.fault === 'missing-scene-images') return null as never;
    const images: Record<string, PatchMapEngineSceneImageRecord> = Object.create(null) as Record<
      string,
      PatchMapEngineSceneImageRecord
    >;
    for (const element of this.dataset) {
      if (element.type === 'image' && typeof element.source === 'string') {
        const record = this.failedImageRecord(element);
        images[String(record.entityId)] = record;
        continue;
      }
      if (!Array.isArray(element.components)) continue;
      for (const componentValue of element.components) {
        if (!isRecord(componentValue) || typeof componentValue.source !== 'string') continue;
        const show = componentValue.show !== false;
        const record = this.imageRecord(String(element.id), componentValue, show);
        images[String(record.entityId)] = record;
      }
    }
    if (
      this.fault === 'retain-resource' &&
      this.retainedIcon !== null &&
      this.findComponent(this.retainedIcon.ownerId, String(this.retainedIcon.component.id)) === null
    ) {
      const record = this.imageRecord(
        this.retainedIcon.ownerId,
        this.retainedIcon.component,
        true,
      );
      images[String(record.entityId)] = record;
    }
    const values = Object.values(images);
    const activeTargetCount = values.filter((image) => image.active === true).length;
    const activeBindingCount = new Set(values.filter(({ active }) => active).map(({ bindingKey }) => (
      bindingKey
    ))).size;
    const failed = values.filter(({ state }) => state === 'failed');
    const probe: PatchMapEngineSceneImagesProbe = {
      destroyed: this.destroyed,
      targetCount: values.length,
      activeTargetCount,
      bindingCount: activeBindingCount,
      pendingBindingCount: 0,
      pendingSettlementCount: 0,
      pendingReleaseCount: 0,
      diagnosticCount: failed.length,
      staleAttachCount: 0,
      staleCompletionCount: 0,
      images: Object.freeze(images),
      diagnostics: Object.freeze(failed.map((image) => Object.freeze({
        level: 'warning' as const,
        code: 'ASSET_LOAD_FAILED' as const,
        targetId: image.entityId,
        bindingKey: image.bindingKey,
        generation: image.generation,
        message: 'fixture scheme is outside the package-owned asset policy',
      }))),
      abandonedRequests: {
        pendingSettlementCount: 0,
        pendingReleaseCount: 0,
        staleAttachmentCount: 0,
      },
    };
    return deepFreeze(probe);
  }

  public debugSnapshot(): PatchMapSurfaceDebug {
    const renderLanes = this.renderLaneSnapshot();
    const laneValues = Object.values(renderLanes);
    const snapshot = {
      cssSize: Object.freeze([this.width, this.height] as const),
      backingSize: Object.freeze([
        Math.round(this.width * this.pixelRatio),
        Math.round(this.height * this.pixelRatio),
      ] as const),
      selectionIds: this.selectionIds,
      activeAnimationCount: 0,
      activeGestureCount: 0,
      ...(this.fault === 'missing-rendering'
        ? {}
        : {
            renderCommandCount: laneValues.reduce(
              (sum, lane) => sum + lane.renderObjectCount,
              0,
            ),
            visiblePrimitiveCount: laneValues.reduce(
              (sum, lane) => sum + lane.visiblePrimitiveCount,
              0,
            ),
          }),
    };
    return Object.freeze(snapshot);
  }

  private renderLaneSnapshot(): PatchMapRenderLaneSnapshot {
    const counts = new Map<PatchMapRenderLaneRole, number>(TEST_RENDER_LANE_ROLES.map((role) => (
      [role, 0] as const
    )));
    const increment = (role: PatchMapRenderLaneRole): void => {
      counts.set(role, (counts.get(role) ?? 0) + 1);
    };
    for (const element of this.dataset) {
      if (element.show === false) continue;
      if (element.type === 'item' && Array.isArray(element.components)) {
        for (const componentValue of element.components) {
          if (!isRecord(componentValue) || componentValue.show === false) continue;
          const componentType = String(componentValue.type);
          if (
            componentType === 'icon' &&
            (this.assetAcquisition === null || this.assetAlias !== componentValue.source)
          ) continue;
          increment(componentRenderLane(componentType, componentValue));
        }
      } else if (element.type === 'image') {
        increment('content-assets');
      } else if (element.type !== 'relations') {
        increment('ordinary-geometry');
      }
    }
    if (this.fault === 'retain-resource' && this.findComponent('item-a', 'icon') === null) {
      increment('content-assets');
    }
    if (this.fault === 'lane-orphan' && this.findComponent('item-a', 'icon') === null) {
      increment('content-assets');
    }
    return deepFreeze(Object.fromEntries(TEST_RENDER_LANE_ROLES.map((role) => {
      const count = counts.get(role) ?? 0;
      return [role, {
        role,
        label: `PatchMap / ${role}`,
        renderObjectCount: count,
        visiblePrimitiveCount: count,
      }];
    }))) as PatchMapRenderLaneSnapshot;
  }

  public async destroy(): Promise<boolean> {
    if (this.destroyed) return false;
    await this.assetSettlement;
    if (this.assetAcquisition !== null) await this.assetAcquisition.release();
    this.assetAcquisition = null;
    this.assetAlias = null;
    this.destroyed = true;
    this.canvasCount = 0;
    this.dataset = Object.freeze([]);
    this.selectionIds = Object.freeze([]);
    this.presentationInput = null;
    return true;
  }

  private queueAssetSynchronization(): void {
    this.assetSettlement = this.assetSettlement.then(async () => {
      const desiredAlias = this.desiredAssetAlias();
      if (this.assetAcquisition !== null && this.assetAlias !== desiredAlias) {
        await this.assetAcquisition.release();
        this.assetAcquisition = null;
        this.assetAlias = null;
      }
      if (desiredAlias !== null && this.assetAcquisition === null) {
        this.assetAcquisition = await this.assetSession.acquire(desiredAlias);
        this.assetAlias = desiredAlias;
      }
    });
  }

  private desiredAssetAlias(): string | null {
    const current = this.findComponent('item-a', 'icon');
    if (current !== null && current.show !== false && typeof current.source === 'string') {
      return current.source;
    }
    if (
      this.fault === 'retain-resource' &&
      this.retainedIcon !== null &&
      typeof this.retainedIcon.component.source === 'string'
    ) {
      return this.retainedIcon.component.source;
    }
    return null;
  }

  private findComponent(ownerId: string, componentId: string): JsonRecord | null {
    const owner = this.dataset.find((element) => element.id === ownerId);
    if (owner === undefined || !Array.isArray(owner.components)) return null;
    for (const value of owner.components as unknown[]) {
      if (isRecord(value) && value.id === componentId) return value;
    }
    return null;
  }

  private imageRecord(
    ownerId: string,
    component: JsonRecord,
    show: boolean,
  ): PatchMapEngineSceneImageRecord {
    const componentId = String(component.id);
    const source = String(component.source);
    const resolved = show && this.assetAcquisition !== null && this.assetAlias === source;
    const record: PatchMapEngineSceneImageRecord = {
      entityId: `${ownerId}::icon:${componentId}`,
      active: resolved,
      generation: this.geometryRevision,
      authoredSource: source,
      sourceKind: 'alias',
      dimensionMode: 'authored',
      bindingKey: `alias:${source}`,
      sourceCacheIdentity: `alias:${source}`,
      state: resolved ? 'resolved' : show ? 'pending' : 'absent',
      attachmentState: resolved ? 'current' : 'unbound',
      cacheIdentity: resolved ? this.assetAcquisition?.cacheIdentity ?? null : null,
      normalizedResourceIdentity: resolved
        ? this.assetAcquisition?.normalizedResourceIdentity ?? null
        : null,
      naturalSize: Object.freeze([16, 16] as const),
      reusedResolvedResource: false,
      publication: {
        rendererFacts: resolved && this.fault !== 'stale-publication' ? 'current' : 'pending',
      },
      renderObjectCount: resolved ? 1 : 0,
      placeholderCount: 0,
      bindingConsumerCount: resolved ? 1 : 0,
      role: resolved ? 'image' : 'none',
      rendererGeneration: resolved ? this.geometryRevision : null,
      staleAttachCount: 0,
      staleCompletionCount: 0,
      diagnosticCount: 0,
      opacity: 1,
      zIndex: 0,
      hitBounds: null,
      initial: null,
      attempts: Object.freeze([]),
    };
    return deepFreeze(record);
  }

  private failedImageRecord(image: JsonRecord): PatchMapEngineSceneImageRecord {
    const entityId = String(image.id);
    const source = String(image.source);
    const bindingKey = `url:${source}`;
    const active = image.show !== false;
    const record: PatchMapEngineSceneImageRecord = {
      entityId,
      active,
      generation: this.geometryRevision,
      authoredSource: source,
      sourceKind: 'url',
      dimensionMode: 'authored',
      bindingKey,
      sourceCacheIdentity: bindingKey,
      state: active ? 'failed' : 'absent',
      attachmentState: active ? 'current' : 'unbound',
      cacheIdentity: null,
      normalizedResourceIdentity: null,
      naturalSize: null,
      reusedResolvedResource: false,
      publication: { rendererFacts: 'current' },
      renderObjectCount: active ? 1 : 0,
      placeholderCount: active ? 1 : 0,
      bindingConsumerCount: active ? 1 : 0,
      role: active ? 'asset-placeholder' : 'none',
      rendererGeneration: active ? this.geometryRevision : null,
      staleAttachCount: 0,
      staleCompletionCount: 0,
      diagnosticCount: active ? 1 : 0,
      opacity: 1,
      zIndex: 0,
      hitBounds: null,
      initial: null,
      attempts: Object.freeze([]),
    };
    return deepFreeze(record);
  }
}

function entityGeometry(record: JsonRecord, affine = recordAffine(record)) {
  const attrs = isRecord(record.attrs) ? record.attrs : {};
  const size = isRecord(record.size) ? record.size : { width: 0, height: 0 };
  const width = numberOr(size.width, 0);
  const height = numberOr(size.height, 0);
  const angle = numberOr(attrs.angle, 0);
  const a = requiredNumber(affine, 0);
  const b = requiredNumber(affine, 1);
  const c = requiredNumber(affine, 2);
  const d = requiredNumber(affine, 3);
  const tx = requiredNumber(affine, 4);
  const ty = requiredNumber(affine, 5);
  const corners = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ].map(([localX = 0, localY = 0]) => [
    a * localX + c * localY + tx,
    b * localX + d * localY + ty,
  ] as const);
  const xs = corners.map(([cornerX]) => cornerX);
  const ys = corners.map(([, cornerY]) => cornerY);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const bounds = Object.freeze([minX, minY, maxX - minX, maxY - minY] as const);
  return deepFreeze({
    id: String(record.id),
    kind: String(record.type),
    localBounds: [0, 0, width, height] as const,
    worldBounds: bounds,
    screenBounds: bounds,
    visibleBounds: bounds,
    visible: record.show !== false,
    interactive: record.interactive !== false,
    visibleCenter: [
      a * width / 2 + c * height / 2 + tx,
      b * width / 2 + d * height / 2 + ty,
    ] as const,
    screenAngle: angle,
  });
}

function flattenGeometryNodes(
  values: readonly JsonRecord[],
  parentAffine: readonly number[] = [1, 0, 0, 1, 0, 0],
): readonly Readonly<{ readonly record: JsonRecord; readonly affine: readonly number[] }>[] {
  const nodes: Readonly<{ readonly record: JsonRecord; readonly affine: readonly number[] }>[] = [];
  for (const record of values) {
    const affine = multiplyAffine(parentAffine, recordAffine(record));
    if (record.type === 'group' && Array.isArray(record.children)) {
      nodes.push(...flattenGeometryNodes(asDataset(record.children), affine));
      continue;
    }
    if (record.type !== 'relations') nodes.push(Object.freeze({ record, affine }));
  }
  return Object.freeze(nodes);
}

function recordAffine(record: JsonRecord): readonly number[] {
  const attrs = isRecord(record.attrs) ? record.attrs : {};
  const angle = typeof attrs.angle === 'number' && Number.isFinite(attrs.angle)
    ? attrs.angle
    : typeof attrs.rotation === 'number' && Number.isFinite(attrs.rotation)
      ? attrs.rotation * 180 / Math.PI
      : 0;
  const radians = angle * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const scaleX = numberOr(attrs.scaleX, 1);
  const scaleY = numberOr(attrs.scaleY, 1);
  return Object.freeze([
    cosine * scaleX,
    sine * scaleX,
    -sine * scaleY,
    cosine * scaleY,
    numberOr(attrs.x, 0),
    numberOr(attrs.y, 0),
  ]);
}

function multiplyAffine(left: readonly number[], right: readonly number[]): readonly number[] {
  return Object.freeze([
    requiredNumber(left, 0) * requiredNumber(right, 0) +
      requiredNumber(left, 2) * requiredNumber(right, 1),
    requiredNumber(left, 1) * requiredNumber(right, 0) +
      requiredNumber(left, 3) * requiredNumber(right, 1),
    requiredNumber(left, 0) * requiredNumber(right, 2) +
      requiredNumber(left, 2) * requiredNumber(right, 3),
    requiredNumber(left, 1) * requiredNumber(right, 2) +
      requiredNumber(left, 3) * requiredNumber(right, 3),
    requiredNumber(left, 0) * requiredNumber(right, 4) +
      requiredNumber(left, 2) * requiredNumber(right, 5) + requiredNumber(left, 4),
    requiredNumber(left, 1) * requiredNumber(right, 4) +
      requiredNumber(left, 3) * requiredNumber(right, 5) + requiredNumber(left, 5),
  ]);
}

function requiredNumber(values: readonly number[], index: number): number {
  const value = values[index];
  if (value === undefined) throw new Error(`Missing affine entry ${index}`);
  return value;
}

function hasElementId(values: readonly JsonRecord[], id: string): boolean {
  for (const record of values) {
    if (record.id === id) return true;
    if (
      record.type === 'group' &&
      Array.isArray(record.children) &&
      hasElementId(asDataset(record.children), id)
    ) return true;
  }
  return false;
}

function componentProductRenderRole(
  componentType: string,
  component: JsonRecord,
): PatchMapComponentRenderRole {
  if (componentType === 'background') {
    return isRecord(component.source) && component.source.type === 'rect'
      ? 'background-geometry'
      : 'background-asset';
  }
  if (componentType === 'icon') return 'content-asset';
  if (componentType === 'text') return 'text';
  return 'ordinary-geometry';
}

function componentRenderLane(
  componentType: string,
  component: JsonRecord,
): PatchMapRenderLaneRole {
  switch (componentType) {
    case 'background':
      return isRecord(component.source) && component.source.type === 'rect'
        ? 'background-geometry'
        : 'background-assets';
    case 'icon':
      return 'content-assets';
    case 'text':
      return 'text';
    default:
      return 'ordinary-geometry';
  }
}

function relationBounds(
  start: readonly [number, number],
  end: readonly [number, number],
): readonly [number, number, number, number] {
  return Object.freeze([
    Math.min(start[0], end[0]),
    Math.min(start[1], end[1]),
    Math.abs(end[0] - start[0]),
    Math.abs(end[1] - start[1]),
  ]);
}

function center(bounds: readonly [number, number, number, number]): readonly [number, number] {
  return Object.freeze([bounds[0] + bounds[2] / 2, bounds[1] + bounds[3] / 2]);
}


function refreshTargetLabel(target: PatchMapSemanticTarget): string {
  return target.kind === 'component'
    ? `${target.ownerId}/${target.id}`
    : target.id;
}


let testAssetBackendSequence = 0;

export function createTestAssetRuntime(): PatchMapAssetRuntime {
  const backend: PatchMapAssetBackend = Object.freeze({
    keyNamespace: `patch-map-update-handler-test-${++testAssetBackendSequence}`,
    get(_request: PatchMapAssetBackendRequest) {
      return undefined;
    },
    load(request: PatchMapAssetBackendRequest) {
      return Promise.resolve(Object.freeze({ key: request.key }));
    },
    describe(request: PatchMapAssetBackendRequest) {
      return Object.freeze({
        normalizedResourceIdentity: `decoded:${request.cacheIdentity}`,
        cacheIdentity: request.cacheIdentity,
      });
    },
    unload(_key: string) {
      return Promise.resolve();
    },
  });
  return new PatchMapAssetRuntime(backend);
}

export function zeroOwnership(): Readonly<JsonRecord> {
  return Object.freeze({
    activeSessionCount: 0,
    tickerCount: 0,
    schedulerCount: 0,
    listenerCount: 0,
    animationClosureCount: 0,
    pendingWorkCount: 0,
  });
}

function asDataset(value: unknown): readonly JsonRecord[] {
  if (!Array.isArray(value)) throw new Error('Surface dataset must be an array');
  return value as readonly JsonRecord[];
}

export function requireArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

export function requireRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`${label} must be a record`);
  return value;
}

export function requireInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`${label} must be positive`);
  }
  return value as number;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value as object)) return value;
  seen.add(value as object);
  for (const key of Reflect.ownKeys(value as object)) {
    deepFreeze(Reflect.get(value as object, key), seen);
  }
  return Object.freeze(value);
}

