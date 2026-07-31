import { describe, expect, it } from 'vitest';

import { runPatchMapManualAdvancedAction } from '../../lab/patch-map/interactive/manual-workbench-actions';
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
