import type { PatchMapBackgroundPaintProjection } from '../../contracts';
import {
  RenderFlags,
  RenderKind,
  type RenderStoreView,
} from '../../dense/renderer-types';
import {
  resolvePatchMapRelationPath,
} from '../../semantic/relations';
import {
  resolvePatchMapRelationEndpointGeometry as endpointGeometry,
} from '../relation-endpoint-geometry';
import {
  resolvePatchMapSlotQuad,
  type PatchMapEntityPaintProbe,
  type PatchMapProjectionRenderContext,
} from '../types';
import {
  buildLineGeometry,
  buildQuadGeometry,
  clamp01,
  finishGeometry,
  isFiniteLine,
  isFiniteQuad,
  multiplyPackedRgba,
  packedRgbaToMeshStyle,
  type AggregateGeometryData,
  type AggregateLine,
  type AggregateQuad,
  type PackedMeshStyle,
} from './geometry';

const RECT_PASS = 0;
const BAR_TRACK_PASS = 1;
const BAR_FILL_PASS = 2;
const RELATION_PASS = 0;
const PASSES_PER_Z_INDEX = 4;
const ROUNDED_BAR_CORNER_SEGMENTS = 4;
const ROUNDED_BAR_PERIMETER_VERTICES = 4 * (ROUNDED_BAR_CORNER_SEGMENTS + 1);
const ROUNDED_BAR_VERTICES_PER_PRIMITIVE = ROUNDED_BAR_PERIMETER_VERTICES + 1;
const ROUNDED_BAR_INDICES_PER_PRIMITIVE = ROUNDED_BAR_PERIMETER_VERTICES * 3;

export interface AggregateGeometryGroup extends AggregateGeometryData {
  readonly key: string;
  readonly tint: number;
  readonly alpha: number;
  readonly drawOrder: number;
}

export interface AggregateChunkGeometry {
  readonly quadGroups: readonly AggregateGeometryGroup[];
  readonly relationGroups: readonly AggregateGeometryGroup[];
  readonly visibleQuads: number;
  readonly visibleRelations: number;
}

interface MutableQuadGroup extends PackedMeshStyle {
  readonly key: string;
  readonly drawOrder: number;
  readonly primitives: AggregateQuad[];
}

interface MutableLineGroup extends PackedMeshStyle {
  readonly key: string;
  readonly drawOrder: number;
  readonly primitives: AggregateLine[];
}

interface MutableRoundedBarGroup extends PackedMeshStyle {
  readonly key: string;
  readonly drawOrder: number;
  readonly primitives: StyledBarPrimitive[];
}

export interface BarPrimitiveBinding {
  readonly key: string;
  readonly primitiveIndex: number;
  readonly geometryKind: 'quad' | 'rounded';
  readonly packed: number;
  readonly opacity: number;
  readonly zIndex: number;
}

export interface BarSlotBinding {
  readonly entityId: string;
  track: BarPrimitiveBinding | null;
  fill: BarPrimitiveBinding | null;
  readonly radius: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  progress: number;
  projectionRevision: number;
}

export interface AggregateChunkLaneGeometry {
  readonly backgroundGroups: readonly AggregateGeometryGroup[];
  readonly styledBackgrounds: readonly StyledBackgroundPrimitive[];
  readonly rectGroups: readonly AggregateGeometryGroup[];
  readonly styledRects: readonly StyledBackgroundPrimitive[];
  readonly barGroups: readonly AggregateGeometryGroup[];
  readonly styledBars: readonly StyledBackgroundPrimitive[];
  readonly relationGroups: readonly AggregateGeometryGroup[];
  readonly barSlots: readonly number[];
  readonly barBindings: ReadonlyMap<number, BarSlotBinding>;
  readonly paintProbes: ReadonlyMap<string, PatchMapEntityPaintProbe>;
  readonly visibleBackgrounds: number;
  readonly visibleRects: number;
  readonly visibleBars: number;
  readonly visibleRelations: number;
}

export interface AggregateBarLaneGeometry {
  readonly groups: readonly AggregateGeometryGroup[];
  readonly styledBars: readonly StyledBackgroundPrimitive[];
  readonly bindings: ReadonlyMap<number, BarSlotBinding>;
  readonly paintProbes: ReadonlyMap<string, PatchMapEntityPaintProbe>;
  readonly visibleBars: number;
}

export interface StyledBackgroundPrimitive {
  readonly entityId: string;
  readonly quad: ReturnType<typeof resolvePatchMapSlotQuad>;
  readonly paint: PatchMapBackgroundPaintProjection;
  readonly fill: number;
  readonly borderColor: number;
  readonly opacity: number;
  readonly drawOrder: number;
}

