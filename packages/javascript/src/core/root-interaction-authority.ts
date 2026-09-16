import type { CorePoint, CoreView } from '../dense/contracts';
import {
  PATCH_MAP_POINTER_CLICK_SLOP_CSS_PX,
  coordinatesMovedBeyondCssSlop,
} from '../pointer-gesture/geometry';
import type {
  RootContextMenuInput,
  RootInteractionHandlers,
  RootWheelInput,
} from '../rendering-port';
import {
  PATCH_MAP_DEFAULT_VIEWPORT_POLICIES,
  PATCH_MAP_VIEWPORT_POLICIES,
  type PatchMapViewportPolicy,
} from '../viewport';
import type {
  PatchMapRootPointerInput,
  PatchMapRootViewportChange,
  PatchMapRootViewportChangeSource,
} from './contracts';

export interface PatchMapRootInteractionBinder {
  bindRootInteractions(handlers: RootInteractionHandlers): () => void;
}

export interface PatchMapRootInteractionPorts {
  readonly readView: () => CoreView;
  readonly selectAtScreen: (point: CorePoint) => void;
  readonly panBy: (delta: CorePoint) => void;
  readonly zoomAt: (screenPoint: CorePoint, factor: number) => void;
  readonly hitTestInteractive: (point: CorePoint) => boolean;
  readonly requestGestureFrame: () => void;
  readonly setGestureContinuous: (enabled: boolean, reason: string) => void;
}

export interface PatchMapRootInteractionOptions {
  readonly selectionMode: 'immediate' | 'deferred';
  readonly autoRender: boolean;
  readonly wheelActivationModifier: 'none' | 'control';
}

interface PanState {
  readonly pointerId: number;
  readonly source: Extract<PatchMapRootViewportChangeSource, 'pointer' | 'middle-pointer'>;
  readonly startX: number;
  readonly startY: number;
  active: boolean;
  x: number;
  y: number;
}

/**
 * Owns the one root Pixi binding and all root gesture/listener state. Semantic
 * selection and view transactions remain Core-owned through the supplied ports.
 */
export class PatchMapRootInteractionAuthority {
  private pan: PanState | null = null;
  private viewportPolicies = new Set<PatchMapViewportPolicy>(
    PATCH_MAP_DEFAULT_VIEWPORT_POLICIES,
  );
  private viewportZoomLimits: readonly [number, number] = Object.freeze([
    Number.MIN_VALUE,
    Number.MAX_VALUE,
  ]);
  private readonly viewportListeners = new Set<
    (change: PatchMapRootViewportChange) => void
  >();
  private readonly pointerListeners = new Set<
    (input: PatchMapRootPointerInput) => void
  >();
  private readonly contextMenuListeners = new Set<
    (input: RootContextMenuInput) => boolean
  >();
  private readonly unbind: () => void;
  private destroyed = false;
  private bindingReleased = false;

  public constructor(
    binder: PatchMapRootInteractionBinder,
    private readonly ports: PatchMapRootInteractionPorts,
    private readonly options: PatchMapRootInteractionOptions,
  ) {
    this.unbind = binder.bindRootInteractions({
      pointer: (input) => this.onPointerInput(input),
      wheel: (input) => this.onWheel(input),
      contextMenu: (input) => this.onContextMenu(input),
    });
  }

  public get activeGesture(): boolean {
    return !this.destroyed && this.pan?.active === true;
  }

  public get pointerListenerCount(): number {
    return this.destroyed ? 0 : this.pointerListeners.size;
  }

  public get zoomLimits(): readonly [number, number] {
    return this.viewportZoomLimits;
  }

  public setGesturePolicies(
    policies: readonly PatchMapViewportPolicy[],
  ): readonly PatchMapViewportPolicy[] {
    this.assertAlive();
    if (!Array.isArray(policies)) throw new TypeError('viewport policies must be an array');
    const supported = new Set<PatchMapViewportPolicy>(PATCH_MAP_VIEWPORT_POLICIES);
    const next = new Set<PatchMapViewportPolicy>();
    const requested = policies as readonly unknown[];
    for (const [index, value] of requested.entries()) {
      if (typeof value !== 'string' || !supported.has(value as PatchMapViewportPolicy)) {
        throw new TypeError(`viewport policies[${index}] is unsupported`);
      }
      next.add(value as PatchMapViewportPolicy);
    }
    this.viewportPolicies = next;
    if (!next.has('pan')) {
      this.cancelGesture();
      this.ports.setGestureContinuous(false, 'gesture-cancel');
    }
    return Object.freeze(PATCH_MAP_VIEWPORT_POLICIES.filter((policy) => next.has(policy)));
  }

  public setZoomLimits(
    limits: readonly [number, number],
  ): readonly [number, number] {
    this.assertAlive();
    if (
      !Array.isArray(limits) ||
      limits.length !== 2 ||
      !Number.isFinite(limits[0]) ||
      !Number.isFinite(limits[1]) ||
      !(limits[0] > 0) ||
      limits[1] < limits[0]
    ) {
      throw new RangeError('viewport zoom limits must be finite, positive, and ordered');
    }
    this.viewportZoomLimits = Object.freeze([limits[0], limits[1]]);
    return this.viewportZoomLimits;
  }

