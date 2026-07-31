import {
  Container,
  Graphics,
  GraphicsContext,
  Particle,
  ParticleContainer,
  Rectangle,
  Texture,
} from 'pixi.js';

import type { SlotRange } from '../dense/contracts';
import {
  RenderFlags,
  RenderKind,
  type RenderStoreView,
} from '../dense/renderer-types';
import type { PatchMapAffineBasis } from '../semantic/geometry';
import {
  resolvePatchMapRelationPath,
} from '../semantic/relations';
import {
  resolvePatchMapRelationEndpointGeometry as particleEndpointGeometry,
} from './relation-endpoint-geometry';
import {
  resolvePatchMapSlotQuad,
  type PatchMapProjectionRenderContext,
} from './types';

const EMPTY_BOUNDS = Object.freeze({ x: 0, y: 0, width: 1, height: 1 });

export interface ParticleQuadDescriptor {
  readonly key: string;
  readonly slot: number;
  readonly role: 'rect' | 'bar-track' | 'bar-fill';
  readonly centerX: number;
  readonly centerY: number;
  readonly width: number;
  readonly height: number;
  /** Normalized signed axes shared with Mesh, leaves, and geometry probes. */
  readonly basis: PatchMapAffineBasis;
  readonly rotation: number;
  readonly tint: number;
  readonly alpha: number;
}

export interface GraphicsQuadDescriptor extends ParticleQuadDescriptor {
  readonly radius: number;
  readonly strokeTint: number;
  readonly strokeAlpha: number;
  readonly strokeWidth: number;
}

export interface RelationSegmentDescriptor {
  readonly key: string;
  readonly relationId: string;
  readonly segmentIndex: number;
  readonly slot: number;
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  readonly tint: number;
  readonly alpha: number;
  readonly lineWidth: number;
  readonly resolved: boolean;
}

export interface LayerBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ParticleGraphicsDescriptors {
  readonly staticParticles: readonly ParticleQuadDescriptor[];
  readonly dynamicParticles: readonly ParticleQuadDescriptor[];
  readonly fallbackGraphics: readonly GraphicsQuadDescriptor[];
  readonly relations: readonly RelationSegmentDescriptor[];
  readonly staticBounds: LayerBounds;
  readonly dynamicBounds: LayerBounds;
  readonly unsupportedCount: number;
  readonly selectedCount: number;
}

export interface ParticleGraphicsLayerOptions {
  /** Defaults to Texture.WHITE. A texture seam keeps construction testable without a renderer. */
  readonly texture?: Texture;
  readonly label?: string;
}

export interface ParticleGraphicsSyncOptions {
  /** Dense ranges are reported for evidence; this spike still scans and uploads its aggregate lanes. */
  readonly changedRanges?: readonly SlotRange[];
  /** Change this on document reload even if the dense store reuses its revision number. */
  readonly fullRebuildEpoch?: number | string;
  readonly projectionContext?: PatchMapProjectionRenderContext;
}

export interface ParticleGraphicsDebugCounters {
  readonly storeRevision: number;
  readonly fullRebuildEpoch: number | string | null;
  readonly fullRebuilds: number;
  readonly inPlaceSyncs: number;
  readonly changedRangeCount: number;
  readonly staticParticleCount: number;
  readonly dynamicParticleCount: number;
  readonly fallbackShapeCount: number;
  readonly relationSegmentCount: number;
  readonly unsupportedCount: number;
  readonly selectedCount: number;
  /** Every render uploads all enabled dynamic attributes for this many particles. */
  readonly dynamicFullUploadCount: number;
  /** Static particles explicitly invalidated by this synchronization. */
  readonly staticInvalidatedUploadCount: number;
  /** Observable particle population uploaded/invalidated for the next render. */
  readonly particleFullUploadCount: number;
  readonly aggregateDisplayObjectCount: number;
}

export interface ParticleGraphicsSyncResult extends ParticleGraphicsDebugCounters {
  readonly changed: boolean;
  readonly fullRebuild: boolean;
}

