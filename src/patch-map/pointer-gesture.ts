import {
  pointDistance,
  validateFiniteTuple,
} from './pointer-gesture/geometry';

export {
  hitPatchMapBoxRegion,
  hitPatchMapPaintRegion,
} from './pointer-gesture/geometry';
export type {
  PatchMapRegionEntityGeometry,
  PatchMapRegionHitResult,
  PatchMapRegionRelationGeometry,
} from './pointer-gesture/geometry';

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
