import type {
  PatchMap,
  PatchMapGestureCancelReason,
} from '../../src/patch-map';
import {
  angleDegrees,
  canvasPoint,
  cursorForMode,
  interactionModeForManualMode,
  isResizeHandle,
  manualModeLabel,
  manualModeStatusHelp,
  midpoint,
  normalizeDeltaDegrees,
  selectionVisualModeForManualMode,
  viewportPanOperationForManualMode,
  type ManualPointerGesture,
  type ManualPointerMode,
} from './manual-workbench-input';

export type PatchMapManualPointerOutcome =
  | Readonly<{ type: 'action'; value: string }>
  | Readonly<{ type: 'frame-request'; durationMs: number }>
  | Readonly<{ type: 'publish-frame' }>
  | Readonly<{ type: 'queue-refresh' }>
  | Readonly<{ type: 'refresh' }>;

type PatchMapManualPointerActionIdAllocator = (
  kind: 'move' | 'resize' | 'rotate',
) => string;

type PatchMapManualPointerOutcomeSink = (
  outcome: PatchMapManualPointerOutcome,
) => void;

export class PatchMapManualPointerController {
  private readonly host: HTMLElement;
  private readonly canvasFrame: HTMLElement;
  private readonly allocateActionId: PatchMapManualPointerActionIdAllocator;
  private readonly onOutcome: PatchMapManualPointerOutcomeSink;
  private engine: PatchMap | null = null;
  private modeValue: ManualPointerMode = 'select';
  private activePointer: ManualPointerGesture | null = null;
  private panPointerId: number | null = null;
  private canvasAbortController: AbortController | null = null;

  public constructor(
    host: HTMLElement,
    canvasFrame: HTMLElement,
    allocateActionId: PatchMapManualPointerActionIdAllocator,
    onOutcome: PatchMapManualPointerOutcomeSink,
  ) {
    this.host = host;
    this.canvasFrame = canvasFrame;
    this.allocateActionId = allocateActionId;
    this.onOutcome = onOutcome;
  }

  public get mode(): ManualPointerMode {
    return this.modeValue;
  }

  public bind(next: PatchMap): void {
    this.detach('replace');
    this.engine = next;
    const canvas = next.canvasHandle().element;
    const controller = new AbortController();
    this.canvasAbortController = controller;
    const { signal } = controller;

    canvas.dataset.manualPatchMapCanvas = 'true';
    canvas.setAttribute('aria-label', 'PatchMap 직접 조작 화면');
    canvas.addEventListener('pointerdown', this.onPointerDown, { signal });
    canvas.addEventListener('pointermove', this.onPointerMove, { signal });
    canvas.addEventListener('pointerup', this.onPointerUp, { signal });
    canvas.addEventListener('pointercancel', this.onPointerCancel, { signal });
    canvas.addEventListener('pointerleave', this.onPointerLeave, { signal });
    canvas.addEventListener('wheel', this.onWheel, { signal, passive: true });
    canvas.addEventListener('contextmenu', this.onContextMenu, { signal });
  }

  public activateMode(nextMode: ManualPointerMode): void {
    this.modeValue = nextMode;
    for (const button of this.host.querySelectorAll<HTMLButtonElement>('[data-manual-mode]')) {
      button.setAttribute('aria-pressed', String(button.dataset.manualMode === nextMode));
    }
    const next = this.engine;
    if (next !== null) {
      next.applyInteractionModeOperation({
        op: 'replace',
        state: interactionModeForManualMode(nextMode),
      });
      next.configureViewportPolicy({
        op: viewportPanOperationForManualMode(nextMode),
        policy: 'pan',
      });
      this.refreshSelectionVisual(next);
      next.canvasHandle().element.style.cursor = cursorForMode(nextMode);
    }
    setManualText(
      this.host,
      'mode-help',
      `${manualModeLabel(nextMode)}: ${manualModeStatusHelp(nextMode)}`,
    );
    this.host.dataset.manualMode = nextMode;
  }