/**
 * Known trade-offs of the Particle/Sprite/GraphicsContext competitor.
 *
 * These are public so benchmark reports cannot accidentally hide the reasons
 * this layer may lose to aggregate Mesh geometry.
 */
export const PARTICLE_GRAPHICS_LIMITATIONS = Object.freeze([
  'dynamic ParticleContainer attributes are uploaded for the whole container on every rendered frame',
  'rounded or stroked quads rebuild retained GraphicsContext geometry when their values change',
  'aggregate partitions preserve order within a partition, not arbitrary cross-kind z interleaving',
  'text and image entities are intentionally delegated to their dedicated PatchMap layers',
] as const);

/**
 * Convert a dense Core store into renderer-neutral Particle/Graphics records.
 * The builder allocates no Pixi scene objects, so normalization and adapter
 * correctness can be unit-tested in a Node environment.
 */
export function buildParticleGraphicsDescriptors(
  store: RenderStoreView,
  projectionContext?: PatchMapProjectionRenderContext,
): ParticleGraphicsDescriptors {
  const staticParticles: ParticleQuadDescriptor[] = [];
  const dynamicParticles: ParticleQuadDescriptor[] = [];
  const fallbackGraphics: GraphicsQuadDescriptor[] = [];
  const relations: RelationSegmentDescriptor[] = [];
  let unsupportedCount = 0;
  let selectedCount = 0;

  const order = store.renderOrder();
  for (let orderIndex = 0; orderIndex < order.length; orderIndex += 1) {
    const slot = order[orderIndex] as number;
    if (!isAlive(store, slot)) continue;

    const flags = store.flags[slot] as number;
    if ((flags & RenderFlags.Selected) !== 0) selectedCount += 1;
    const visibleOpacity = (flags & RenderFlags.Visible) === 0
      ? 0
      : clamp01(store.opacity[slot] as number);
    const kind = store.kind[slot] as number;

    if (kind === RenderKind.Rect) {
      const fill = unpackColor(store.fill[slot] as number, visibleOpacity);
      const stroke = unpackColor(store.stroke[slot] as number, visibleOpacity);
      const quad = createQuad(
        store,
        slot,
        'rect',
        fill.tint,
        fill.alpha,
        projectionContext,
      );
      const radius = clampRadius(store.radius[slot] as number, quad.width, quad.height);
      const strokeWidth = Math.max(0, finiteOrZero(store.strokeWidth[slot] as number));

      if (
        radius === 0 &&
        (stroke.alpha === 0 || strokeWidth === 0) &&
        isParticleCompatible(quad)
      ) {
        staticParticles.push(quad);
      } else {
        fallbackGraphics.push({
          ...quad,
          radius,
          strokeTint: stroke.tint,
          strokeAlpha: stroke.alpha,
          strokeWidth,
        });
      }
      continue;
    }

    if (kind === RenderKind.Bar) {
      const min = finiteOrZero(store.min[slot] as number);
      const max = finiteOrZero(store.max[slot] as number);
      const value = finiteOrZero(store.value[slot] as number);
      const progress = max > min ? clamp01((value - min) / (max - min)) : 0;
      const track = unpackColor(store.trackFill[slot] as number, visibleOpacity);
      const fill = unpackColor(store.fill[slot] as number, visibleOpacity);
      const trackQuad = createQuad(
        store,
        slot,
        'bar-track',
        track.tint,
        track.alpha,
        projectionContext,
      );
      const fillQuad = createQuad(
        store,
        slot,
        'bar-fill',
        fill.tint,
        fill.alpha,
        projectionContext,
        progress,
      );
      const radius = clampRadius(
        store.radius[slot] as number,
        trackQuad.width,
        trackQuad.height,
      );

      if (
        radius === 0 &&
        isParticleCompatible(trackQuad) &&
        isParticleCompatible(fillQuad)
      ) {
        // Keep the zero-width fill particle so a 0 -> positive animation does
        // not churn Particle instances or change the aggregate topology.
        dynamicParticles.push(trackQuad, fillQuad);
      } else {
        fallbackGraphics.push(
          {
            ...trackQuad,
            radius,
            strokeTint: 0,
            strokeAlpha: 0,
            strokeWidth: 0,
          },
          {
            ...fillQuad,
            radius: Math.min(radius, fillQuad.width / 2),
            strokeTint: 0,
            strokeAlpha: 0,
            strokeWidth: 0,
          },
        );
      }
      continue;
    }

    if (kind === RenderKind.Relation) {
      relations.push(...createRelations(store, slot, visibleOpacity, projectionContext));
      continue;
    }

    // Text and image have dedicated aggregate layers in PatchMap. Unknown kind
    // codes are counted here as well so omission is observable.
    unsupportedCount += 1;
  }

  return Object.freeze({
    staticParticles: Object.freeze(staticParticles),
    dynamicParticles: Object.freeze(dynamicParticles),
    fallbackGraphics: Object.freeze(fallbackGraphics),
    relations: Object.freeze(relations),
    staticBounds: freezeBounds(computeQuadBounds(staticParticles)),
    dynamicBounds: freezeBounds(computeQuadBounds(dynamicParticles)),
    unsupportedCount,
    selectedCount,
  });
}

