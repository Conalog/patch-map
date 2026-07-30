export const PATCH_MAP_POINTER_GESTURE_REVISION = 'core-v2-pointer-gesture/1' as const;

export type PatchMapPointerInputType =
  | 'down'
  | 'move'
  | 'up'
  | 'up-outside'
  | 'cancel'
  | 'leave';

export interface PatchMapPointerModifiers {
  readonly shift: boolean;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly meta: boolean;
}

export interface PatchMapPointerInput {
  readonly type: PatchMapPointerInputType;
  readonly pointerId: number;
  readonly pointerType: string;
  readonly button: number;
  readonly buttons: number;
  readonly screen: readonly [number, number];
  readonly timeMs: number;
  readonly modifiers: PatchMapPointerModifiers;
  readonly viewRevision: number;
}

export type PatchMapSemanticPointerEventType =
  | 'down'
  | 'up'
  | 'click'
  | 'drag-start'
  | 'drag-update'
  | 'drag-end'
  | 'cancel'
  | 'hover-change';

export interface PatchMapSemanticPointerPayload {
  readonly target: Readonly<{ readonly id: string }> | null;
  readonly global: readonly [number, number];
  readonly screen: readonly [number, number];
  readonly modifiers: PatchMapPointerModifiers;
  readonly button: number;
  readonly pointerId: number;
  readonly pointerType: string;
  readonly clickCount: number;
}

export interface PatchMapSemanticPointerEvent {
  readonly type: PatchMapSemanticPointerEventType;
  readonly payload: PatchMapSemanticPointerPayload;
}

export interface PatchMapPointerDispatchResult {
  readonly events: readonly PatchMapSemanticPointerEvent[];
  readonly hoverTarget: string | null;
  readonly clickSuppressed: boolean;
  readonly semanticCompletionCount: number;
}

export interface PatchMapPointerGestureProbe {
  readonly activePointerCount: number;
  readonly pointerCaptureCount: number;
  readonly activeGestureCount: number;
  readonly hoverTarget: string | null;
  readonly hoverListenerCount: number;
  readonly staleGestureCount: number;
  readonly destroyed: boolean;
}

export interface PatchMapPointerGestureOptions {
  readonly hitTest: (point: Readonly<{ readonly x: number; readonly y: number }>) => string | null;
  readonly clickThresholdCssPx?: number;
  readonly clickWindowMs?: number;
  readonly clickRadiusCssPx?: number;
  readonly hoverDuringPress?: boolean;
}

export type PatchMapOwnedGestureKind =
  | 'click'
  | 'box'
  | 'paint'
  | 'pan'
  | 'move'
  | 'resize'
  | 'rotate';

export type PatchMapGestureCancelReason =
  | 'escape'
  | 'pointer-cancel'
  | 'lost-capture'
  | 'blur'
  | 'redraw'
  | 'selection-change'
  | 'lock-change'
  | 'replace'
  | 'destroy';

export type PatchMapGestureTerminationReason =
  | 'pointer-up-outside'
  | PatchMapGestureCancelReason;

export interface PatchMapOwnedGestureTermination {
  readonly kind: PatchMapOwnedGestureKind;
  readonly reason: PatchMapGestureTerminationReason;
  readonly state: 'committed' | 'reverted';
  readonly commitCount: 0 | 1;
  readonly depthDelta: 0;
  readonly staleCompletionCount: 0;
  readonly resources: Readonly<{
    readonly capture: 0;
    readonly overlay: 0;
    readonly autoPan: 0;
    readonly listeners: 0;
    readonly modifiers: 0;
  }>;
}

export interface PatchMapRegionEntityGeometry {
  readonly id: string;
  readonly ownerItemId?: string;
  readonly screenBounds: readonly [number, number, number, number];
  readonly visible: boolean;
  readonly interactive: boolean;
}

