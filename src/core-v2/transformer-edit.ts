import type {
  CoreV2ElementType,
  NormalizedCoreV2Element,
} from './semantic/dataset';
import {
  CORE_V2_IDENTITY_AFFINE,
  applyCoreV2Affine,
  createCoreV2Affine,
  invertCoreV2Affine,
  multiplyCoreV2Affine,
  type CoreV2AffineMatrix,
  type CoreV2PointTuple,
} from './semantic/geometry';
import type {
  CoreV2MutationOperation,
  CoreV2MutationTarget,
} from './semantic/transaction';

export const CORE_V2_TRANSFORMER_EDIT_REVISION =
  'core-v2-transformer-edit/1' as const;

export type CoreV2TransformerEditKind = 'move' | 'resize' | 'rotate';
export type CoreV2ResizeHandle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 'e' | 's' | 'w';

export interface CoreV2TransformerGeometry {
  readonly id: string;
  readonly type: CoreV2ElementType;
  readonly parentId: string | null;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotationDegrees: number;
  readonly rotationChannel: 'angle' | 'rotation' | 'none';
  readonly centerWorld: CoreV2PointTuple;
}

export interface CoreV2TransformerEditPlanBase {
  readonly schemaRevision: typeof CORE_V2_TRANSFORMER_EDIT_REVISION;
  readonly kind: CoreV2TransformerEditKind;
  readonly selectionIds: readonly string[];
  readonly eligibleIds: readonly string[];
  readonly lockedIds: readonly string[];
  readonly ineligibleIds: readonly string[];
  readonly operations: readonly CoreV2MutationOperation[];
  readonly before: Readonly<Record<string, CoreV2TransformerGeometry>>;
  readonly after: Readonly<Record<string, CoreV2TransformerGeometry>>;
  readonly selectionCenterBefore: CoreV2PointTuple | null;
  readonly selectionCenterAfter: CoreV2PointTuple | null;
}

export type CoreV2TransformerEditPlan =
  | Readonly<CoreV2TransformerEditPlanBase & {
      readonly status: 'planned';
      readonly changed: true;
    }>
  | Readonly<CoreV2TransformerEditPlanBase & {
      readonly status: 'unchanged';
      readonly changed: false;
    }>
  | Readonly<CoreV2TransformerEditPlanBase & {
      readonly status: 'rejected';
      readonly changed: false;
      readonly code: 'MISSING_TARGET' | 'INELIGIBLE_TARGET' | 'LOCKED_TARGET';
    }>;

export interface CoreV2MoveTransformRequest {
  readonly selectionIds: readonly string[];
  readonly deltaWorld: CoreV2PointTuple;
  readonly axisLock?: boolean;
  readonly lockedIds?: readonly string[];
}

export interface CoreV2ResizeTransformRequest {
  readonly selectionIds: readonly string[];
  readonly handle: CoreV2ResizeHandle;
  readonly deltaWorld: CoreV2PointTuple;
  readonly lockAspectRatio?: boolean;
  readonly minSize?: number;
  readonly lockedIds?: readonly string[];
}

export interface CoreV2RotateTransformRequest {
  readonly selectionIds: readonly string[];
  readonly deltaDegrees: number;
  readonly centerWorld?: CoreV2PointTuple;
  readonly lockedIds?: readonly string[];
}

export type CoreV2TransformerEditRequest =
  | Readonly<{ readonly kind: 'move' } & CoreV2MoveTransformRequest>
  | Readonly<{ readonly kind: 'resize' } & CoreV2ResizeTransformRequest>
  | Readonly<{ readonly kind: 'rotate' } & CoreV2RotateTransformRequest>;

export interface CoreV2RotationSnapResult {
  readonly startDegrees: number;
  readonly pointerDegrees: number;
  readonly continuousDeltaDegrees: number;
  readonly appliedDegrees: number;
  readonly snapped: boolean;
}

export interface CoreV2EdgeAutoPanResult {
  readonly pointerWorldBefore: CoreV2PointTuple;
  readonly pointerWorldAfter: CoreV2PointTuple;
  readonly adjustedPointerScreen: CoreV2PointTuple;
  readonly centerWorld: CoreV2PointTuple;
}

interface LocatedTransformTarget {
  readonly element: NormalizedCoreV2Element;
  readonly geometry: CoreV2TransformerGeometry | null;
  readonly parentAffine: CoreV2AffineMatrix;
  readonly locked: boolean;
}

