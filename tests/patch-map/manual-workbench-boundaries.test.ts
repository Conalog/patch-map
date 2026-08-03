import { describe, expect, it } from 'vitest';

import { runPatchMapManualAdvancedAction } from '../../lab/patch-map/interactive/manual-workbench-actions';
import {
  createPatchMapManualOperationQueue,
  patchMapManualKeyboardMutationAllowed,
  releasePatchMapManualOwnedResources,
  settlePatchMapManualCleanup,
} from '../../lab/patch-map/interactive/manual-workbench-cleanup';
import {
  PatchMapManualPointerController,
  type PatchMapManualPointerOutcome,
} from '../../lab/patch-map/interactive/manual-pointer-controller';
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
  manualModeTitleHelp,
  midpoint,
  normalizeDeltaDegrees,
  selectionVisualModeForManualMode,
  viewportPanOperationForManualMode,
  type ManualPointerMode,
} from '../../lab/patch-map/interactive/manual-workbench-input';
import type { PatchMap } from '../../src/patch-map';

const MODES = Object.freeze([
  'select',
  'box',
  'paint',
  'move',
  'resize',
  'rotate',
  'pan',
] as const satisfies readonly ManualPointerMode[]);

describe('PatchMap manual workbench input boundary', () => {
  it('serializes Lab ownership changes and continues after a rejected operation', async () => {
    const enqueue = createPatchMapManualOperationQueue();
    const calls: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = enqueue(async () => {
      calls.push('first:start');
      await firstGate;
      calls.push('first:end');
      throw new Error('first failed');
    });
    const second = enqueue(() => {
      calls.push('second');
      return 2;
    });

    await Promise.resolve();
    expect(calls).toEqual(['first:start']);
    releaseFirst();
    await expect(first).rejects.toThrow('first failed');
    await expect(second).resolves.toBe(2);
    expect(calls).toEqual(['first:start', 'first:end', 'second']);
  });

  it('settles every engine cleanup step while preserving the first failure', async () => {
    const calls: string[] = [];
    const firstFailure = new Error('pointer cleanup failed');

    await expect(settlePatchMapManualCleanup([
      () => {
        calls.push('pointer');
        throw firstFailure;
      },
      () => {
        calls.push('frame-loop');
      },
      () => {
        calls.push('assets');
        return Promise.reject(new Error('asset cleanup failed'));
      },
      () => {
        calls.push('engine');
      },
    ])).rejects.toBe(firstFailure);

    expect(calls).toEqual(['pointer', 'frame-loop', 'assets', 'engine']);
  });

  it('retains failed ownership cleanup for retry and blocks keyboard mutations while occupied', async () => {
    const resources = ['released', 'retry'];
    let retryFailures = 1;
    const release = (resource: string): Promise<void> => {
      if (resource === 'retry' && retryFailures > 0) {
        retryFailures -= 1;
        return Promise.reject(new Error('retry cleanup'));
      }
      return Promise.resolve();
    };

    await expect(releasePatchMapManualOwnedResources(resources, release))
      .rejects.toThrow('retry cleanup');
    expect(resources).toEqual(['retry']);
    await expect(releasePatchMapManualOwnedResources(resources, release)).resolves.toBeUndefined();
    expect(resources).toEqual([]);

    expect(patchMapManualKeyboardMutationAllowed('ready', false)).toBe(true);
    expect(patchMapManualKeyboardMutationAllowed('failed', false)).toBe(true);
    expect(patchMapManualKeyboardMutationAllowed('booting', false)).toBe(false);
    expect(patchMapManualKeyboardMutationAllowed('busy', false)).toBe(false);
    expect(patchMapManualKeyboardMutationAllowed('ready', true)).toBe(false);
  });

  it('owns the exact seven keyboard modes and Korean operator copy', () => {
    expect(['v', 'b', 'p', 'm', 'r', 'o', 'h'].map(manualModeForShortcutKey))
      .toEqual(MODES);
    expect(manualModeForShortcutKey('x')).toBeUndefined();
    expect(MODES.map(manualModeLabel)).toEqual([
      '선택',
      '영역 선택',
      '붓질 선택',
      '이동',
      '크기 조절',
      '회전',
      '화면 이동',
    ]);
    for (const mode of MODES) {
      expect(manualModeTitleHelp(mode)).toMatch(/[가-힣]/u);
      expect(manualModeStatusHelp(mode)).toMatch(/[가-힣]/u);
      expect(isManualPointerMode(mode)).toBe(true);
    }
    expect(isManualPointerMode('zoom')).toBe(false);
  });

  it('maps each mode to one engine interaction, viewport, visual, and cursor policy', () => {
    expect(MODES.map(interactionModeForManualMode)).toEqual([
      'select',
      'select',
      'relation-paint',
      'transform',
      'transform',
      'transform',
      'pan',
    ]);
    expect(MODES.map(viewportPanOperationForManualMode)).toEqual([
      'stop', 'stop', 'stop', 'stop', 'stop', 'stop', 'start',
    ]);
    expect(MODES.map(selectionVisualModeForManualMode)).toEqual([
      'all', 'all', 'all', 'all', 'all', 'all', 'hidden',
    ]);
    expect(MODES.map(cursorForMode)).toEqual([
      'default', 'crosshair', 'cell', 'move', 'nwse-resize', 'crosshair', 'grab',
    ]);
  });

  it('normalizes canvas coordinates and transformer geometry without DOM writes', () => {
    const canvas = {
      getBoundingClientRect: () => ({
        left: 10,
        top: 20,
        width: 200,
        height: 100,
      }),
      style: { width: '100px', height: '50px' },
    } as unknown as Pick<HTMLCanvasElement, 'getBoundingClientRect' | 'style'>;

    const point = canvasPoint({ clientX: 110, clientY: 70 }, canvas);

    expect(point).toEqual([50, 25]);
    expect(Object.isFrozen(point)).toBe(true);
    expect(midpoint([10, 20], [30, 60])).toEqual([20, 40]);
    expect(angleDegrees([0, 0], [0, 1])).toBe(90);
    expect([190, -190, 540, -540].map(normalizeDeltaDegrees))
      .toEqual([-170, 170, 180, -180]);
    expect(isResizeHandle('nw')).toBe(true);
    expect(isResizeHandle('rotate')).toBe(false);
  });

  it('keeps one fixed canvas listener set and owns transformer escape cleanup', () => {
    const canvas = new RecordingCanvas();
    const host = manualPointerHost();
    const calls: Array<Readonly<{ method: string; value: unknown }>> = [];
    const outcomes: PatchMapManualPointerOutcome[] = [];
    let activeSessionCount = 0;
    let actionSequence = 0;
    const engine = {
      canvasHandle: () => ({ element: canvas as unknown as HTMLCanvasElement }),
      applyInteractionModeOperation: (value: unknown) => calls.push({
        method: 'applyInteractionModeOperation',
        value,
      }),
      configureViewportPolicy: (value: unknown) => calls.push({
        method: 'configureViewportPolicy',
        value,
      }),
      setSelectionVisualPolicy: (value: unknown) => calls.push({
        method: 'setSelectionVisualPolicy',
        value,
      }),
      screenToWorld: ({ x, y }: Readonly<{ x: number; y: number }>) => ({ x, y }),
      snapshot: () => ({ selectionIds: Object.freeze(['manual-rect-a']) }),
      selectionHitTestScreen: () => ({ target: { selectionId: 'manual-rect-a' } }),
      selectionVisualProbe: () => ({
        frame: { screenCorners: Object.freeze([[0, 0], [20, 0], [20, 20], [0, 20]]) },
      }),
      hitTransformerHandle: () => null,
      beginTransformerEdit: (value: unknown) => {
        activeSessionCount = 1;
        calls.push({ method: 'beginTransformerEdit', value });
      },
      transformerEditProbe: () => ({ activeSessionCount }),
      cancelTransformerEdit: (pointerId: number, reason: string) => {
        activeSessionCount = 0;
        calls.push({ method: 'cancelTransformerEdit', value: { pointerId, reason } });
      },
    } as unknown as PatchMap;
    const controller = new PatchMapManualPointerController(
      host.element,
      host.canvasFrame,
      (kind) => `manual-${kind}-${++actionSequence}`,
      (outcome) => outcomes.push(outcome),
    );

    controller.bind(engine);
    controller.activateMode('move');
    canvas.emit('pointerdown', pointerEvent({
      button: 0,
      pointerId: 7,
      clientX: 20,
      clientY: 30,
      shiftKey: false,
    }));

    expect(canvas.listenerTypes()).toEqual([
      'pointerdown',
      'pointermove',
      'pointerup',
      'pointercancel',
      'pointerleave',
      'wheel',
      'contextmenu',
    ]);
    expect(calls.find(({ method }) => method === 'beginTransformerEdit')?.value)
      .toMatchObject({
        pointerId: 7,
        actionId: 'manual-move-1',
        kind: 'move',
        handle: 'frame',
        selectionIds: ['manual-rect-a'],
      });
    expect(canvas.hasPointerCapture(7)).toBe(true);
    expect(controller.cancelActiveTransformFromEscape()).toBe(true);
    expect(calls.at(-1)).toEqual({
      method: 'cancelTransformerEdit',
      value: { pointerId: 7, reason: 'escape' },
    });
    expect(canvas.hasPointerCapture(7)).toBe(false);
    expect(outcomes).toEqual([
      { type: 'frame-request', durationMs: 800 },
      { type: 'publish-frame' },
      { type: 'action', value: 'transform-cancelled' },
      { type: 'refresh' },
    ]);

    canvas.emit('pointerdown', pointerEvent({
      button: 0,
      pointerId: 8,
      clientX: 20,
      clientY: 30,
      shiftKey: false,
    }));
    const outcomesBeforeRebind = outcomes.length;
    controller.bind(engine);
    expect(calls.at(-1)).toEqual({
      method: 'cancelTransformerEdit',
      value: { pointerId: 8, reason: 'replace' },
    });
    expect(canvas.hasPointerCapture(8)).toBe(false);
    expect(canvas.listenerTypes()).toHaveLength(7);
    expect(outcomes).toHaveLength(outcomesBeforeRebind);

    canvas.emit('pointerdown', pointerEvent({
      button: 0,
      pointerId: 9,
      clientX: 20,
      clientY: 30,
      shiftKey: false,
    }));
    const outcomesBeforeUnbind = outcomes.length;
    controller.unbind();
    expect(calls.at(-1)).toEqual({
      method: 'cancelTransformerEdit',
      value: { pointerId: 9, reason: 'destroy' },
    });
    expect(canvas.hasPointerCapture(9)).toBe(false);
    expect(outcomes).toHaveLength(outcomesBeforeUnbind);
    expect(canvas.listenerTypes()).toEqual([]);

    controller.bind(engine);
    canvas.emit('pointerdown', pointerEvent({
      button: 0,
      pointerId: 10,
      clientX: 20,
      clientY: 30,
      shiftKey: false,
    }));
    canvas.emit('pointercancel', pointerEvent({
      button: 0,
      pointerId: 10,
      clientX: 20,
      clientY: 30,
      shiftKey: false,
    }));
    expect(calls.at(-1)).toEqual({
      method: 'cancelTransformerEdit',
      value: { pointerId: 10, reason: 'pointer-cancel' },
    });
    expect(canvas.hasPointerCapture(10)).toBe(false);
    expect(outcomes.slice(-3)).toEqual([
      { type: 'action', value: 'gesture-cancelled' },
      { type: 'publish-frame' },
      { type: 'refresh' },
    ]);
    controller.unbind();
  });
});