export interface PatchMapRegionRelationGeometry {
  readonly id: string;
  readonly relationId?: string;
  readonly screenPoints?: readonly (readonly [number, number])[];
  readonly screenEndpoints: readonly [
    readonly [number, number],
    readonly [number, number],
  ];
  readonly visible?: boolean;
}

export interface PatchMapRegionHitResult {
  readonly candidateIds: readonly string[];
  readonly relationIds: readonly string[];
  readonly duplicateCount: number;
  readonly nonFiniteCount: number;
}

interface ActivePointer {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly button: number;
  readonly targetId: string | null;
  readonly startScreen: readonly [number, number];
  readonly startViewRevision: number;
  maxDistance: number;
  dragging: boolean;
}

interface ClickHistory {
  readonly targetId: string | null;
  readonly pointerType: string;
  readonly button: number;
  readonly screen: readonly [number, number];
  readonly timeMs: number;
  readonly count: number;
}

interface OwnedGesture {
  readonly kind: PatchMapOwnedGestureKind;
  readonly pointerId: number;
}

const RELEASED_GESTURE_RESOURCES = Object.freeze({
  capture: 0,
  overlay: 0,
  autoPan: 0,
  listeners: 0,
  modifiers: 0,
});

/**
 * Root-only pointer authority. It owns one state record per active pointer,
 * never one callback or closure per scene entity.
 */
export class PatchMapPointerGestureAuthority {
  private readonly hitTest: PatchMapPointerGestureOptions['hitTest'];
  private readonly clickThresholdCssPx: number;
  private readonly clickWindowMs: number;
  private readonly clickRadiusCssPx: number;
  private readonly hoverDuringPress: boolean;
  private readonly activePointers = new Map<number, ActivePointer>();
  private hoverTarget: string | null = null;
  private clickHistory: ClickHistory | null = null;
  private ownedGesture: OwnedGesture | null = null;
  private staleGestureCount = 0;
  private destroyed = false;

  public constructor(options: PatchMapPointerGestureOptions) {
    this.hitTest = options.hitTest;
    this.clickThresholdCssPx = positiveFinite(
      options.clickThresholdCssPx ?? 4,
      'clickThresholdCssPx',
    );
    this.clickWindowMs = positiveFinite(options.clickWindowMs ?? 500, 'clickWindowMs');
    this.clickRadiusCssPx = positiveFinite(
      options.clickRadiusCssPx ?? 4,
      'clickRadiusCssPx',
    );
    this.hoverDuringPress = options.hoverDuringPress ?? false;
  }

  public dispatch(inputValue: PatchMapPointerInput): PatchMapPointerDispatchResult {
    const input = normalizePointerInput(inputValue);
    if (this.destroyed) return emptyDispatchResult(this.hoverTarget);
    if (this.ownedGesture?.pointerId === input.pointerId) {
      return Object.freeze({
        events: Object.freeze([]),
        hoverTarget: this.hoverTarget,
        clickSuppressed: true,
        semanticCompletionCount: 0,
      });
    }
    if (input.type === 'down') return this.pointerDown(input);
    if (input.type === 'move') return this.pointerMove(input);
    if (input.type === 'up' || input.type === 'up-outside') {
      return this.pointerUp(input);
    }
    if (input.type === 'cancel') return this.pointerCancel(input);
    return this.pointerLeave(input);
  }

  public beginOwnedGesture(kind: PatchMapOwnedGestureKind, pointerId: number): void {
    if (this.destroyed) throw new Error('PatchMap pointer gesture authority is destroyed');
    validatePointerId(pointerId);
    if (this.ownedGesture !== null) {
      throw new Error('PatchMap pointer gesture authority already owns a gesture');
    }
    this.ownedGesture = Object.freeze({ kind, pointerId });
  }