interface ResizeBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly anchor: CoreV2PointTuple;
}

const MOVE_ROTATE_TYPES = new Set<CoreV2ElementType>([
  'grid',
  'item',
  'rect',
  'image',
  'text',
]);
const RESIZE_TYPES = new Set<CoreV2ElementType>(['rect', 'image']);

export function planCoreV2TransformerEdit(
  dataset: readonly NormalizedCoreV2Element[],
  request: CoreV2TransformerEditRequest,
): CoreV2TransformerEditPlan {
  switch (request.kind) {
    case 'move':
      return planCoreV2MoveTransform(dataset, request);
    case 'resize':
      return planCoreV2ResizeTransform(dataset, request);
    case 'rotate':
      return planCoreV2RotateTransform(dataset, request);
  }
}

export function planCoreV2MoveTransform(
  dataset: readonly NormalizedCoreV2Element[],
  request: CoreV2MoveTransformRequest,
): CoreV2TransformerEditPlan {
  const normalized = normalizeBaseRequest(dataset, request.selectionIds, request.lockedIds);
  const deltaWorld = finitePoint(request.deltaWorld, 'move deltaWorld');
  const delta = request.axisLock === true
    ? dominantAxis(deltaWorld)
    : deltaWorld;
  const classification = classifyTargets(normalized.targets, MOVE_ROTATE_TYPES);
  const rejected = atomicRejection('move', normalized, classification);
  if (rejected !== null) return rejected;

  const operations: CoreV2MutationOperation[] = [];
  const after: Record<string, CoreV2TransformerGeometry> = {};
  for (const target of classification.eligible) {
    const geometry = requireGeometry(target);
    const parentDelta = affineVector(invertCoreV2Affine(target.parentAffine), delta);
    const next = freezeGeometry({
      ...geometry,
      x: integer(geometry.x + parentDelta[0]),
      y: integer(geometry.y + parentDelta[1]),
      centerWorld: applyCoreV2Affine(target.parentAffine, [
        integer(geometry.x + parentDelta[0]) + geometry.width / 2,
        integer(geometry.y + parentDelta[1]) + geometry.height / 2,
      ]),
    });
    after[target.element.id] = next;
    operations.push(geometryOperation(geometry, next));
  }
  return completedPlan(
    'move',
    normalized,
    classification,
    operations,
    after,
    selectionCenter(classification.allGeometry),
  );
}

export function planCoreV2ResizeTransform(
  dataset: readonly NormalizedCoreV2Element[],
  request: CoreV2ResizeTransformRequest,
): CoreV2TransformerEditPlan {
  const normalized = normalizeBaseRequest(dataset, request.selectionIds, request.lockedIds);
  const handle = resizeHandle(request.handle);
  const deltaWorld = finitePoint(request.deltaWorld, 'resize deltaWorld');
  const minSize = positiveFinite(request.minSize ?? 1, 'resize minSize');
  const classification = classifyTargets(normalized.targets, RESIZE_TYPES);
  const rejected = atomicRejection('resize', normalized, classification);
  if (rejected !== null) return rejected;

  const operations: CoreV2MutationOperation[] = [];
  const after: Record<string, CoreV2TransformerGeometry> = {};
  if (classification.eligible.length === 1) {
    const target = classification.eligible[0]!;
    const geometry = requireGeometry(target);
    const parentDelta = affineVector(invertCoreV2Affine(target.parentAffine), deltaWorld);
    const resized = resizeBounds(
      geometry,
      handle,
      parentDelta,
      minSize,
      request.lockAspectRatio === true,
    );
    const next = geometryForResize(target, geometry, resized);
    after[target.element.id] = next;
    operations.push(geometryOperation(geometry, next));
  } else {
    const frame = geometryUnion(classification.allGeometry);
    if (frame === null) {
      return rejectedPlan('resize', normalized, classification, 'INELIGIBLE_TARGET');
    }
    const resizedFrame = resizeBounds(
      frame,
      handle,
      deltaWorld,
      minSize,
      request.lockAspectRatio === true,
    );
    const scaleX = resizedFrame.width / frame.width;
    const scaleY = resizedFrame.height / frame.height;
    for (const target of classification.eligible) {
      const geometry = requireGeometry(target);
      const worldTopLeft = applyCoreV2Affine(target.parentAffine, [geometry.x, geometry.y]);
      const worldX = resizedFrame.x + (worldTopLeft[0] - frame.x) * scaleX;
      const worldY = resizedFrame.y + (worldTopLeft[1] - frame.y) * scaleY;
      const parentPoint = applyCoreV2Affine(
        invertCoreV2Affine(target.parentAffine),
        [worldX, worldY],
      );
      const resized = Object.freeze({
        x: integer(parentPoint[0]),
        y: integer(parentPoint[1]),
        width: Math.max(minSize, integer(geometry.width * scaleX)),
        height: Math.max(minSize, integer(geometry.height * scaleY)),
        anchor: resizedFrame.anchor,
      });
      const next = geometryForResize(target, geometry, resized);
      after[target.element.id] = next;
      operations.push(geometryOperation(geometry, next));
    }
  }
  return completedPlan(
    'resize',
    normalized,
    classification,
    operations,
    after,
    selectionCenter(classification.allGeometry),
  );
}