  public refreshSelectionVisual(next: PatchMap = this.requireEngine()): void {
    next.setSelectionVisualPolicy({
      mode: selectionVisualModeForManualMode(this.modeValue),
      handleCssPx: 10,
      strokeCssPx: 2,
    });
  }

  public cancelActiveTransformFromEscape(): boolean {
    const next = this.engine;
    const gesture = this.activePointer;
    if (
      next === null
      || gesture?.kind !== 'transform'
      || next.transformerEditProbe().activeSessionCount === 0
    ) {
      return false;
    }
    this.cleanupPointerSession('escape', gesture.pointerId);
    this.onOutcome({ type: 'publish-frame' });
    this.onOutcome({ type: 'action', value: 'transform-cancelled' });
    this.onOutcome({ type: 'refresh' });
    return true;
  }

  public unbind(): void {
    this.detach('destroy');
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    const next = this.requireEngine();
    if (event.button !== 0 || this.activePointer !== null) return;
    const canvas = next.canvasHandle().element;
    const screen = canvasPoint(event, canvas);
    const world = next.screenToWorld({ x: screen[0], y: screen[1] });
    const selectionBefore = next.snapshot().selectionIds;
    if (this.modeValue === 'pan') {
      this.panPointerId = event.pointerId;
      canvas.setPointerCapture(event.pointerId);
      this.onOutcome({ type: 'frame-request', durationMs: 800 });
      return;
    }
    if (this.modeValue === 'box' || this.modeValue === 'paint') {
      canvas.setPointerCapture(event.pointerId);
      this.activePointer = {
        pointerId: event.pointerId,
        kind: this.modeValue,
        startScreen: screen,
        startWorld: [world.x, world.y],
        selectionBefore,
        segments: [],
        moved: false,
      };
      if (this.modeValue === 'box') this.drawMarquee(screen, screen);
      this.onOutcome({ type: 'frame-request', durationMs: 500 });
      return;
    }
    if (
      this.modeValue === 'move'
      || this.modeValue === 'resize'
      || this.modeValue === 'rotate'
    ) {
      const hit = next.selectionHitTestScreen({ x: screen[0], y: screen[1] });
      let selectionIds = selectionBefore;
      const hitSelectionId = hit.target?.selectionId ?? null;
      if (hitSelectionId !== null && !selectionIds.includes(hitSelectionId)) {
        selectionIds = next.applySelection({
          op: event.shiftKey ? 'add' : 'replace',
          ids: [hitSelectionId],
          source: 'canvas',
        }).current;
      }
      if (selectionIds.length === 0) return;
      this.refreshSelectionVisual(next);
      const visual = next.selectionVisualProbe();
      const center = visual?.frame === null || visual?.frame === undefined
        ? null
        : midpoint(visual.frame.screenCorners[0], visual.frame.screenCorners[2]);
      const actualHandle = next.hitTransformerHandle(screen);
      const resizeHandle = isResizeHandle(actualHandle) ? actualHandle : 'se';
      const transformerKind = this.modeValue;
      next.beginTransformerEdit({
        pointerId: event.pointerId,
        actionId: this.allocateActionId(transformerKind),
        kind: transformerKind,
        handle: transformerKind === 'move'
          ? 'frame'
          : transformerKind === 'rotate'
            ? 'rotate'
            : resizeHandle,
        selectionIds,
      });
      canvas.setPointerCapture(event.pointerId);
      this.activePointer = {
        pointerId: event.pointerId,
        kind: 'transform',
        startScreen: screen,
        startWorld: [world.x, world.y],
        selectionBefore: selectionIds,
        transformKind: transformerKind,
        ...(transformerKind === 'resize' ? { resizeHandle } : {}),
        ...(transformerKind === 'rotate' && center !== null
          ? {
              rotationCenterScreen: center,
              rotationStartDegrees: angleDegrees(center, screen),
            }
          : {}),
        segments: [],
        moved: false,
      };
      this.onOutcome({ type: 'frame-request', durationMs: 800 });
      return;
    }
    if (this.modeValue === 'select') {
      this.activePointer = {
        pointerId: event.pointerId,
        kind: 'paint',
        startScreen: screen,
        startWorld: [world.x, world.y],
        selectionBefore,
        segments: [],
        moved: false,
      };
      return;
    }
    this.onOutcome({ type: 'frame-request', durationMs: 800 });
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const next = this.requireEngine();
    const canvas = next.canvasHandle().element;
    const screen = canvasPoint(event, canvas);
    const world = next.screenToWorld({ x: screen[0], y: screen[1] });
    setManualText(
      this.host,
      'pointer',
      `${screen[0].toFixed(0)}, ${screen[1].toFixed(0)} → ${world.x.toFixed(1)}, ${world.y.toFixed(1)}`,
    );
    const gesture = this.activePointer;
    if (gesture === null || gesture.pointerId !== event.pointerId) {
      if (this.modeValue === 'pan') {
        this.clearTooltip();
        return;
      }
      const tooltip = next.hoverTooltipAtScreen(
        { x: screen[0], y: screen[1] },
        [180, 44],
      );
      this.showTooltip(tooltip.targetId, event.clientX, event.clientY);
      if (
        this.modeValue === 'resize'
        || this.modeValue === 'rotate'
        || this.modeValue === 'move'
      ) {
        const handle = next.hitTransformerHandle(screen);
        canvas.style.cursor = handle === null
          ? this.modeValue === 'move'
            ? 'move'
            : this.modeValue === 'rotate'
              ? 'crosshair'
              : 'nwse-resize'
          : next.transformerHandleProbe()?.regions.find(({ id }) => id === handle)?.cursor ?? '';
      }
      return;
    }
    const distance = Math.hypot(
      screen[0] - gesture.startScreen[0],
      screen[1] - gesture.startScreen[1],
    );
    if (distance > 3) gesture.moved = true;
    if (gesture.kind === 'box') {
      this.drawMarquee(gesture.startScreen, screen);
    } else if (gesture.kind === 'paint' && this.modeValue === 'paint') {
      const previous = gesture.segments.at(-1)?.[1] ?? gesture.startScreen;
      gesture.segments.push(Object.freeze([previous, screen] as const));
      this.drawPaintTrail(gesture);
    } else if (gesture.kind === 'transform' && gesture.transformKind !== undefined) {
      const deltaWorld = Object.freeze([
        world.x - gesture.startWorld[0],
        world.y - gesture.startWorld[1],
      ] as const);
      if (gesture.transformKind === 'move') {
        next.previewTransformerEdit(event.pointerId, {
          kind: 'move',
          selectionIds: gesture.selectionBefore,
          deltaWorld,
          axisLock: event.shiftKey,
        });
      } else if (gesture.transformKind === 'resize') {
        next.previewTransformerEdit(event.pointerId, {
          kind: 'resize',
          selectionIds: gesture.selectionBefore,
          handle: gesture.resizeHandle ?? 'se',
          deltaWorld,
          lockAspectRatio: event.shiftKey,
          minSize: 8,
        });
      } else {
        const center = gesture.rotationCenterScreen ?? gesture.startScreen;
        const startDegrees = gesture.rotationStartDegrees
          ?? angleDegrees(center, gesture.startScreen);
        let deltaDegrees = normalizeDeltaDegrees(
          angleDegrees(center, screen) - startDegrees,
        );
        if (event.shiftKey) deltaDegrees = Math.round(deltaDegrees / 15) * 15;
        next.previewTransformerEdit(event.pointerId, {
          kind: 'rotate',
          selectionIds: gesture.selectionBefore,
          deltaDegrees,
        });
      }
    }
    this.onOutcome({ type: 'frame-request', durationMs: 800 });
    this.onOutcome({ type: 'queue-refresh' });
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const next = this.requireEngine();
    if (this.panPointerId === event.pointerId) {
      this.panPointerId = null;
      const canvas = next.canvasHandle().element;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      this.onOutcome({ type: 'action', value: 'pan-gesture' });
      this.onOutcome({ type: 'frame-request', durationMs: 600 });
      this.onOutcome({ type: 'queue-refresh' });
      return;
    }
    const gesture = this.activePointer;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;
    const canvas = next.canvasHandle().element;
    const screen = canvasPoint(event, canvas);
    try {
      if (gesture.kind === 'box') {
        next.selectBox(gesture.startScreen, screen, {
          mode: event.shiftKey ? 'add' : 'replace',
          partialIntersection: true,
        });
      } else if (gesture.kind === 'paint' && this.modeValue === 'paint') {
        const segments = gesture.segments.length > 0
          ? gesture.segments
          : [Object.freeze([gesture.startScreen, screen] as const)];
        next.selectPaint(segments, {
          mode: event.shiftKey ? 'add' : 'replace',
          toleranceCssPx: 10,
        });
      } else if (
        gesture.kind === 'paint'
        && this.modeValue === 'select'
        && !gesture.moved
      ) {
        // Root pointer authority already applies replace/toggle selection from
        // the exact click event. Do not repeat the 5,000-scene selection pass
        // in the Lab host for Shift-click.
      } else if (
        gesture.kind === 'transform'
        && next.transformerEditProbe().activeSessionCount > 0
      ) {
        next.completeTransformerEdit(event.pointerId);
      }
      this.onOutcome({
        type: 'action',
        value: gesture.kind === 'transform'
          ? `${gesture.transformKind ?? 'transform'}-gesture`
          : `${gesture.kind}-selection`,
      });
      this.onOutcome({ type: 'publish-frame' });
    } finally {
      this.activePointer = null;
      this.hideMarquee();
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      this.onOutcome({ type: 'frame-request', durationMs: 600 });
      this.onOutcome({ type: 'refresh' });
    }
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (this.panPointerId === event.pointerId) {
      this.cleanupPointerSession('pointer-cancel', event.pointerId);
      this.onOutcome({ type: 'action', value: 'pan-cancelled' });
      this.onOutcome({ type: 'frame-request', durationMs: 400 });
      this.onOutcome({ type: 'queue-refresh' });
      return;
    }
    const gesture = this.activePointer;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;
    this.cleanupPointerSession('pointer-cancel', event.pointerId);
    this.onOutcome({ type: 'action', value: 'gesture-cancelled' });
    this.onOutcome({ type: 'publish-frame' });
    this.onOutcome({ type: 'refresh' });
  };

