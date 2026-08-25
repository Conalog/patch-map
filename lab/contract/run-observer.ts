export interface PatchMapContractUiRunMetrics {
  readonly durationMs: number;
  readonly frameCount: number;
  readonly framesPerSecond: number;
  readonly maxFrameGapMs: number;
  readonly longTaskCount: number;
  readonly longTaskTotalMs: number;
}

export type PatchMapRunObserverPrefix =
  | 'ren-005'
  | 'ren-006'
  | 'ren-008'
  | 'ren-010'
  | 'ren-011';

export function renderRunObserver(prefix: PatchMapRunObserverPrefix): string {
  return `<div class="contract-run-observer" data-testid="${prefix}-run-observation">
    <div><span class="contract-kicker">실행별 메인 스레드 관찰</span><p>FPS와 프레임 간격은 requestAnimationFrame으로, 긴 작업은 지원되는 경우 브라우저 Long Tasks API로 측정합니다.</p></div>
    <dl>
      <div><dt>실행</dt><dd data-testid="${prefix}-run-index">관찰 전</dd></div>
      <div><dt>FPS</dt><dd data-testid="${prefix}-run-fps">관찰 전</dd></div>
      <div><dt>프레임 수</dt><dd data-testid="${prefix}-run-frame-count">관찰 전</dd></div>
      <div><dt>최대 프레임 간격</dt><dd data-testid="${prefix}-run-max-frame-gap">관찰 전</dd></div>
      <div><dt>긴 작업 수</dt><dd data-testid="${prefix}-run-long-task-count">관찰 전</dd></div>
      <div><dt>걸린 시간</dt><dd data-testid="${prefix}-run-duration">관찰 전</dd></div>
    </dl>
    <ol class="contract-performance-journal" data-testid="${prefix}-performance-journal"></ol>
  </div>`;
}

export function runObserverPrefix(scenario: string): PatchMapRunObserverPrefix | null {
  if (scenario === 'REN-005') return 'ren-005';
  if (scenario === 'REN-006') return 'ren-006';
  if (scenario === 'REN-008') return 'ren-008';
  if (scenario === 'REN-010') return 'ren-010';
  if (scenario === 'REN-011') return 'ren-011';
  return null;
}

export function appendRunPerformance(
  root: HTMLElement,
  prefix: PatchMapRunObserverPrefix,
  observation: Readonly<{
    readonly runIndex: number;
    readonly runKind: 'run' | 'repeat';
    readonly metrics: PatchMapContractUiRunMetrics;
    readonly runResult: unknown;
  }>,
): void {
  const observer = root.querySelector<HTMLElement>(`[data-testid="${prefix}-run-observation"]`);
  if (!observer) return;
  const { metrics } = observation;
  setText(observer.querySelector(`[data-testid="${prefix}-run-index"]`), String(observation.runIndex));
  setText(observer.querySelector(`[data-testid="${prefix}-run-fps"]`), metrics.framesPerSecond.toFixed(1));
  setText(observer.querySelector(`[data-testid="${prefix}-run-frame-count"]`), String(metrics.frameCount));
  setText(
    observer.querySelector(`[data-testid="${prefix}-run-max-frame-gap"]`),
    `${metrics.maxFrameGapMs.toFixed(1)} ms`,
  );
  setText(
    observer.querySelector(`[data-testid="${prefix}-run-long-task-count"]`),
    `${metrics.longTaskCount} / ${metrics.longTaskTotalMs.toFixed(1)} ms`,
  );
  setText(
    observer.querySelector(`[data-testid="${prefix}-run-duration"]`),
    `${metrics.durationMs.toFixed(1)} ms`,
  );
  const journal = observer.querySelector<HTMLOListElement>(
    `[data-testid="${prefix}-performance-journal"]`,
  );
  if (!journal) return;
  const row = document.createElement('li');
  row.dataset.testid = `${prefix}-performance-journal-row`;
  row.dataset.runIndex = String(observation.runIndex);
  row.dataset.runKind = observation.runKind;
  row.dataset.fps = metrics.framesPerSecond.toFixed(3);
  row.dataset.frameCount = String(metrics.frameCount);
  row.dataset.longTaskCount = String(metrics.longTaskCount);
  row.dataset.longTaskTotalMs = metrics.longTaskTotalMs.toFixed(3);
  row.dataset.maxFrameGapMs = metrics.maxFrameGapMs.toFixed(3);
  row.dataset.durationMs = metrics.durationMs.toFixed(3);
  row.textContent = `${observation.runKind === 'repeat' ? '반복 실행' : '첫 실행'} ${observation.runIndex}: ${metrics.framesPerSecond.toFixed(1)} FPS · 긴 작업 ${metrics.longTaskCount}개 · 최대 간격 ${metrics.maxFrameGapMs.toFixed(1)} ms`;
  journal.append(row);
}

