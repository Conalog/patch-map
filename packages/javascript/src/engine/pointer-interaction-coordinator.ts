import { BrushModeAuthority } from './brush-mode-authority';
import type {
  PatchMapPointerHoverEvent,
  PatchMapPointerPolicy,
  PatchMapPointerSelectionChange,
  PatchMapPointerTooltipEvent,
  PatchMapSelectionPolicy,
  PatchMapTarget,
} from '../public/contracts';
import {
  PATCH_MAP_POINTER_CLICK_WINDOW_MS,
  PatchMapPointerGestureAuthority,
  type PatchMapGestureCancelReason,
  type PatchMapGestureTerminationReason,
  type PatchMapOwnedGestureKind,
  type PatchMapOwnedGestureTermination,
  type PatchMapPointerDispatchResult,
  type PatchMapPointerGestureProbe,
  type PatchMapSemanticPointerEvent,
} from '../pointer-gesture';
import type {
  PatchMapLogicalSceneIndex,
  PatchMapLogicalTargetSnapshot,
  PatchMapSelectionChange,
  PatchMapSelectionSetOperation,
} from '../query-selection';
import { evaluatePatchMapTransformableSubset } from '../selection-transformer';
import type {
  PatchMapEnginePointerInput,
} from './contracts/rendering';
import type {
  PatchMapEngineRegionSelectionOptions,
  PatchMapEngineRegionSelectionResult,
} from './contracts/query-selection';
import type {
  PatchMapEngineSurface,
  PatchMapSurfaceContextMenuInput,
} from './contracts';
import type { PatchMapPoint } from './surface-contract';
import { validatePoint } from './input-contracts';
import {
  DEFAULT_POINTER_POLICY,
  DEFAULT_POINTER_SELECTION_POLICY,
  blankClickClearsSelection,
  destroyedPointerGestureProbe,
  normalizePointerPolicy,
  normalizePointerSelectionPolicy,
  pointerBoxActivationMatches,
  pointerTargetPaintOrder,
  publicPointerTarget,
  samePublicPointerTarget,
  screenBoundsContain,
  selectionGeometryIds,
  type NormalizedPointerPolicy,
  type NormalizedPointerSelectionPolicy,
} from './pointer-interaction-values';

interface PointerBoxGesture {
  readonly pointerId: number;
  readonly start: readonly [number, number];
  readonly additive: boolean;
  active: boolean;
}

interface BrushGesture {
  readonly sceneRevision: number;
  readonly input: PatchMapEnginePointerInput;
  readonly viewRevision: number;
  readonly seed: PatchMapLogicalTargetSnapshot | null;
  timer: ReturnType<typeof setTimeout> | null;
  active: boolean;
  consumed: boolean;
  restore: boolean | null;
  previous: readonly [number, number];
  seen: Set<string>;
  removing: boolean;
}

interface ArmedPointerTargetDeselect {
  readonly selectionId: string;
  readonly timer: ReturnType<typeof globalThis.setTimeout>;
}

export interface PatchMapPointerInteractionPort {
  readonly requireSurface: (operation: string) => PatchMapEngineSurface;
  readonly liveSurface: () => PatchMapEngineSurface | null;
  readonly hasMaterialized: () => boolean;
  readonly logicalSelectionIndex: () => PatchMapLogicalSceneIndex;
  readonly selectionIds: () => readonly string[];
  readonly transformerOwnsPointer: (pointerId: number) => boolean;
  readonly routeTransformerInput: (pointerId: number) => void;
  readonly completeTransformerEdit: (pointerId: number) => void;
  readonly cancelTransformerEdit: (pointerId: number) => void;
  readonly selectBox: (
    start: readonly [number, number],
    end: readonly [number, number],
    options: PatchMapEngineRegionSelectionOptions,
  ) => PatchMapEngineRegionSelectionResult;
  readonly selectPaint: (
    segments: readonly (readonly [readonly [number, number], readonly [number, number]])[],
    options: PatchMapEngineRegionSelectionOptions,
  ) => PatchMapEngineRegionSelectionResult;
  readonly applySelection: (input: PatchMapSelectionSetOperation) => PatchMapSelectionChange;
  readonly sceneRevision: () => number;
  readonly viewRevision: () => number;
  readonly interactionRevision: () => number;
  readonly advanceInteraction: () => void;
  readonly interactionMode: () => string;
  readonly dispatchHostPointerEvent: (event: PatchMapSemanticPointerEvent) => void;
  readonly clearHostTooltip: (reason: 'drag') => void;
  readonly emitPointerEvent: (event: PatchMapSemanticPointerEvent) => void;
  readonly emitPointerHover: (event: PatchMapPointerHoverEvent) => void;
  readonly emitPointerTooltip: (event: PatchMapPointerTooltipEvent) => void;
  readonly emitHostCallbackFailure: (operation: string) => void;
  readonly notReadyError: (operation: string) => Error;
}