  private readonly onPointerLeave = (event: PointerEvent): void => {
    if (this.activePointer === null) this.clearTooltip();
    else if (this.activePointer.pointerId === event.pointerId) {
      this.onOutcome({ type: 'frame-request', durationMs: 400 });
    }
  };

  private readonly onWheel = (): void => {
    this.onOutcome({ type: 'frame-request', durationMs: 650 });
    this.onOutcome({ type: 'queue-refresh' });
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    const next = this.requireEngine();
    const canvas = next.canvasHandle().element;
    const point = canvasPoint(event, canvas);
    const tooltip = next.toggleTooltipPinAtScreen(
      { x: point[0], y: point[1] },
      [180, 44],
    );
    this.showTooltip(tooltip.targetId, event.clientX, event.clientY);
    this.onOutcome({ type: 'queue-refresh' });
  };

  private drawMarquee(
    start: readonly [number, number],
    end: readonly [number, number],
  ): void {
    const marquee = required<HTMLElement>(this.host, '[data-manual-marquee]');
    const canvas = this.requireEngine().canvasHandle().element;
    const canvasRect = canvas.getBoundingClientRect();
    const frameRect = this.canvasFrame.getBoundingClientRect();
    const left = Math.min(start[0], end[0]) + canvasRect.left - frameRect.left;
    const top = Math.min(start[1], end[1]) + canvasRect.top - frameRect.top;
    marquee.style.left = `${left}px`;
    marquee.style.top = `${top}px`;
    marquee.style.width = `${Math.abs(end[0] - start[0])}px`;
    marquee.style.height = `${Math.abs(end[1] - start[1])}px`;
    marquee.dataset.kind = 'box';
    marquee.hidden = false;
  }