export function planCoreV2RotateTransform(
  dataset: readonly NormalizedCoreV2Element[],
  request: CoreV2RotateTransformRequest,
): CoreV2TransformerEditPlan {
  const normalized = normalizeBaseRequest(dataset, request.selectionIds, request.lockedIds);
  const deltaDegrees = finite(request.deltaDegrees, 'rotate deltaDegrees');
  const classification = classifyTargets(normalized.targets, MOVE_ROTATE_TYPES);
  if (classification.eligible.length === 0) {
    const code = classification.locked.length > 0 ? 'LOCKED_TARGET' : 'INELIGIBLE_TARGET';
    return rejectedPlan('rotate', normalized, classification, code);
  }
  const center = request.centerWorld === undefined
    ? selectionCenter(classification.allGeometry)
    : finitePoint(request.centerWorld, 'rotate centerWorld');
  if (center === null) {
    return rejectedPlan('rotate', normalized, classification, 'INELIGIBLE_TARGET');
  }

  const operations: CoreV2MutationOperation[] = [];
  const after: Record<string, CoreV2TransformerGeometry> = {};
  for (const target of classification.eligible) {
    const geometry = requireGeometry(target);
    const nextCenterWorld = classification.eligible.length === 1 &&
        normalized.selectionIds.length === 1
      ? geometry.centerWorld
      : rotatePoint(geometry.centerWorld, center, deltaDegrees);
    const parentCenter = applyCoreV2Affine(
      invertCoreV2Affine(target.parentAffine),
      nextCenterWorld,
    );
    const next = freezeGeometry({
      ...geometry,
      x: roundSix(parentCenter[0] - geometry.width / 2),
      y: roundSix(parentCenter[1] - geometry.height / 2),
      rotationDegrees: normalizeDegrees(geometry.rotationDegrees + deltaDegrees),
      centerWorld: nextCenterWorld,
    });
    after[target.element.id] = next;
    operations.push(geometryOperation(geometry, next));
  }
  return completedPlan(
    'rotate',
    normalized,
    classification,
    operations,
    after,
    center,
  );
}

export function resolveCoreV2RotationSnap(
  startDegreesValue: number,
  pointerDegreesValue: number,
  snap: boolean,
  incrementDegreesValue = 15,
): CoreV2RotationSnapResult {
  const startDegrees = normalizeDegrees(finite(startDegreesValue, 'rotation startDegrees'));
  const pointerDegrees = normalizeDegrees(finite(pointerDegreesValue, 'rotation pointerDegrees'));
  const incrementDegrees = positiveFinite(
    incrementDegreesValue,
    'rotation incrementDegrees',
  );
  const continuousDeltaDegrees = roundSix(shortestDelta(startDegrees, pointerDegrees));
  const appliedDegrees = snap
    ? normalizeDegrees(Math.round(pointerDegrees / incrementDegrees) * incrementDegrees)
    : pointerDegrees;
  return Object.freeze({
    startDegrees,
    pointerDegrees,
    continuousDeltaDegrees,
    appliedDegrees,
    snapped: snap,
  });
}

