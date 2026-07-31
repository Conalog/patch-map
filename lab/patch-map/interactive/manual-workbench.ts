import {
  PatchMap,
  PatchMapAssetRuntime,
  createPatchMapAssetIngestionPolicy,
  createPatchMapPixiAssetBackend,
  type PatchMapAssetAcquisition,
  type PatchMapAssetIngestionPolicyProfile,
  type PatchMapFrameLoop,
  type PatchMapEngineHistoryResult,
} from '../../../src/patch-map/index';
import {
  patchMapKoreanStatus,
} from '../contract/korean-copy';
import {
  PATCH_MAP_MANUAL_TOOL_LABELS,
  selectPatchMapManualCase,
  type PatchMapManualToolGroup,
} from './manual-case-catalog';
import {
  buildPatchMapManualScene,
  buildPatchMapManualSceneAsync,
  isPatchMapManualSceneSize,
  type PatchMapManualScene,
  type PatchMapManualSceneSize,
} from './manual-scene';
import {
  advancedExample,
  defaultManualAnimationDuration,
  manualActionDisplay,
  manualSceneSizeLabel,
} from './manual-workbench-view';
import { runPatchMapManualAdvancedAction } from './manual-workbench-actions';
import {
  angleDegrees,
  canvasPoint,
  cursorForMode,
  interactionModeForManualMode,
  isManualPointerMode,
  isResizeHandle,
  manualModeForShortcutKey,
  manualModeLabel,
  manualModeStatusHelp,
  midpoint,
  normalizeDeltaDegrees,
  selectionVisualModeForManualMode,
  viewportPanOperationForManualMode,
  type ManualPointerGesture,
  type ManualPointerMode,
} from './manual-workbench-input';
import { PATCH_MAP_MANUAL_LAB_ZOOM_LIMITS } from '../lab-settings';

export { renderPatchMapManualWorkbench } from './manual-workbench-view';

export interface PatchMapManualLabState {
  readonly caseId: string;
  readonly sceneSize: string;
  readonly status: 'booting' | 'ready' | 'busy' | 'destroyed' | 'failed';
  readonly generation: number;
  readonly mode: ManualPointerMode;
  readonly selectedIds: readonly string[];
  readonly history: Readonly<{
    readonly undoDepth: number;
    readonly redoDepth: number;
  }>;
  readonly activeAnimations: number;
  readonly canvasCount: number;
  readonly lastAction: string;
  readonly error: string | null;
}

export interface PatchMapManualLabBridge {
  readonly ready: Promise<void>;
  state(): PatchMapManualLabState;
  engine(): PatchMap | null;
  run(command: string): Promise<unknown>;
  destroy(): Promise<void>;
}

export interface PatchMapManualLabMountOptions {
  readonly caseId: string;
  readonly title: string;
  readonly size: string;
  readonly seed: number;
}

declare global {
  interface Window {
    __PATCH_MAP_MANUAL_LAB__?: PatchMapManualLabBridge;
  }
}

const MANUAL_EVENT_NAMES = Object.freeze([
  'sceneCommitted',
  'frame',
  'viewChanged',
  'viewSettled',
  'selectionChanged',
  'change',
  'targetDestroyed',
  'historyUndone',
  'historyRedone',
  'historyVisible',
  'historyCleared',
  'diagnostic',
  'documentVisibilityChanged',
] as const);

const MANUAL_LAB_EXTERNAL_ASSET_PROFILE: PatchMapAssetIngestionPolicyProfile =
  Object.freeze({
    protocols: Object.freeze(['https:']),
    origins: Object.freeze(['https://images.conalog.com']),
    redirects: 'revalidate',
    credentials: 'omit',
    mediaTypes: Object.freeze([
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/avif',
      'image/svg+xml',
    ]),
    maxEncodedBytes: 32 * 1024 * 1024,
    maxDecodedWidth: 20_000,
    maxDecodedHeight: 20_000,
  });