  private drawPaintTrail(gesture: ManualPointerGesture): void {
    const last = gesture.segments.at(-1)?.[1] ?? gesture.startScreen;
    const half = 12;
    this.drawMarquee(
      [last[0] - half, last[1] - half],
      [last[0] + half, last[1] + half],
    );
    required<HTMLElement>(this.host, '[data-manual-marquee]').dataset.kind = 'paint';
  }

  private hideMarquee(): void {
    required<HTMLElement>(this.host, '[data-manual-marquee]').hidden = true;
  }

  private showTooltip(targetId: string | null, clientX: number, clientY: number): void {
    const tooltip = required<HTMLElement>(this.host, '[data-manual-tooltip]');
    if (targetId === null) {
      tooltip.hidden = true;
      return;
    }
    const frameRect = this.canvasFrame.getBoundingClientRect();
    tooltip.textContent = targetId;
    tooltip.style.left = `${clientX - frameRect.left + 14}px`;
    tooltip.style.top = `${clientY - frameRect.top + 14}px`;
    tooltip.hidden = false;
  }

  private clearTooltip(): void {
    required<HTMLElement>(this.host, '[data-manual-tooltip]').hidden = true;
  }

  private detach(reason: 'replace' | 'destroy'): void {
    let failure: Error | null = null;
    try {
      this.cleanupPointerSession(reason);
    } catch (error) {
      failure = pointerCleanupError(error);
    }
    try {
      this.canvasAbortController?.abort();
    } catch (error) {
      failure ??= pointerCleanupError(error);
    }
    this.canvasAbortController = null;
    try {
      this.hideMarquee();
    } catch (error) {
      failure ??= pointerCleanupError(error);
    }
    this.engine = null;
    if (failure !== null) throw failure;
  }