describe('PatchMap manual workbench advanced action boundary', () => {
  it.each([
    ['author', 'author'],
    ['transact', 'transact'],
    ['selection', 'applySelection'],
    ['viewport', 'setViewport'],
    ['world-transform', 'setWorldTransform'],
    ['history-companion', 'setHistoryCompanion'],
    ['live-overlay', 'applyLiveOverlay'],
    ['viewport-policy', 'configureViewportPolicy'],
  ] as const)('routes %s to the exact public PatchMap method', (manualMethod, engineMethod) => {
    const { engine, calls } = recordingEngine();
    const input = Object.freeze({ marker: manualMethod });

    const result = runPatchMapManualAdvancedAction(engine, manualMethod, input);

    expect(calls).toEqual([{ method: engineMethod, args: [input] }]);
    expect(result).toEqual({ method: engineMethod, args: [input] });
  });

  it('keeps patch target and payload as separate public method arguments', () => {
    const { engine, calls } = recordingEngine();
    const target = Object.freeze({ kind: 'element', id: 'manual-rect-a' });
    const patch = Object.freeze({ fill: '#ff6b35' });

    runPatchMapManualAdvancedAction(engine, 'patch', { target, patch });

    expect(calls).toEqual([{ method: 'patch', args: [target, patch] }]);
  });

  it('rejects unsupported methods and non-record patch input in Korean', () => {
    const { engine } = recordingEngine();

    expect(() => runPatchMapManualAdvancedAction(engine, 'patch', []))
      .toThrow('부분 갱신 입력 값은 객체여야 합니다.');
    expect(() => runPatchMapManualAdvancedAction(engine, 'missing', {}))
      .toThrow('지원하지 않는 고급 작업입니다: missing');
  });
});