export class PatchMapPointerInteractionCoordinator {
  private authority: PatchMapPointerGestureAuthority | null = null;
  private candidateAuthority: PatchMapPointerGestureAuthority | null = null;
  private pointerPolicy: NormalizedPointerPolicy = DEFAULT_POINTER_POLICY;
  private selectionPolicy: NormalizedPointerSelectionPolicy =
    DEFAULT_POINTER_SELECTION_POLICY;
  private boxGesture: PointerBoxGesture | null = null;
  private armedTargetDeselect: ArmedPointerTargetDeselect | null = null;
  private hoverTarget: PatchMapTarget | null = null;
  private tooltipTarget: PatchMapTarget | null = null;
  private tooltipPinned = false;

  public readonly brush: BrushModeAuthority;
  private brushGeneration = 0;
  private brushGesture: BrushGesture | null = null;
  public constructor(private readonly port: PatchMapPointerInteractionPort) {
    this.brush = new BrushModeAuthority(
      () => { this.port.requireSurface('selection.brush'); },
      () => this.clearBrushGesture('cancel', false, true),
      () => this.port.emitHostCallbackFailure('selection.brush.onChange'),
    );
  }

  public configurePointerPolicy(policy: PatchMapPointerPolicy | undefined): void {
    this.pointerPolicy = normalizePointerPolicy(policy);
  }

  public configureSelectionPolicy(policy: PatchMapSelectionPolicy | undefined): void {
    const normalized = normalizePointerSelectionPolicy(policy);
    this.clearBrushGesture('cancel');
    this.cancelArmedTargetDeselect();
    this.clearBoxGesture();
    this.selectionPolicy = normalized;
    this.syncSelectionVisualPolicy();
  }

  public createCandidateAuthority(surface: PatchMapEngineSurface): PatchMapPointerGestureAuthority {
    if (this.authority !== null || this.candidateAuthority !== null) {
      throw new Error('pointer gesture authority ownership is already active');
    }
    const candidate = new PatchMapPointerGestureAuthority({
      hitTest: (point) => surface.hitTestScreen(point),
      clickTargetIdentity: (targetId, screen) => {
        const hitTarget = this.logicalTargetAtScreen(screen, targetId, surface);
        if (hitTarget === null) return null;
        return this.port.logicalSelectionIndex()
          .resolveSelectionUnit(hitTarget.key, 'grid-cell')
          ?.selectionId ?? null;
      },
      hoverDuringPress: this.pointerPolicy.hoverDuringPress,
    });
    this.candidateAuthority = candidate;
    return candidate;
  }

  public adoptCandidateAuthority(authority: PatchMapPointerGestureAuthority): void {
    if (authority !== this.candidateAuthority || this.authority !== null) {
      throw new Error('pointer gesture authority candidate cannot be adopted');
    }
    this.candidateAuthority = null;
    this.authority = authority;
  }

  public discardCandidateAuthority(authority: PatchMapPointerGestureAuthority): void {
    if (authority !== this.candidateAuthority) {
      throw new Error('pointer gesture authority candidate cannot be discarded');
    }
    this.candidateAuthority = null;
    authority.destroy();
  }

  public requireAuthority(operation: string): PatchMapPointerGestureAuthority {
    if (this.authority === null) throw this.port.notReadyError(operation);
    return this.authority;
  }

  public probe(): PatchMapPointerGestureProbe {
    return this.authority?.probe() ?? destroyedPointerGestureProbe();
  }

  public get active(): boolean {
    return (this.authority?.probe().activeGestureCount ?? 0) > 0;
  }

  public get staleGestureCount(): number {
    return this.authority?.probe().staleGestureCount ?? 0;
  }

  public interruptIfPresent(reason: PatchMapGestureCancelReason): void {
    this.clearBrushGesture('cancel');
    this.authority?.interrupt(reason);
  }