  private cleanupPointerSession(
    reason: PatchMapGestureCancelReason,
    pointerId: number | null = null,
  ): boolean {
    const active = this.activePointer !== null
      && (pointerId === null || this.activePointer.pointerId === pointerId)
      ? this.activePointer
      : null;
    const panPointerId = this.panPointerId !== null
      && (pointerId === null || this.panPointerId === pointerId)
      ? this.panPointerId
      : null;
    if (active === null && panPointerId === null) return false;

    let failure: Error | null = null;
    const attempt = (operation: () => void): void => {
      try {
        operation();
      } catch (error) {
        failure ??= pointerCleanupError(error);
      }
    };
    const next = this.engine;
    if (next !== null) {
      let canvas: HTMLCanvasElement | null = null;
      try {
        canvas = next.canvasHandle().element;
      } catch (error) {
        failure ??= pointerCleanupError(error);
      }
      if (active?.kind === 'transform') {
        attempt(() => {
          if (next.transformerEditProbe().activeSessionCount > 0) {
            next.cancelTransformerEdit(active.pointerId, reason);
          }
        });
      }
      if (active !== null && canvas !== null) {
        attempt(() => {
          if (canvas.hasPointerCapture(active.pointerId)) {
            canvas.releasePointerCapture(active.pointerId);
          }
        });
      }
      if (
        panPointerId !== null
        && panPointerId !== active?.pointerId
        && canvas !== null
      ) {
        attempt(() => {
          if (canvas.hasPointerCapture(panPointerId)) {
            canvas.releasePointerCapture(panPointerId);
          }
        });
      }
    }
    if (active !== null) this.activePointer = null;
    if (panPointerId !== null) this.panPointerId = null;
    if (active !== null) attempt(() => this.hideMarquee());
    if (failure !== null) throw failure;
    return true;
  }

  private requireEngine(): PatchMap {
    if (this.engine === null) {
      throw new Error('PatchMap pointer controller has no active engine');
    }
    return this.engine;
  }
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const value = root.querySelector<T>(selector);
  if (!value) throw new Error(`PatchMap manual Lab element missing: ${selector}`);
  return value;
}

function setManualText(root: ParentNode, key: string, value: string): void {
  const target = root.querySelector<HTMLElement>(`[data-manual-${key}]`);
  if (target) target.textContent = value;
}

function pointerCleanupError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