  public terminateOwnedGesture(
    reason: PatchMapGestureTerminationReason,
  ): PatchMapOwnedGestureTermination | null {
    const gesture = this.ownedGesture;
    if (gesture === null) {
      this.staleGestureCount += 1;
      return null;
    }
    this.ownedGesture = null;
    this.activePointers.delete(gesture.pointerId);
    return Object.freeze({
      kind: gesture.kind,
      reason,
      state: reason === 'pointer-up-outside' ? 'committed' : 'reverted',
      commitCount: reason === 'pointer-up-outside' ? 1 : 0,
      depthDelta: 0,
      staleCompletionCount: 0,
      resources: RELEASED_GESTURE_RESOURCES,
    });
  }

  public cancelOwnedGesture(reason: PatchMapGestureCancelReason): PatchMapOwnedGestureTermination | null {
    return this.terminateOwnedGesture(reason);
  }

  public resetClickHistory(): void {
    this.clickHistory = null;
  }

  public interrupt(reason: PatchMapGestureCancelReason): PatchMapOwnedGestureTermination | null {
    this.activePointers.clear();
    this.hoverTarget = null;
    this.clickHistory = null;
    const gesture = this.ownedGesture;
    if (gesture === null) return null;
    return this.terminateOwnedGesture(reason);
  }

  public probe(): PatchMapPointerGestureProbe {
    return Object.freeze({
      activePointerCount: this.activePointers.size,
      pointerCaptureCount: this.activePointers.size,
      activeGestureCount: this.ownedGesture === null ? 0 : 1,
      hoverTarget: this.hoverTarget,
      hoverListenerCount: this.destroyed ? 0 : 1,
      staleGestureCount: this.staleGestureCount,
      destroyed: this.destroyed,
    });
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.activePointers.clear();
    this.ownedGesture = null;
    this.hoverTarget = null;
    this.clickHistory = null;
    this.destroyed = true;
  }

  private pointerDown(input: PatchMapPointerInput): PatchMapPointerDispatchResult {
    const targetId = this.hit(input.screen);
    const pointer: ActivePointer = {
      pointerId: input.pointerId,
      pointerType: input.pointerType,
      button: input.button,
      targetId,
      startScreen: input.screen,
      startViewRevision: input.viewRevision,
      maxDistance: 0,
      dragging: false,
    };
    this.activePointers.set(input.pointerId, pointer);
    if (!this.hoverDuringPress) this.hoverTarget = null;
    return dispatchResult(
      [semanticPointerEvent('down', input, targetId, 0)],
      this.hoverTarget,
      false,
    );
  }

  private pointerMove(input: PatchMapPointerInput): PatchMapPointerDispatchResult {
    const active = this.activePointers.get(input.pointerId);
    if (active === undefined) {
      if (input.buttons !== 0 && !this.hoverDuringPress) {
        return emptyDispatchResult(this.hoverTarget);
      }
      const nextHover = this.hit(input.screen);
      if (nextHover === this.hoverTarget) return emptyDispatchResult(this.hoverTarget);
      this.hoverTarget = nextHover;
      return dispatchResult(
        [semanticPointerEvent('hover-change', input, nextHover, 0)],
        this.hoverTarget,
        false,
      );
    }

    active.maxDistance = Math.max(
      active.maxDistance,
      pointDistance(active.startScreen, input.screen),
    );
    if (!this.hoverDuringPress) this.hoverTarget = null;
    const events: PatchMapSemanticPointerEvent[] = [];
    if (!active.dragging && active.maxDistance > this.clickThresholdCssPx) {
      active.dragging = true;
      events.push(semanticPointerEvent('drag-start', input, active.targetId, 0));
    }
    if (active.dragging) {
      events.push(semanticPointerEvent('drag-update', input, active.targetId, 0));
    }
    return dispatchResult(events, this.hoverTarget, false);
  }