/**
 * Pixi adapter for spike B. It owns four meaningful aggregate display objects:
 * static particles, mutable bar particles, fallback Graphics, and relations.
 * It intentionally owns no events, entity listeners, or tickers.
 */
export class ParticleGraphicsLayer {
  public readonly container: Container;
  public readonly staticParticles: ParticleContainer;
  public readonly dynamicParticles: ParticleContainer;
  public readonly fallbackGraphics: Graphics;
  public readonly relationGraphics: Graphics;

  readonly #texture: Texture;
  readonly #fallbackContext: GraphicsContext;
  readonly #relationContext: GraphicsContext;
  #staticKeys: string[] = [];
  #dynamicKeys: string[] = [];
  #lastStore: RenderStoreView | null = null;
  #lastRevision = -1;
  #lastProjectionRevision = -1;
  #lastEpoch: number | string | null = null;
  #lastFallbackSignature = '';
  #lastRelationSignature = '';
  #fullRebuilds = 0;
  #inPlaceSyncs = 0;
  #lastCounters: ParticleGraphicsDebugCounters;
  #destroyed = false;

  public constructor(options: ParticleGraphicsLayerOptions = {}) {
    const label = options.label ?? 'PatchMap Particle + Graphics spike';
    this.#texture = options.texture ?? Texture.WHITE;
    this.container = new Container({ label });
    this.container.eventMode = 'none';
    this.container.interactiveChildren = false;

    this.staticParticles = new ParticleContainer({
      label: `${label} / static rectangles`,
      texture: this.#texture,
      boundsArea: new Rectangle(0, 0, 1, 1),
      dynamicProperties: {
        vertex: false,
        position: false,
        rotation: false,
        uvs: false,
        color: false,
      },
    });
    this.dynamicParticles = new ParticleContainer({
      label: `${label} / dynamic bars`,
      texture: this.#texture,
      boundsArea: new Rectangle(0, 0, 1, 1),
      // Bar value changes scale (vertex). Transactions can also move, rotate,
      // recolor, or fade bars, so this honest competitor enables each lane.
      // Pixi uploads enabled lanes for the entire container per rendered frame.
      dynamicProperties: {
        vertex: true,
        position: true,
        rotation: true,
        uvs: false,
        color: true,
      },
    });

    this.#fallbackContext = new GraphicsContext();
    this.#fallbackContext.batchMode = 'batch';
    this.fallbackGraphics = new Graphics({
      label: `${label} / rounded and stroked fallback`,
      context: this.#fallbackContext,
    });
    this.#relationContext = new GraphicsContext();
    this.#relationContext.batchMode = 'batch';
    this.relationGraphics = new Graphics({
      label: `${label} / aggregate relations`,
      context: this.#relationContext,
    });
    this.fallbackGraphics.eventMode = 'none';
    this.relationGraphics.eventMode = 'none';

    this.container.addChild(
      this.relationGraphics,
      this.staticParticles,
      this.fallbackGraphics,
      this.dynamicParticles,
    );
    this.#lastCounters = freezeCounters({
      storeRevision: -1,
      fullRebuildEpoch: null,
      fullRebuilds: 0,
      inPlaceSyncs: 0,
      changedRangeCount: 0,
      staticParticleCount: 0,
      dynamicParticleCount: 0,
      fallbackShapeCount: 0,
      relationSegmentCount: 0,
      unsupportedCount: 0,
      selectedCount: 0,
      dynamicFullUploadCount: 0,
      staticInvalidatedUploadCount: 0,
      particleFullUploadCount: 0,
      aggregateDisplayObjectCount: 4,
    });
  }

  public get destroyed(): boolean {
    return this.#destroyed;
  }

  public get debugCounters(): ParticleGraphicsDebugCounters {
    return this.#lastCounters;
  }

  public sync(
    store: RenderStoreView,
    options: ParticleGraphicsSyncOptions = {},
  ): ParticleGraphicsSyncResult {
    this.#assertAlive();
    const requestedEpoch = options.fullRebuildEpoch ?? null;
    const requestedProjectionRevision = options.projectionContext?.revision ?? -1;
    if (
      store === this.#lastStore &&
      store.revision === this.#lastRevision &&
      requestedProjectionRevision === this.#lastProjectionRevision &&
      requestedEpoch === this.#lastEpoch
    ) {
      return Object.freeze({ ...this.#lastCounters, changed: false, fullRebuild: false });
    }

    const descriptors = buildParticleGraphicsDescriptors(store, options.projectionContext);
    const fullRebuild =
      store !== this.#lastStore ||
      requestedEpoch !== this.#lastEpoch ||
      !sameKeys(this.#staticKeys, descriptors.staticParticles) ||
      !sameKeys(this.#dynamicKeys, descriptors.dynamicParticles);
    const projectionChanged = requestedProjectionRevision !== this.#lastProjectionRevision;
    const staticInvalidated =
      fullRebuild ||
      changedRangesTouchRect(store, options.changedRanges) ||
      (projectionChanged && options.changedRanges === undefined);

    if (fullRebuild) {
      this.#replaceParticles(
        this.staticParticles,
        descriptors.staticParticles,
        this.#staticKeys,
      );
      this.#replaceParticles(
        this.dynamicParticles,
        descriptors.dynamicParticles,
        this.#dynamicKeys,
      );
      this.#fullRebuilds += 1;
    } else {
      if (staticInvalidated) {
        this.#updateParticles(this.staticParticles, descriptors.staticParticles);
        // Static attributes upload only when a changed range touches a Rect.
        this.staticParticles.update();
      }
      this.#updateParticles(this.dynamicParticles, descriptors.dynamicParticles);
      // Dynamic lanes are consumed by Pixi's ParticlePipe during every render.
      this.#inPlaceSyncs += 1;
    }

    this.staticParticles.boundsArea = toRectangle(descriptors.staticBounds);
    this.dynamicParticles.boundsArea = toRectangle(descriptors.dynamicBounds);
    this.#syncFallbackGraphics(descriptors.fallbackGraphics);
    this.#syncRelations(descriptors.relations);

    this.#lastStore = store;
    this.#lastRevision = store.revision;
    this.#lastProjectionRevision = requestedProjectionRevision;
    this.#lastEpoch = requestedEpoch;
    this.#lastCounters = freezeCounters({
      storeRevision: store.revision,
      fullRebuildEpoch: requestedEpoch,
      fullRebuilds: this.#fullRebuilds,
      inPlaceSyncs: this.#inPlaceSyncs,
      changedRangeCount: options.changedRanges?.length ?? 0,
      staticParticleCount: descriptors.staticParticles.length,
      dynamicParticleCount: descriptors.dynamicParticles.length,
      fallbackShapeCount: descriptors.fallbackGraphics.length,
      relationSegmentCount: new Set(
        descriptors.relations.filter((relation) => relation.resolved).map((relation) => relation.slot),
      ).size,
      unsupportedCount: descriptors.unsupportedCount,
      selectedCount: descriptors.selectedCount,
      dynamicFullUploadCount: descriptors.dynamicParticles.length,
      staticInvalidatedUploadCount: staticInvalidated ? descriptors.staticParticles.length : 0,
      particleFullUploadCount:
        descriptors.dynamicParticles.length +
        (staticInvalidated ? descriptors.staticParticles.length : 0),
      aggregateDisplayObjectCount: 4,
    });

    return Object.freeze({ ...this.#lastCounters, changed: true, fullRebuild });
  }

  public destroy(): boolean {
    if (this.#destroyed) return false;
    this.container.removeChildren();

    this.staticParticles.particleChildren.length = 0;
    this.dynamicParticles.particleChildren.length = 0;
    this.staticParticles.update();
    this.dynamicParticles.update();
    this.staticParticles.destroy();
    this.dynamicParticles.destroy();

    // Graphics were constructed with shared contexts, so their default
    // destruction preserves the contexts; destroy those explicitly afterward.
    this.fallbackGraphics.destroy({ context: false });
    this.relationGraphics.destroy({ context: false });
    this.#fallbackContext.destroy();
    this.#relationContext.destroy();
    this.container.destroy();

    this.#staticKeys.length = 0;
    this.#dynamicKeys.length = 0;
    this.#lastStore = null;
    this.#lastRevision = -1;
    this.#lastProjectionRevision = -1;
    this.#lastFallbackSignature = '';
    this.#lastRelationSignature = '';
    this.#destroyed = true;
    return true;
  }

  #replaceParticles(
    container: ParticleContainer,
    descriptors: readonly ParticleQuadDescriptor[],
    keys: string[],
  ): void {
    const particles = container.particleChildren;
    particles.length = 0;
    keys.length = 0;
    for (const descriptor of descriptors) {
      const particle = new Particle({ texture: this.#texture });
      applyParticle(particle, descriptor, this.#texture);
      particles.push(particle);
      keys.push(descriptor.key);
    }
    container.update();
  }

  #updateParticles(
    container: ParticleContainer,
    descriptors: readonly ParticleQuadDescriptor[],
  ): void {
    for (let index = 0; index < descriptors.length; index += 1) {
      const particle = container.particleChildren[index];
      const descriptor = descriptors[index];
      if (particle !== undefined && descriptor !== undefined) {
        // This layer only inserts concrete Particle instances. Pixi exposes
        // particleChildren as IParticle[] because callers may supply their own
        // structs, so recover the narrower type at this owned boundary.
        applyParticle(particle as Particle, descriptor, this.#texture);
      }
    }
  }

  #syncFallbackGraphics(descriptors: readonly GraphicsQuadDescriptor[]): void {
    const signature = graphicsSignature(descriptors);
    if (signature === this.#lastFallbackSignature) return;
    this.#lastFallbackSignature = signature;
    this.#fallbackContext.clear();
    for (const descriptor of descriptors) drawGraphicsQuad(this.#fallbackContext, descriptor);
  }

  #syncRelations(descriptors: readonly RelationSegmentDescriptor[]): void {
    const signature = relationSignature(descriptors);
    if (signature === this.#lastRelationSignature) return;
    this.#lastRelationSignature = signature;
    this.#relationContext.clear();
    for (const relation of descriptors) {
      if (
        !relation.resolved ||
        relation.alpha <= 0 ||
        relation.lineWidth <= 0
      ) {
        continue;
      }
      this.#relationContext
        .moveTo(relation.fromX, relation.fromY)
        .lineTo(relation.toX, relation.toY)
        .stroke({
          color: relation.tint,
          alpha: relation.alpha,
          width: relation.lineWidth,
        });
    }
  }

  #assertAlive(): void {
    if (this.#destroyed) throw new Error('ParticleGraphicsLayer is destroyed');
  }
}

function changedRangesTouchRect(
  store: RenderStoreView,
  ranges: readonly SlotRange[] | undefined,
): boolean {
  if (ranges === undefined) return true;
  for (const range of ranges) {
    const start = Math.max(0, Math.min(store.capacity, Math.floor(range.start)));
    const end = Math.max(start, Math.min(store.capacity, Math.ceil(range.end)));
    for (let slot = start; slot < end; slot += 1) {
      if (
        (store.alive[slot] as number) !== 0 &&
        (store.kind[slot] as number) === RenderKind.Rect
      ) {
        return true;
      }
    }
  }
  return false;
}

function createQuad(
  store: RenderStoreView,
  slot: number,
  role: ParticleQuadDescriptor['role'],
  tint: number,
  alpha: number,
  projectionContext?: PatchMapProjectionRenderContext,
  widthFraction = 1,
): ParticleQuadDescriptor {
  const resolved = resolvePatchMapSlotQuad(store, slot, projectionContext, widthFraction);
  const rotation = Math.atan2(resolved.basis[1], resolved.basis[0]);
  return Object.freeze({
    key: `${role}:${slot}`,
    slot,
    role,
    centerX: resolved.center[0],
    centerY: resolved.center[1],
    width: resolved.width,
    height: resolved.height,
    basis: resolved.basis,
    rotation,
    tint,
    alpha,
  });
}

function createRelations(
  store: RenderStoreView,
  slot: number,
  visibleOpacity: number,
  projectionContext?: PatchMapProjectionRenderContext,
): readonly RelationSegmentDescriptor[] {
  const from = store.relationFrom[slot] as number;
  const to = store.relationTo[slot] as number;
  const resolved = isAlive(store, from) && isAlive(store, to);
  const color = unpackColor(store.color[slot] as number, visibleOpacity);
  const entityId = store.ids[slot] ?? `@slot:${slot}`;
  const relationProjection = projectionContext?.index.relationsByEntityId?.[entityId];
  if (!resolved) {
    return Object.freeze([Object.freeze({
      key: `relation:${slot}:0`,
      relationId: relationProjection?.relationId ?? entityId,
      segmentIndex: 0,
      slot,
      fromX: 0,
      fromY: 0,
      toX: 0,
      toY: 0,
      tint: color.tint,
      alpha: color.alpha,
      lineWidth: positiveOrZero(store.lineWidth[slot] as number),
      resolved: false,
    })]);
  }
  const fromQuad = resolvePatchMapSlotQuad(store, from, projectionContext);
  const toQuad = resolvePatchMapSlotQuad(store, to, projectionContext);
  const points = relationProjection
    ? resolvePatchMapRelationPath(
        relationProjection,
        particleEndpointGeometry(store, from, fromQuad.vertices, fromQuad.center),
        particleEndpointGeometry(store, to, toQuad.vertices, toQuad.center),
        {
          color: store.color[slot] as number,
          width: positiveOrZero(store.lineWidth[slot] as number),
          opacity: visibleOpacity,
          zIndex: store.zIndex[slot] as number,
          visible: visibleOpacity > 0,
        },
      )
    : null;
  const worldPoints = points?.visible === false
    ? []
    : points?.worldPoints ?? [fromQuad.center, toQuad.center];
  const descriptors: RelationSegmentDescriptor[] = [];
  for (let index = 1; index < worldPoints.length; index += 1) {
    const start = worldPoints[index - 1];
    const end = worldPoints[index];
    if (!start || !end) continue;
    descriptors.push(Object.freeze({
      key: `relation:${slot}:${index - 1}`,
      relationId: relationProjection?.relationId ?? entityId,
      segmentIndex: index - 1,
      slot,
      fromX: start[0],
      fromY: start[1],
      toX: end[0],
      toY: end[1],
      tint: color.tint,
      alpha: color.alpha,
      lineWidth: points?.worldStrokeWidths[index - 1] ??
        positiveOrZero(store.lineWidth[slot] as number),
      resolved: true,
    }));
  }
  return Object.freeze(descriptors);
}

function drawGraphicsQuad(
  context: GraphicsContext,
  descriptor: GraphicsQuadDescriptor,
): void {
  if (descriptor.width <= 0 || descriptor.height <= 0) return;
  const hasFill = descriptor.alpha > 0;
  const hasStroke = descriptor.strokeAlpha > 0 && descriptor.strokeWidth > 0;
  if (!hasFill && !hasStroke) return;

  appendRotatedRoundedRect(context, descriptor);
  if (hasFill) context.fill({ color: descriptor.tint, alpha: descriptor.alpha });
  if (hasStroke) {
    context.stroke({
      color: descriptor.strokeTint,
      alpha: descriptor.strokeAlpha,
      width: descriptor.strokeWidth,
    });
  }
}

/**
 * GraphicsContext draw-time transforms were added after the earliest Pixi v8
 * releases supported by this package. Transforming the path explicitly keeps
 * the competitor on the public API available across the declared v8 range.
 */
function appendRotatedRoundedRect(
  context: GraphicsContext,
  descriptor: GraphicsQuadDescriptor,
): void {
  const halfWidth = descriptor.width / 2;
  const halfHeight = descriptor.height / 2;
  const radius = Math.min(descriptor.radius, halfWidth, halfHeight);
  const point = (x: number, y: number): readonly [number, number] => {
    return [
      descriptor.centerX + x * descriptor.basis[0] + y * descriptor.basis[2],
      descriptor.centerY + x * descriptor.basis[1] + y * descriptor.basis[3],
    ];
  };

  if (radius <= 0) {
    const topLeft = point(-halfWidth, -halfHeight);
    const topRight = point(halfWidth, -halfHeight);
    const bottomRight = point(halfWidth, halfHeight);
    const bottomLeft = point(-halfWidth, halfHeight);
    context
      .moveTo(topLeft[0], topLeft[1])
      .lineTo(topRight[0], topRight[1])
      .lineTo(bottomRight[0], bottomRight[1])
      .lineTo(bottomLeft[0], bottomLeft[1])
      .closePath();
    return;
  }

  const start = point(-halfWidth + radius, -halfHeight);
  const topEnd = point(halfWidth - radius, -halfHeight);
  const topRightControl = point(halfWidth, -halfHeight);
  const rightStart = point(halfWidth, -halfHeight + radius);
  const rightEnd = point(halfWidth, halfHeight - radius);
  const bottomRightControl = point(halfWidth, halfHeight);
  const bottomStart = point(halfWidth - radius, halfHeight);
  const bottomEnd = point(-halfWidth + radius, halfHeight);
  const bottomLeftControl = point(-halfWidth, halfHeight);
  const leftStart = point(-halfWidth, halfHeight - radius);
  const leftEnd = point(-halfWidth, -halfHeight + radius);
  const topLeftControl = point(-halfWidth, -halfHeight);

  context
    .moveTo(start[0], start[1])
    .lineTo(topEnd[0], topEnd[1])
    .quadraticCurveTo(topRightControl[0], topRightControl[1], rightStart[0], rightStart[1])
    .lineTo(rightEnd[0], rightEnd[1])
    .quadraticCurveTo(
      bottomRightControl[0],
      bottomRightControl[1],
      bottomStart[0],
      bottomStart[1],
    )
    .lineTo(bottomEnd[0], bottomEnd[1])
    .quadraticCurveTo(
      bottomLeftControl[0],
      bottomLeftControl[1],
      leftStart[0],
      leftStart[1],
    )
    .lineTo(leftEnd[0], leftEnd[1])
    .quadraticCurveTo(topLeftControl[0], topLeftControl[1], start[0], start[1])
    .closePath();
}

function applyParticle(
  particle: Particle,
  descriptor: ParticleQuadDescriptor,
  texture: Texture,
): void {
  const textureWidth = Math.max(Number.EPSILON, texture.width);
  const textureHeight = Math.max(Number.EPSILON, texture.height);
  particle.x = descriptor.centerX;
  particle.y = descriptor.centerY;
  particle.anchorX = 0.5;
  particle.anchorY = 0.5;
  particle.scaleX = descriptor.width / textureWidth;
  particle.scaleY = descriptor.height / textureHeight * basisHandedness(descriptor.basis);
  particle.rotation = descriptor.rotation;
  particle.tint = descriptor.tint;
  particle.alpha = descriptor.alpha;
}

function unpackColor(packedInput: number, opacity: number): { tint: number; alpha: number } {
  const packed = packedInput >>> 0;
  return {
    tint: packed >>> 8,
    alpha: ((packed & 0xff) / 0xff) * clamp01(opacity),
  };
}

function isAlive(store: RenderStoreView, slot: number): boolean {
  return (
    Number.isInteger(slot) &&
    slot >= 0 &&
    slot < store.capacity &&
    (store.alive[slot] as number) !== 0
  );
}

function positiveOrZero(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function clampRadius(radius: number, width: number, height: number): number {
  if (!Number.isFinite(radius) || radius <= 0) return 0;
  return Math.min(radius, width / 2, height / 2);
}

function sameKeys(
  current: readonly string[],
  descriptors: readonly ParticleQuadDescriptor[],
): boolean {
  if (current.length !== descriptors.length) return false;
  for (let index = 0; index < current.length; index += 1) {
    if (current[index] !== descriptors[index]?.key) return false;
  }
  return true;
}

function computeQuadBounds(descriptors: readonly ParticleQuadDescriptor[]): LayerBounds {
  if (descriptors.length === 0) return EMPTY_BOUNDS;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const descriptor of descriptors) {
    const halfWidth = (
      descriptor.width * Math.abs(descriptor.basis[0]) +
      descriptor.height * Math.abs(descriptor.basis[2])
    ) / 2;
    const halfHeight = (
      descriptor.width * Math.abs(descriptor.basis[1]) +
      descriptor.height * Math.abs(descriptor.basis[3])
    ) / 2;
    minX = Math.min(minX, descriptor.centerX - halfWidth);
    minY = Math.min(minY, descriptor.centerY - halfHeight);
    maxX = Math.max(maxX, descriptor.centerX + halfWidth);
    maxY = Math.max(maxY, descriptor.centerY + halfHeight);
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function freezeBounds(bounds: LayerBounds): LayerBounds {
  return Object.freeze({ ...bounds });
}

function toRectangle(bounds: LayerBounds): Rectangle {
  return new Rectangle(bounds.x, bounds.y, bounds.width, bounds.height);
}

function graphicsSignature(descriptors: readonly GraphicsQuadDescriptor[]): string {
  return descriptors.map((descriptor) => [
    descriptor.key,
    descriptor.centerX,
    descriptor.centerY,
    descriptor.width,
    descriptor.height,
    ...descriptor.basis,
    descriptor.rotation,
    descriptor.tint,
    descriptor.alpha,
    descriptor.radius,
    descriptor.strokeTint,
    descriptor.strokeAlpha,
    descriptor.strokeWidth,
  ].join(',')).join(';');
}

function relationSignature(descriptors: readonly RelationSegmentDescriptor[]): string {
  return descriptors.map((descriptor) => [
    descriptor.key,
    descriptor.fromX,
    descriptor.fromY,
    descriptor.toX,
    descriptor.toY,
    descriptor.tint,
    descriptor.alpha,
    descriptor.lineWidth,
    descriptor.resolved ? 1 : 0,
  ].join(',')).join(';');
}

function freezeCounters(counters: ParticleGraphicsDebugCounters): ParticleGraphicsDebugCounters {
  return Object.freeze({ ...counters });
}

function isParticleCompatible(descriptor: ParticleQuadDescriptor): boolean {
  if (descriptor.width === 0 || descriptor.height === 0) return true;
  const [a, b, c, d] = descriptor.basis;
  const xLength = Math.hypot(a, b);
  const yLength = Math.hypot(c, d);
  const dot = a * c + b * d;
  const determinant = a * d - b * c;
  return Math.abs(xLength - 1) <= 1e-6 &&
    Math.abs(yLength - 1) <= 1e-6 &&
    Math.abs(dot) <= 1e-6 &&
    Math.abs(Math.abs(determinant) - 1) <= 1e-6;
}

function basisHandedness(basis: PatchMapAffineBasis): 1 | -1 {
  return basis[0] * basis[3] - basis[1] * basis[2] < 0 ? -1 : 1;
}