export function mountPatchMapManualWorkbench(
  root: HTMLElement,
  options: PatchMapManualLabMountOptions,
): PatchMapManualLabBridge {
  const host = required<HTMLElement>(root, '[data-testid="manual-workbench"]');
  const surfaceHost = required<HTMLElement>(host, '[data-testid="manual-canvas-host"]');
  const canvasFrame = required<HTMLElement>(host, '[data-testid="manual-canvas-frame"]');
  const descriptor = selectPatchMapManualCase(options.caseId);
  const abortController = new AbortController();
  const { signal } = abortController;
  let engine: PatchMap | null = null;
  let manualSceneSize: PatchMapManualSceneSize = requireManualSceneSize(options.size);
  let scene: PatchMapManualScene = buildPatchMapManualScene(
    manualSceneSize,
    options.seed,
    defaultManualAnimationDuration(options.caseId),
  );
  let status: PatchMapManualLabState['status'] = 'booting';
  let generation = 0;
  let mode: ManualPointerMode = 'select';
  let lastAction = 'boot';
  let lastError: string | null = null;
  let actionSequence = 0;
  let animationSequence = 0;
  let activePointer: ManualPointerGesture | null = null;
  let panPointerId: number | null = null;
  let canvasAbortController: AbortController | null = null;
  let resizeFrame = 0;
  let refreshFrame = 0;
  let framesPaused = false;
  let savedViewport: ReturnType<PatchMap['serializeViewport']> | null = null;
  let lifecycleClock = 0;
  let lastLiveRefreshWallTime = 0;
  let longTaskCount = 0;
  let eventJournal: Array<Readonly<Record<string, unknown>>> = [];
  let frameTimes: number[] = [];
  let assetLeases: PatchMapAssetAcquisition[] = [];
  let engineUnbinds: Array<() => void> = [];
  let frameLoop: PatchMapFrameLoop | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let performanceObserver: PerformanceObserver | null = null;
  let lastSnapshot: ReturnType<PatchMap['snapshot']> | null = null;
  let destroyed = false;
  const assetPolicy = createPatchMapAssetIngestionPolicy(
    MANUAL_LAB_EXTERNAL_ASSET_PROFILE,
  );
  const assetRuntime = new PatchMapAssetRuntime(createPatchMapPixiAssetBackend({
    ingestionPolicy: MANUAL_LAB_EXTERNAL_ASSET_PROFILE,
  }));

  const ready = boot();
  void ready.catch(() => undefined);

  required<HTMLSelectElement>(host, '[data-manual-scene-size]').value =
    manualSceneSize;
  bindStaticControls();
  activateTool(descriptor.tools[0] ?? 'diagnostics');
  installPerformanceObserver();

  const bridge: PatchMapManualLabBridge = Object.freeze({
    ready,
    state: stateSnapshot,
    engine: () => liveEngine(),
    run: runCommand,
    destroy,
  });
  window.__PATCH_MAP_MANUAL_LAB__ = bridge;
  window.addEventListener('pagehide', () => {
    void destroy().catch(() => undefined);
  }, { signal });

  return bridge;

  async function boot(): Promise<void> {
    try {
      await createSession(true);
      status = 'ready';
      setMessage(
        `${options.caseId} 세션이 준비되었습니다. 선택·변형·실행 취소·애니메이션·JSON 편집·종료·재시작을 원하는 만큼 반복하세요.`,
      );
    } catch (error) {
      fail(error);
      throw error;
    } finally {
      refresh();
    }
  }

  async function createSession(loadScene: boolean): Promise<PatchMap> {
    status = 'busy';
    await destroyEngine();
    surfaceHost.replaceChildren();
    const size = surfaceSize(canvasFrame);
    const next = new PatchMap({
      historyLimit: 100,
      assetPolicy,
      assetRuntime,
    });
    const instanceId = `manual-${options.caseId.toLowerCase()}-${generation + 1}`;
    lastLiveRefreshWallTime = 0;
    generation += 1;
    next.registerAssets(instanceId);
    await next.initialize({
      instanceId,
      target: surfaceHost,
      width: size.width,
      height: size.height,
      pixelRatio: Math.min(2, window.devicePixelRatio || 1),
      strategy: 'mesh',
      preference: 'webgl',
      backend: 'webgl2',
      antialias: false,
      background: '#f8fafcff',
      devtools: true,
      powerPreference: 'high-performance',
      zoomLimits: PATCH_MAP_MANUAL_LAB_ZOOM_LIMITS,
    });
    engine = next;
    frameLoop = next.createFrameLoop({
      onFrame: ({ wallTimeMs, activeAnimationsAfter }) => {
        frameTimes.push(wallTimeMs);
        if (frameTimes.length > 120) frameTimes = frameTimes.slice(-120);
        if (
          activeAnimationsAfter === 0 ||
          wallTimeMs - lastLiveRefreshWallTime >= 200
        ) {
          lastLiveRefreshWallTime = wallTimeMs;
          queueRefresh();
        }
      },
    });
    bindEngine(next);
    if (loadScene) {
      loadManualScene(next, scene);
      next.fitViewport({ paddingCssPx: 46 });
      publishEngineFrame(next);
    }
    bindCanvas(next);
    installResizeObserver();
    required<HTMLElement>(host, '[data-manual-loading]').hidden = true;
    status = 'ready';
    lastError = null;
    lastAction = loadScene ? 'initialize + load' : 'initialize';
    refreshSceneEditor();
    activateMode(mode);
    refresh();
    return next;
  }

  function bindStaticControls(): void {
    for (const button of host.querySelectorAll<HTMLButtonElement>('[data-manual-tool-button]')) {
      button.addEventListener('click', () => {
        const tool = button.dataset.manualToolButton;
        if (isManualToolGroup(tool)) activateTool(tool);
      }, { signal });
    }
    for (const button of host.querySelectorAll<HTMLButtonElement>('[data-manual-focus-tool]')) {
      button.addEventListener('click', () => {
        const tool = button.dataset.manualFocusTool;
        if (isManualToolGroup(tool)) {
          activateTool(tool);
          required<HTMLElement>(host, `[data-manual-tool-panel="${tool}"]`).scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
          });
        }
      }, { signal });
    }
    for (const button of host.querySelectorAll<HTMLButtonElement>('[data-manual-mode]')) {
      button.addEventListener('click', () => {
        const nextMode = button.dataset.manualMode;
        if (isManualPointerMode(nextMode)) activateMode(nextMode);
      }, { signal });
    }
    for (const button of host.querySelectorAll<HTMLButtonElement>('[data-manual-command]')) {
      button.addEventListener('click', () => {
        void runCommand(button.dataset.manualCommand ?? '').catch(() => undefined);
      }, { signal });
    }
    const probe = required<HTMLSelectElement>(host, '[data-manual-probe-select]');
    probe.addEventListener('change', refreshProbe, { signal });
    const advancedMethod = required<HTMLSelectElement>(host, '[data-manual-advanced-method]');
    advancedMethod.addEventListener('change', () => {
      required<HTMLTextAreaElement>(host, '[data-manual-advanced-json]').value =
        advancedExample(advancedMethod.value);
    }, { signal });
    window.addEventListener('keydown', onKeyDown, { signal });
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (isEditableTarget(event.target)) return;
    const key = event.key.toLowerCase();
    const next = liveEngine();
    if (next === null) return;
    if (event.metaKey || event.ctrlKey) {
      if (key !== 'z' && key !== 'y') return;
      const shortcut = next.handleHistoryShortcut({
        key: event.key,
        code: event.code,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        pathKind: 'canvas',
      });
      if (shortcut.preventDefault) event.preventDefault();
      if (shortcut.handled) {
        lastAction = shortcut.action ?? 'history shortcut';
        startFrameLoop(500);
        refresh();
      }
      return;
    }
    if (event.altKey) return;
    const shortcutMode = manualModeForShortcutKey(key);
    if (shortcutMode !== undefined) {
      event.preventDefault();
      activateMode(shortcutMode);
      return;
    }
    if (key === 'escape') {
      const gesture = activePointer;
      if (
        gesture?.kind === 'transform' &&
        next.transformerEditProbe().activeSessionCount > 0
      ) {
        next.cancelTransformerEdit(gesture.pointerId, 'escape');
        const canvas = next.canvasHandle().element;
        if (canvas.hasPointerCapture(gesture.pointerId)) {
          canvas.releasePointerCapture(gesture.pointerId);
        }
        activePointer = null;
        hideMarquee();
        publishEngineFrame(next);
        lastAction = 'transform-cancelled';
        event.preventDefault();
        refresh();
      }
      return;
    }
    if (key === 'delete' || key === 'backspace') {
      event.preventDefault();
      void runCommand('delete-selected').catch(() => undefined);
      return;
    }
    const step = event.shiftKey ? 10 : 1;
    const deltaByKey: Readonly<Record<string, readonly [number, number]>> = {
      arrowleft: [-step, 0],
      arrowright: [step, 0],
      arrowup: [0, -step],
      arrowdown: [0, step],
    };
    const delta = deltaByKey[key];
    if (delta !== undefined) {
      event.preventDefault();
      try {
        transformSelection('move', delta);
        lastAction = 'keyboard-nudge';
        startFrameLoop(500);
        refresh();
      } catch (error) {
        fail(error);
        refresh();
      }
    }
  }

  function bindEngine(next: PatchMap): void {
    engineUnbinds = [
      next.on('sceneCommitted', (event) => recordEvent('sceneCommitted', event)),
      next.on('frame', (event) => recordEvent('frame', event, false)),
      next.on('viewChanged', (event) => recordEvent('viewChanged', event, false)),
      next.on('viewSettled', (event) => recordEvent('viewSettled', event)),
      next.on('selectionChanged', (event) => {
        recordEvent('selectionChanged', event);
        refreshSelectionVisual(next);
      }),
      next.on('change', (event) => {
        recordEvent('change', event);
        startFrameLoop(500);
      }),
      next.on('targetDestroyed', (event) => recordEvent('targetDestroyed', event)),
      next.on('historyUndone', (event) => {
        recordEvent('historyUndone', event);
        startFrameLoop(500);
      }),
      next.on('historyRedone', (event) => {
        recordEvent('historyRedone', event);
        startFrameLoop(500);
      }),
      next.on('historyVisible', (event) => recordEvent('historyVisible', event)),
      next.on('historyCleared', (event) => recordEvent('historyCleared', event)),
      next.on('diagnostic', (event) => recordEvent('diagnostic', event)),
      next.on('documentVisibilityChanged', (event) =>
        recordEvent('documentVisibilityChanged', event)),
    ];
    if (engineUnbinds.length !== MANUAL_EVENT_NAMES.length) {
      throw new Error('PatchMap manual Lab event binding drift');
    }
  }

  function bindCanvas(next: PatchMap): void {
    canvasAbortController?.abort();
    canvasAbortController = new AbortController();
    const canvasSignal = canvasAbortController.signal;
    const canvas = next.canvasHandle().element;
    canvas.dataset.manualPatchMapCanvas = 'true';
    canvas.setAttribute('aria-label', 'PatchMap 직접 조작 화면');
    canvas.addEventListener('pointerdown', (event) => onPointerDown(event, next), {
      signal: canvasSignal,
    });
    canvas.addEventListener('pointermove', (event) => onPointerMove(event, next), {
      signal: canvasSignal,
    });
    canvas.addEventListener('pointerup', (event) => onPointerUp(event, next), {
      signal: canvasSignal,
    });
    canvas.addEventListener('pointercancel', (event) => onPointerCancel(event, next), {
      signal: canvasSignal,
    });
    canvas.addEventListener('pointerleave', (event) => {
      if (activePointer === null) clearTooltip();
      else if (activePointer.pointerId === event.pointerId) startFrameLoop(400);
    }, { signal: canvasSignal });
    canvas.addEventListener('wheel', () => {
      startFrameLoop(650);
      queueRefresh();
    }, { signal: canvasSignal, passive: true });
    canvas.addEventListener('contextmenu', (event) => {
      const point = canvasPoint(event, canvas);
      const tooltip = next.toggleTooltipPinAtScreen(
        { x: point[0], y: point[1] },
        [180, 44],
      );
      showTooltip(tooltip.targetId, event.clientX, event.clientY);
      queueRefresh();
    }, { signal: canvasSignal });
  }

  function onPointerDown(event: PointerEvent, next: PatchMap): void {
    if (event.button !== 0 || activePointer !== null) return;
    const canvas = next.canvasHandle().element;
    const screen = canvasPoint(event, canvas);
    const world = next.screenToWorld({ x: screen[0], y: screen[1] });
    const selectionBefore = next.snapshot().selectionIds;
    if (mode === 'pan') {
      panPointerId = event.pointerId;
      canvas.setPointerCapture(event.pointerId);
      startFrameLoop(800);
      return;
    }
    if (mode === 'box' || mode === 'paint') {
      canvas.setPointerCapture(event.pointerId);
      activePointer = {
        pointerId: event.pointerId,
        kind: mode,
        startScreen: screen,
        startWorld: [world.x, world.y],
        selectionBefore,
        segments: [],
        moved: false,
      };
      if (mode === 'box') drawMarquee(screen, screen);
      startFrameLoop(500);
      return;
    }
    if (mode === 'move' || mode === 'resize' || mode === 'rotate') {
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
      refreshSelectionVisual(next);
      const visual = next.selectionVisualProbe();
      const center = visual?.frame === null || visual?.frame === undefined
        ? null
        : midpoint(visual.frame.screenCorners[0], visual.frame.screenCorners[2]);
      const actualHandle = next.hitTransformerHandle(screen);
      const resizeHandle = isResizeHandle(actualHandle) ? actualHandle : 'se';
      const transformerKind = mode;
      next.beginTransformerEdit({
        pointerId: event.pointerId,
        actionId: `manual-${transformerKind}-${++actionSequence}`,
        kind: transformerKind,
        handle: transformerKind === 'move'
          ? 'frame'
          : transformerKind === 'rotate'
            ? 'rotate'
            : resizeHandle,
        selectionIds,
      });
      canvas.setPointerCapture(event.pointerId);
      activePointer = {
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
      startFrameLoop(800);
      return;
    }
    if (mode === 'select') {
      activePointer = {
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
    startFrameLoop(800);
  }

  function onPointerMove(event: PointerEvent, next: PatchMap): void {
    const canvas = next.canvasHandle().element;
    const screen = canvasPoint(event, canvas);
    const world = next.screenToWorld({ x: screen[0], y: screen[1] });
    setText(host, 'pointer', `${screen[0].toFixed(0)}, ${screen[1].toFixed(0)} → ${world.x.toFixed(1)}, ${world.y.toFixed(1)}`);
    const gesture = activePointer;
    if (gesture === null || gesture.pointerId !== event.pointerId) {
      if (mode === 'pan') {
        clearTooltip();
        return;
      }
      const tooltip = next.hoverTooltipAtScreen(
        { x: screen[0], y: screen[1] },
        [180, 44],
      );
      showTooltip(tooltip.targetId, event.clientX, event.clientY);
      if (mode === 'resize' || mode === 'rotate' || mode === 'move') {
        const handle = next.hitTransformerHandle(screen);
        canvas.style.cursor = handle === null
          ? mode === 'move'
            ? 'move'
            : mode === 'rotate'
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
      drawMarquee(gesture.startScreen, screen);
    } else if (gesture.kind === 'paint' && mode === 'paint') {
      const previous = gesture.segments.at(-1)?.[1] ?? gesture.startScreen;
      gesture.segments.push(Object.freeze([previous, screen] as const));
      drawPaintTrail(gesture);
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
        const startDegrees = gesture.rotationStartDegrees ??
          angleDegrees(center, gesture.startScreen);
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
    startFrameLoop(800);
    queueRefresh();
  }

  function onPointerUp(event: PointerEvent, next: PatchMap): void {
    if (panPointerId === event.pointerId) {
      panPointerId = null;
      const canvas = next.canvasHandle().element;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      lastAction = 'pan-gesture';
      startFrameLoop(600);
      queueRefresh();
      return;
    }
    const gesture = activePointer;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;
    const canvas = next.canvasHandle().element;
    const screen = canvasPoint(event, canvas);
    try {
      if (gesture.kind === 'box') {
        next.selectBox(gesture.startScreen, screen, {
          mode: event.shiftKey ? 'add' : 'replace',
          partialIntersection: true,
        });
      } else if (gesture.kind === 'paint' && mode === 'paint') {
        const segments = gesture.segments.length > 0
          ? gesture.segments
          : [Object.freeze([gesture.startScreen, screen] as const)];
        next.selectPaint(segments, {
          mode: event.shiftKey ? 'add' : 'replace',
          toleranceCssPx: 10,
        });
      } else if (
        gesture.kind === 'paint' &&
        mode === 'select' &&
        !gesture.moved
      ) {
        // Root pointer authority already applies replace/toggle selection from
        // the exact click event. Do not repeat the 5,000-scene selection pass
        // in the Lab host for Shift-click.
      } else if (
        gesture.kind === 'transform' &&
        next.transformerEditProbe().activeSessionCount > 0
      ) {
        next.completeTransformerEdit(event.pointerId);
      }
      lastAction = gesture.kind === 'transform'
        ? `${gesture.transformKind ?? 'transform'}-gesture`
        : `${gesture.kind}-selection`;
      publishEngineFrame(next);
    } finally {
      activePointer = null;
      hideMarquee();
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      startFrameLoop(600);
      refresh();
    }
  }

  function onPointerCancel(event: PointerEvent, next: PatchMap): void {
    if (panPointerId === event.pointerId) {
      panPointerId = null;
      lastAction = 'pan-cancelled';
      startFrameLoop(400);
      queueRefresh();
      return;
    }
    const gesture = activePointer;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;
    if (
      gesture.kind === 'transform' &&
      next.transformerEditProbe().activeSessionCount > 0
    ) {
      next.cancelTransformerEdit(event.pointerId, 'pointer-cancel');
    }
    activePointer = null;
    hideMarquee();
    lastAction = 'gesture-cancelled';
    publishEngineFrame(next);
    refresh();
  }

  async function runCommand(command: string): Promise<unknown> {
    if (destroyed) throw new Error('PatchMap 직접 조작 실험실이 이미 종료되었습니다.');
    status = 'busy';
    lastError = null;
    let result: unknown = null;
    try {
      switch (command) {
        case 'select-first':
          result = requireEngine().select(scene.primaryIds.slice(0, 1));
          break;
        case 'select-first-three':
          result = requireEngine().select(scene.primaryIds.slice(0, 3));
          break;
        case 'select-relations':
          result = requireEngine().selectRelationEndpoints(scene.relationIds);
          break;
        case 'selection-clear':
          result = requireEngine().applySelection({ op: 'clear', source: 'programmatic' });
          break;
        case 'nudge-left':
          result = transformSelection('move', [-nudgeAmount(), 0]);
          break;
        case 'nudge-right':
          result = transformSelection('move', [nudgeAmount(), 0]);
          break;
        case 'nudge-up':
          result = transformSelection('move', [0, -nudgeAmount()]);
          break;
        case 'nudge-down':
          result = transformSelection('move', [0, nudgeAmount()]);
          break;
        case 'resize-grow':
          result = transformSelection('resize', [resizeAmount(), resizeAmount()]);
          break;
        case 'resize-shrink':
          result = transformSelection('resize', [-resizeAmount(), -resizeAmount()]);
          break;
        case 'rotate-left':
          result = transformSelection('rotate', -angleAmount());
          break;
        case 'rotate-right':
          result = transformSelection('rotate', angleAmount());
          break;
        case 'undo':
          result = historyAction('undo');
          break;
        case 'redo':
          result = historyAction('redo');
          break;
        case 'history-clear':
          result = requireEngine().clearHistory();
          break;
        case 'history-capacity':
          result = requireEngine().setHistoryCapacity(numberInput('history-capacity', 100));
          break;
        case 'fit-all':
          result = requireEngine().fitViewport({ paddingCssPx: 46 });
          publishNow('fit all');
          break;
        case 'fit-selection':
          result = requireEngine().fitViewport({
            targets: requireEngine().snapshot().selectionIds,
            paddingCssPx: 70,
          });
          publishNow('fit selection');
          break;
        case 'view-reset':
          requireEngine().setViewport({ centerWorld: [0, 0], scale: 1 });
          result = requireEngine().setWorldTransform({
            rotationDegrees: 0,
            flipX: false,
            flipY: false,
          });
          publishNow('reset view');
          break;
        case 'zoom-in':
          result = zoomAtCenter(1.25);
          break;
        case 'zoom-out':
          result = zoomAtCenter(0.8);
          break;
        case 'world-rotate-left':
          result = rotateWorld(-15);
          break;
        case 'world-rotate-right':
          result = rotateWorld(15);
          break;
        case 'world-flip-x':
          result = flipWorld('x');
          break;
        case 'world-flip-y':
          result = flipWorld('y');
          break;
        case 'view-save':
          requireEngine().settleViewport();
          savedViewport = requireEngine().serializeViewport();
          result = savedViewport;
          break;
        case 'view-restore':
          result = requireEngine().restoreViewport(savedViewport);
          publishNow('restore view');
          break;
        case 'animate-all':
          result = animateBars('all');
          break;
        case 'animate-partial':
          result = animateBars('partial');
          break;
        case 'animate-selected':
          result = animateBars('selected');
          break;
        case 'animation-duration': {
          const durationMs = manualAnimationDuration();
          scene = await buildPatchMapManualSceneAsync(
            manualSceneSize,
            options.seed,
            durationMs,
          );
          result = loadManualScene(requireEngine(), scene);
          requireEngine().fitViewport({ paddingCssPx: 46 });
          publishNow(`bar animation ${durationMs}ms`);
          refreshSceneEditor();
          setMessage(
            `막대 애니메이션 시간을 ${(durationMs / 1_000).toFixed(1)}초로 적용했습니다.`,
          );
          break;
        }
        case 'random-text':
          result = randomizeTexts();
          break;
        case 'frames-toggle':
          framesPaused = !framesPaused;
          if (framesPaused) {
            frameLoop?.pause();
          } else {
            frameLoop?.resume(800);
          }
          result = { framesPaused };
          break;
        case 'reduced-motion':
          result = requireEngine().setReducedMotion(
            required<HTMLInputElement>(host, '[data-manual-reduced-motion]').checked,
          );
          break;
        case 'style-selected':
          result = styleSelected();
          break;
        case 'text-selected':
          result = editSelectedText();
          break;
        case 'scene-size': {
          const nextSize = selectedManualSceneSize();
          const nextScene = await buildPatchMapManualSceneAsync(
            nextSize,
            options.seed,
            manualAnimationDuration(),
          );
          result = loadManualScene(requireEngine(), nextScene, nextSize);
          manualSceneSize = nextSize;
          scene = nextScene;
          requireEngine().fitViewport({ paddingCssPx: 46 });
          publishNow(`load ${nextSize} example records`);
          refreshSceneEditor();
          host.dispatchEvent(new CustomEvent('patch-map-manual-scene-size-change', {
            bubbles: true,
            detail: { size: nextSize },
          }));
          break;
        }
        case 'scene-regenerate':
          scene = await buildPatchMapManualSceneAsync(
            manualSceneSize,
            (options.seed + ++actionSequence) >>> 0,
            manualAnimationDuration(),
          );
          result = loadManualScene(requireEngine(), scene);
          requireEngine().fitViewport({ paddingCssPx: 46 });
          publishNow('regenerate scene');
          refreshSceneEditor();
          break;
        case 'scene-load-json':
          result = loadJsonEditor();
          break;
        case 'scene-export-json':
          refreshSceneEditor();
          result = requireEngine().exportDataset();
          break;
        case 'scene-invalid-json':
          required<HTMLTextAreaElement>(host, '[data-manual-scene-json]').value =
            JSON.stringify([
              { type: 'rect', id: 'duplicate', size: { width: 30, height: 30 } },
              { type: 'rect', id: 'duplicate', size: { width: 40, height: 40 } },
            ], null, 2);
          result = '중복 ID 오류 예제가 준비되었습니다.';
          break;
        case 'publish-frame':
          publishNow('manual frame');
          result = requireEngine().snapshot().publishedTuple;
          break;
        case 'create-element':
          result = createElement();
          break;
        case 'duplicate-selected':
          result = duplicateSelected();
          break;
        case 'group-selected':
          result = groupSelected();
          break;
        case 'ungroup-selected':
          result = ungroupSelected();
          break;
        case 'front-selected':
          result = reorderSelected('front');
          break;
        case 'back-selected':
          result = reorderSelected('back');
          break;
        case 'align-selected':
          result = alignSelected();
          break;
        case 'distribute-selected':
          result = distributeSelected();
          break;
        case 'delete-selected':
          result = deleteSelected();
          break;
        case 'asset-acquire':
          result = await acquireAsset();
          break;
        case 'asset-release':
          result = await releaseAsset();
          break;
        case 'capture':
          result = await captureScene();
          break;
        case 'destroy-session':
          await destroyEngine();
          status = 'destroyed';
          result = { destroyed: true };
          break;
        case 'reinitialize-session':
          result = await createSession(true);
          break;
        case 'replace-session':
          result = loadManualScene(requireEngine(), scene);
          requireEngine().fitViewport({ paddingCssPx: 46 });
          publishNow('replace scene');
          break;
        case 'resize-small':
          result = resizeSurface(640, 420);
          break;
        case 'resize-large':
          result = resizeSurface(960, 620);
          break;
        case 'page-hide': {
          const frameTime = frameLoop?.debugSnapshot().logicalTimeMs ?? 0;
          lifecycleClock = Math.max(lifecycleClock + 1, frameTime, performance.now());
          result = requireEngine().setDocumentVisibility({
            state: 'hidden',
            timeMs: lifecycleClock,
          });
          break;
        }
        case 'page-show': {
          const frameTime = frameLoop?.debugSnapshot().logicalTimeMs ?? 0;
          lifecycleClock = Math.max(lifecycleClock + 1, frameTime, performance.now());
          result = requireEngine().setDocumentVisibility({
            state: 'visible',
            timeMs: lifecycleClock,
          });
          publishNow('page visible');
          break;
        }
        case 'accessibility-tree':
          result = requireEngine().accessibilityTree();
          showAdvancedResult(result);
          break;
        case 'accessibility-focus':
          result = requireEngine().focusAccessibilityTarget(accessibilityTarget());
          break;
        case 'accessibility-activate':
          result = requireEngine().activateAccessibilityTarget(accessibilityTarget(), {
            source: 'host',
            activationId: `manual-a11y-${++actionSequence}`,
          });
          break;
        case 'probe-refresh':
          refreshProbe();
          result = currentProbe();
          break;
        case 'events-clear':
          eventJournal = [];
          result = { cleared: true };
          break;
        case 'advanced-run':
          result = runAdvancedOperation();
          showAdvancedResult(result);
          break;
        default:
          throw new Error(`알 수 없는 PatchMap 직접 조작 명령입니다: ${command}`);
      }
      lastAction = command;
      status = liveEngine() === null ? 'destroyed' : 'ready';
      if (liveEngine() !== null) {
        startFrameLoop(500);
      }
      setMessage(`‘${actionDisplay(command)}’ 작업을 완료했습니다. 계속 조작하거나 같은 작업을 다시 실행해도 됩니다.`);
      return result;
    } catch (error) {
      fail(error);
      throw error;
    } finally {
      queueRefresh();
    }
  }

  function activateTool(tool: PatchMapManualToolGroup): void {
    for (const button of host.querySelectorAll<HTMLButtonElement>('[data-manual-tool-button]')) {
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.manualToolButton === tool),
      );
    }
    for (const panel of host.querySelectorAll<HTMLElement>('[data-manual-tool-panel]')) {
      panel.hidden = panel.dataset.manualToolPanel !== tool;
    }
  }

  function activateMode(nextMode: ManualPointerMode): void {
    mode = nextMode;
    for (const button of host.querySelectorAll<HTMLButtonElement>('[data-manual-mode]')) {
      button.setAttribute('aria-pressed', String(button.dataset.manualMode === mode));
    }
    const live = liveEngine();
    if (live !== null) {
      live.applyInteractionModeOperation({
        op: 'replace',
        state: interactionModeForManualMode(mode),
      });
      live.configureViewportPolicy({
        op: viewportPanOperationForManualMode(mode),
        policy: 'pan',
      });
      refreshSelectionVisual(live);
      live.canvasHandle().element.style.cursor = cursorForMode(mode);
    }
    setText(host, 'mode-help', `${manualModeLabel(mode)}: ${manualModeStatusHelp(mode)}`);
    host.dataset.manualMode = mode;
  }

  function transformSelection(
    kind: 'move',
    delta: readonly [number, number],
  ): unknown;
  function transformSelection(
    kind: 'resize',
    delta: readonly [number, number],
  ): unknown;
  function transformSelection(kind: 'rotate', delta: number): unknown;
  function transformSelection(
    kind: 'move' | 'resize' | 'rotate',
    delta: readonly [number, number] | number,
  ): unknown {
    const next = requireEngine();
    const selectionIds = selectedIdsOrDefault(next);
    if (kind === 'move' && Array.isArray(delta)) {
      return next.applyTransformerEdit({
        kind,
        selectionIds,
        deltaWorld: [Number(delta[0]), Number(delta[1])],
      }, { actionId: `manual-nudge-${++actionSequence}` });
    }
    if (kind === 'resize' && Array.isArray(delta)) {
      return next.applyTransformerEdit({
        kind,
        selectionIds,
        handle: 'se',
        deltaWorld: [Number(delta[0]), Number(delta[1])],
        lockAspectRatio:
          required<HTMLInputElement>(host, '[data-manual-lock-ratio]').checked,
        minSize: 8,
      }, { actionId: `manual-resize-${++actionSequence}` });
    }
    return next.applyTransformerEdit({
      kind: 'rotate',
      selectionIds,
      deltaDegrees: Number(delta),
    }, { actionId: `manual-rotate-${++actionSequence}` });
  }

  function historyAction(direction: 'undo' | 'redo'): PatchMapEngineHistoryResult {
    const next = requireEngine();
    return direction === 'undo' ? next.undo() : next.redo();
  }

  function animateBars(scope: 'all' | 'partial' | 'selected'): unknown {
    const next = requireEngine();
    animationSequence += 1;
    let targets = scene.barTargets;
    if (scope === 'partial') {
      targets = targets.filter((_, index) => index % 10 === animationSequence % 10);
    } else if (scope === 'selected') {
      const selected = new Set(next.snapshot().selectionIds);
      targets = targets.filter(({ ownerId }) => selected.has(ownerId));
      if (targets.length === 0) targets = scene.barTargets.slice(0, 1);
    }
    const heights = new Float64Array(targets.length);
    for (let index = 0; index < targets.length; index += 1) {
      heights[index] = 8 + ((index * 17 + animationSequence * 23) % 52);
    }
    const result = next.updateBarHeights({
      actionId: `manual-bars-${scope}-${animationSequence}`,
      targets,
      heights,
    });
    startFrameLoop(1_200);
    return result;
  }

  function randomizeTexts(): unknown {
    const next = requireEngine();
    animationSequence += 1;
    const targets = scene.textTargets
      .filter((_, index) => index % 4 === animationSequence % 4);
    const texts = targets.map(({ ownerId }, index) =>
      `${ownerId.slice(5)}:${animationSequence}:${index}`);
    return next.updateTexts({
      actionId: `manual-text-${animationSequence}`,
      targets,
      texts,
    });
  }

  function styleSelected(): unknown {
    const next = requireEngine();
    const target = selectedElementIds(next)[0] ?? 'manual-rect-a';
    return next.author({
      type: 'apply-style',
      target,
      changes: {
        fill: required<HTMLInputElement>(host, '[data-manual-style-fill]').value,
        alpha: numberInput('style-alpha', 1),
        cornerRadius: numberInput('style-radius', 8),
      },
      strict: true,
      actionId: `manual-style-${++actionSequence}`,
    });
  }

  function editSelectedText(): unknown {
    const next = requireEngine();
    const value = required<HTMLInputElement>(host, '[data-manual-text-value]').value;
    const selected = next.snapshot().selectionIds;
    if (selected.includes('manual-text')) {
      return next.patch({ kind: 'element', id: 'manual-text' }, { text: value });
    }
    const ownerId = selected.find((id) => id.startsWith('node-')) ?? 'node-0';
    return next.patch(
      { kind: 'component', ownerId, id: 'label' },
      { text: value },
    );
  }

  function createElement(): unknown {
    const next = requireEngine();
    const kind = required<HTMLSelectElement>(host, '[data-manual-create-kind]').value;
    const id = `manual-${kind}-${++actionSequence}`;
    const viewport = next.viewportProbe();
    return next.author({
      type: 'create-element',
      kind,
      id,
      positionWorld: viewport.centerWorld,
      parentId: null,
      actionId: `manual-create-${actionSequence}`,
    });
  }

  function duplicateSelected(): unknown {
    const next = requireEngine();
    const target = selectedElementIds(next)[0] ?? 'manual-rect-a';
    return next.author({
      type: 'duplicate-tree',
      target,
      rootId: `${target}-copy-${++actionSequence}`,
      offsetWorld: [28, 28],
      rewriteInternalReferences: true,
      preserveExternalReferences: true,
      actionId: `manual-duplicate-${actionSequence}`,
    });
  }

  function groupSelected(): unknown {
    const next = requireEngine();
    const targets = selectedElementIds(next);
    return next.author({
      type: 'group-targets',
      targets,
      groupId: `manual-group-${++actionSequence}`,
      actionId: `manual-group-${actionSequence}`,
    });
  }

  function ungroupSelected(): unknown {
    const next = requireEngine();
    const target = selectedElementIds(next)[0] ?? 'manual-group';
    return next.author({
      type: 'ungroup-target',
      target,
      actionId: `manual-ungroup-${++actionSequence}`,
    });
  }

  function reorderSelected(placement: 'front' | 'back'): unknown {
    const next = requireEngine();
    return next.author({
      type: 'reorder-z',
      targets: selectedElementIds(next),
      placement,
      preserveRelativeOrder: true,
      actionId: `manual-${placement}-${++actionSequence}`,
    });
  }

  function alignSelected(): unknown {
    const next = requireEngine();
    return next.author({
      type: 'align-targets',
      targets: selectedElementIds(next),
      axis: required<HTMLSelectElement>(host, '[data-manual-align-axis]').value,
      actionId: `manual-align-${++actionSequence}`,
    });
  }

  function distributeSelected(): unknown {
    const next = requireEngine();
    return next.author({
      type: 'distribute-targets',
      targets: selectedElementIds(next),
      axis: required<HTMLSelectElement>(host, '[data-manual-distribute-axis]').value,
      basis: 'bounds',
      actionId: `manual-distribute-${++actionSequence}`,
    });
  }

  function deleteSelected(): readonly unknown[] {
    const next = requireEngine();
    const results: unknown[] = [];
    for (const id of selectedElementIds(next)) {
      results.push(next.destroyTarget({ kind: 'element', id }));
    }
    return Object.freeze(results);
  }

  function loadJsonEditor(): unknown {
    const next = requireEngine();
    const text = required<HTMLTextAreaElement>(host, '[data-manual-scene-json]').value;
    const input: unknown = JSON.parse(text);
    const before = fingerprint(input);
    const result = next.loadDataset(input, {
      strict: required<HTMLInputElement>(host, '[data-manual-strict-load]').checked,
      datasetRef: `manual-json:${options.caseId}`,
    });
    const after = fingerprint(input);
    setText(host, 'immutability', before === after ? '통과' : '실패');
    publishEngineFrame(next);
    return result;
  }

  function loadManualScene(
    next: PatchMap,
    nextScene: PatchMapManualScene,
    size: PatchMapManualSceneSize = manualSceneSize,
  ): unknown {
    const before = fingerprint(nextScene.dataset);
    const result = next.loadDataset(nextScene.dataset, {
      datasetRef: `manual:${options.caseId}:${size}:${options.seed}`,
    });
    const after = fingerprint(nextScene.dataset);
    setText(host, 'immutability', before === after ? '통과' : '실패');
    return result;
  }

  async function acquireAsset(): Promise<unknown> {
    const lease = await requireEngine().acquireAsset('device');
    assetLeases.push(lease);
    return requireEngine().assetProbe('device');
  }

  async function releaseAsset(): Promise<unknown> {
    const lease = assetLeases.pop();
    if (lease !== undefined) await lease.release();
    return requireEngine().assetProbe('device');
  }

  async function releaseAllAssets(): Promise<void> {
    const leases = assetLeases;
    assetLeases = [];
    await Promise.allSettled(leases.map(async (lease) => lease.release()));
  }

  async function captureScene(): Promise<unknown> {
    const next = requireEngine();
    publishEngineFrame(next);
    const snapshot = next.snapshot();
    const capture = await next.extractPublishedScene({
      targetTuple: snapshot.publishedTuple,
      cssSize: snapshot.resources.canvas.cssSize,
      mime: 'image/png',
    });
    const image = required<HTMLImageElement>(host, '[data-manual-capture-image]');
    image.src = capture.dataUrl;
    image.hidden = false;
    return {
      capturedTuple: capture.capturedTuple,
      cssSize: capture.cssSize,
      backingSize: capture.backingSize,
      authoritativeCanvasRetained: capture.authoritativeCanvasRetained,
      dataUrlBytes: capture.dataUrl.length,
    };
  }

  function resizeSurface(width: number, height: number): unknown {
    canvasFrame.style.setProperty('--manual-canvas-width', `${width}px`);
    canvasFrame.style.setProperty('--manual-canvas-height', `${height}px`);
    const result = requireEngine().resize(
      Math.min(width, Math.max(1, surfaceHost.clientWidth)),
      Math.min(height, Math.max(1, surfaceHost.clientHeight)),
      Math.min(2, window.devicePixelRatio || 1),
    );
    publishNow(`resize ${width}×${height}`);
    return result;
  }

  function runAdvancedOperation(): unknown {
    const next = requireEngine();
    const method = required<HTMLSelectElement>(host, '[data-manual-advanced-method]').value;
    const input: unknown = JSON.parse(
      required<HTMLTextAreaElement>(host, '[data-manual-advanced-json]').value,
    );
    return runPatchMapManualAdvancedAction(next, method, input);
  }

  function refresh(): void {
    const next = liveEngine();
    host.dataset.manualStatus = status;
    setText(host, 'status', patchMapKoreanStatus(status));
    setText(host, 'last-action', actionDisplay(lastAction));
    setText(host, 'scene-size', manualSceneSizeLabel(manualSceneSize));
    const history = next?.historyState() ?? { undoDepth: 0, redoDepth: 0 };
    const animations = activeAnimationCount(next);
    if (next === null) {
      lastSnapshot = null;
    } else if (animations === 0) {
      lastSnapshot = next.snapshot();
    }
    const snapshot = lastSnapshot;
    const selectedIds = next?.selectionIds ?? snapshot?.selectionIds ?? [];
    const viewport = next?.viewportProbe() ?? snapshot?.viewport ?? null;
    setText(host, 'selection-count', String(selectedIds.length));
    setText(host, 'selection-ids', selectedIds.length === 0 ? '선택 없음' : selectedIds.join('\n'));
    setText(host, 'history', `${history.undoDepth} / ${history.redoDepth}`);
    setText(host, 'animations', String(animations));
    setText(
      host,
      'frame',
      String(next?.publishedFrameRevision ?? snapshot?.frameRevision ?? 0),
    );
    setText(host, 'canvas', String(snapshot?.resources.canvasCount ?? 0));
    setText(host, 'generation', String(generation));
    setText(
      host,
      'viewport',
      viewport === null
        ? '세션 꺼짐'
        : `${viewport.scale.toFixed(3)}× @ ${viewport.centerWorld.map((value) => value.toFixed(1)).join(', ')}`,
    );
    setText(
      host,
      'history-stack',
      next === null ? '세션 꺼짐' : historySummary(next),
    );
    setText(host, 'asset-state', next === null
      ? '세션 꺼짐'
      : summarize(next.assetProbe('device')));
    setText(host, 'lifecycle-state', snapshot === null
      ? '종료됨'
      : summarize({
          '수명 주기': patchMapKoreanStatus(snapshot.lifecycle),
          '세대': snapshot.revisions.lifecycleGeneration,
          '대기 작업': snapshot.pendingWork,
          '캔버스 수': snapshot.resources.canvasCount,
          '구독 수': snapshot.resources.subscriptions.active,
        }));
    setText(host, 'event-count', String(eventJournal.length));
    required<HTMLElement>(host, '[data-manual-event-journal]').textContent =
      eventJournal.length === 0
        ? '아직 기록된 이벤트가 없습니다.'
        : eventJournal.slice(-18).map((event) => JSON.stringify(event)).join('\n');
    required<HTMLElement>(
      host,
      '[data-manual-command="frames-toggle"] [data-manual-command-label]',
    ).textContent =
      framesPaused ? '프레임 다시 시작' : '프레임 일시 정지';
    const deltas = frameTimes.slice(1).map((time, index) => time - (frameTimes[index] ?? time));
    const average = deltas.length === 0
      ? null
      : deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
    const maxGap = deltas.length === 0 ? null : Math.max(...deltas);
    setText(
      host,
      'fps',
      average === null || maxGap === null
        ? '—'
        : `${(1000 / average).toFixed(0)} / ${maxGap.toFixed(1)} ms`,
    );
    setText(host, 'long-tasks', String(longTaskCount));
    syncDisabledState(next === null);
  }

  function queueRefresh(): void {
    cancelAnimationFrame(refreshFrame);
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = 0;
      refresh();
    });
  }

  function refreshProbe(): void {
    const output = required<HTMLElement>(host, '[data-manual-probe-output]');
    try {
      output.textContent = JSON.stringify(currentProbe(), null, 2);
    } catch (error) {
      output.textContent = errorMessage(error);
    }
  }

  function currentProbe(): unknown {
    const next = requireEngine();
    switch (required<HTMLSelectElement>(host, '[data-manual-probe-select]').value) {
      case 'history':
        return next.historyInspection();
      case 'geometry':
        return next.geometryProbe();
      case 'accessibility':
        return next.accessibilityProbe();
      case 'assets':
        return next.assetProbe();
      case 'interaction':
        return {
          mode: next.interactionModeProbe(),
          pointer: next.pointerGestureProbe(),
          transformer: next.transformerGestureProbe(),
          transformerEdit: next.transformerEditProbe(),
          ownership: next.interactionOwnershipProbe(),
        };
      case 'runtime':
        return next.runtimeDiagnostics();
      default:
        return next.snapshot();
    }
  }

  function refreshSceneEditor(): void {
    const next = liveEngine();
    if (next === null) return;
    required<HTMLTextAreaElement>(host, '[data-manual-scene-json]').value =
      JSON.stringify(next.exportDataset(), null, 2);
  }

  function refreshSelectionVisual(next: PatchMap): void {
    next.setSelectionVisualPolicy({
      mode: selectionVisualModeForManualMode(mode),
      handleCssPx: 10,
      strokeCssPx: 2,
    });
  }

  function recordEvent(type: string, value: unknown, refreshNow = true): void {
    const summary = eventSummary(type, value);
    eventJournal.push(summary);
    if (eventJournal.length > 120) eventJournal = eventJournal.slice(-120);
    if (refreshNow) queueRefresh();
  }

  function startFrameLoop(durationMs: number): void {
    if (framesPaused || liveEngine() === null) return;
    frameLoop?.request(durationMs);
  }

  function publishNow(action: string): void {
    const next = requireEngine();
    publishEngineFrame(next);
    lastAction = action;
    startFrameLoop(350);
  }

  function publishEngineFrame(
    next: PatchMap,
  ): void {
    if (next !== liveEngine()) {
      throw new Error('PatchMap frame loop target no longer owns the active engine');
    }
    frameLoop?.publishNow();
  }

  function installResizeObserver(): void {
    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0;
        const next = liveEngine();
        if (next === null) return;
        const size = surfaceSize(canvasFrame);
        if (size.width <= 0 || size.height <= 0) return;
        next.resize(size.width, size.height, Math.min(2, window.devicePixelRatio || 1));
        startFrameLoop(350);
      });
    });
    resizeObserver.observe(canvasFrame);
  }

  function installPerformanceObserver(): void {
    if (!('PerformanceObserver' in window)) return;
    try {
      performanceObserver = new PerformanceObserver((list) => {
        longTaskCount += list.getEntries().length;
        queueRefresh();
      });
      performanceObserver.observe({ type: 'longtask', buffered: true });
    } catch {
      performanceObserver = null;
    }
  }

  function drawMarquee(
    start: readonly [number, number],
    end: readonly [number, number],
  ): void {
    const marquee = required<HTMLElement>(host, '[data-manual-marquee]');
    const canvas = requireEngine().canvasHandle().element;
    const canvasRect = canvas.getBoundingClientRect();
    const frameRect = canvasFrame.getBoundingClientRect();
    const left = Math.min(start[0], end[0]) + canvasRect.left - frameRect.left;
    const top = Math.min(start[1], end[1]) + canvasRect.top - frameRect.top;
    marquee.style.left = `${left}px`;
    marquee.style.top = `${top}px`;
    marquee.style.width = `${Math.abs(end[0] - start[0])}px`;
    marquee.style.height = `${Math.abs(end[1] - start[1])}px`;
    marquee.dataset.kind = 'box';
    marquee.hidden = false;
  }

  function drawPaintTrail(gesture: ManualPointerGesture): void {
    const last = gesture.segments.at(-1)?.[1] ?? gesture.startScreen;
    const half = 12;
    drawMarquee(
      [last[0] - half, last[1] - half],
      [last[0] + half, last[1] + half],
    );
    required<HTMLElement>(host, '[data-manual-marquee]').dataset.kind = 'paint';
  }

  function hideMarquee(): void {
    required<HTMLElement>(host, '[data-manual-marquee]').hidden = true;
  }

  function showTooltip(targetId: string | null, clientX: number, clientY: number): void {
    const tooltip = required<HTMLElement>(host, '[data-manual-tooltip]');
    if (targetId === null) {
      tooltip.hidden = true;
      return;
    }
    const frameRect = canvasFrame.getBoundingClientRect();
    tooltip.textContent = targetId;
    tooltip.style.left = `${clientX - frameRect.left + 14}px`;
    tooltip.style.top = `${clientY - frameRect.top + 14}px`;
    tooltip.hidden = false;
  }

  function clearTooltip(): void {
    required<HTMLElement>(host, '[data-manual-tooltip]').hidden = true;
  }

  function zoomAtCenter(factor: number): unknown {
    const next = requireEngine();
    const snapshot = next.snapshot();
    const [width, height] = snapshot.resources.canvas.cssSize;
    const result = next.zoomViewportAt({
      factor,
      anchorCss: [width / 2, height / 2],
      source: 'programmatic',
    });
    publishNow(factor > 1 ? 'zoom in' : 'zoom out');
    return result;
  }

  function rotateWorld(delta: number): unknown {
    const next = requireEngine();
    const world = next.viewportTransformProbe().world;
    const result = next.setWorldTransform({
      rotationDegrees: world.rotationDegrees + delta,
      flipX: world.flipX,
      flipY: world.flipY,
    });
    publishNow('rotate world');
    return result;
  }

  function flipWorld(axis: 'x' | 'y'): unknown {
    const next = requireEngine();
    const world = next.viewportTransformProbe().world;
    const result = next.setWorldTransform({
      rotationDegrees: world.rotationDegrees,
      flipX: axis === 'x' ? !world.flipX : world.flipX,
      flipY: axis === 'y' ? !world.flipY : world.flipY,
    });
    publishNow(`flip ${axis}`);
    return result;
  }

  function accessibilityTarget(): string {
    const value = required<HTMLInputElement>(host, '[data-manual-accessibility-target]')
      .value.trim();
    return value || requireEngine().snapshot().selectionIds[0] || 'manual-rect-a';
  }

  function selectedIdsOrDefault(next: PatchMap): readonly string[] {
    const selected = next.snapshot().selectionIds;
    if (selected.length > 0) return selected;
    next.select(['manual-rect-a']);
    return ['manual-rect-a'];
  }

  function selectedElementIds(next: PatchMap): readonly string[] {
    return selectedIdsOrDefault(next).filter((id) => !id.includes('::'));
  }

  function stateSnapshot(): PatchMapManualLabState {
    const next = liveEngine();
    const animations = activeAnimationCount(next);
    if (next === null) {
      lastSnapshot = null;
    } else if (animations === 0) {
      lastSnapshot = next.snapshot();
    }
    const snapshot = lastSnapshot;
    const history = next?.historyState() ?? { undoDepth: 0, redoDepth: 0 };
    return Object.freeze({
      caseId: options.caseId,
      sceneSize: manualSceneSize,
      status,
      generation,
      mode,
      selectedIds: next?.selectionIds ?? snapshot?.selectionIds ?? Object.freeze([]),
      history: Object.freeze({
        undoDepth: history.undoDepth,
        redoDepth: history.redoDepth,
      }),
      activeAnimations: animations,
      canvasCount: snapshot?.resources.canvasCount ?? 0,
      lastAction,
      error: lastError,
    });
  }

  function requireEngine(): PatchMap {
    const next = liveEngine();
    if (next === null) {
      throw new Error('PatchMap 직접 조작 세션이 종료되었습니다. ‘다시 초기화’를 누르세요.');
    }
    return next;
  }

  function liveEngine(): PatchMap | null {
    if (engine === null) return null;
    return engine.destroyed ? null : engine;
  }

  function activeAnimationCount(next: PatchMap | null): number {
    return next?.activeAnimations ?? 0;
  }

  async function destroyEngine(): Promise<void> {
    canvasAbortController?.abort();
    canvasAbortController = null;
    resizeObserver?.disconnect();
    resizeObserver = null;
    cancelAnimationFrame(refreshFrame);
    cancelAnimationFrame(resizeFrame);
    refreshFrame = 0;
    resizeFrame = 0;
    frameLoop?.destroy();
    frameLoop = null;
    activePointer = null;
    panPointerId = null;
    hideMarquee();
    await releaseAllAssets();
    for (const unbind of engineUnbinds.splice(0)) unbind();
    const previous = engine;
    engine = null;
    lastSnapshot = null;
    if (previous !== null) await previous.destroy();
    surfaceHost.replaceChildren();
  }

  async function destroy(): Promise<void> {
    if (destroyed) return;
    destroyed = true;
    abortController.abort();
    performanceObserver?.disconnect();
    performanceObserver = null;
    await destroyEngine();
    status = 'destroyed';
    if (window.__PATCH_MAP_MANUAL_LAB__ === bridge) {
      delete window.__PATCH_MAP_MANUAL_LAB__;
    }
    refresh();
  }

  function fail(error: unknown): void {
    lastError = errorMessage(error);
    lastAction = 'failed';
    status = 'failed';
    setMessage(`오류 · ${lastError}`);
  }

  function actionDisplay(value: string): string {
    const label = host.querySelector<HTMLElement>(
      `[data-manual-command="${value}"] [data-manual-command-label]`,
    )?.textContent?.trim();
    return label && label.length > 0 ? label : manualActionDisplay(value);
  }

  function setMessage(value: string): void {
    required<HTMLElement>(host, '[data-manual-message]').textContent = value;
  }

  function syncDisabledState(offline: boolean): void {
    for (const button of host.querySelectorAll<HTMLButtonElement>('[data-manual-command]')) {
      const command = button.dataset.manualCommand;
      button.disabled = offline && command !== 'reinitialize-session';
    }
    for (const button of host.querySelectorAll<HTMLButtonElement>('[data-manual-mode]')) {
      button.disabled = offline;
    }
  }

  function showAdvancedResult(value: unknown): void {
    required<HTMLElement>(host, '[data-manual-advanced-output]').textContent =
      JSON.stringify(value, null, 2);
  }

  function numberInput(name: string, fallback: number): number {
    const value = Number(required<HTMLInputElement>(host, `[data-manual-${name}]`).value);
    return Number.isFinite(value) ? value : fallback;
  }

  function nudgeAmount(): number {
    return numberInput('nudge-amount', 10);
  }

  function resizeAmount(): number {
    return numberInput('resize-amount', 16);
  }

  function angleAmount(): number {
    return numberInput('angle-amount', 15);
  }

  function manualAnimationDuration(): number {
    const durationMs = numberInput(
      'animation-duration',
      defaultManualAnimationDuration(options.caseId),
    );
    if (
      !Number.isSafeInteger(durationMs) ||
      durationMs < 0 ||
      durationMs > 60_000
    ) {
      throw new RangeError('막대 애니메이션 시간은 0~60,000ms 정수여야 합니다.');
    }
    return durationMs;
  }

  function selectedManualSceneSize(): PatchMapManualSceneSize {
    return requireManualSceneSize(
      required<HTMLSelectElement>(host, '[data-manual-scene-size]').value,
    );
  }
}