interface StyledBarPrimitive extends StyledBackgroundPrimitive {
  readonly slot: number;
  readonly part: 'track' | 'fill';
  readonly radius: number;
  readonly widthFraction: number;
}

function buildRoundedBarGeometry(
  primitives: readonly StyledBarPrimitive[],
): AggregateGeometryData {
  const positions = new Float32Array(
    primitives.length * ROUNDED_BAR_VERTICES_PER_PRIMITIVE * 2,
  );
  const uvs = new Float32Array(
    primitives.length * ROUNDED_BAR_VERTICES_PER_PRIMITIVE * 2,
  );
  const indices = new Uint32Array(
    primitives.length * ROUNDED_BAR_INDICES_PER_PRIMITIVE,
  );

  for (let primitiveIndex = 0; primitiveIndex < primitives.length; primitiveIndex += 1) {
    const primitive = primitives[primitiveIndex] as StyledBarPrimitive;
    writeRoundedBarPositionValues(
      positions,
      primitiveIndex,
      primitive.quad,
      primitive.radius,
      primitive.widthFraction,
      uvs,
    );
    const vertexBase = primitiveIndex * ROUNDED_BAR_VERTICES_PER_PRIMITIVE;
    const indexBase = primitiveIndex * ROUNDED_BAR_INDICES_PER_PRIMITIVE;

    for (let edge = 0; edge < ROUNDED_BAR_PERIMETER_VERTICES; edge += 1) {
      const offset = indexBase + edge * 3;
      indices[offset] = vertexBase;
      indices[offset + 1] = vertexBase + 1 + edge;
      indices[offset + 2] =
        vertexBase + 1 + ((edge + 1) % ROUNDED_BAR_PERIMETER_VERTICES);
    }
  }

  return finishGeometry(positions, uvs, indices, primitives.length);
}

type RoundedBarQuad = StyledBackgroundPrimitive['quad'];

export function writeRoundedBarPositionValues(
  positions: Float32Array,
  primitiveIndex: number,
  quad: RoundedBarQuad,
  radius: number,
  widthFraction = 1,
  uvs?: Float32Array,
): boolean {
  const projection = quad.projection;
  const localWidth = projection === null
    ? quad.width
    : projection.localBounds[2] * widthFraction;
  const localHeight = projection?.localBounds[3] ?? quad.height;
  if (!(localWidth > 0) || !(localHeight > 0)) return false;

  const fittedRadius = Math.min(
    Math.max(0, radius),
    localWidth / 2,
    localHeight / 2,
  );
  const scaleX = quad.width / localWidth;
  const scaleY = quad.height / localHeight;
  const [basisA, basisB, basisC, basisD] = quad.basis;
  const [topLeftX, topLeftY] = quad.vertices;
  const positionBase = primitiveIndex * ROUNDED_BAR_VERTICES_PER_PRIMITIVE * 2;
  let changed = writeRoundedBarVertex(
    positions,
    uvs,
    positionBase,
    0,
    localWidth / 2,
    localHeight / 2,
    localWidth,
    localHeight,
    scaleX,
    scaleY,
    basisA,
    basisB,
    basisC,
    basisD,
    topLeftX,
    topLeftY,
  );
  changed = writeRoundedBarCorner(
    positions,
    uvs,
    positionBase,
    0,
    localWidth - fittedRadius,
    fittedRadius,
    fittedRadius,
    -Math.PI / 2,
    localWidth,
    localHeight,
    scaleX,
    scaleY,
    basisA,
    basisB,
    basisC,
    basisD,
    topLeftX,
    topLeftY,
  ) || changed;
  changed = writeRoundedBarCorner(
    positions,
    uvs,
    positionBase,
    ROUNDED_BAR_CORNER_SEGMENTS + 1,
    localWidth - fittedRadius,
    localHeight - fittedRadius,
    fittedRadius,
    0,
    localWidth,
    localHeight,
    scaleX,
    scaleY,
    basisA,
    basisB,
    basisC,
    basisD,
    topLeftX,
    topLeftY,
  ) || changed;
  changed = writeRoundedBarCorner(
    positions,
    uvs,
    positionBase,
    (ROUNDED_BAR_CORNER_SEGMENTS + 1) * 2,
    fittedRadius,
    localHeight - fittedRadius,
    fittedRadius,
    Math.PI / 2,
    localWidth,
    localHeight,
    scaleX,
    scaleY,
    basisA,
    basisB,
    basisC,
    basisD,
    topLeftX,
    topLeftY,
  ) || changed;
  changed = writeRoundedBarCorner(
    positions,
    uvs,
    positionBase,
    (ROUNDED_BAR_CORNER_SEGMENTS + 1) * 3,
    fittedRadius,
    fittedRadius,
    fittedRadius,
    Math.PI,
    localWidth,
    localHeight,
    scaleX,
    scaleY,
    basisA,
    basisB,
    basisC,
    basisD,
    topLeftX,
    topLeftY,
  ) || changed;
  return changed;
}