export function resolveCoreV2EdgeAutoPan(
  pointerScreenValue: CoreV2PointTuple,
  deltaCssValue: CoreV2PointTuple,
  centerWorldValue: CoreV2PointTuple,
  scaleValue: number,
  viewportSizeValue: CoreV2PointTuple,
): CoreV2EdgeAutoPanResult {
  const pointerScreen = finitePoint(pointerScreenValue, 'edge-pan pointerScreen');
  const deltaCss = finitePoint(deltaCssValue, 'edge-pan deltaCss');
  const centerWorld = finitePoint(centerWorldValue, 'edge-pan centerWorld');
  const viewportSize = finitePoint(viewportSizeValue, 'edge-pan viewportSize');
  const scale = positiveFinite(scaleValue, 'edge-pan scale');
  const pointerWorldBefore = screenPointToWorld(
    pointerScreen,
    centerWorld,
    scale,
    viewportSize,
  );
  const nextCenter = Object.freeze([
    centerWorld[0] + deltaCss[0] / scale,
    centerWorld[1] + deltaCss[1] / scale,
  ] as const);
  const adjustedPointerScreen = Object.freeze([
    pointerScreen[0] - deltaCss[0],
    pointerScreen[1] - deltaCss[1],
  ] as const);
  const pointerWorldAfter = screenPointToWorld(
    adjustedPointerScreen,
    nextCenter,
    scale,
    viewportSize,
  );
  return Object.freeze({
    pointerWorldBefore,
    pointerWorldAfter,
    adjustedPointerScreen,
    centerWorld: nextCenter,
  });
}

function normalizeBaseRequest(
  dataset: readonly NormalizedCoreV2Element[],
  selectionIdsValue: readonly string[],
  lockedIdsValue: readonly string[] = [],
): Readonly<{
  readonly selectionIds: readonly string[];
  readonly targets: readonly (LocatedTransformTarget | null)[];
}> {
  if (!Array.isArray(dataset)) throw new TypeError('transform dataset must be an array');
  const selectionIds = uniqueStrings(selectionIdsValue, 'transform selectionIds');
  const lockedIds = new Set(uniqueStrings(lockedIdsValue, 'transform lockedIds'));
  const index = indexTransformTargets(dataset, lockedIds, new Set(selectionIds));
  return Object.freeze({
    selectionIds,
    targets: Object.freeze(selectionIds.map((id) => index.get(id) ?? null)),
  });
}

function classifyTargets(
  targets: readonly (LocatedTransformTarget | null)[],
  eligibleTypes: ReadonlySet<CoreV2ElementType>,
): Readonly<{
  readonly eligible: readonly LocatedTransformTarget[];
  readonly locked: readonly LocatedTransformTarget[];
  readonly ineligible: readonly (LocatedTransformTarget | null)[];
  readonly allGeometry: readonly CoreV2TransformerGeometry[];
}> {
  const eligible: LocatedTransformTarget[] = [];
  const locked: LocatedTransformTarget[] = [];
  const ineligible: (LocatedTransformTarget | null)[] = [];
  const allGeometry: CoreV2TransformerGeometry[] = [];
  for (const target of targets) {
    if (target?.geometry !== null && target?.geometry !== undefined) {
      allGeometry.push(target.geometry);
    }
    if (target === null || target.geometry === null || !eligibleTypes.has(target.element.type)) {
      ineligible.push(target);
    } else if (target.locked) {
      locked.push(target);
    } else {
      eligible.push(target);
    }
  }
  return Object.freeze({
    eligible: Object.freeze(eligible),
    locked: Object.freeze(locked),
    ineligible: Object.freeze(ineligible),
    allGeometry: Object.freeze(allGeometry),
  });
}

function atomicRejection(
  kind: 'move' | 'resize',
  normalized: ReturnType<typeof normalizeBaseRequest>,
  classification: ReturnType<typeof classifyTargets>,
): Extract<CoreV2TransformerEditPlan, { readonly status: 'rejected' }> | null {
  if (classification.ineligible.some((target) => target === null)) {
    return rejectedPlan(kind, normalized, classification, 'MISSING_TARGET');
  }
  if (classification.locked.length > 0) {
    return rejectedPlan(kind, normalized, classification, 'LOCKED_TARGET');
  }
  if (
    classification.ineligible.length > 0 ||
    classification.eligible.length !== normalized.selectionIds.length
  ) {
    return rejectedPlan(kind, normalized, classification, 'INELIGIBLE_TARGET');
  }
  return null;
}