  private pointerUp(input: PatchMapPointerInput): PatchMapPointerDispatchResult {
    const active = this.activePointers.get(input.pointerId);
    if (active === undefined) {
      this.staleGestureCount += 1;
      return emptyDispatchResult(this.hoverTarget);
    }
    this.activePointers.delete(input.pointerId);
    active.maxDistance = Math.max(
      active.maxDistance,
      pointDistance(active.startScreen, input.screen),
    );
    if (active.dragging || active.maxDistance > this.clickThresholdCssPx) {
      return dispatchResult(
        [semanticPointerEvent('drag-end', input, active.targetId, 0)],
        this.hoverTarget,
        true,
      );
    }
    const events: PatchMapSemanticPointerEvent[] = [
      semanticPointerEvent('up', input, active.targetId, 0),
    ];
    const endTargetId = this.hit(input.screen);
    const clickSuppressed =
      active.startViewRevision !== input.viewRevision ||
      endTargetId !== active.targetId;
    if (clickSuppressed) return dispatchResult(events, this.hoverTarget, true);
    const clickCount = this.nextClickCount(active, input);
    events.push(semanticPointerEvent('click', input, active.targetId, clickCount));
    return dispatchResult(events, this.hoverTarget, false);
  }

  private pointerCancel(input: PatchMapPointerInput): PatchMapPointerDispatchResult {
    const active = this.activePointers.get(input.pointerId);
    if (active === undefined) return emptyDispatchResult(this.clearHover());
    this.activePointers.delete(input.pointerId);
    const event = semanticPointerEvent('cancel', input, active.targetId, 0);
    return dispatchResult([event], this.clearHover(), true);
  }

  private pointerLeave(input: PatchMapPointerInput): PatchMapPointerDispatchResult {
    const previous = this.hoverTarget;
    this.hoverTarget = null;
    const active = this.activePointers.get(input.pointerId);
    if (active !== undefined) this.activePointers.delete(input.pointerId);
    const events: PatchMapSemanticPointerEvent[] = [];
    if (active !== undefined) {
      events.push(semanticPointerEvent('cancel', input, active.targetId, 0));
    }
    if (previous !== null) {
      events.push(semanticPointerEvent('hover-change', input, null, 0));
    }
    return dispatchResult(events, this.hoverTarget, active !== undefined);
  }

  private nextClickCount(active: ActivePointer, input: PatchMapPointerInput): number {
    const history = this.clickHistory;
    const repeated = history !== null &&
      history.targetId === active.targetId &&
      history.pointerType === active.pointerType &&
      history.button === active.button &&
      input.timeMs >= history.timeMs &&
      input.timeMs - history.timeMs <= this.clickWindowMs &&
      pointDistance(history.screen, input.screen) <= this.clickRadiusCssPx;
    const count = repeated ? history.count + 1 : 1;
    this.clickHistory = Object.freeze({
      targetId: active.targetId,
      pointerType: active.pointerType,
      button: active.button,
      screen: input.screen,
      timeMs: input.timeMs,
      count,
    });
    return count;
  }

  private hit(point: readonly [number, number]): string | null {
    return this.hitTest(Object.freeze({ x: point[0], y: point[1] }));
  }

  private clearHover(): null {
    this.hoverTarget = null;
    return null;
  }
}

export function hitPatchMapBoxRegion(
  entities: readonly PatchMapRegionEntityGeometry[],
  relations: readonly PatchMapRegionRelationGeometry[],
  start: readonly [number, number],
  end: readonly [number, number],
  options: Readonly<{ readonly partialIntersection?: boolean }> = {},
): PatchMapRegionHitResult {
  validateFiniteTuple(start, 'box start');
  validateFiniteTuple(end, 'box end');
  const box = normalizedBounds(start, end);
  const partial = options.partialIntersection ?? true;
  const candidateIds: string[] = [];
  const seen = new Set<string>();
  const duplicateCount = 0;
  let nonFiniteCount = 0;
  for (const entity of entities) {
    if (!entity.visible || !entity.interactive) continue;
    if (!finiteBounds(entity.screenBounds)) {
      nonFiniteCount += 1;
      continue;
    }
    const hit = partial
      ? boundsIntersect(box, entity.screenBounds)
      : boundsContainBounds(box, entity.screenBounds);
    if (!hit) continue;
    const id = entity.ownerItemId ?? entity.id;
    if (seen.has(id)) continue;
    seen.add(id);
    candidateIds.push(id);
  }
  return freezeRegionResult(
    candidateIds,
    relationIdsIntersectingBox(relations, box),
    duplicateCount,
    nonFiniteCount,
  );
}