function writeRoundedBarCorner(
  positions: Float32Array,
  uvs: Float32Array | undefined,
  positionBase: number,
  perimeterStart: number,
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  localWidth: number,
  localHeight: number,
  scaleX: number,
  scaleY: number,
  basisA: number,
  basisB: number,
  basisC: number,
  basisD: number,
  topLeftX: number,
  topLeftY: number,
): boolean {
  let changed = false;
  for (let segment = 0; segment <= ROUNDED_BAR_CORNER_SEGMENTS; segment += 1) {
    const angle = startAngle +
      (segment / ROUNDED_BAR_CORNER_SEGMENTS) * (Math.PI / 2);
    changed = writeRoundedBarVertex(
      positions,
      uvs,
      positionBase,
      1 + perimeterStart + segment,
      centerX + Math.cos(angle) * radius,
      centerY + Math.sin(angle) * radius,
      localWidth,
      localHeight,
      scaleX,
      scaleY,
      basisA,
      basisB,
      basisC,
      basisD,
      topLeftX,
      topLeftY,
    ) || changed;
  }
  return changed;
}

function writeRoundedBarVertex(
  positions: Float32Array,
  uvs: Float32Array | undefined,
  positionBase: number,
  vertexIndex: number,
  localX: number,
  localY: number,
  localWidth: number,
  localHeight: number,
  scaleX: number,
  scaleY: number,
  basisA: number,
  basisB: number,
  basisC: number,
  basisD: number,
  topLeftX: number,
  topLeftY: number,
): boolean {
  const offset = positionBase + vertexIndex * 2;
  const nextX = Math.fround(
    topLeftX + basisA * scaleX * localX + basisC * scaleY * localY,
  );
  const nextY = Math.fround(
    topLeftY + basisB * scaleX * localX + basisD * scaleY * localY,
  );
  const changed = positions[offset] !== nextX || positions[offset + 1] !== nextY;
  positions[offset] = nextX;
  positions[offset + 1] = nextY;
  if (uvs !== undefined) {
    uvs[offset] = localX / localWidth;
    uvs[offset + 1] = localY / localHeight;
  }
  return changed;
}

export function isDrawable(store: RenderStoreView, slot: number): boolean {
  return (
    slot >= 0 &&
    slot < store.capacity &&
    (store.alive[slot] as number) !== 0 &&
    ((store.flags[slot] as number) & RenderFlags.Visible) !== 0 &&
    (store.opacity[slot] as number) > 0
  );
}

function isEndpoint(store: RenderStoreView, slot: number): boolean {
  return slot >= 0 && slot < store.capacity && (store.alive[slot] as number) !== 0;
}

function styleKey(style: PackedMeshStyle, drawOrder: number): string {
  return `${drawOrder}:${style.tint.toString(16).padStart(6, '0')}:${style.alpha}`;
}

function getQuadGroup(
  groups: Map<string, MutableQuadGroup>,
  packed: number,
  opacity: number,
  zIndex: number,
  pass: number,
): MutableQuadGroup | null {
  const style = packedRgbaToMeshStyle(packed, opacity);
  if (style.alpha <= 0) return null;
  const drawOrder = zIndex * PASSES_PER_Z_INDEX + pass;
  const key = styleKey(style, drawOrder);
  let group = groups.get(key);
  if (group === undefined) {
    group = { key, ...style, drawOrder, primitives: [] };
    groups.set(key, group);
  }
  return group;
}

function getLineGroup(
  groups: Map<string, MutableLineGroup>,
  packed: number,
  opacity: number,
  zIndex: number,
): MutableLineGroup | null {
  const style = packedRgbaToMeshStyle(packed, opacity);
  if (style.alpha <= 0) return null;
  const drawOrder = zIndex * PASSES_PER_Z_INDEX + RELATION_PASS;
  const key = styleKey(style, drawOrder);
  let group = groups.get(key);
  if (group === undefined) {
    group = { key, ...style, drawOrder, primitives: [] };
    groups.set(key, group);
  }
  return group;
}