function completedPlan(
  kind: CoreV2TransformerEditKind,
  normalized: ReturnType<typeof normalizeBaseRequest>,
  classification: ReturnType<typeof classifyTargets>,
  operations: readonly CoreV2MutationOperation[],
  changedGeometry: Readonly<Record<string, CoreV2TransformerGeometry>>,
  center: CoreV2PointTuple | null,
): CoreV2TransformerEditPlan {
  const before = geometryRecord(classification.allGeometry);
  const after = Object.freeze({ ...before, ...changedGeometry });
  const changed = operations.some((operation) =>
    operation.op === 'merge' && operation.changes.length > 0);
  const base = planBase(kind, normalized, classification, operations, before, after, center);
  return Object.freeze({
    ...base,
    status: changed ? 'planned' : 'unchanged',
    changed,
  }) as CoreV2TransformerEditPlan;
}

function rejectedPlan(
  kind: CoreV2TransformerEditKind,
  normalized: ReturnType<typeof normalizeBaseRequest>,
  classification: ReturnType<typeof classifyTargets>,
  code: Extract<CoreV2TransformerEditPlan, { readonly status: 'rejected' }>['code'],
): Extract<CoreV2TransformerEditPlan, { readonly status: 'rejected' }> {
  const geometry = geometryRecord(classification.allGeometry);
  return Object.freeze({
    ...planBase(kind, normalized, classification, [], geometry, geometry, null),
    status: 'rejected',
    changed: false,
    code,
  });
}

function planBase(
  kind: CoreV2TransformerEditKind,
  normalized: ReturnType<typeof normalizeBaseRequest>,
  classification: ReturnType<typeof classifyTargets>,
  operations: readonly CoreV2MutationOperation[],
  before: Readonly<Record<string, CoreV2TransformerGeometry>>,
  after: Readonly<Record<string, CoreV2TransformerGeometry>>,
  center: CoreV2PointTuple | null,
): CoreV2TransformerEditPlanBase {
  return Object.freeze({
    schemaRevision: CORE_V2_TRANSFORMER_EDIT_REVISION,
    kind,
    selectionIds: normalized.selectionIds,
    eligibleIds: Object.freeze(classification.eligible.map(({ element }) => element.id)),
    lockedIds: Object.freeze(classification.locked.map(({ element }) => element.id)),
    ineligibleIds: Object.freeze(classification.ineligible.map((target, index) =>
      target?.element.id ?? normalized.selectionIds[index] ?? '')),
    operations: Object.freeze([...operations]),
    before,
    after,
    selectionCenterBefore: center,
    selectionCenterAfter: center,
  });
}

function indexTransformTargets(
  dataset: readonly NormalizedCoreV2Element[],
  lockedIds: ReadonlySet<string>,
  requestedIds: ReadonlySet<string>,
): ReadonlyMap<string, LocatedTransformTarget> {
  const result = new Map<string, LocatedTransformTarget>();
  if (requestedIds.size === 0) return result;
  const visit = (
    elements: readonly NormalizedCoreV2Element[],
    parentId: string | null,
    parentAffine: CoreV2AffineMatrix,
    ancestorLocked: boolean,
  ): boolean => {
    for (const element of elements) {
      const locked = ancestorLocked || element.locked || lockedIds.has(element.id);
      if (requestedIds.has(element.id)) {
        const geometry = elementGeometry(element, parentId, parentAffine);
        result.set(element.id, Object.freeze({ element, geometry, parentAffine, locked }));
        if (result.size === requestedIds.size) return true;
      }
      if (element.type === 'group') {
        const complete = visit(
          element.children,
          element.id,
          multiplyCoreV2Affine(parentAffine, localAffine(element)),
          locked,
        );
        if (complete) return true;
      }
    }
    return false;
  };
  visit(dataset, null, CORE_V2_IDENTITY_AFFINE, false);
  return result;
}