function recordingEngine(): Readonly<{
  engine: PatchMap;
  calls: Array<Readonly<{ method: string; args: readonly unknown[] }>>;
}> {
  const calls: Array<Readonly<{ method: string; args: readonly unknown[] }>> = [];
  const engine = new Proxy({}, {
    get: (_target, property) => (...args: unknown[]) => {
      const method = String(property);
      calls.push(Object.freeze({ method, args: Object.freeze(args) }));
      return Object.freeze({ method, args: Object.freeze(args) });
    },
  }) as PatchMap;
  return Object.freeze({ engine, calls });
}

class RecordingCanvas {
  public readonly dataset: Record<string, string> = {};
  public readonly style: Record<string, string> = {
    width: '100px',
    height: '100px',
    cursor: '',
  };
  private readonly listeners = new Map<string, EventListener[]>();
  private readonly capturedPointers = new Set<number>();

  public setAttribute(): void {}

  public addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void {
    const callable = typeof listener === 'function'
      ? listener
      : (event: Event) => listener.handleEvent(event);
    const entries = this.listeners.get(type) ?? [];
    entries.push(callable);
    this.listeners.set(type, entries);
    if (typeof options === 'object') {
      options.signal?.addEventListener('abort', () => {
        const remaining = (this.listeners.get(type) ?? []).filter((entry) => entry !== callable);
        if (remaining.length === 0) this.listeners.delete(type);
        else this.listeners.set(type, remaining);
      }, { once: true });
    }
  }