  public bindViewportChanges(
    listener: (change: PatchMapRootViewportChange) => void,
  ): () => void {
    this.assertAlive();
    if (typeof listener !== 'function') {
      throw new TypeError('root viewport listener must be a function');
    }
    this.viewportListeners.add(listener);
    return () => {
      this.viewportListeners.delete(listener);
    };
  }

  public bindPointerInputs(
    listener: (input: PatchMapRootPointerInput) => void,
  ): () => void {
    this.assertAlive();
    if (typeof listener !== 'function') {
      throw new TypeError('root pointer input listener must be a function');
    }
    this.pointerListeners.add(listener);
    return () => {
      this.pointerListeners.delete(listener);
    };
  }

  public bindContextMenuInputs(
    listener: (input: RootContextMenuInput) => boolean,
  ): () => void {
    this.assertAlive();
    if (typeof listener !== 'function') {
      throw new TypeError('root context-menu listener must be a function');
    }
    this.contextMenuListeners.add(listener);
    return () => {
      this.contextMenuListeners.delete(listener);
    };
  }

  public cancelGesture(): void {
    this.pan = null;
  }

  public destroy(): boolean {
    const firstDestroy = !this.destroyed;
    this.destroyed = true;
    this.pan = null;
    this.viewportPolicies.clear();
    this.viewportListeners.clear();
    this.pointerListeners.clear();
    this.contextMenuListeners.clear();
    if (!this.bindingReleased) {
      this.unbind();
      this.bindingReleased = true;
    }
    return firstDestroy;
  }

  private onPointerInput(input: PatchMapRootPointerInput): void {
    if (this.destroyed) return;
    this.publishPointerInput(input);
    if (input.type === 'down') {
      this.onPointerDown(input.screenX, input.screenY, input.pointerId, input.button);
    } else if (input.type === 'move') {
      this.onPointerMove(input.screenX, input.screenY, input.pointerId);
    } else {
      this.onPointerUp(input.pointerId);
    }
  }

  private onWheel(input: RootWheelInput): boolean {
    if (this.destroyed || !this.viewportPolicies.has('wheel')) return false;
    if (
      this.options.wheelActivationModifier === 'control' &&
      !input.ctrlKey &&
      !input.metaKey
    ) {
      return false;
    }
    const before = this.ports.readView();
    const nextScale = Math.min(
      this.viewportZoomLimits[1],
      Math.max(
        this.viewportZoomLimits[0],
        before.scale * Math.exp(-input.deltaY * 0.001),
      ),
    );
    if (nextScale === before.scale) return false;
    this.ports.zoomAt({ x: input.screenX, y: input.screenY }, nextScale / before.scale);
    this.publishViewportChange('wheel', before);
    return true;
  }

  private onContextMenu(input: RootContextMenuInput): boolean {
    if (this.destroyed) return false;
    if (this.contextMenuListeners.size === 0) {
      return this.ports.hitTestInteractive({ x: input.screenX, y: input.screenY });
    }
    let handled = false;
    for (const listener of [...this.contextMenuListeners]) {
      handled = listener(input) || handled;
    }
    return handled;
  }

  private onPointerDown(x: number, y: number, pointerId: number, button: number): void {
    if (this.options.selectionMode === 'immediate' && button === 0) {
      this.ports.selectAtScreen({ x, y });
    }
    if (
      this.viewportPolicies.has('pan') &&
      (button === 0 || button === 1)
    ) {
      this.pan = {
        pointerId,
        source: button === 1 ? 'middle-pointer' : 'pointer',
        startX: x,
        startY: y,
        active: button === 1,
        x,
        y,
      };
      if (this.pan.active) this.activatePanGesture();
    }
  }

  private onPointerMove(x: number, y: number, pointerId: number): void {
    const pan = this.pan;
    if (pan === null || pan.pointerId !== pointerId) return;
    if (!pan.active) {
      if (!coordinatesMovedBeyondCssSlop(
        pan.startX,
        pan.startY,
        x,
        y,
        PATCH_MAP_POINTER_CLICK_SLOP_CSS_PX,
      )) {
        return;
      }
      pan.active = true;
      this.activatePanGesture();
    }
    const delta = { x: x - pan.x, y: y - pan.y };
    pan.x = x;
    pan.y = y;
    const before = this.ports.readView();
    this.ports.panBy(delta);
    this.publishViewportChange(pan.source, before);
  }

  private onPointerUp(pointerId: number): void {
    if (this.pan?.pointerId !== pointerId) return;
    const active = this.pan.active;
    this.pan = null;
    if (!active) return;
    this.ports.requestGestureFrame();
    if (this.options.autoRender) {
      this.ports.setGestureContinuous(false, 'gesture-end');
    }
  }

  private activatePanGesture(): void {
    this.ports.requestGestureFrame();
    if (this.options.autoRender) {
      this.ports.setGestureContinuous(true, 'gesture');
    }
  }

  private publishViewportChange(
    source: PatchMapRootViewportChangeSource,
    before: CoreView,
  ): void {
    const view = this.ports.readView();
    if (
      before.x === view.x &&
      before.y === view.y &&
      before.scale === view.scale &&
      before.rotation === view.rotation
    ) {
      return;
    }
    const change = Object.freeze({ source, view } satisfies PatchMapRootViewportChange);
    for (const listener of [...this.viewportListeners]) listener(change);
  }

  private publishPointerInput(input: PatchMapRootPointerInput): void {
    for (const listener of [...this.pointerListeners]) listener(input);
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('PatchMap root interaction authority is destroyed');
  }
}