function buildRoundedBarGroups(
  primitives: readonly StyledBarPrimitive[],
  bindings: ReadonlyMap<number, BarSlotBinding>,
): readonly AggregateGeometryGroup[] {
  const groups = new Map<string, MutableRoundedBarGroup>();
  for (const primitive of primitives) {
    const style = packedRgbaToMeshStyle(primitive.fill, primitive.opacity);
    if (style.alpha <= 0) continue;
    const key = `rounded:${styleKey(style, primitive.drawOrder)}`;
    let group = groups.get(key);
    if (group === undefined) {
      group = {
        key,
        ...style,
        drawOrder: primitive.drawOrder,
        primitives: [],
      };
      groups.set(key, group);
    }
    const primitiveIndex = group.primitives.length;
    group.primitives.push(primitive);
    const binding = bindings.get(primitive.slot);
    if (binding !== undefined) {
      const primitiveBinding: BarPrimitiveBinding = {
        key,
        primitiveIndex,
        geometryKind: 'rounded',
        packed: primitive.fill >>> 0,
        opacity: primitive.opacity,
        zIndex: Math.floor(primitive.drawOrder / PASSES_PER_Z_INDEX),
      };
      if (primitive.part === 'track') binding.track = primitiveBinding;
      else binding.fill = primitiveBinding;
    }
  }
  return [...groups.values()].map((group) => ({
    key: group.key,
    tint: group.tint,
    alpha: group.alpha,
    drawOrder: group.drawOrder,
    ...buildRoundedBarGeometry(group.primitives),
  }));
}

function geometryGroup(
  group: MutableQuadGroup,
  geometry: AggregateGeometryData,
): AggregateGeometryGroup;
function geometryGroup(
  group: MutableLineGroup,
  geometry: AggregateGeometryData,
): AggregateGeometryGroup;
function geometryGroup(
  group: MutableQuadGroup | MutableLineGroup,
  geometry: AggregateGeometryData,
): AggregateGeometryGroup {
  return {
    key: group.key,
    tint: group.tint,
    alpha: group.alpha,
    drawOrder: group.drawOrder,
    ...geometry,
  };
}

function appendBarPrimitive(
  groups: Map<string, MutableQuadGroup>,
  packed: number,
  opacity: number,
  zIndex: number,
  pass: number,
  quad: AggregateQuad,
): BarPrimitiveBinding | null {
  if (!isFiniteQuad(quad)) return null;
  const group = getQuadGroup(groups, packed, opacity, zIndex, pass);
  if (group === null) return null;
  const primitiveIndex = group.primitives.length;
  group.primitives.push(quad);
  return {
    key: group.key,
    primitiveIndex,
    geometryKind: 'quad',
    packed: packed >>> 0,
    opacity,
    zIndex,
  };
}

export function resolveBarProgress(store: RenderStoreView, slot: number): number {
  const min = store.min[slot] as number;
  const max = store.max[slot] as number;
  return max > min
    ? clamp01(((store.value[slot] as number) - min) / (max - min))
    : 0;
}

function isStyledBar(store: RenderStoreView, slot: number): boolean {
  return Math.max(0, store.radius[slot] as number) > 0;
}

function styledBarPaint(
  entityId: string,
  fill: number,
  radius: number,
): PatchMapBackgroundPaintProjection {
  return Object.freeze({
    entityId,
    sourceKind: 'rect',
    fill: fill >>> 0,
    borderWidth: 0,
    borderColor: 0,
    radius: Object.freeze([radius, radius, radius, radius] as const),
    tint: 0xffffffff,
  });
}

