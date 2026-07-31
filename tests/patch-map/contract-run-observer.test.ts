import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  appendRunPerformance,
  renderRunObserver,
  resetRunPerformance,
  runObserverPrefix,
  startUiRunObservation,
} from '../../lab/patch-map/contract/run-observer';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PatchMap contract Lab run observer', () => {
  it('renders the supported observer prefixes with the stable metric field order', () => {
    expect([
      'REN-005',
      'REN-006',
      'REN-008',
      'REN-010',
      'REN-011',
      'REN-012',
    ].map(runObserverPrefix)).toEqual([
      'ren-005',
      'ren-006',
      'ren-008',
      'ren-010',
      'ren-011',
      null,
    ]);

    const markup = renderRunObserver('ren-006');
    expect([...markup.matchAll(/data-testid="([^"]+)"/gu)].map((match) => match[1])).toEqual([
      'ren-006-run-observation',
      'ren-006-run-index',
      'ren-006-run-fps',
      'ren-006-run-frame-count',
      'ren-006-run-max-frame-gap',
      'ren-006-run-long-task-count',
      'ren-006-run-duration',
      'ren-006-performance-journal',
    ]);
  });

  it('appends journal data attributes in order and resets the displayed run', () => {
    const displayed = new Map<string, { textContent: string | null }>([
      ['run-index', { textContent: 'stale' }],
      ['run-fps', { textContent: 'stale' }],
      ['run-frame-count', { textContent: 'stale' }],
      ['run-max-frame-gap', { textContent: 'stale' }],
      ['run-long-task-count', { textContent: 'stale' }],
      ['run-duration', { textContent: 'stale' }],
    ]);
    const appended: unknown[] = [];
    const journal = {
      append: vi.fn((row: unknown) => appended.push(row)),
      replaceChildren: vi.fn(),
    };
    const observer = {
      querySelector: vi.fn((selector: string) => {
        if (selector === '[data-testid="ren-006-performance-journal"]') return journal;
        const suffix = selector.match(/ren-006-(.+)"\]$/u)?.[1];
        return suffix ? displayed.get(suffix) ?? null : null;
      }),
    };
    const root = {
      querySelector: vi.fn((selector: string) => (
        selector === '[data-testid="ren-006-run-observation"]' ? observer : null
      )),
    };
    const row = { dataset: {} as Record<string, string>, textContent: '' };
    vi.stubGlobal('document', { createElement: vi.fn(() => row) });

    appendRunPerformance(root as unknown as HTMLElement, 'ren-006', {
      runIndex: 2,
      runKind: 'repeat',
      metrics: {
        durationMs: 50,
        frameCount: 2,
        framesPerSecond: 40,
        maxFrameGapMs: 24,
        longTaskCount: 2,
        longTaskTotalMs: 12,
      },
      runResult: Object.freeze({ status: 'observed' }),
    });

    expect(Object.entries(row.dataset)).toEqual([
      ['testid', 'ren-006-performance-journal-row'],
      ['runIndex', '2'],
      ['runKind', 'repeat'],
      ['fps', '40.000'],
      ['frameCount', '2'],
      ['longTaskCount', '2'],
      ['longTaskTotalMs', '12.000'],
      ['maxFrameGapMs', '24.000'],
      ['durationMs', '50.000'],
    ]);
    expect(row.textContent).toBe('반복 실행 2: 40.0 FPS · 긴 작업 2개 · 최대 간격 24.0 ms');
    expect(appended).toEqual([row]);
    expect(Object.fromEntries(
      [...displayed].map(([suffix, element]) => [suffix, element.textContent]),
    )).toEqual({
      'run-index': '2',
      'run-fps': '40.0',
      'run-frame-count': '2',
      'run-max-frame-gap': '24.0 ms',
      'run-long-task-count': '2 / 12.0 ms',
      'run-duration': '50.0 ms',
    });

    resetRunPerformance(root as unknown as HTMLElement, 'ren-006');

    expect([...displayed.values()].map(({ textContent }) => textContent)).toEqual(
      Array.from({ length: 6 }, () => '관찰 전'),
    );
    expect(journal.replaceChildren).toHaveBeenCalledOnce();
  });

  it('finishes on the pending animation frame before draining and disconnecting long tasks', async () => {
    const events: string[] = [];
    const frames: FrameRequestCallback[] = [];
    const times = [0, 16, 40, 50];
    vi.stubGlobal('performance', {
      now: vi.fn(() => {
        const value = times.shift();
        if (value === undefined) throw new Error('Unexpected performance.now call');
        events.push(`now:${value}`);
        return value;
      }),
    });
    vi.stubGlobal('window', {
      requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
        events.push('requestAnimationFrame');
        frames.push(callback);
        return frames.length;
      }),
    });

    class FakePerformanceObserver {
      static readonly supportedEntryTypes = ['longtask'];

      constructor(readonly callback: PerformanceObserverCallback) {}

      observe(): void {
        events.push('observe');
      }

      takeRecords(): PerformanceEntryList {
        events.push('takeRecords');
        return [{ duration: 7 } as PerformanceEntry];
      }

      disconnect(): void {
        events.push('disconnect');
      }
    }
    vi.stubGlobal('PerformanceObserver', FakePerformanceObserver);

    const observation = startUiRunObservation();
    frames.shift()?.(1);
    const finished = observation.finish();
    expect(observation.finish()).toBe(finished);
    frames.shift()?.(2);

    await expect(finished).resolves.toEqual({
      durationMs: 50,
      frameCount: 2,
      framesPerSecond: 40,
      maxFrameGapMs: 24,
      longTaskCount: 1,
      longTaskTotalMs: 7,
    });
    expect(events).toEqual([
      'now:0',
      'requestAnimationFrame',
      'observe',
      'now:16',
      'requestAnimationFrame',
      'now:40',
      'takeRecords',
      'disconnect',
      'now:50',
    ]);
  });
});