function elementGeometry(
  element: NormalizedCoreV2Element,
  parentId: string | null,
  parentAffine: CoreV2AffineMatrix,
): CoreV2TransformerGeometry | null {
  const size = elementSize(element);
  if (size === null) return null;
  const attrs = element.attrs ?? {};
  const x = optionalFinite(attrs.x, 0, `${element.id}.attrs.x`);
  const y = optionalFinite(attrs.y, 0, `${element.id}.attrs.y`);
  const rotationDegrees = rotationFromAttrs(attrs, element.id);
  return freezeGeometry({
    id: element.id,
    type: element.type,
    parentId,
    x,
    y,
    width: size[0],
    height: size[1],
    rotationDegrees,
    rotationChannel: attrs.rotation === undefined
      ? attrs.angle === undefined ? 'none' : 'angle'
      : 'rotation',
    centerWorld: applyCoreV2Affine(parentAffine, [
      x + size[0] / 2,
      y + size[1] / 2,
    ]),
  });
}

function elementSize(
  element: NormalizedCoreV2Element,
): readonly [number, number] | null {
  if (
    element.type === 'rect' ||
    element.type === 'item' ||
    element.type === 'image' ||
    element.type === 'text'
  ) {
    if (element.size === undefined) return null;
    return Object.freeze([
      nonnegativeFinite(element.size.width, `${element.id}.size.width`),
      nonnegativeFinite(element.size.height, `${element.id}.size.height`),
    ]);
  }
  if (element.type === 'grid') {
    const rows = element.cells.length;
    const columns = Math.max(0, ...element.cells.map((row) => row.length));
    const itemWidth = nonnegativeFinite(element.item.size.width, `${element.id}.item.size.width`);
    const itemHeight = nonnegativeFinite(
      element.item.size.height,
      `${element.id}.item.size.height`,
    );
    return Object.freeze([
      columns === 0 ? 0 : columns * itemWidth + (columns - 1) * element.gap.x,
      rows === 0 ? 0 : rows * itemHeight + (rows - 1) * element.gap.y,
    ]);
  }
  return null;
}

function localAffine(element: NormalizedCoreV2Element): CoreV2AffineMatrix {
  const attrs = element.attrs ?? {};
  return createCoreV2Affine(
    optionalFinite(attrs.x, 0, `${element.id}.attrs.x`),
    optionalFinite(attrs.y, 0, `${element.id}.attrs.y`),
    rotationFromAttrs(attrs, element.id),
    optionalFinite(attrs.scaleX, 1, `${element.id}.attrs.scaleX`),
    optionalFinite(attrs.scaleY, 1, `${element.id}.attrs.scaleY`),
  );
}

function geometryForResize(
  target: LocatedTransformTarget,
  geometry: CoreV2TransformerGeometry,
  resized: ResizeBounds,
): CoreV2TransformerGeometry {
  return freezeGeometry({
    ...geometry,
    x: resized.x,
    y: resized.y,
    width: resized.width,
    height: resized.height,
    centerWorld: applyCoreV2Affine(target.parentAffine, [
      resized.x + resized.width / 2,
      resized.y + resized.height / 2,
    ]),
  });
}

function resizeBounds(
  geometry: Pick<CoreV2TransformerGeometry, 'x' | 'y' | 'width' | 'height'>,
  handle: CoreV2ResizeHandle,
  delta: CoreV2PointTuple,
  minSize: number,
  lockAspectRatio: boolean,
): ResizeBounds {
  const startRight = geometry.x + geometry.width;
  const startBottom = geometry.y + geometry.height;
  let left = handle.includes('w') ? geometry.x + delta[0] : geometry.x;
  let right = handle.includes('e') ? startRight + delta[0] : startRight;
  let top = handle.includes('n') ? geometry.y + delta[1] : geometry.y;
  let bottom = handle.includes('s') ? startBottom + delta[1] : startBottom;

  if (lockAspectRatio) {
    const ratio = geometry.width / geometry.height;
    if (handle === 'e' || handle === 'w') {
      const width = Math.max(minSize, right - left);
      const height = Math.max(minSize, width / ratio);
      top = geometry.y + (geometry.height - height) / 2;
      bottom = top + height;
      if (handle === 'w') left = startRight - width;
      else right = geometry.x + width;
    } else if (handle === 'n' || handle === 's') {
      const height = Math.max(minSize, bottom - top);
      const width = Math.max(minSize, height * ratio);
      left = geometry.x + (geometry.width - width) / 2;
      right = left + width;
      if (handle === 'n') top = startBottom - height;
      else bottom = geometry.y + height;
    } else {
      const widthCandidate = Math.max(minSize, right - left);
      const heightCandidate = Math.max(minSize, bottom - top);
      const scale = Math.max(
        minSize / geometry.width,
        minSize / geometry.height,
        widthCandidate / geometry.width,
        heightCandidate / geometry.height,
      );
      const width = geometry.width * scale;
      const height = geometry.height * scale;
      left = handle.includes('w') ? startRight - width : geometry.x;
      right = handle.includes('e') ? geometry.x + width : startRight;
      top = handle.includes('n') ? startBottom - height : geometry.y;
      bottom = handle.includes('s') ? geometry.y + height : startBottom;
    }
  }

  if (right - left < minSize) {
    if (handle.includes('w')) left = right - minSize;
    else right = left + minSize;
  }
  if (bottom - top < minSize) {
    if (handle.includes('n')) top = bottom - minSize;
    else bottom = top + minSize;
  }

  const anchorX = handle.includes('w') ? startRight
    : handle.includes('e') ? geometry.x
      : geometry.x + geometry.width / 2;
  const anchorY = handle.includes('n') ? startBottom
    : handle.includes('s') ? geometry.y
      : geometry.y + geometry.height / 2;
  return Object.freeze({
    x: integer(left),
    y: integer(top),
    width: Math.max(minSize, integer(right - left)),
    height: Math.max(minSize, integer(bottom - top)),
    anchor: Object.freeze([roundSix(anchorX), roundSix(anchorY)] as const),
  });
}