function appendStyledBarSlot(
  store: RenderStoreView,
  slot: number,
  primitives: StyledBarPrimitive[],
  bindings: Map<number, BarSlotBinding>,
  projectionContext?: PatchMapProjectionRenderContext,
): number {
  const x = store.x[slot] as number;
  const y = store.y[slot] as number;
  const width = store.width[slot] as number;
  const height = store.height[slot] as number;
  const rotation = store.rotation[slot] as number;
  const progress = resolveBarProgress(store, slot);
  const entityId = store.ids[slot] ?? `@slot:${slot}`;
  const radius = Math.max(0, store.radius[slot] as number);
  bindings.set(slot, {
    entityId,
    track: null,
    fill: null,
    radius,
    x,
    y,
    width,
    height,
    rotation,
    progress,
    projectionRevision: projectionContext?.revision ?? -1,
  });
  let count = 0;
  if (isDrawable(store, slot) && width > 0 && height > 0) {
    const opacity = store.opacity[slot] as number;
    const zIndex = store.zIndex[slot] as number;
    const trackFill = (store.trackFill[slot] as number) >>> 0;
    const trackStyle = packedRgbaToMeshStyle(trackFill, opacity);
    if (trackStyle.alpha > 0) {
      primitives.push({
        slot,
        part: 'track',
        radius,
        widthFraction: 1,
        entityId,
        quad: resolvePatchMapSlotQuad(store, slot, projectionContext),
        paint: styledBarPaint(entityId, trackFill, radius),
        fill: trackFill,
        borderColor: 0,
        opacity,
        drawOrder: zIndex * PASSES_PER_Z_INDEX + BAR_TRACK_PASS,
      });
      count += 1;
    }

    const fillWidth = width * progress;
    const fill = (store.fill[slot] as number) >>> 0;
    const fillStyle = packedRgbaToMeshStyle(fill, opacity);
    if (fillWidth > 0 && fillStyle.alpha > 0) {
      const fillRadius = Math.min(radius, fillWidth / 2, height / 2);
      primitives.push({
        slot,
        part: 'fill',
        radius: fillRadius,
        widthFraction: progress,
        entityId,
        quad: resolvePatchMapSlotQuad(store, slot, projectionContext, progress),
        paint: styledBarPaint(entityId, fill, fillRadius),
        fill,
        borderColor: 0,
        opacity,
        drawOrder: zIndex * PASSES_PER_Z_INDEX + BAR_FILL_PASS,
      });
      count += 1;
    }
  }
  return count;
}

function appendBarSlot(
  store: RenderStoreView,
  slot: number,
  groups: Map<string, MutableQuadGroup>,
  bindings: Map<number, BarSlotBinding>,
  projectionContext?: PatchMapProjectionRenderContext,
): number {
  let track: BarPrimitiveBinding | null = null;
  let fill: BarPrimitiveBinding | null = null;
  const x = store.x[slot] as number;
  const y = store.y[slot] as number;
  const width = store.width[slot] as number;
  const height = store.height[slot] as number;
  const rotation = store.rotation[slot] as number;
  const progress = resolveBarProgress(store, slot);
  const entityId = store.ids[slot] ?? `@slot:${slot}`;
  const trackQuad = resolvePatchMapSlotQuad(store, slot, projectionContext);
  const fillQuad = resolvePatchMapSlotQuad(store, slot, projectionContext, progress);
  if (isDrawable(store, slot)) {
    if (width > 0 && height > 0) {
      const opacity = store.opacity[slot] as number;
      const zIndex = store.zIndex[slot] as number;
      const pivotX = x + width / 2;
      const pivotY = y + height / 2;
      track = appendBarPrimitive(
        groups,
        store.trackFill[slot] as number,
        opacity,
        zIndex,
        BAR_TRACK_PASS,
        { x, y, width, height, rotation, pivotX, pivotY, vertices: trackQuad.vertices },
      );

      const fillWidth = width * progress;
      if (fillWidth > 0) {
        fill = appendBarPrimitive(
          groups,
          store.fill[slot] as number,
          opacity,
          zIndex,
          BAR_FILL_PASS,
          {
            x,
            y,
            width: fillWidth,
            height,
            rotation,
            pivotX,
            pivotY,
            vertices: fillQuad.vertices,
          },
        );
      }
    }
  }
  bindings.set(slot, {
    entityId,
    track,
    fill,
    radius: 0,
    x,
    y,
    width,
    height,
    rotation,
    progress,
    projectionRevision: projectionContext?.revision ?? -1,
  });
  return (track === null ? 0 : 1) + (fill === null ? 0 : 1);
}

export function buildAggregateBarLaneGeometry(
  store: RenderStoreView,
  barSlots: readonly number[],
  projectionContext?: PatchMapProjectionRenderContext,
): AggregateBarLaneGeometry {
  const groups = new Map<string, MutableQuadGroup>();
  const styledBars: StyledBarPrimitive[] = [];
  const bindings = new Map<number, BarSlotBinding>();
  const paintProbes = new Map<string, PatchMapEntityPaintProbe>();
  let visibleBars = 0;
  for (const slot of barSlots) {
    if (
      slot < 0 ||
      slot >= store.capacity ||
      (store.alive[slot] as number) === 0 ||
      (store.kind[slot] as number) !== RenderKind.Bar
    ) {
      continue;
    }
    const styled = isStyledBar(store, slot);
    const primitives = styled
      ? appendStyledBarSlot(store, slot, styledBars, bindings, projectionContext)
      : appendBarSlot(store, slot, groups, bindings, projectionContext);
    visibleBars += primitives;
    const entityId = store.ids[slot] ?? `@slot:${slot}`;
    paintProbes.set(entityId, barEntityPaintProbe(entityId, primitives));
  }
  return {
    groups: [
      ...[...groups.values()].map((group) =>
        geometryGroup(group, buildQuadGeometry(group.primitives)),
      ),
      ...buildRoundedBarGroups(styledBars, bindings),
    ],
    styledBars: [],
    bindings,
    paintProbes,
    visibleBars,
  };
}