  public interruptAndResetIfPresent(reason: PatchMapGestureCancelReason): void {
    this.clearBrushGesture('cancel');
    this.authority?.interrupt(reason);
    this.resetProjectionState();
  }

  public dispatch(input: PatchMapEnginePointerInput): PatchMapPointerDispatchResult {
    this.port.requireSurface('dispatchPointerInput');
    const authority = this.requireAuthority('dispatchPointerInput');
    const transformerOwned = this.port.transformerOwnsPointer(input.pointerId);
    if (this.routeBrushInput(input, transformerOwned)) {
      return Object.freeze({ events: Object.freeze([]), hoverTarget: null, clickSuppressed: true, semanticCompletionCount: 0 });
    }
    this.prepareBoxGesture(input, transformerOwned);
    if (transformerOwned) this.port.routeTransformerInput(input.pointerId);
    const result = authority.dispatch(Object.freeze({
      ...input,
      viewRevision: input.viewRevision ?? this.port.viewRevision(),
    }));
    if (transformerOwned) {
      if (input.type === 'up' || input.type === 'up-outside') {
        this.port.completeTransformerEdit(input.pointerId);
      } else if (input.type === 'cancel' || input.type === 'leave') {
        this.port.cancelTransformerEdit(input.pointerId);
      }
    }
    if (result.events.length > 0) this.port.advanceInteraction();
    for (const event of result.events) {
      this.port.emitPointerEvent(event);
      this.port.dispatchHostPointerEvent(event);
      if (event.type === 'hover-change' || event.type === 'hover-move') {
        this.publishHover(event);
      }
    }
    if (
      (input.type === 'leave' || input.type === 'cancel') &&
      !this.tooltipPinned &&
      this.tooltipTarget !== null &&
      !result.events.some((event) => event.type === 'hover-change')
    ) {
      this.publishUnpinnedTooltipLeave(input);
    }
    if (result.events.some((event) => event.type === 'drag-start')) {
      this.cancelArmedTargetDeselect();
    }
    this.routeBoxGesture(input, result);
    const click = result.events.find((event) => event.type === 'click');
    if (click !== undefined && click.payload.button === 0) {
      this.releasePinnedTooltipFromPrimaryClick(click);
    }
    if (
      click !== undefined &&
      click.payload.button === 0 &&
      this.port.interactionMode() === 'select'
    ) {
      this.applyClickSelection(click);
    }
    return result;
  }

  public dispatchContextMenu(input: PatchMapSurfaceContextMenuInput): boolean {
    if (this.brushGesture !== null) return true;
    const target = this.logicalTargetAtScreen(input.screen, null);
    if (!this.pointerPolicy.tooltip.pinOnContextMenu) return target !== null;
    if (target === null) return false;
    const next = publicPointerTarget(target);
    const previous = this.tooltipTarget;
    const world = this.port.requireSurface('pointerContextMenu').screenToWorld({
      x: input.screen[0],
      y: input.screen[1],
    });
    this.tooltipTarget = next;
    this.tooltipPinned = true;
    this.port.emitPointerTooltip(Object.freeze({
      type: 'pin',
      target: next,
      previousTarget: previous,
      anchor: Object.freeze([...input.screen] as [number, number]),
      world: Object.freeze([world.x, world.y] as const),
      pointerId: 1,
      pointerType: 'mouse',
      modifiers: Object.freeze({ ...input.modifiers }),
      pinned: true,
    } satisfies PatchMapPointerTooltipEvent));
    return this.pointerPolicy.tooltip.preventDefault;
  }

  public ownsContextMenu(point: PatchMapPoint): boolean {
    validatePoint(point, 'ownsContextMenu');
    return this.port.requireSurface('ownsContextMenu').hitTestScreen(point) !== null;
  }

  public interrupt(
    reason: PatchMapGestureCancelReason,
  ): PatchMapOwnedGestureTermination | null {
    this.port.requireSurface('interruptPointerGestures');
    const termination = this.requireAuthority('interruptPointerGestures').interrupt(reason);
    this.resetProjectionState();
    return termination;
  }

  public beginOwnedGesture(kind: PatchMapOwnedGestureKind, pointerId: number): void {
    this.port.requireSurface('beginOwnedPointerGesture');
    this.port.clearHostTooltip('drag');
    this.requireAuthority('beginOwnedPointerGesture').beginOwnedGesture(kind, pointerId);
  }