function geometryUnion(
  geometries: readonly CoreV2TransformerGeometry[],
): CoreV2TransformerGeometry | null {
  if (geometries.length === 0) return null;
  const minX = Math.min(...geometries.map(({ centerWorld, width }) => centerWorld[0] - width / 2));
  const minY = Math.min(...geometries.map(({ centerWorld, height }) => centerWorld[1] - height / 2));
  const maxX = Math.max(...geometries.map(({ centerWorld, width }) => centerWorld[0] + width / 2));
  const maxY = Math.max(...geometries.map(({ centerWorld, height }) => centerWorld[1] + height / 2));
  return freezeGeometry({
    id: '$selection',
    type: 'rect',
    parentId: null,
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    rotationDegrees: 0,
    rotationChannel: 'none',
    centerWorld: Object.freeze([(minX + maxX) / 2, (minY + maxY) / 2] as const),
  });
}

function geometryOperation(
  before: CoreV2TransformerGeometry,
  after: CoreV2TransformerGeometry,
): CoreV2MutationOperation {
  const changes: Array<Readonly<{
    readonly path: readonly (string | number)[];
    readonly value: number;
  }>> = [];
  if (before.x !== after.x) changes.push(Object.freeze({ path: ['attrs', 'x'], value: after.x }));
  if (before.y !== after.y) changes.push(Object.freeze({ path: ['attrs', 'y'], value: after.y }));
  if (before.width !== after.width) {
    changes.push(Object.freeze({ path: ['size', 'width'], value: after.width }));
  }
  if (before.height !== after.height) {
    changes.push(Object.freeze({ path: ['size', 'height'], value: after.height }));
  }
  if (before.rotationDegrees !== after.rotationDegrees) {
    changes.push(Object.freeze({
      path: before.rotationChannel === 'rotation'
        ? ['attrs', 'rotation']
        : ['attrs', 'angle'],
      value: before.rotationChannel === 'rotation'
        ? after.rotationDegrees * Math.PI / 180
        : after.rotationDegrees,
    }));
  }
  return Object.freeze({
    op: 'merge',
    target: elementTarget(before.id),
    changes: Object.freeze(changes),
  });
}

function selectionCenter(
  geometries: readonly CoreV2TransformerGeometry[],
): CoreV2PointTuple | null {
  const union = geometryUnion(geometries);
  return union?.centerWorld ?? null;
}

function geometryRecord(
  geometries: readonly CoreV2TransformerGeometry[],
): Readonly<Record<string, CoreV2TransformerGeometry>> {
  return Object.freeze(Object.fromEntries(geometries.map((geometry) => [
    geometry.id,
    geometry,
  ])));
}

function rotatePoint(
  point: CoreV2PointTuple,
  center: CoreV2PointTuple,
  degrees: number,
): CoreV2PointTuple {
  const radians = degrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const x = point[0] - center[0];
  const y = point[1] - center[1];
  return Object.freeze([
    roundSix(center[0] + x * cosine - y * sine),
    roundSix(center[1] + x * sine + y * cosine),
  ] as const);
}