function barEntityPaintProbe(
  entityId: string,
  primitives: number,
): PatchMapEntityPaintProbe {
  return freezeEntityPaintProbe({
    entityId,
    lane: 'relations-dynamic',
    rendererKind: primitives > 0 ? 'mesh' : 'none',
    primitiveCount: primitives,
    renderObjectCount: 0,
    packedTint: null,
    rgbTint: null,
    alpha: null,
  });
}

export function buildAggregateChunkLaneGeometry(
  store: RenderStoreView,
  start: number,
  end: number,
  projectionContext?: PatchMapProjectionRenderContext,
): AggregateChunkLaneGeometry {
  const backgroundGroups = new Map<string, MutableQuadGroup>();
  const styledBackgrounds: StyledBackgroundPrimitive[] = [];
  const rectGroups = new Map<string, MutableQuadGroup>();
  const styledRects: StyledBackgroundPrimitive[] = [];
  const barGroups = new Map<string, MutableQuadGroup>();
  const styledBars: StyledBarPrimitive[] = [];
  const relationGroups = new Map<string, MutableLineGroup>();
  const barSlots: number[] = [];
  const barBindings = new Map<number, BarSlotBinding>();
  const paintProbes = new Map<string, PatchMapEntityPaintProbe>();
  const resolvedStart = Math.max(0, Math.min(store.capacity, Math.floor(start)));
  const resolvedEnd = Math.max(resolvedStart, Math.min(store.capacity, Math.ceil(end)));
  let visibleBackgrounds = 0;
  let visibleRects = 0;
  let visibleBars = 0;
  let visibleRelations = 0;

  for (let slot = resolvedStart; slot < resolvedEnd; slot += 1) {
    if ((store.alive[slot] as number) === 0) continue;
    const entityId = store.ids[slot] ?? `@slot:${slot}`;
    const kind = store.kind[slot] as number;
    if (kind === RenderKind.Bar) {
      barSlots.push(slot);
      const styled = isStyledBar(store, slot);
      const primitives = styled
        ? appendStyledBarSlot(store, slot, styledBars, barBindings, projectionContext)
        : appendBarSlot(store, slot, barGroups, barBindings, projectionContext);
      visibleBars += primitives;
      paintProbes.set(entityId, barEntityPaintProbe(entityId, primitives));
      continue;
    }
    if (
      kind === RenderKind.Rect &&
      projectionContext?.index.componentsByEntityId?.[entityId]?.renderRole ===
        'background-geometry'
    ) {
      const paint = projectionContext.index.backgroundsByEntityId?.[entityId];
      const opacity = store.opacity[slot] as number;
      const presentationFill = presentationFillOverride(store, entityId);
      const packedFill = presentationFill ?? (
        paint?.sourceKind === 'rect'
          ? multiplyPackedRgba(paint.fill, paint.tint)
          : (store.fill[slot] as number) >>> 0
      );
      const fillStyle = packedRgbaToMeshStyle(packedFill, opacity);
      const packedBorder = paint?.sourceKind === 'rect'
        ? multiplyPackedRgba(paint.borderColor, paint.tint)
        : (store.stroke[slot] as number) >>> 0;
      const borderStyle = packedRgbaToMeshStyle(
        packedBorder,
        opacity,
      );
      const drawable = isDrawable(store, slot);
      const styled = paint?.sourceKind === 'rect' && (
        paint.borderWidth > 0 || paint.radius.some((value) => value > 0)
      );
      const visiblePaint = drawable && (
        fillStyle.alpha > 0 ||
        (styled === true && paint.borderWidth > 0 && borderStyle.alpha > 0)
      );
      let rendererKind: PatchMapEntityPaintProbe['rendererKind'] = 'none';
      if (visiblePaint) {
        const quad = resolvePatchMapSlotQuad(store, slot, projectionContext);
        if (styled && paint) {
          styledBackgrounds.push({
            entityId,
            quad,
            paint,
            fill: packedFill,
            borderColor: packedBorder,
            opacity,
            drawOrder: (store.zIndex[slot] as number) * PASSES_PER_Z_INDEX + RECT_PASS,
          });
          rendererKind = 'graphics';
          visibleBackgrounds += 1;
        } else {
          const group = getQuadGroup(
            backgroundGroups,
            packedFill,
            opacity,
            store.zIndex[slot] as number,
            RECT_PASS,
          );
          if (group !== null) {
            group.primitives.push({
              x: store.x[slot] as number,
              y: store.y[slot] as number,
              width: store.width[slot] as number,
              height: store.height[slot] as number,
              rotation: store.rotation[slot] as number,
              vertices: quad.vertices,
            });
            rendererKind = 'mesh';
            visibleBackgrounds += 1;
          }
        }
      }
      paintProbes.set(entityId, freezeEntityPaintProbe({
        entityId,
        lane: 'background-geometry',
        rendererKind,
        primitiveCount: rendererKind === 'none' ? 0 : 1,
        renderObjectCount: 0,
        packedTint: packedFill,
        rgbTint: rendererKind === 'none' ? null : fillStyle.tint,
        alpha: rendererKind === 'none' ? null : fillStyle.alpha,
      }));
      continue;
    }
    if (!isDrawable(store, slot)) continue;
    const opacity = store.opacity[slot] as number;
    const zIndex = store.zIndex[slot] as number;

    if (kind === RenderKind.Rect) {
      const width = store.width[slot] as number;
      const height = store.height[slot] as number;
      const packedFill = (store.fill[slot] as number) >>> 0;
      const packedBorder = (store.stroke[slot] as number) >>> 0;
      const fillStyle = packedRgbaToMeshStyle(packedFill, opacity);
      const borderStyle = packedRgbaToMeshStyle(packedBorder, opacity);
      const borderWidth = Math.max(0, store.strokeWidth[slot] as number);
      const radius = Math.max(0, store.radius[slot] as number);
      const styled = radius > 0 || (borderWidth > 0 && borderStyle.alpha > 0);
      const visiblePaint = width > 0 && height > 0 && (
        fillStyle.alpha > 0 || (borderWidth > 0 && borderStyle.alpha > 0)
      );
      if (visiblePaint && styled) {
        const quad = resolvePatchMapSlotQuad(store, slot, projectionContext);
        styledRects.push({
          entityId,
          quad,
          paint: Object.freeze({
            entityId,
            sourceKind: 'rect',
            fill: packedFill,
            borderWidth,
            borderColor: packedBorder,
            radius: Object.freeze([radius, radius, radius, radius] as const),
            tint: 0xffffffff,
          }),
          fill: packedFill,
          borderColor: packedBorder,
          opacity,
          drawOrder: zIndex * PASSES_PER_Z_INDEX + RECT_PASS,
        });
        visibleRects += 1;
        paintProbes.set(entityId, freezeEntityPaintProbe({
          entityId,
          lane: 'ordinary-geometry',
          rendererKind: 'graphics',
          primitiveCount: 1,
          renderObjectCount: 0,
          packedTint: packedFill,
          rgbTint: fillStyle.tint,
          alpha: fillStyle.alpha,
        }));
      } else if (visiblePaint) {
        const group = getQuadGroup(rectGroups, packedFill, opacity, zIndex, RECT_PASS);
        if (group !== null) {
          const quad = resolvePatchMapSlotQuad(store, slot, projectionContext);
          group.primitives.push({
            x: store.x[slot] as number,
            y: store.y[slot] as number,
            width,
            height,
            rotation: store.rotation[slot] as number,
            vertices: quad.vertices,
          });
          visibleRects += 1;
          paintProbes.set(entityId, freezeEntityPaintProbe({
            entityId,
            lane: 'ordinary-geometry',
            rendererKind: 'mesh',
            primitiveCount: 1,
            renderObjectCount: 0,
            packedTint: packedFill,
            rgbTint: fillStyle.tint,
            alpha: fillStyle.alpha,
          }));
        }
      }
      continue;
    }

    if (kind !== RenderKind.Relation) continue;
    const from = store.relationFrom[slot] as number;
    const to = store.relationTo[slot] as number;
    const width = store.lineWidth[slot] as number;
    if (!isEndpoint(store, from) || !isEndpoint(store, to) || width <= 0) continue;
    const relationId = store.ids[slot] ?? '';
    const relationProjection = projectionContext?.index.relationsByEntityId?.[relationId];
    const fromQuad = resolvePatchMapSlotQuad(store, from, projectionContext);
    const toQuad = resolvePatchMapSlotQuad(store, to, projectionContext);
    const lines: AggregateLine[] = [];
    if (relationProjection) {
      const path = resolvePatchMapRelationPath(
        relationProjection,
        endpointGeometry(store, from, fromQuad.vertices, fromQuad.center),
        endpointGeometry(store, to, toQuad.vertices, toQuad.center),
        {
          color: store.color[slot] as number,
          width,
          opacity,
          zIndex,
          visible: isDrawable(store, slot),
        },
      );
      if (!path.visible) continue;
      for (let pointIndex = 1; pointIndex < path.worldPoints.length; pointIndex += 1) {
        const startPoint = path.worldPoints[pointIndex - 1];
        const endPoint = path.worldPoints[pointIndex];
        if (!startPoint || !endPoint) continue;
        const line = {
          fromX: startPoint[0],
          fromY: startPoint[1],
          toX: endPoint[0],
          toY: endPoint[1],
          width: path.worldStrokeWidths[pointIndex - 1] ?? width,
        };
        if (isFiniteLine(line)) lines.push(line);
      }
    } else {
      const line = {
        fromX: fromQuad.center[0],
        fromY: fromQuad.center[1],
        toX: toQuad.center[0],
        toY: toQuad.center[1],
        width,
      };
      if (!isFiniteLine(line)) continue;
      lines.push(line);
    }
    if (lines.length === 0) continue;
    const group = getLineGroup(
      relationGroups,
      store.color[slot] as number,
      opacity,
      zIndex,
    );
    if (group === null) continue;
    group.primitives.push(...lines);
    visibleRelations += 1;
    const style = packedRgbaToMeshStyle(store.color[slot] as number, opacity);
    paintProbes.set(entityId, freezeEntityPaintProbe({
      entityId,
      lane: 'relations-dynamic',
      rendererKind: 'mesh',
      primitiveCount: lines.length,
      renderObjectCount: 0,
      packedTint: (store.color[slot] as number) >>> 0,
      rgbTint: style.tint,
      alpha: style.alpha,
    }));
  }

  return {
    backgroundGroups: [...backgroundGroups.values()].map((group) =>
      geometryGroup(group, buildQuadGeometry(group.primitives)),
    ),
    styledBackgrounds,
    rectGroups: [...rectGroups.values()].map((group) =>
      geometryGroup(group, buildQuadGeometry(group.primitives)),
    ),
    styledRects,
    barGroups: [
      ...[...barGroups.values()].map((group) =>
        geometryGroup(group, buildQuadGeometry(group.primitives)),
      ),
      ...buildRoundedBarGroups(styledBars, barBindings),
    ],
    styledBars: [],
    relationGroups: [...relationGroups.values()].map((group) =>
      geometryGroup(group, buildLineGeometry(group.primitives)),
    ),
    barSlots,
    barBindings,
    paintProbes,
    visibleBackgrounds,
    visibleRects,
    visibleBars,
    visibleRelations,
  };
}