  public terminateOwnedGesture(
    reason: PatchMapGestureTerminationReason,
  ): PatchMapOwnedGestureTermination | null {
    this.port.requireSurface('terminateOwnedPointerGesture');
    return this.requireAuthority('terminateOwnedPointerGesture').terminateOwnedGesture(reason);
  }

  public cancelOwnedGesture(
    reason: PatchMapGestureCancelReason,
  ): PatchMapOwnedGestureTermination | null {
    this.port.requireSurface('cancelOwnedPointerGesture');
    return this.requireAuthority('cancelOwnedPointerGesture').cancelOwnedGesture(reason);
  }

  public selectionPublication(change: PatchMapSelectionChange): PatchMapPointerSelectionChange {
    const index = this.port.logicalSelectionIndex();
    const targets = (ids: readonly string[]): readonly PatchMapTarget[] => Object.freeze(
      ids.flatMap((id) => {
        const target = index.target(id);
        return target === null ? [] : [publicPointerTarget(target)];
      }),
    );
    return Object.freeze({
      source: 'pointer',
      selected: targets(change.current),
      added: targets(change.added),
      removed: targets(change.removed),
      interactionRevision: this.port.interactionRevision(),
    });
  }

  public syncSelectionVisualPolicy(): boolean {
    if (!this.port.hasMaterialized()) return false;
    const surface = this.port.liveSurface();
    if (surface === null) return false;
    const policy = this.selectionPolicy.visual;
    const marquee = this.selectionPolicy.box?.visual ?? Object.freeze({
      color: policy.color,
      strokeCssPx: policy.strokeCssPx,
      fillAlpha: 0.08,
    });
    const index = this.port.logicalSelectionIndex();
    const selectionIds = this.port.selectionIds();
    const overlayIds = selectionGeometryIds(index, selectionIds);
    const subset = evaluatePatchMapTransformableSubset(index, selectionIds);
    return surface.setSelectionOverlayPolicy?.({
      visibleIds: overlayIds,
      transformableIds: subset.transformableTargets.map((target) => target.selectionId),
      resizableIds: subset.resizableTargets.map((target) => target.selectionId),
      hidden: policy.mode === 'hidden',
      handleCssPx: 6,
      strokeCssPx: policy.strokeCssPx,
      strokeScale: policy.strokeScale,
      minStrokeCssPx: policy.minStrokeCssPx,
      strokeAlignment: policy.strokeAlignment,
      color: policy.color,
      displayMode: policy.mode,
      marqueeColor: marquee.color,
      marqueeStrokeCssPx: marquee.strokeCssPx,
      marqueeFillAlpha: marquee.fillAlpha,
    }) ?? false;
  }

  public resetProjectionState(): void {
    this.clearBrushGesture('cancel');
    this.cancelArmedTargetDeselect();
    this.clearBoxGesture();
    this.hoverTarget = null;
    this.tooltipTarget = null;
    this.tooltipPinned = false;
  }

  public destroy(): void {
    this.clearBrushGesture('cancel');
    this.brush.destroy();
    this.candidateAuthority?.destroy();
    this.candidateAuthority = null;
    this.authority?.destroy();
    this.authority = null;
    this.resetProjectionState();
  }

  private clearBrushGesture(source: 'release' | 'cancel', restore = true, consume = false): void {
    this.brushGeneration++;
    const gesture = this.brushGesture;
    this.brushGesture = null;
    if (gesture?.timer !== null && gesture?.timer !== undefined) clearTimeout(gesture.timer);
    if (gesture?.consumed) this.authority?.terminateOwnedGesture(source === 'release' ? 'pointer-up-outside' : 'pointer-cancel');
    if (consume && gesture) {
      this.authority?.interrupt('pointer-cancel');
      this.port.liveSurface()?.cancelViewportGestures?.();
    }
    this.brush.publish(restore && gesture?.restore !== null && gesture?.restore !== undefined ? gesture.restore : this.brush.state.enabled, false, source);
  }

  private brushLive(gesture: BrushGesture): boolean {
    return this.brushGesture === gesture && this.port.liveSurface() !== null &&
      this.port.interactionMode() === 'select' && this.port.viewRevision() === gesture.viewRevision &&
      this.port.sceneRevision() === gesture.sceneRevision;
  }