export function hitPatchMapPaintRegion(
  entities: readonly PatchMapRegionEntityGeometry[],
  relations: readonly PatchMapRegionRelationGeometry[],
  segments: readonly (readonly [
    readonly [number, number],
    readonly [number, number],
  ])[],
  options: Readonly<{ readonly toleranceCssPx?: number }> = {},
): PatchMapRegionHitResult {
  const tolerance = nonNegativeFinite(options.toleranceCssPx ?? 0, 'paint toleranceCssPx');
  const finiteSegments = segments.filter((segment) =>
    finitePoint(segment[0]) && finitePoint(segment[1]));
  const candidateIds: string[] = [];
  const seen = new Set<string>();
  const duplicateCount = 0;
  let nonFiniteCount = segments.length - finiteSegments.length;
  for (const entity of entities) {
    if (!entity.visible || !entity.interactive) continue;
    if (!finiteBounds(entity.screenBounds)) {
      nonFiniteCount += 1;
      continue;
    }
    if (!finiteSegments.some((segment) =>
      segmentIntersectsExpandedBounds(segment, entity.screenBounds, tolerance))) {
      continue;
    }
    const id = entity.ownerItemId ?? entity.id;
    if (seen.has(id)) continue;
    seen.add(id);
    candidateIds.push(id);
  }
  const relationIds = relations.flatMap((relation) => {
    if (relation.visible === false) return [];
    const points = relationPoints(relation);
    if (points.some((point) => !finitePoint(point))) {
      nonFiniteCount += 1;
      return [];
    }
    return polylineSegments(points).some((relationSegment) =>
      finiteSegments.some((paintSegment) =>
        segmentDistance(relationSegment, paintSegment) <= tolerance))
      ? [relation.relationId ?? relation.id]
      : [];
  });
  return freezeRegionResult(candidateIds, uniqueStrings(relationIds), duplicateCount, nonFiniteCount);
}

function normalizePointerInput(input: PatchMapPointerInput): PatchMapPointerInput {
  if (!isPointerInputType(input.type)) throw new TypeError('pointer input type is unsupported');
  validatePointerId(input.pointerId);
  if (typeof input.pointerType !== 'string' || input.pointerType.length === 0) {
    throw new TypeError('pointerType must be a non-empty string');
  }
  if (!Number.isInteger(input.button) || !Number.isInteger(input.buttons)) {
    throw new TypeError('pointer button state must be integral');
  }
  validateFiniteTuple(input.screen, 'pointer screen');
  if (!Number.isFinite(input.timeMs) || !Number.isFinite(input.viewRevision)) {
    throw new RangeError('pointer time and view revision must be finite');
  }
  return Object.freeze({
    ...input,
    screen: Object.freeze([input.screen[0], input.screen[1]] as const),
    modifiers: Object.freeze({
      shift: input.modifiers.shift,
      ctrl: input.modifiers.ctrl,
      alt: input.modifiers.alt,
      meta: input.modifiers.meta,
    }),
  });
}

function isPointerInputType(value: string): value is PatchMapPointerInputType {
  return value === 'down' ||
    value === 'move' ||
    value === 'up' ||
    value === 'up-outside' ||
    value === 'cancel' ||
    value === 'leave';
}

function semanticPointerEvent(
  type: PatchMapSemanticPointerEventType,
  input: PatchMapPointerInput,
  targetId: string | null,
  clickCount: number,
): PatchMapSemanticPointerEvent {
  return Object.freeze({
    type,
    payload: Object.freeze({
      target: targetId === null ? null : Object.freeze({ id: targetId }),
      global: input.screen,
      screen: input.screen,
      modifiers: input.modifiers,
      button: input.button,
      pointerId: input.pointerId,
      pointerType: input.pointerType,
      clickCount,
    }),
  });
}