function presentationFillOverride(
  store: RenderStoreView,
  entityId: string,
): number | null {
  const candidate = (
    store as RenderStoreView & {
      presentationFillOverride?: (id: string) => number | null;
    }
  ).presentationFillOverride;
  if (typeof candidate !== 'function') return null;
  const value = candidate.call(store, entityId);
  return value === null ? null : value >>> 0;
}

/**
 * Normalize one fixed slot chunk into aggregate style meshes.
 *
 * Default Mesh material has one tint/alpha per mesh, so groups are keyed by
 * tint, alpha, z-index, and the rect/bar pass. This preserves colors without a
 * custom shader while keeping scene nodes proportional to styles per chunk.
 */
export function buildAggregateChunkGeometry(
  store: RenderStoreView,
  start: number,
  end: number,
  projectionContext?: PatchMapProjectionRenderContext,
): AggregateChunkGeometry {
  const built = buildAggregateChunkLaneGeometry(store, start, end, projectionContext);
  return {
    quadGroups: [...built.backgroundGroups, ...built.rectGroups, ...built.barGroups],
    relationGroups: built.relationGroups,
    visibleQuads: built.visibleBackgrounds + built.visibleRects + built.visibleBars,
    visibleRelations: built.visibleRelations,
  };
}

function freezeEntityPaintProbe(
  probe: PatchMapEntityPaintProbe,
): PatchMapEntityPaintProbe {
  return Object.freeze({ ...probe });
}