  private routeBrushInput(input: PatchMapEnginePointerInput, transformerOwned: boolean): boolean {
    if (input.type === 'down') {
      const other = (this.authority?.probe().activePointerCount ?? 0) > 0;
      this.clearBrushGesture('cancel');
      if (other || transformerOwned || input.button !== 0 || !this.selectionPolicy.allowMultiple || this.port.interactionMode() !== 'select') return false;
      const policy = this.selectionPolicy.brush;
      if (!this.brush.state.enabled && !policy.longPress) return false;
      const generation = this.brushGeneration;
      const sceneRevision = this.port.sceneRevision();
      const viewRevision = this.port.viewRevision();
      const raw = this.logicalTargetAtScreen(input.screen, null);
      const seed = raw === null ? null : this.port.logicalSelectionIndex().resolveSelectionUnit(raw.key, 'grid-cell');
      if (seed !== null && (seed.locked || seed.ancestorLocked || this.targetSelectable(seed) !== true)) return false;
      if (generation !== this.brushGeneration || this.port.liveSurface() === null ||
          sceneRevision !== this.port.sceneRevision() || viewRevision !== this.port.viewRevision()) return true;
      if (seed === null && !this.brush.state.enabled) return false;
      const g: BrushGesture = { input, seed, sceneRevision, viewRevision, timer: null, active: false, consumed: false, restore: null, previous: input.screen, seen: new Set(), removing: false };
      this.brushGesture = g;
      if (policy.longPress && seed !== null) {
        const hold = policy.longPress;
        g.timer = setTimeout(() => {
          g.timer = null;
          if (!this.brushLive(g)) { if (this.brushGesture === g) this.clearBrushGesture('cancel'); return; }
          try {
          this.clearBoxGesture();
          this.port.liveSurface()?.cancelViewportGestures?.();
          this.requireAuthority('brush').beginOwnedGesture('paint', input.pointerId);
          g.consumed = true;
          const prior = this.brush.state.enabled;
          if (hold.behavior === 'hold') g.restore = prior;
          if (hold.behavior === 'toggle' && prior) {
            this.brush.publish(false, false, 'long-press');
          } else {
            this.brush.publish(true, false, 'long-press');
            if (this.brushLive(g)) this.startBrush(g, 'long-press');
          }
          } catch {
            if (this.brushGesture === g) this.clearBrushGesture('cancel');
            this.port.emitHostCallbackFailure('selection.brush');
          }
        }, hold.delayMs);
      }
      return false;
    }
    const g = this.brushGesture;
    if (g === null || g.input.pointerId !== input.pointerId) return false;
    const owned = g.consumed;
    if (!this.brushLive(g)) { this.clearBrushGesture('cancel'); return owned; }
    if (input.type === 'cancel' || input.type === 'leave') { this.clearBrushGesture('cancel'); return owned; }
    if (input.type === 'move') {
      const moved = Math.max(Math.abs(input.screen[0] - g.input.screen[0]), Math.abs(input.screen[1] - g.input.screen[1])) > 4;
      if (!g.consumed && moved) {
        if (g.timer !== null) { clearTimeout(g.timer); g.timer = null; }
        if (!this.brush.state.enabled) { this.clearBrushGesture('cancel'); return false; }
        this.clearBoxGesture();
        this.requireAuthority('brush').beginOwnedGesture('paint', input.pointerId);
        g.consumed = true;
        this.startBrush(g, 'api');
      }
      if (g.consumed) this.port.liveSurface()?.cancelViewportGestures?.();
      if (this.brushLive(g) && g.active) this.paintBrush(g, input.screen);
      return g.consumed;
    }
    if (input.type === 'up' || input.type === 'up-outside') {
      try { if (g.active) this.paintBrush(g, input.screen); }
      finally { if (this.brushGesture === g) this.clearBrushGesture('release'); }
      return owned;
    }
    return false;
  }

  private startBrush(g: BrushGesture, source: 'api' | 'long-press'): void {
    const operation = this.selectionPolicy.brush.operation;
    g.removing = operation === 'remove' || operation === 'auto' && g.seed !== null && this.port.selectionIds().includes(g.seed.selectionId);
    g.active = true;
    this.cancelArmedTargetDeselect();
    this.port.clearHostTooltip('drag');
    this.brush.publish(true, true, source);
    if (this.brushLive(g)) this.paintBrush(g, g.previous, g.seed);
  }