function screenPointToWorld(
  screen: CoreV2PointTuple,
  centerWorld: CoreV2PointTuple,
  scale: number,
  viewportSize: CoreV2PointTuple,
): CoreV2PointTuple {
  return Object.freeze([
    roundSix(centerWorld[0] + (screen[0] - viewportSize[0] / 2) / scale),
    roundSix(centerWorld[1] + (screen[1] - viewportSize[1] / 2) / scale),
  ] as const);
}

function dominantAxis(delta: CoreV2PointTuple): CoreV2PointTuple {
  return Math.abs(delta[0]) >= Math.abs(delta[1])
    ? Object.freeze([delta[0], 0] as const)
    : Object.freeze([0, delta[1]] as const);
}

function affineVector(
  matrix: CoreV2AffineMatrix,
  vector: CoreV2PointTuple,
): CoreV2PointTuple {
  return Object.freeze([
    matrix[0] * vector[0] + matrix[2] * vector[1],
    matrix[1] * vector[0] + matrix[3] * vector[1],
  ] as const);
}

function rotationFromAttrs(
  attrs: Readonly<Record<string, unknown>>,
  id: string,
): number {
  if (attrs.angle !== undefined && attrs.rotation !== undefined) {
    throw new TypeError(`${id} cannot contain both attrs.angle and attrs.rotation`);
  }
  if (attrs.angle !== undefined) return finite(attrs.angle, `${id}.attrs.angle`);
  if (attrs.rotation !== undefined) {
    return finite(attrs.rotation, `${id}.attrs.rotation`) * 180 / Math.PI;
  }
  return 0;
}

function resizeHandle(value: string): CoreV2ResizeHandle {
  if (!['nw', 'ne', 'sw', 'se', 'n', 'e', 's', 'w'].includes(value)) {
    throw new TypeError('resize handle is unsupported');
  }
  return value as CoreV2ResizeHandle;
}

function elementTarget(id: string): Extract<CoreV2MutationTarget, { readonly kind: 'element' }> {
  return Object.freeze({ kind: 'element', id });
}

function requireGeometry(target: LocatedTransformTarget): CoreV2TransformerGeometry {
  if (target.geometry === null) throw new Error(`transform target ${target.element.id} has no geometry`);
  return target.geometry;
}

function freezeGeometry(
  geometry: CoreV2TransformerGeometry,
): CoreV2TransformerGeometry {
  return Object.freeze({
    ...geometry,
    centerWorld: Object.freeze([...geometry.centerWorld]) as CoreV2PointTuple,
  });
}

function shortestDelta(start: number, end: number): number {
  return ((end - start + 540) % 360) - 180;
}

function normalizeDegrees(value: number): number {
  const normalized = ((value % 360) + 360) % 360;
  return roundSix(normalized === 360 ? 0 : normalized);
}

function integer(value: number): number {
  const rounded = Math.round(finite(value, 'transform integer result'));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function roundSix(value: number): number {
  const rounded = Math.round(finite(value, 'transform finite result') * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function uniqueStrings(value: readonly string[], label: string): readonly string[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  const result: string[] = [];
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    if (typeof entry !== 'string' || entry.length === 0) {
      throw new TypeError(`${label}[${index}] must be a non-empty string`);
    }
    if (!seen.has(entry)) {
      seen.add(entry);
      result.push(entry);
    }
  });
  return Object.freeze(result);
}

function finitePoint(value: CoreV2PointTuple, label: string): CoreV2PointTuple {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new TypeError(`${label} must contain two finite numbers`);
  }
  return Object.freeze([
    finite(value[0], `${label}[0]`),
    finite(value[1], `${label}[1]`),
  ] as const);
}

function optionalFinite(
  value: unknown,
  fallback: number,
  label: string,
): number {
  return value === undefined ? fallback : finite(value, label);
}

function nonnegativeFinite(value: unknown, label: string): number {
  const result = finite(value, label);
  if (result < 0) throw new RangeError(`${label} must be non-negative`);
  return result;
}

function positiveFinite(value: unknown, label: string): number {
  const result = finite(value, label);
  if (!(result > 0)) throw new RangeError(`${label} must be positive`);
  return result;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite`);
  }
  return value;
}