function requireManualSceneSize(value: string): PatchMapManualSceneSize {
  if (!isPatchMapManualSceneSize(value)) {
    throw new RangeError(`지원하지 않는 직접 조작 예제 크기입니다: ${value}`);
  }
  return value;
}


function historySummary(engine: PatchMap): string {
  const inspection = engine.historyInspection();
  if (inspection.commands.length === 0) {
    return `기록 없음 · 최대 ${inspection.state.capacity}개`;
  }
  return [
    `최대 기록 ${inspection.state.capacity}개`,
    ...inspection.commands.map((command, index) =>
      `${index < inspection.state.undoDepth ? '취소 가능' : '재실행 가능'}  ${command.id}  ×${command.recordCount}`),
  ].join('\n');
}

function eventSummary(
  type: string,
  value: unknown,
): Readonly<Record<string, unknown>> {
  const record = isRecord(value) ? value : {};
  const revisions = isRecord(record.revisions) ? record.revisions : null;
  return Object.freeze({
    '시각(ms)': Math.round(performance.now()),
    '이벤트': manualEventLabel(type),
    ...(typeof record.status === 'string'
      ? { '상태': patchMapKoreanStatus(record.status) }
      : {}),
    ...(typeof record.direction === 'string'
      ? { '방향': record.direction === 'undo' ? '실행 취소' : record.direction === 'redo' ? '다시 실행' : record.direction }
      : {}),
    ...(revisions !== null && typeof revisions.sceneRevision === 'number'
      ? { '장면 리비전': revisions.sceneRevision }
      : {}),
    ...(Array.isArray(record.current) ? { '선택': record.current } : {}),
    ...(typeof record.code === 'string' ? { '코드': record.code } : {}),
  });
}