  private paintBrush(g: BrushGesture, end: readonly [number, number], seed?: PatchMapLogicalTargetSnapshot | null): void {
    if (!this.brushLive(g)) return;
    const hit = this.port.selectPaint([[g.previous, end]], { commit: false });
    g.previous = end;
    const ids: string[] = [];
    for (const target of seed ? [seed, ...hit.targets] : hit.targets) {
      if (g.seen.has(target.selectionId) || target.locked || target.ancestorLocked) continue;
      const eligible = this.targetSelectable(target);
      if (!this.brushLive(g)) return;
      if (eligible === null) { this.clearBrushGesture('cancel'); return; }
      if (!eligible) continue;
      g.seen.add(target.selectionId);
      ids.push(target.selectionId);
    }
    if (ids.length > 0) this.port.applySelection({ op: g.removing ? 'remove' : 'add', ids, source: 'canvas' });
  }

  private releasePinnedTooltipFromPrimaryClick(click: PatchMapSemanticPointerEvent): void {
    if (!this.tooltipPinned) return;
    const logical = this.logicalTargetAtScreen(
      click.payload.screen,
      click.payload.target?.id ?? null,
    );
    const next = logical === null ? null : publicPointerTarget(logical);
    const previous = this.tooltipTarget;
    const world = this.port.requireSurface('pointerTooltipClick').screenToWorld({
      x: click.payload.screen[0],
      y: click.payload.screen[1],
    });
    this.tooltipTarget = next;
    this.tooltipPinned = false;
    this.port.emitPointerTooltip(Object.freeze({
      type: next === null ? 'hide' : 'show',
      target: next,
      previousTarget: previous,
      anchor: Object.freeze([...click.payload.screen] as [number, number]),
      world: Object.freeze([world.x, world.y] as const),
      pointerId: click.payload.pointerId,
      pointerType: click.payload.pointerType,
      modifiers: Object.freeze({ ...click.payload.modifiers }),
      pinned: false,
    } satisfies PatchMapPointerTooltipEvent));
  }

  private publishUnpinnedTooltipLeave(input: PatchMapEnginePointerInput): void {
    const previous = this.tooltipTarget;
    if (previous === null) return;
    const world = this.port.requireSurface('pointerTooltipLeave').screenToWorld({
      x: input.screen[0],
      y: input.screen[1],
    });
    this.tooltipTarget = null;
    this.port.emitPointerTooltip(Object.freeze({
      type: 'hide',
      target: null,
      previousTarget: previous,
      anchor: Object.freeze([...input.screen] as [number, number]),
      world: Object.freeze([world.x, world.y] as const),
      pointerId: input.pointerId,
      pointerType: input.pointerType,
      modifiers: Object.freeze({ ...input.modifiers }),
      pinned: false,
    } satisfies PatchMapPointerTooltipEvent));
  }

  private prepareBoxGesture(input: PatchMapEnginePointerInput, transformerOwned: boolean): void {
    if (input.type !== 'down') return;
    this.clearBoxGesture();
    if (
      transformerOwned ||
      input.button !== 0 ||
      this.selectionPolicy.box === null ||
      !pointerBoxActivationMatches(this.selectionPolicy.box, input) ||
      this.port.interactionMode() !== 'select'
    ) {
      return;
    }
    this.boxGesture = {
      pointerId: input.pointerId,
      start: Object.freeze([input.screen[0], input.screen[1]] as const),
      additive: this.selectionPolicy.allowMultiple && input.modifiers.shift,
      active: false,
    };
  }

  private routeBoxGesture(
    input: PatchMapEnginePointerInput,
    result: PatchMapPointerDispatchResult,
  ): void {
    const gesture = this.boxGesture;
    if (gesture === null || gesture.pointerId !== input.pointerId) return;
    const dragStarted = result.events.some((event) => event.type === 'drag-start');
    if (dragStarted) {
      this.port.requireSurface('pointerBoxSelection').cancelViewportGestures?.();
      gesture.active = true;
      this.port.clearHostTooltip('drag');
    }
    if (gesture.active && input.type === 'move') {
      this.port.requireSurface('pointerBoxSelection').setSelectionMarquee?.({
        start: gesture.start,
        current: input.screen,
      });
    }
    if (result.events.some((event) => event.type === 'drag-end')) {
      try {
        if (gesture.active) this.commitBoxSelection(gesture, input.screen);
      } finally {
        this.clearBoxGesture();
      }
      return;
    }
    if (
      input.type === 'cancel' ||
      input.type === 'leave' ||
      input.type === 'up' ||
      input.type === 'up-outside'
    ) {
      this.clearBoxGesture();
    }
  }