function dispatchResult(
  events: readonly PatchMapSemanticPointerEvent[],
  hoverTarget: string | null,
  clickSuppressed: boolean,
): PatchMapPointerDispatchResult {
  return Object.freeze({
    events: Object.freeze([...events]),
    hoverTarget,
    clickSuppressed,
    semanticCompletionCount: events.filter((event) =>
      event.type === 'click' || event.type === 'drag-end').length,
  });
}

function emptyDispatchResult(hoverTarget: string | null): PatchMapPointerDispatchResult {
  return dispatchResult(Object.freeze([]), hoverTarget, false);
}

function normalizedBounds(
  start: readonly [number, number],
  end: readonly [number, number],
): readonly [number, number, number, number] {
  const x = Math.min(start[0], end[0]);
  const y = Math.min(start[1], end[1]);
  return Object.freeze([x, y, Math.abs(end[0] - start[0]), Math.abs(end[1] - start[1])]);
}

function relationIdsIntersectingBox(
  relations: readonly PatchMapRegionRelationGeometry[],
  box: readonly [number, number, number, number],
): readonly string[] {
  return uniqueStrings(relations.flatMap((relation) => {
    if (relation.visible === false) return [];
    const points = relationPoints(relation);
    if (points.some((point) => !finitePoint(point))) return [];
    return polylineSegments(points).some((segment) => segmentIntersectsBounds(segment, box))
      ? [relation.relationId ?? relation.id]
      : [];
  }));
}

function relationPoints(
  relation: PatchMapRegionRelationGeometry,
): readonly (readonly [number, number])[] {
  return relation.screenPoints && relation.screenPoints.length >= 2
    ? relation.screenPoints
    : relation.screenEndpoints;
}

function polylineSegments(
  points: readonly (readonly [number, number])[],
): readonly (readonly [readonly [number, number], readonly [number, number]])[] {
  const segments: (readonly [readonly [number, number], readonly [number, number]])[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (from !== undefined && to !== undefined) segments.push(Object.freeze([from, to]));
  }
  return segments;
}

function segmentIntersectsExpandedBounds(
  segment: readonly [readonly [number, number], readonly [number, number]],
  bounds: readonly [number, number, number, number],
  tolerance: number,
): boolean {
  const expanded = Object.freeze([
    bounds[0] - tolerance,
    bounds[1] - tolerance,
    bounds[2] + tolerance * 2,
    bounds[3] + tolerance * 2,
  ] as const);
  return segmentIntersectsBounds(segment, expanded);
}

function segmentIntersectsBounds(
  segment: readonly [readonly [number, number], readonly [number, number]],
  bounds: readonly [number, number, number, number],
): boolean {
  if (pointInBounds(segment[0], bounds) || pointInBounds(segment[1], bounds)) return true;
  const [x, y, width, height] = bounds;
  const corners = [
    Object.freeze([x, y] as const),
    Object.freeze([x + width, y] as const),
    Object.freeze([x + width, y + height] as const),
    Object.freeze([x, y + height] as const),
  ];
  return segmentsIntersect(segment, [corners[0]!, corners[1]!]) ||
    segmentsIntersect(segment, [corners[1]!, corners[2]!]) ||
    segmentsIntersect(segment, [corners[2]!, corners[3]!]) ||
    segmentsIntersect(segment, [corners[3]!, corners[0]!]);
}

function segmentsIntersect(
  left: readonly [readonly [number, number], readonly [number, number]],
  right: readonly [readonly [number, number], readonly [number, number]],
): boolean {
  const [a, b] = left;
  const [c, d] = right;
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (abC === 0 && pointOnSegment(c, a, b)) return true;
  if (abD === 0 && pointOnSegment(d, a, b)) return true;
  if (cdA === 0 && pointOnSegment(a, c, d)) return true;
  if (cdB === 0 && pointOnSegment(b, c, d)) return true;
  return Math.sign(abC) !== Math.sign(abD) && Math.sign(cdA) !== Math.sign(cdB);
}