function manualEventLabel(type: string): string {
  const labels: Readonly<Record<string, string>> = {
    sceneCommitted: '장면 반영',
    frame: '프레임 게시',
    viewChanged: '화면 변경',
    viewSettled: '화면 이동 완료',
    selectionChanged: '선택 변경',
    change: '제품 상태 변경',
    targetDestroyed: '대상 제거',
    historyUndone: '히스토리 실행 취소',
    historyRedone: '히스토리 다시 실행',
    historyVisible: '히스토리 표시',
    historyCleared: '히스토리 비움',
    diagnostic: '진단',
    documentVisibilityChanged: '페이지 표시 상태 변경',
  };
  return labels[type] ?? type;
}

function surfaceSize(frame: HTMLElement): Readonly<{ width: number; height: number }> {
  return Object.freeze({
    width: Math.max(480, Math.round(frame.clientWidth || 900)),
    height: Math.max(420, Math.round(frame.clientHeight || 560)),
  });
}

function isManualToolGroup(value: unknown): value is PatchMapManualToolGroup {
  return typeof value === 'string' && Object.hasOwn(PATCH_MAP_MANUAL_TOOL_LABELS, value);
}

function required<T extends Element>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (element === null) throw new Error(`Missing PatchMap manual Lab element: ${selector}`);
  return element;
}

function setText(root: ParentNode, key: string, value: string): void {
  const target = root.querySelector<HTMLElement>(`[data-manual-readout="${key}"]`);
  if (target !== null) target.textContent = value;
}

function summarize(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function fingerprint(input: unknown): string {
  const value = JSON.stringify(input);
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${value.length}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}


function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isEditableTarget(value: EventTarget | null): boolean {
  if (!(value instanceof HTMLElement)) return false;
  return value.matches('input, textarea, select, [contenteditable="true"]') ||
    value.closest('[contenteditable="true"]') !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