  private clearBoxGesture(): void {
    const active = this.boxGesture?.active === true;
    this.boxGesture = null;
    if (active) this.port.liveSurface()?.setSelectionMarquee?.(null);
  }

  private commitBoxSelection(
    gesture: PointerBoxGesture,
    end: readonly [number, number],
  ): void {
    const box = this.selectionPolicy.box;
    if (box === null) return;
    const hit = this.port.selectBox(gesture.start, end, {
      commit: false,
      partialIntersection: box.partialIntersection,
    });
    const eligible: PatchMapLogicalTargetSnapshot[] = [];
    for (const target of hit.targets) {
      const selectable = this.targetSelectable(target);
      if (selectable === null) return;
      if (selectable) eligible.push(target);
    }
    const targets = this.selectionPolicy.allowMultiple ? eligible : eligible.slice(0, 1);
    this.port.applySelection({
      op: gesture.additive ? 'add' : 'replace',
      ids: targets.map((target) => target.selectionId),
      source: 'canvas',
    });
  }

  private applyClickSelection(click: PatchMapSemanticPointerEvent): void {
    const rawTarget = click.payload.target?.id ?? null;
    const hitTarget = this.logicalTargetAtScreen(click.payload.screen, rawTarget);
    const target = hitTarget === null
      ? null
      : this.port.logicalSelectionIndex().resolveSelectionUnit(hitTarget.key, 'grid-cell');
    const selectable = target === null ? true : this.targetSelectable(target);
    if (selectable === null) {
      this.cancelArmedTargetDeselect();
      return;
    }
    if (target === null || !selectable) {
      this.cancelArmedTargetDeselect();
      if (!blankClickClearsSelection(
        this.selectionPolicy.clearOnBlankClick,
        click.payload.clickCount,
      )) return;
      this.port.applySelection({ op: 'replace', ids: [], source: 'canvas' });
      return;
    }
    if (
      (click.payload.modifiers.ctrl || click.payload.modifiers.meta) &&
      this.applyModifierResolvedSelection(click, target)
    ) {
      this.cancelArmedTargetDeselect();
      return;
    }
    if (!this.selectionPolicy.deselectOnTargetDoubleClick || click.payload.modifiers.shift) {
      this.cancelArmedTargetDeselect();
      this.applyTargetClick(click, target);
      return;
    }
    const armed = this.armedTargetDeselect;
    if (armed?.selectionId === target.selectionId && click.payload.clickCount % 2 === 0) {
      this.cancelArmedTargetDeselect();
      this.port.applySelection({
        op: 'remove',
        ids: [target.selectionId],
        source: 'canvas',
      });
      return;
    }
    this.cancelArmedTargetDeselect();
    if (this.port.selectionIds().includes(target.selectionId)) {
      this.armTargetDeselect(target.selectionId);
      return;
    }
    this.applyTargetClick(click, target);
  }

  private applyModifierResolvedSelection(
    click: PatchMapSemanticPointerEvent,
    target: PatchMapLogicalTargetSnapshot,
  ): boolean {
    const resolver = this.selectionPolicy.resolveModifierSelection;
    if (resolver === null) return false;
    try {
      const resolved = resolver(Object.freeze({
        target: publicPointerTarget(target),
        currentIds: Object.freeze([...this.port.selectionIds()]),
        modifiers: Object.freeze({ ...click.payload.modifiers }),
        clickCount: click.payload.clickCount,
      }));
      if (!Array.isArray(resolved)) {
        throw new TypeError('selection.resolveModifierSelection must return an ID array');
      }
      const ids = Object.freeze([...new Set(resolved.map((id, index) => {
        if (typeof id !== 'string' || id.length === 0) {
          throw new TypeError(
            `selection.resolveModifierSelection result[${index}] must be a non-empty ID`,
          );
        }
        return id;
      }))]);
      const index = this.port.logicalSelectionIndex();
      for (const id of ids) {
        const candidate = index.target(id);
        if (candidate === null) {
          throw new TypeError(`selection.resolveModifierSelection returned unknown ID ${id}`);
        }
        if (this.targetSelectable(candidate) !== true) return true;
      }
      this.port.applySelection({ op: 'replace', ids, source: 'canvas' });
    } catch {
      this.port.emitHostCallbackFailure('selection.resolveModifierSelection');
    }
    return true;
  }