function segmentDistance(
  left: readonly [readonly [number, number], readonly [number, number]],
  right: readonly [readonly [number, number], readonly [number, number]],
): number {
  if (segmentsIntersect(left, right)) return 0;
  return Math.min(
    pointToSegmentDistance(left[0], right[0], right[1]),
    pointToSegmentDistance(left[1], right[0], right[1]),
    pointToSegmentDistance(right[0], left[0], left[1]),
    pointToSegmentDistance(right[1], left[0], left[1]),
  );
}

function pointToSegmentDistance(
  point: readonly [number, number],
  start: readonly [number, number],
  end: readonly [number, number],
): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return pointDistance(point, start);
  const projection = Math.max(
    0,
    Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared),
  );
  return Math.hypot(
    point[0] - (start[0] + projection * dx),
    point[1] - (start[1] + projection * dy),
  );
}

function orientation(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
): number {
  const value = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return Math.abs(value) <= Number.EPSILON ? 0 : value;
}

function pointOnSegment(
  point: readonly [number, number],
  start: readonly [number, number],
  end: readonly [number, number],
): boolean {
  return point[0] >= Math.min(start[0], end[0]) &&
    point[0] <= Math.max(start[0], end[0]) &&
    point[1] >= Math.min(start[1], end[1]) &&
    point[1] <= Math.max(start[1], end[1]);
}

function pointInBounds(
  point: readonly [number, number],
  bounds: readonly [number, number, number, number],
): boolean {
  return point[0] >= bounds[0] &&
    point[0] <= bounds[0] + bounds[2] &&
    point[1] >= bounds[1] &&
    point[1] <= bounds[1] + bounds[3];
}

function boundsIntersect(
  left: readonly [number, number, number, number],
  right: readonly [number, number, number, number],
): boolean {
  return left[0] <= right[0] + right[2] &&
    left[0] + left[2] >= right[0] &&
    left[1] <= right[1] + right[3] &&
    left[1] + left[3] >= right[1];
}

function boundsContainBounds(
  outer: readonly [number, number, number, number],
  inner: readonly [number, number, number, number],
): boolean {
  return inner[0] >= outer[0] &&
    inner[1] >= outer[1] &&
    inner[0] + inner[2] <= outer[0] + outer[2] &&
    inner[1] + inner[3] <= outer[1] + outer[3];
}

function finiteBounds(bounds: readonly [number, number, number, number]): boolean {
  return bounds.every(Number.isFinite) && bounds[2] >= 0 && bounds[3] >= 0;
}

function finitePoint(point: readonly [number, number]): boolean {
  return Number.isFinite(point[0]) && Number.isFinite(point[1]);
}

function validateFiniteTuple(point: readonly [number, number], label: string): void {
  if (!finitePoint(point)) throw new RangeError(`${label} must contain finite coordinates`);
}

function validatePointerId(pointerId: number): void {
  if (!Number.isInteger(pointerId) || pointerId < 0) {
    throw new RangeError('pointerId must be a non-negative integer');
  }
}

function positiveFinite(value: number, label: string): number {
  if (!(value > 0) || !Number.isFinite(value)) {
    throw new RangeError(`${label} must be positive and finite`);
  }
  return value;
}

function nonNegativeFinite(value: number, label: string): number {
  if (value < 0 || !Number.isFinite(value)) {
    throw new RangeError(`${label} must be non-negative and finite`);
  }
  return value;
}

function pointDistance(
  left: readonly [number, number],
  right: readonly [number, number],
): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)]);
}

function freezeRegionResult(
  candidateIds: readonly string[],
  relationIds: readonly string[],
  duplicateCount: number,
  nonFiniteCount: number,
): PatchMapRegionHitResult {
  return Object.freeze({
    candidateIds: Object.freeze([...candidateIds]),
    relationIds: Object.freeze([...relationIds]),
    duplicateCount,
    nonFiniteCount,
  });
}