  public emit(type: string, event: PointerEvent): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener.call(this as unknown as EventTarget, event);
    }
  }

  public listenerTypes(): readonly string[] {
    return Object.freeze([...this.listeners.keys()]);
  }

  public setPointerCapture(pointerId: number): void {
    this.capturedPointers.add(pointerId);
  }

  public hasPointerCapture(pointerId: number): boolean {
    return this.capturedPointers.has(pointerId);
  }

  public releasePointerCapture(pointerId: number): void {
    this.capturedPointers.delete(pointerId);
  }

  public getBoundingClientRect(): DOMRect {
    return {
      left: 0,
      top: 0,
      width: 100,
      height: 100,
    } as DOMRect;
  }
}

function manualPointerHost(): Readonly<{
  element: HTMLElement;
  canvasFrame: HTMLElement;
}> {
  const modeButton = {
    dataset: { manualMode: 'move' },
    setAttribute: () => undefined,
  };
  const modeHelp = { textContent: '' };
  const pointer = { textContent: '' };
  const marquee = { dataset: {}, hidden: true, style: {} };
  const tooltip = { hidden: true, style: {}, textContent: '' };
  const targets = new Map<string, unknown>([
    ['[data-manual-mode-help]', modeHelp],
    ['[data-manual-pointer]', pointer],
    ['[data-manual-marquee]', marquee],
    ['[data-manual-tooltip]', tooltip],
  ]);
  const element = {
    dataset: {},
    querySelectorAll: (selector: string) => selector === '[data-manual-mode]'
      ? [modeButton]
      : [],
    querySelector: (selector: string) => targets.get(selector) ?? null,
  } as unknown as HTMLElement;
  const canvasFrame = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  } as unknown as HTMLElement;
  return Object.freeze({ element, canvasFrame });
}

function pointerEvent(
  value: Readonly<{
    button: number;
    pointerId: number;
    clientX: number;
    clientY: number;
    shiftKey: boolean;
  }>,
): PointerEvent {
  return value as PointerEvent;
}