  private applyTargetClick(
    click: PatchMapSemanticPointerEvent,
    target: PatchMapLogicalTargetSnapshot,
  ): void {
    this.port.applySelection({
      op: this.selectionPolicy.allowMultiple && click.payload.modifiers.shift
        ? 'toggle'
        : 'replace',
      ids: [target.selectionId],
      source: 'canvas',
    });
  }

  private armTargetDeselect(selectionId: string): void {
    const timer = globalThis.setTimeout(() => this.cancelArmedTargetDeselect(),
      PATCH_MAP_POINTER_CLICK_WINDOW_MS);
    this.armedTargetDeselect = Object.freeze({ selectionId, timer });
  }

  private cancelArmedTargetDeselect(): void {
    const armed = this.armedTargetDeselect;
    if (armed === null) return;
    globalThis.clearTimeout(armed.timer);
    this.armedTargetDeselect = null;
  }

  private targetSelectable(target: PatchMapLogicalTargetSnapshot): boolean | null {
    const predicate = this.selectionPolicy.isSelectable;
    if (predicate === null) return true;
    try {
      return predicate(publicPointerTarget(target)) === true;
    } catch {
      this.port.emitHostCallbackFailure('selection.isSelectable');
      return null;
    }
  }

  private publishHover(event: PatchMapSemanticPointerEvent): void {
    const target = event.type === 'hover-change' && event.payload.target === null
      ? null
      : this.logicalTargetAtScreen(event.payload.screen, event.payload.target?.id ?? null);
    const next = target === null ? null : publicPointerTarget(target);
    const previous = this.hoverTarget;
    if (event.type === 'hover-move' && next === null) return;
    if (event.type === 'hover-change' && samePublicPointerTarget(previous, next)) return;
    const world = this.port.requireSurface('pointerHover').screenToWorld({
      x: event.payload.screen[0],
      y: event.payload.screen[1],
    });
    const publication = Object.freeze({
      type: next === null ? 'leave' : samePublicPointerTarget(previous, next) ? 'move' : 'hover',
      target: next,
      previousTarget: previous,
      anchor: Object.freeze([...event.payload.screen] as [number, number]),
      world: Object.freeze([world.x, world.y] as const),
      pointerId: event.payload.pointerId,
      pointerType: event.payload.pointerType,
      modifiers: Object.freeze({ ...event.payload.modifiers }),
    } satisfies PatchMapPointerHoverEvent);
    this.hoverTarget = next;
    this.port.emitPointerHover(publication);
    if (!this.tooltipPinned) {
      const tooltipPrevious = this.tooltipTarget;
      this.tooltipTarget = next;
      this.port.emitPointerTooltip(Object.freeze({
        type: next === null
          ? 'hide'
          : samePublicPointerTarget(tooltipPrevious, next) ? 'move' : 'show',
        target: next,
        previousTarget: tooltipPrevious,
        anchor: publication.anchor,
        world: publication.world,
        pointerId: publication.pointerId,
        pointerType: publication.pointerType,
        modifiers: publication.modifiers,
        pinned: false,
      } satisfies PatchMapPointerTooltipEvent));
    }
  }

  private logicalTargetAtScreen(
    screen: readonly [number, number],
    fallbackId: string | null,
    surface = this.port.requireSurface('pointerTarget'),
  ): PatchMapLogicalTargetSnapshot | null {
    const candidates = surface.queryRegionGeometry?.(Object.freeze([
      screen[0], screen[1], 0, 0,
    ] as const));
    if (candidates !== undefined) {
      const index = this.port.logicalSelectionIndex();
      let selected: PatchMapLogicalTargetSnapshot | null = null;
      for (const geometry of candidates.entities) {
        const componentCandidate =
          geometry.ownerItemId !== undefined && geometry.componentId !== undefined;
        if (
          !geometry.visible ||
          (!geometry.interactive && (!componentCandidate || geometry.ownerItemId !== fallbackId)) ||
          !screenBoundsContain(geometry.screenBounds, screen)
        ) continue;
        const target = componentCandidate
          ? index.target({
              kind: 'component',
              ownerId: geometry.ownerItemId!,
              id: geometry.componentId!,
            })
          : index.target(geometry.id);
        if (target !== null && (selected === null || pointerTargetPaintOrder(target, selected) < 0)) {
          selected = target;
        }
      }
      if (selected !== null) return selected;
    }
    return fallbackId === null ? null : this.port.logicalSelectionIndex().target(fallbackId);
  }
}
