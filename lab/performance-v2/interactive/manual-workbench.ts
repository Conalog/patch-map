import {
  CoreV2Engine,
  type CoreV2EngineHistoryResult,
} from '../../../src/core-v2/engine';
import type { CoreV2AssetAcquisition } from '../../../src/core-v2/assets';
import type { CoreV2ContractPresenterDescriptor } from '../contract/presenters';
import {
  CORE_V2_MANUAL_ACTION_COUNT,
  CORE_V2_MANUAL_CASE_COUNT,
  CORE_V2_MANUAL_TOOL_LABELS,
  selectCoreV2ManualCase,
  type CoreV2ManualToolGroup,
} from './manual-case-catalog';
import {
  buildCoreV2ManualScene,
  type CoreV2ManualScene,
} from './manual-scene';

type ManualPointerMode =
  | 'select'
  | 'box'
  | 'paint'
  | 'move'
  | 'resize'
  | 'rotate'
  | 'pan';

interface ManualPointerGesture {
  readonly pointerId: number;
  readonly kind: 'box' | 'paint' | 'transform';
  readonly startScreen: readonly [number, number];
  readonly startWorld: readonly [number, number];
  readonly selectionBefore: readonly string[];
  readonly transformKind?: 'move' | 'resize' | 'rotate';
  readonly resizeHandle?: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 'e' | 's' | 'w';
  readonly rotationCenterScreen?: readonly [number, number];
  readonly rotationStartDegrees?: number;
  segments: Array<readonly [
    readonly [number, number],
    readonly [number, number],
  ]>;
  moved: boolean;
}