export function resetRunPerformance(
  root: HTMLElement,
  prefix: PatchMapRunObserverPrefix,
): void {
  const observer = root.querySelector<HTMLElement>(`[data-testid="${prefix}-run-observation"]`);
  if (!observer) return;
  for (const suffix of [
    'run-index',
    'run-fps',
    'run-frame-count',
    'run-max-frame-gap',
    'run-long-task-count',
    'run-duration',
  ]) {
    setText(observer.querySelector(`[data-testid="${prefix}-${suffix}"]`), '관찰 전');
  }
  observer.querySelector(`[data-testid="${prefix}-performance-journal"]`)?.replaceChildren();
}

export function startUiRunObservation(): Readonly<{
  finish(): Promise<PatchMapContractUiRunMetrics>;
}> {
  const startedAt = performance.now();
  const frameTimes: number[] = [];
  const longTasks: PerformanceEntry[] = [];
  let observer: PerformanceObserver | null = null;
  let active = true;
  let frameRequest = 0;
  let finishPromise: Promise<PatchMapContractUiRunMetrics> | null = null;
  let finishRun: ((metrics: PatchMapContractUiRunMetrics) => void) | null = null;

  const sampleFrame = (_time: number): void => {
    frameRequest = 0;
    // Callback arrival, rather than the compositor timestamp argument, captures
    // main-thread stalls that delay requestAnimationFrame delivery.
    frameTimes.push(performance.now());
    if (active) {
      frameRequest = window.requestAnimationFrame(sampleFrame);
      return;
    }
    if (observer) {
      longTasks.push(...observer.takeRecords());
      observer.disconnect();
    }
    const finishedAt = performance.now();
    const durationMs = Math.max(0, finishedAt - startedAt);
    let maxFrameGapMs = 0;
    let previous = startedAt;
    for (const frameTime of frameTimes) {
      maxFrameGapMs = Math.max(maxFrameGapMs, Math.max(0, frameTime - previous));
      previous = frameTime;
    }
    const framesPerSecond = durationMs > 0
      ? frameTimes.length * 1_000 / durationMs
      : 0;
    finishRun?.(Object.freeze({
      durationMs,
      frameCount: frameTimes.length,
      framesPerSecond,
      maxFrameGapMs,
      longTaskCount: longTasks.length,
      longTaskTotalMs: longTasks.reduce((total, entry) => total + entry.duration, 0),
    }));
    finishRun = null;
  };
  frameRequest = window.requestAnimationFrame(sampleFrame);
  if (
    typeof PerformanceObserver !== 'undefined'
    && PerformanceObserver.supportedEntryTypes?.includes('longtask')
  ) {
    observer = new PerformanceObserver((entries) => longTasks.push(...entries.getEntries()));
    observer.observe({ entryTypes: ['longtask'] });
  }

  return Object.freeze({
    finish(): Promise<PatchMapContractUiRunMetrics> {
      finishPromise ??= new Promise((resolve) => {
        finishRun = resolve;
        active = false;
        if (frameRequest === 0) frameRequest = window.requestAnimationFrame(sampleFrame);
      });
      return finishPromise;
    },
  });
}

function setText(target: Element | null, value: string): void {
  if (target) target.textContent = value;
}