export interface CoreV2ManualLabState {
  readonly caseId: string;
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

export interface CoreV2ManualLabBridge {
  readonly ready: Promise<void>;
  state(): CoreV2ManualLabState;
  engine(): CoreV2Engine | null;
  run(command: string): Promise<unknown>;
  destroy(): Promise<void>;
}

export interface CoreV2ManualLabMountOptions {
  readonly caseId: string;
  readonly title: string;
  readonly size: string;
  readonly seed: number;
}

declare global {
  interface Window {
    __PATCH_MAP_CORE_V2_MANUAL_LAB__?: CoreV2ManualLabBridge;
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

export function renderCoreV2ManualWorkbench(
  presenter: CoreV2ContractPresenterDescriptor,
): string {
  const descriptor = selectCoreV2ManualCase(presenter.caseId);
  const toolButtons = descriptor.tools.map((tool, index) =>
    `<button type="button" data-manual-tool-button="${tool}"${index === 0 ? ' aria-pressed="true"' : ' aria-pressed="false"'}>${escapeHtml(CORE_V2_MANUAL_TOOL_LABELS[tool])}</button>`,
  ).join('');
  const tasks = descriptor.tasks.map((task) => `<li>${escapeHtml(task)}</li>`).join('');
  const actions = descriptor.actions.map((action) =>
    `<li data-manual-approved-action="${escapeHtml(action.type)}"><span>${String(action.index + 1).padStart(2, '0')}</span><div><strong>${escapeHtml(action.label)}</strong><p>${escapeHtml(action.instruction)}</p></div><button type="button" data-manual-focus-tool="${action.group}">Open ${escapeHtml(CORE_V2_MANUAL_TOOL_LABELS[action.group])}</button></li>`,
  ).join('');

  return `<section class="manual-workbench" data-testid="manual-workbench" data-manual-status="booting" data-manual-case="${escapeHtml(presenter.caseId)}">
    <header class="manual-workbench-header">
      <div>
        <span class="contract-kicker">Human-operated product Lab</span>
        <h2>Keep the engine alive. Try every action yourself.</h2>
        <p>This is a persistent PixiJS WebGL session. The exact evidence runner remains separate below.</p>
      </div>
      <div class="manual-coverage-stamp">
        <strong>${CORE_V2_MANUAL_CASE_COUNT}/173</strong>
        <span>cases mapped</span>
        <small>${CORE_V2_MANUAL_ACTION_COUNT}/646 actions</small>
      </div>
    </header>
    <section class="manual-case-guide" aria-labelledby="manual-case-guide-title">
      <div>
        <span class="manual-case-id">${escapeHtml(descriptor.caseId)}</span>
        <h3 id="manual-case-guide-title">${escapeHtml(descriptor.title)}</h3>
      </div>
      <ol>${tasks}</ol>
    </section>
    <div class="manual-stage-layout">
      <section class="manual-stage-column">
        <div class="manual-mode-bar" role="toolbar" aria-label="Canvas interaction tools">
          ${modeButton('select', 'Select', 'V')}
          ${modeButton('box', 'Box', 'B')}
          ${modeButton('paint', 'Paint', 'P')}
          ${modeButton('move', 'Move', 'M')}
          ${modeButton('resize', 'Resize', 'R')}
          ${modeButton('rotate', 'Rotate', 'O')}
          ${modeButton('pan', 'Pan', 'H')}
          <span class="manual-mode-help" data-testid="manual-mode-help">Click objects; Shift toggles selection.</span>
        </div>
        <div class="manual-canvas-frame" data-testid="manual-canvas-frame">
          <div class="manual-canvas-host" data-testid="manual-canvas-host" tabindex="0" aria-label="Persistent Core v2 interactive canvas"></div>
          <div class="manual-selection-marquee" data-manual-marquee hidden></div>
          <div class="manual-canvas-tooltip" data-manual-tooltip hidden></div>
          <div class="manual-canvas-loading" data-manual-loading>Starting PixiJS WebGL…</div>
        </div>
        <div class="manual-live-strip" aria-live="polite">
          <div><span>Status</span><strong data-manual-readout="status">BOOTING</strong></div>
          <div><span>Selection</span><strong data-manual-readout="selection-count">0</strong></div>
          <div><span>Undo / redo</span><strong data-manual-readout="history">0 / 0</strong></div>
          <div><span>Animations</span><strong data-manual-readout="animations">0</strong></div>
          <div><span>Frame</span><strong data-manual-readout="frame">0</strong></div>
          <div><span>FPS / max gap</span><strong data-manual-readout="fps">—</strong></div>
          <div><span>Canvas</span><strong data-manual-readout="canvas">0</strong></div>
          <div><span>Last action</span><strong data-manual-readout="last-action">boot</strong></div>
        </div>
        <p class="manual-status-message" data-manual-message>Creating the persistent manual session…</p>
      </section>
      <aside class="manual-controls-column">
        <nav class="manual-tool-tabs" aria-label="Manual product controls">${toolButtons}</nav>
        <div class="manual-tool-panels">
          ${renderSelectionPanel()}
          ${renderTransformPanel()}
          ${renderHistoryPanel()}
          ${renderViewPanel()}
          ${renderAnimationPanel()}
          ${renderDataPanel()}
          ${renderAuthoringPanel()}
          ${renderAssetsPanel()}
          ${renderLifecyclePanel()}
          ${renderAccessibilityPanel()}
          ${renderDiagnosticsPanel()}
        </div>
      </aside>
    </div>
    <details class="manual-approved-actions">
      <summary><span>Approved action map</span><strong>${descriptor.actions.length}/${descriptor.actions.length} operable steps</strong></summary>
      <p>These controls are expected-blind: they call the public product engine and never read normalized expected evidence.</p>
      <ol>${actions}</ol>
    </details>
  </section>`;
}

export function mountCoreV2ManualWorkbench(
  root: HTMLElement,
  options: CoreV2ManualLabMountOptions,
): CoreV2ManualLabBridge {
  const host = required<HTMLElement>(root, '[data-testid="manual-workbench"]');
  const surfaceHost = required<HTMLElement>(host, '[data-testid="manual-canvas-host"]');
  const canvasFrame = required<HTMLElement>(host, '[data-testid="manual-canvas-frame"]');
  const descriptor = selectCoreV2ManualCase(options.caseId);
  const abortController = new AbortController();
  const { signal } = abortController;
  let engine: CoreV2Engine | null = null;
  let scene: CoreV2ManualScene = buildCoreV2ManualScene(options.size, options.seed);
  let status: CoreV2ManualLabState['status'] = 'booting';
  let generation = 0;
  let mode: ManualPointerMode = 'select';
  let lastAction = 'boot';
  let lastError: string | null = null;
  let actionSequence = 0;
  let animationSequence = 0;
  let activePointer: ManualPointerGesture | null = null;
  let canvasAbortController: AbortController | null = null;
  let resizeFrame = 0;
  let renderFrame = 0;
  let refreshFrame = 0;
  let monitorUntil = 0;
  let framesPaused = false;
  let savedViewport: ReturnType<CoreV2Engine['serializeViewport']> | null = null;
  let lifecycleClock = 0;
  let frameClock = 0;
  let longTaskCount = 0;
  let eventJournal: Array<Readonly<Record<string, unknown>>> = [];
  let frameTimes: number[] = [];
  let assetLeases: CoreV2AssetAcquisition[] = [];
  let engineUnbinds: Array<() => void> = [];
  let resizeObserver: ResizeObserver | null = null;
  let performanceObserver: PerformanceObserver | null = null;
  let destroyed = false;

  const ready = boot();
  void ready.catch(() => undefined);

  bindStaticControls();
  activateTool(descriptor.tools[0] ?? 'diagnostics');
  installPerformanceObserver();

  const bridge: CoreV2ManualLabBridge = Object.freeze({
    ready,
    state: stateSnapshot,
    engine: () => liveEngine(),
    run: runCommand,
    destroy,
  });
  window.__PATCH_MAP_CORE_V2_MANUAL_LAB__ = bridge;
  window.addEventListener('pagehide', () => {
    void destroy().catch(() => undefined);
  }, { signal });

  return bridge;

  async function boot(): Promise<void> {
    try {
      await createSession(true);
      status = 'ready';
      setMessage(
        `${options.caseId} is live. Select, transform, undo, animate, edit JSON, destroy, and re-init as often as you like.`,
      );
    } catch (error) {
      fail(error);
      throw error;
    } finally {
      refresh();
    }
  }

  async function createSession(loadScene: boolean): Promise<CoreV2Engine> {
    status = 'busy';
    await destroyEngine();
    surfaceHost.replaceChildren();
    const size = surfaceSize(canvasFrame);
    const next = new CoreV2Engine({ historyLimit: 100 });
    generation += 1;
    await next.initialize({
      instanceId: `manual-${options.caseId.toLowerCase()}-${generation}`,
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
    });
    engine = next;
    bindEngine(next);
    if (loadScene) {
      loadManualScene(next, scene);
      next.fitViewport({ paddingCssPx: 46 });
      publishEngineFrame(next, performance.now());
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
    const modeByKey: Readonly<Record<string, ManualPointerMode>> = {
      v: 'select',
      b: 'box',
      p: 'paint',
      m: 'move',
      r: 'resize',
      o: 'rotate',
      h: 'pan',
    };
    const shortcutMode = modeByKey[key];
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
        publishEngineFrame(next, performance.now());
        lastAction = 'transform cancelled by Escape';
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
        lastAction = `keyboard nudge ${key}`;
        startFrameLoop(500);
        refresh();
      } catch (error) {
        fail(error);
        refresh();
      }
    }
  }

  function bindEngine(next: CoreV2Engine): void {
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
      throw new Error('Core v2 manual Lab event binding drift');
    }
  }

  function bindCanvas(next: CoreV2Engine): void {
    canvasAbortController?.abort();
    canvasAbortController = new AbortController();
    const canvasSignal = canvasAbortController.signal;
    const canvas = next.canvasHandle().element;
    canvas.dataset.manualCoreV2Canvas = 'true';
    canvas.setAttribute('aria-label', 'Core v2 manual interaction surface');
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

  function onPointerDown(event: PointerEvent, next: CoreV2Engine): void {
    if (event.button !== 0 || activePointer !== null) return;
    const canvas = next.canvasHandle().element;
    const screen = canvasPoint(event, canvas);
    const world = next.screenToWorld({ x: screen[0], y: screen[1] });
    const selectionBefore = next.snapshot().selectionIds;
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

  function onPointerMove(event: PointerEvent, next: CoreV2Engine): void {
    const canvas = next.canvasHandle().element;
    const screen = canvasPoint(event, canvas);
    const world = next.screenToWorld({ x: screen[0], y: screen[1] });
    setText(host, 'pointer', `${screen[0].toFixed(0)}, ${screen[1].toFixed(0)} → ${world.x.toFixed(1)}, ${world.y.toFixed(1)}`);
    const gesture = activePointer;
    if (gesture === null || gesture.pointerId !== event.pointerId) {
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

  function onPointerUp(event: PointerEvent, next: CoreV2Engine): void {
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
      } else if (gesture.kind === 'paint' && mode === 'select' && !gesture.moved) {
        const hit = next.selectionHitTestScreen({ x: screen[0], y: screen[1] });
        if (event.shiftKey) {
          const target = hit.target?.selectionId ?? null;
          const selected = target === null
            ? gesture.selectionBefore
            : toggleValue(gesture.selectionBefore, target);
          next.applySelection({ op: 'replace', ids: selected, source: 'canvas' });
        }
      } else if (
        gesture.kind === 'transform' &&
        next.transformerEditProbe().activeSessionCount > 0
      ) {
        next.completeTransformerEdit(event.pointerId);
      }
      lastAction = gesture.kind === 'transform'
        ? `${gesture.transformKind ?? 'transform'} gesture`
        : `${gesture.kind} selection`;
      publishEngineFrame(next, performance.now());
    } finally {
      activePointer = null;
      hideMarquee();
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      startFrameLoop(600);
      refresh();
    }
  }

  function onPointerCancel(event: PointerEvent, next: CoreV2Engine): void {
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
    lastAction = 'gesture cancelled';
    publishEngineFrame(next, performance.now());
    refresh();
  }

  async function runCommand(command: string): Promise<unknown> {
    if (destroyed) throw new Error('Core v2 manual Lab is destroyed');
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
        case 'random-text':
          result = randomizeTexts();
          break;
        case 'frames-toggle':
          framesPaused = !framesPaused;
          if (!framesPaused) startFrameLoop(800);
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
        case 'scene-regenerate':
          scene = buildCoreV2ManualScene(options.size, (options.seed + ++actionSequence) >>> 0);
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
          result = 'invalid duplicate fixture staged';
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
        case 'page-hide':
          lifecycleClock = Math.max(lifecycleClock + 1, performance.now());
          result = requireEngine().setDocumentVisibility({
            state: 'hidden',
            timeMs: lifecycleClock,
          });
          break;
        case 'page-show':
          lifecycleClock = Math.max(lifecycleClock + 1, performance.now());
          result = requireEngine().setDocumentVisibility({
            state: 'visible',
            timeMs: lifecycleClock,
          });
          publishNow('page visible');
          break;
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
          throw new Error(`Unknown Core v2 manual command: ${command}`);
      }
      lastAction = command;
      status = liveEngine() === null ? 'destroyed' : 'ready';
      if (liveEngine() !== null) {
        refreshSelectionVisual(requireEngine());
        startFrameLoop(500);
      }
      setMessage(`${humanize(command)} completed. Keep interacting or repeat it.`);
      return result;
    } catch (error) {
      fail(error);
      throw error;
    } finally {
      refresh();
    }
  }

  function activateTool(tool: CoreV2ManualToolGroup): void {
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
        state: mode === 'pan'
          ? 'pan'
          : mode === 'move' || mode === 'resize' || mode === 'rotate'
            ? 'transform'
            : mode === 'paint'
              ? 'relation-paint'
              : 'select',
      });
      live.configureViewportPolicy({
        op: mode === 'pan' ? 'start' : 'stop',
        policy: 'pan',
      });
      refreshSelectionVisual(live);
      live.canvasHandle().element.style.cursor = cursorForMode(mode);
    }
    const help = {
      select: 'Click objects; Shift toggles selection.',
      box: 'Drag a selection box; Shift adds.',
      paint: 'Scrub across objects; Shift adds.',
      move: 'Drag selected objects; Shift locks axis.',
      resize: 'Drag any selection handle; Shift locks ratio.',
      rotate: 'Drag the rotate handle; Shift snaps 15°.',
      pan: 'Drag the canvas and wheel to zoom.',
    } satisfies Record<ManualPointerMode, string>;
    setText(host, 'mode-help', help[mode]);
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

  function historyAction(direction: 'undo' | 'redo'): CoreV2EngineHistoryResult {
    const next = requireEngine();
    return direction === 'undo' ? next.undo() : next.redo();
  }

  function animateBars(scope: 'all' | 'partial' | 'selected'): unknown {
    const next = requireEngine();
    animationSequence += 1;
    const selected = new Set(next.snapshot().selectionIds);
    let targets = scene.barTargets;
    if (scope === 'partial') {
      targets = targets.filter((_, index) => index % 10 === animationSequence % 10);
    } else if (scope === 'selected') {
      targets = targets.filter(({ ownerId }) => selected.has(ownerId));
      if (targets.length === 0) targets = scene.barTargets.slice(0, 1);
    }
    const operations = targets.map(({ ownerId, componentId }, index) => ({
      op: 'merge' as const,
      target: { kind: 'component' as const, ownerId, id: componentId },
      changes: [{
        path: ['size', 'height'] as const,
        value: 8 + ((index * 17 + animationSequence * 23) % 52),
      }],
    }));
    const result = next.transact({
      strict: true,
      actionId: `manual-bars-${scope}-${animationSequence}`,
      operations,
    });
    startFrameLoop(1_200);
    return result;
  }

  function randomizeTexts(): unknown {
    const next = requireEngine();
    animationSequence += 1;
    const operations = scene.textTargets
      .filter((_, index) => index % 4 === animationSequence % 4)
      .map(({ ownerId, componentId }, index) => ({
        op: 'merge' as const,
        target: { kind: 'component' as const, ownerId, id: componentId },
        changes: [{
          path: ['text'] as const,
          value: `${ownerId.slice(5)}:${animationSequence}:${index}`,
        }],
      }));
    return next.transact({
      strict: true,
      actionId: `manual-text-${animationSequence}`,
      operations,
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
    setText(host, 'immutability', before === after ? 'PASS' : 'FAIL');
    publishEngineFrame(next, performance.now());
    return result;
  }

  function loadManualScene(next: CoreV2Engine, nextScene: CoreV2ManualScene): unknown {
    const before = fingerprint(nextScene.dataset);
    const result = next.loadDataset(nextScene.dataset, {
      datasetRef: `manual:${options.caseId}:${options.size}:${options.seed}`,
    });
    const after = fingerprint(nextScene.dataset);
    setText(host, 'immutability', before === after ? 'PASS' : 'FAIL');
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
    publishEngineFrame(next, performance.now());
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
    switch (method) {
      case 'author':
        return next.author(input);
      case 'patch': {
        const record = requireRecord(input, 'patch input');
        return next.patch(
          record.target as Parameters<CoreV2Engine['patch']>[0],
          record.patch,
        );
      }
      case 'transact':
        return next.transact(input as Parameters<CoreV2Engine['transact']>[0]);
      case 'selection':
        return next.applySelection(
          input as Parameters<CoreV2Engine['applySelection']>[0],
        );
      case 'viewport':
        return next.setViewport(input as Parameters<CoreV2Engine['setViewport']>[0]);
      case 'world-transform':
        return next.setWorldTransform(
          input as Parameters<CoreV2Engine['setWorldTransform']>[0],
        );
      case 'history-companion':
        return next.setHistoryCompanion(
          input as Parameters<CoreV2Engine['setHistoryCompanion']>[0],
        );
      case 'live-overlay':
        return next.applyLiveOverlay(
          input as Parameters<CoreV2Engine['applyLiveOverlay']>[0],
        );
      case 'viewport-policy':
        return next.configureViewportPolicy(
          input as Parameters<CoreV2Engine['configureViewportPolicy']>[0],
        );
      default:
        throw new Error(`Unsupported advanced operation: ${method}`);
    }
  }

  function refresh(): void {
    const next = liveEngine();
    host.dataset.manualStatus = status;
    setText(host, 'status', status.toUpperCase());
    setText(host, 'last-action', lastAction);
    const selectedIds = next?.snapshot().selectionIds ?? [];
    const history = next?.historyState() ?? { undoDepth: 0, redoDepth: 0 };
    const snapshot = next?.snapshot() ?? null;
    const animations = next?.semanticProbe().interaction.activeAnimationCount ?? 0;
    setText(host, 'selection-count', String(selectedIds.length));
    setText(host, 'selection-ids', selectedIds.length === 0 ? 'none' : selectedIds.join('\n'));
    setText(host, 'history', `${history.undoDepth} / ${history.redoDepth}`);
    setText(host, 'animations', String(animations));
    setText(host, 'frame', String(snapshot?.frameRevision ?? 0));
    setText(host, 'canvas', String(snapshot?.resources.canvasCount ?? 0));
    setText(host, 'generation', String(generation));
    setText(
      host,
      'viewport',
      snapshot === null
        ? 'offline'
        : `${snapshot.viewport.scale.toFixed(3)}× @ ${snapshot.viewport.centerWorld.map((value) => value.toFixed(1)).join(', ')}`,
    );
    setText(
      host,
      'history-stack',
      next === null ? 'offline' : historySummary(next),
    );
    setText(host, 'asset-state', next === null
      ? 'offline'
      : summarize(next.assetProbe('device')));
    setText(host, 'lifecycle-state', snapshot === null
      ? 'destroyed'
      : summarize({
          lifecycle: snapshot.lifecycle,
          generation: snapshot.revisions.lifecycleGeneration,
          pendingWork: snapshot.pendingWork,
          canvases: snapshot.resources.canvasCount,
          subscriptions: snapshot.resources.subscriptions.active,
        }));
    setText(host, 'event-count', String(eventJournal.length));
    required<HTMLElement>(host, '[data-manual-event-journal]').textContent =
      eventJournal.length === 0
        ? 'No events yet.'
        : eventJournal.slice(-18).map((event) => JSON.stringify(event)).join('\n');
    required<HTMLButtonElement>(host, '[data-manual-command="frames-toggle"]').textContent =
      framesPaused ? 'Resume frames' : 'Pause frames';
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

  function refreshSelectionVisual(next: CoreV2Engine): void {
    next.setSelectionVisualPolicy({
      mode: mode === 'pan' ? 'hidden' : 'all',
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
    monitorUntil = Math.max(monitorUntil, performance.now() + durationMs);
    if (renderFrame !== 0 || framesPaused || liveEngine() === null) return;
    const tick = (time: number): void => {
      renderFrame = 0;
      const next = liveEngine();
      if (next === null || framesPaused) return;
      publishEngineFrame(next, time);
      frameTimes.push(time);
      if (frameTimes.length > 120) frameTimes = frameTimes.slice(-120);
      const animations = next.semanticProbe().interaction.activeAnimationCount ?? 0;
      queueRefresh();
      if (animations > 0 || activePointer !== null || time < monitorUntil) {
        renderFrame = requestAnimationFrame(tick);
      }
    };
    renderFrame = requestAnimationFrame(tick);
  }

  function publishNow(action: string): void {
    const next = requireEngine();
    publishEngineFrame(next, performance.now());
    lastAction = action;
    startFrameLoop(350);
  }

  function publishEngineFrame(next: CoreV2Engine, timeMs: number): void {
    frameClock = Math.max(frameClock + 0.01, timeMs);
    next.publishFrame(frameClock);
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

  function selectedIdsOrDefault(next: CoreV2Engine): readonly string[] {
    const selected = next.snapshot().selectionIds;
    if (selected.length > 0) return selected;
    next.select(['manual-rect-a']);
    return ['manual-rect-a'];
  }

  function selectedElementIds(next: CoreV2Engine): readonly string[] {
    return selectedIdsOrDefault(next).filter((id) => !id.includes('::'));
  }

  function stateSnapshot(): CoreV2ManualLabState {
    const next = liveEngine();
    const snapshot = next?.snapshot() ?? null;
    const history = next?.historyState() ?? { undoDepth: 0, redoDepth: 0 };
    return Object.freeze({
      caseId: options.caseId,
      status,
      generation,
      mode,
      selectedIds: snapshot?.selectionIds ?? Object.freeze([]),
      history: Object.freeze({
        undoDepth: history.undoDepth,
        redoDepth: history.redoDepth,
      }),
      activeAnimations:
        next?.semanticProbe().interaction.activeAnimationCount ?? 0,
      canvasCount: snapshot?.resources.canvasCount ?? 0,
      lastAction,
      error: lastError,
    });
  }

  function requireEngine(): CoreV2Engine {
    const next = liveEngine();
    if (next === null) {
      throw new Error('Manual Core v2 session is offline; press Re-initialize');
    }
    return next;
  }

  function liveEngine(): CoreV2Engine | null {
    if (engine === null) return null;
    const lifecycle = engine.snapshot().lifecycle;
    return lifecycle === 'destroyed' || lifecycle === 'destroying' ? null : engine;
  }

  async function destroyEngine(): Promise<void> {
    canvasAbortController?.abort();
    canvasAbortController = null;
    resizeObserver?.disconnect();
    resizeObserver = null;
    cancelAnimationFrame(renderFrame);
    cancelAnimationFrame(refreshFrame);
    cancelAnimationFrame(resizeFrame);
    renderFrame = 0;
    refreshFrame = 0;
    resizeFrame = 0;
    activePointer = null;
    hideMarquee();
    await releaseAllAssets();
    for (const unbind of engineUnbinds.splice(0)) unbind();
    const previous = engine;
    engine = null;
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
    if (window.__PATCH_MAP_CORE_V2_MANUAL_LAB__ === bridge) {
      delete window.__PATCH_MAP_CORE_V2_MANUAL_LAB__;
    }
    refresh();
  }

  function fail(error: unknown): void {
    lastError = errorMessage(error);
    lastAction = 'failed';
    status = 'failed';
    setMessage(`ERROR · ${lastError}`);
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
}

function renderSelectionPanel(): string {
  return toolPanel('selection', 'Selection you can keep changing', `
    <p>Canvas click uses transformed hit testing. Box and Paint remain available in the mode bar.</p>
    <div class="manual-button-grid">
      ${commandButton('select-first', 'Select first')}
      ${commandButton('select-first-three', 'Select first 3')}
      ${commandButton('select-relations', 'Relation endpoints')}
      ${commandButton('selection-clear', 'Clear')}
    </div>
    <dl class="manual-mini-ledger">
      <div><dt>Selected IDs</dt><dd><pre data-manual-readout="selection-ids">none</pre></dd></div>
      <div><dt>Pointer</dt><dd data-manual-readout="pointer">move over canvas</dd></div>
    </dl>
  `);
}

function renderTransformPanel(): string {
  return toolPanel('transform', 'Move, resize, rotate, cancel', `
    <p>Select objects, then drag them with Move or their visible handles with Resize/Rotate. Escape cancels an active gesture.</p>
    <div class="manual-field-row">
      <label>Nudge <input data-manual-nudge-amount type="number" value="10" min="1" step="1"></label>
      <label>Resize <input data-manual-resize-amount type="number" value="16" min="1" step="1"></label>
      <label>Angle <input data-manual-angle-amount type="number" value="15" min="1" step="1"></label>
    </div>
    <div class="manual-nudge-pad" aria-label="Keyboard-equivalent nudge controls">
      ${commandButton('nudge-up', '↑')}
      ${commandButton('nudge-left', '←')}
      ${commandButton('nudge-down', '↓')}
      ${commandButton('nudge-right', '→')}
    </div>
    <div class="manual-button-grid">
      ${commandButton('resize-grow', 'Grow SE')}
      ${commandButton('resize-shrink', 'Shrink SE')}
      ${commandButton('rotate-left', 'Rotate −')}
      ${commandButton('rotate-right', 'Rotate +')}
    </div>
    <label class="manual-check"><input type="checkbox" data-manual-lock-ratio> Lock aspect ratio for button resize</label>
    <p class="manual-shortcut-note">Shortcuts: arrows nudge 1 px, Shift+arrow 10 px, Escape cancels.</p>
  `);
}

function renderHistoryPanel(): string {
  return toolPanel('history', 'A real stack built by your edits', `
    <div class="manual-button-grid">
      ${commandButton('undo', 'Undo · ⌘/Ctrl Z')}
      ${commandButton('redo', 'Redo · ⇧⌘/Ctrl Z')}
      ${commandButton('history-clear', 'Clear stack')}
    </div>
    <div class="manual-field-action">
      <label>Capacity <input data-manual-history-capacity type="number" value="100" min="0" max="1000" step="1"></label>
      ${commandButton('history-capacity', 'Apply')}
    </div>
    <pre class="manual-ledger-output" data-manual-readout="history-stack">empty</pre>
  `);
}

function renderViewPanel(): string {
  return toolPanel('view', 'Viewport and world transform', `
    <div class="manual-button-grid">
      ${commandButton('fit-all', 'Fit all')}
      ${commandButton('fit-selection', 'Fit selection')}
      ${commandButton('view-reset', 'Reset')}
      ${commandButton('zoom-in', 'Zoom +')}
      ${commandButton('zoom-out', 'Zoom −')}
      ${commandButton('world-rotate-left', 'World −15°')}
      ${commandButton('world-rotate-right', 'World +15°')}
      ${commandButton('world-flip-x', 'Flip X')}
      ${commandButton('world-flip-y', 'Flip Y')}
      ${commandButton('view-save', 'Save view')}
      ${commandButton('view-restore', 'Restore view')}
    </div>
    <dl class="manual-mini-ledger"><div><dt>Current</dt><dd data-manual-readout="viewport">offline</dd></div></dl>
  `);
}

function renderAnimationPanel(): string {
  return toolPanel('animation', 'Animation, text, and presentation paint', `
    <div class="manual-button-grid">
      ${commandButton('animate-all', 'Animate all bars')}
      ${commandButton('animate-partial', 'Animate 10%')}
      ${commandButton('animate-selected', 'Animate selected')}
      ${commandButton('random-text', 'Random text')}
      ${commandButton('frames-toggle', 'Pause frames')}
      ${commandButton('publish-frame', 'Publish one frame')}
    </div>
    <label class="manual-check"><input type="checkbox" data-manual-reduced-motion> Reduced motion</label>
    ${commandButton('reduced-motion', 'Apply motion policy')}
    <div class="manual-style-grid">
      <label>Fill <input data-manual-style-fill type="color" value="#ff6b35"></label>
      <label>Alpha <input data-manual-style-alpha type="number" value="0.85" min="0" max="1" step="0.05"></label>
      <label>Radius <input data-manual-style-radius type="number" value="12" min="0" step="1"></label>
    </div>
    ${commandButton('style-selected', 'Style selected')}
    <div class="manual-field-action">
      <label>Text <input data-manual-text-value value="Manual text · 직접 변경"></label>
      ${commandButton('text-selected', 'Apply text')}
    </div>
  `);
}

function renderDataPanel(): string {
  return toolPanel('data', 'Direct PATCH MAP JSON and atomic updates', `
    <div class="manual-button-grid">
      ${commandButton('scene-regenerate', 'Regenerate seeded scene')}
      ${commandButton('scene-export-json', 'Export current → editor')}
      ${commandButton('scene-invalid-json', 'Stage invalid duplicate')}
      ${commandButton('scene-load-json', 'Load editor JSON')}
    </div>
    <label class="manual-check"><input type="checkbox" data-manual-strict-load> Strict reference validation</label>
    <textarea class="manual-json-editor" data-manual-scene-json spellcheck="false" aria-label="Editable PATCH MAP JSON"></textarea>
    <dl class="manual-mini-ledger"><div><dt>Caller input immutable</dt><dd data-manual-readout="immutability">pending</dd></div></dl>
  `);
}

function renderAuthoringPanel(): string {
  return toolPanel('authoring', 'Editor actions on stable logical IDs', `
    <div class="manual-field-action">
      <label>Create
        <select data-manual-create-kind>
          <option value="rect">Rectangle</option>
          <option value="text">Text</option>
          <option value="item">Item</option>
          <option value="group">Group</option>
          <option value="grid">Grid</option>
          <option value="relations">Relations</option>
          <option value="image">Image</option>
        </select>
      </label>
      ${commandButton('create-element', 'Create at center')}
    </div>
    <div class="manual-button-grid">
      ${commandButton('duplicate-selected', 'Duplicate')}
      ${commandButton('group-selected', 'Group')}
      ${commandButton('ungroup-selected', 'Ungroup')}
      ${commandButton('front-selected', 'Bring front')}
      ${commandButton('back-selected', 'Send back')}
      ${commandButton('delete-selected', 'Delete')}
    </div>
    <div class="manual-field-action">
      <label>Align
        <select data-manual-align-axis>
          <option value="left">Left</option><option value="right">Right</option>
          <option value="top">Top</option><option value="bottom">Bottom</option>
          <option value="center-x">Center X</option><option value="center-y">Center Y</option>
        </select>
      </label>
      ${commandButton('align-selected', 'Apply')}
    </div>
    <div class="manual-field-action">
      <label>Distribute
        <select data-manual-distribute-axis>
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
        </select>
      </label>
      ${commandButton('distribute-selected', 'Apply')}
    </div>
  `);
}

function renderAssetsPanel(): string {
  return toolPanel('assets', 'Assets and extraction without replacing canvas', `
    <div class="manual-button-grid">
      ${commandButton('asset-acquire', 'Acquire built-in asset')}
      ${commandButton('asset-release', 'Release one lease')}
      ${commandButton('capture', 'Capture current scene')}
    </div>
    <pre class="manual-ledger-output" data-manual-readout="asset-state">offline</pre>
    <figure class="manual-capture-preview">
      <img data-manual-capture-image hidden alt="Captured Core v2 scene">
      <figcaption>Capture preview; the live PixiJS canvas stays above.</figcaption>
    </figure>
  `);
}

function renderLifecyclePanel(): string {
  return toolPanel('lifecycle', 'Destroy, re-init, resize, suspend', `
    <div class="manual-button-grid">
      ${commandButton('replace-session', 'Replace scene')}
      ${commandButton('destroy-session', 'Destroy session')}
      ${commandButton('reinitialize-session', 'Re-initialize')}
      ${commandButton('resize-small', 'Resize small')}
      ${commandButton('resize-large', 'Resize large')}
      ${commandButton('page-hide', 'Simulate hidden')}
      ${commandButton('page-show', 'Simulate visible')}
    </div>
    <dl class="manual-mini-ledger">
      <div><dt>Generation</dt><dd data-manual-readout="generation">0</dd></div>
      <div><dt>Lifecycle/resources</dt><dd><pre data-manual-readout="lifecycle-state">offline</pre></dd></div>
    </dl>
  `);
}

function renderAccessibilityPanel(): string {
  return toolPanel('accessibility', 'Logical tree, focus, keyboard parity', `
    <div class="manual-field-action">
      <label>Target ID <input data-manual-accessibility-target value="manual-rect-a"></label>
    </div>
    <div class="manual-button-grid">
      ${commandButton('accessibility-tree', 'Build tree')}
      ${commandButton('accessibility-focus', 'Focus target')}
      ${commandButton('accessibility-activate', 'Activate/select')}
    </div>
    <p>Tab through the renderer-owned accessibility overlay, then use Enter or Space and compare selection.</p>
  `);
}

function renderDiagnosticsPanel(): string {
  return toolPanel('diagnostics', 'Product probes, events, and advanced calls', `
    <div class="manual-field-action">
      <label>Probe
        <select data-manual-probe-select>
          <option value="snapshot">Snapshot</option>
          <option value="runtime">Runtime resources</option>
          <option value="history">History</option>
          <option value="geometry">Geometry</option>
          <option value="interaction">Interaction</option>
          <option value="accessibility">Accessibility</option>
          <option value="assets">Assets</option>
        </select>
      </label>
      ${commandButton('probe-refresh', 'Refresh')}
    </div>
    <pre class="manual-probe-output" data-manual-probe-output>Choose a probe and refresh.</pre>
    <div class="manual-diagnostic-heading">
      <strong>Event journal · <span data-manual-readout="event-count">0</span></strong>
      ${commandButton('events-clear', 'Clear')}
    </div>
    <pre class="manual-event-journal" data-manual-event-journal>No events yet.</pre>
    <details class="manual-advanced-console">
      <summary>Advanced product operation console</summary>
      <p>For case-specific semantics that do not need another bespoke UI. This dispatches only public Core v2 methods.</p>
      <select data-manual-advanced-method>
        <option value="author">author(action)</option>
        <option value="patch">patch(target, patch)</option>
        <option value="transact">transact(request)</option>
        <option value="selection">applySelection(operation)</option>
        <option value="viewport">setViewport(state)</option>
        <option value="world-transform">setWorldTransform(state)</option>
        <option value="history-companion">setHistoryCompanion(value)</option>
        <option value="live-overlay">applyLiveOverlay(input)</option>
        <option value="viewport-policy">configureViewportPolicy(operation)</option>
      </select>
      <textarea data-manual-advanced-json spellcheck="false">${escapeHtml(advancedExample('author'))}</textarea>
      ${commandButton('advanced-run', 'Run public operation')}
      <pre data-manual-advanced-output>Result appears here.</pre>
    </details>
    <dl class="manual-mini-ledger">
      <div><dt>Long tasks</dt><dd data-manual-readout="long-tasks">0</dd></div>
    </dl>
  `);
}

function toolPanel(
  group: CoreV2ManualToolGroup,
  title: string,
  content: string,
): string {
  return `<section class="manual-tool-panel" data-manual-tool-panel="${group}"${group === 'selection' ? '' : ' hidden'}>
    <span class="contract-kicker">${escapeHtml(CORE_V2_MANUAL_TOOL_LABELS[group])}</span>
    <h3>${escapeHtml(title)}</h3>
    ${content}
  </section>`;
}

function modeButton(mode: ManualPointerMode, label: string, shortcut: string): string {
  return `<button type="button" data-manual-mode="${mode}" aria-pressed="${mode === 'select'}"><span>${escapeHtml(label)}</span><kbd>${escapeHtml(shortcut)}</kbd></button>`;
}

function commandButton(command: string, label: string): string {
  return `<button type="button" data-manual-command="${escapeHtml(command)}">${escapeHtml(label)}</button>`;
}

function advancedExample(method: string): string {
  const examples: Readonly<Record<string, unknown>> = {
    author: {
      type: 'edit-position-angle',
      target: 'manual-rect-a',
      x: 80,
      y: 80,
      angleDegrees: 12,
      actionId: 'manual-console-position',
    },
    patch: {
      target: { kind: 'element', id: 'manual-text' },
      patch: { text: 'Advanced console text' },
    },
    transact: {
      strict: true,
      actionId: 'manual-console-transaction',
      operations: [{
        op: 'merge',
        target: { kind: 'element', id: 'manual-rect-b' },
        changes: [{ path: ['attrs', 'x'], value: 260 }],
      }],
    },
    selection: { op: 'replace', ids: ['manual-rect-a'], source: 'programmatic' },
    viewport: { centerWorld: [300, 200], scale: 1.2 },
    'world-transform': { rotationDegrees: 15, flipX: false, flipY: false },
    'history-companion': {
      selectedIds: ['manual-rect-a'],
      mode: 'transform',
      dirty: true,
    },
    'live-overlay': {
      sourceRevision: 1,
      payloadHash: 'manual-overlay-1',
      transaction: {
        strict: true,
        recordHistory: false,
        operations: [{
          op: 'merge',
          target: { kind: 'component', ownerId: 'node-0', id: 'label' },
          changes: [{ path: ['text'], value: 'LIVE' }],
        }],
      },
    },
    'viewport-policy': { op: 'temporary', policy: 'pan' },
  };
  return JSON.stringify(examples[method] ?? examples.author, null, 2);
}

function historySummary(engine: CoreV2Engine): string {
  const inspection = engine.historyInspection();
  if (inspection.commands.length === 0) {
    return `empty · capacity ${inspection.state.capacity}`;
  }
  return [
    `capacity ${inspection.state.capacity}`,
    ...inspection.commands.map((command, index) =>
      `${index < inspection.state.undoDepth ? 'UNDO' : 'REDO'}  ${command.id}  ×${command.recordCount}`),
  ].join('\n');
}

function eventSummary(
  type: string,
  value: unknown,
): Readonly<Record<string, unknown>> {
  const record = isRecord(value) ? value : {};
  const revisions = isRecord(record.revisions) ? record.revisions : null;
  return Object.freeze({
    at: Math.round(performance.now()),
    type,
    ...(typeof record.status === 'string' ? { status: record.status } : {}),
    ...(typeof record.direction === 'string' ? { direction: record.direction } : {}),
    ...(revisions !== null && typeof revisions.sceneRevision === 'number'
      ? { sceneRevision: revisions.sceneRevision }
      : {}),
    ...(Array.isArray(record.current) ? { selected: record.current } : {}),
    ...(typeof record.code === 'string' ? { code: record.code } : {}),
  });
}

function canvasPoint(
  event: Pick<PointerEvent | MouseEvent, 'clientX' | 'clientY'>,
  canvas: HTMLCanvasElement,
): readonly [number, number] {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const cssWidth = Number.parseFloat(canvas.style.width) || width;
  const cssHeight = Number.parseFloat(canvas.style.height) || height;
  return Object.freeze([
    (event.clientX - rect.left) * (cssWidth / width),
    (event.clientY - rect.top) * (cssHeight / height),
  ]);
}

function surfaceSize(frame: HTMLElement): Readonly<{ width: number; height: number }> {
  return Object.freeze({
    width: Math.max(480, Math.round(frame.clientWidth || 900)),
    height: Math.max(420, Math.round(frame.clientHeight || 560)),
  });
}

function toggleValue(values: readonly string[], value: string): readonly string[] {
  return values.includes(value)
    ? Object.freeze(values.filter((candidate) => candidate !== value))
    : Object.freeze([...values, value]);
}

function midpoint(
  left: readonly [number, number],
  right: readonly [number, number],
): readonly [number, number] {
  return Object.freeze([(left[0] + right[0]) / 2, (left[1] + right[1]) / 2]);
}

function angleDegrees(
  center: readonly [number, number],
  point: readonly [number, number],
): number {
  return Math.atan2(point[1] - center[1], point[0] - center[0]) * 180 / Math.PI;
}

function normalizeDeltaDegrees(value: number): number {
  let result = value % 360;
  if (result > 180) result -= 360;
  if (result < -180) result += 360;
  return result;
}

function cursorForMode(mode: ManualPointerMode): string {
  const cursors: Record<ManualPointerMode, string> = {
    select: 'default',
    box: 'crosshair',
    paint: 'cell',
    move: 'move',
    resize: 'nwse-resize',
    rotate: 'crosshair',
    pan: 'grab',
  };
  return cursors[mode];
}

function isResizeHandle(
  value: unknown,
): value is 'nw' | 'ne' | 'sw' | 'se' | 'n' | 'e' | 's' | 'w' {
  return typeof value === 'string' &&
    ['nw', 'ne', 'sw', 'se', 'n', 'e', 's', 'w'].includes(value);
}

function isManualPointerMode(value: unknown): value is ManualPointerMode {
  return typeof value === 'string' &&
    ['select', 'box', 'paint', 'move', 'resize', 'rotate', 'pan'].includes(value);
}

function isManualToolGroup(value: unknown): value is CoreV2ManualToolGroup {
  return typeof value === 'string' && Object.hasOwn(CORE_V2_MANUAL_TOOL_LABELS, value);
}

function required<T extends Element>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (element === null) throw new Error(`Missing Core v2 manual Lab element: ${selector}`);
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

function humanize(value: string): string {
  return value.split('-').map((part) =>
    `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`).join(' ');
}

function requireRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
  return value;
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

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
