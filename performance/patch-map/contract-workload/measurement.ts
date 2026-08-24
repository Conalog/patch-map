import type { PatchMap } from '../../../src/patch-map';

import { deepFreeze } from './semantics';

export interface PatchMapVisibleMeasurement<Result> {
  readonly result: Result;
  readonly actionToVisibleMs: number;
  readonly frameGapMs: number;
  readonly frameTimeMs: number;
}
export async function initializePatchMapContractPerformanceEngine(
  engine: PatchMap,
  input: Readonly<{
    instanceId: string;
    target?: HTMLElement;
    width?: number;
    height?: number;
  }>,
): Promise<void> {
  const snapshot = engine.snapshot();
  if (snapshot.lifecycle !== 'new') return;
  await engine.initialize({
    instanceId: input.instanceId,
    ...(input.target ? { target: input.target } : {}),
    width: input.width ?? 800,
    height: input.height ?? 600,
    pixelRatio: 1,
    antialias: false,
    strategy: 'mesh',
    preference: 'webgl',
    backend: 'webgl2',
    powerPreference: 'high-performance',
  });
}

export async function measurePatchMapVisibleAction<Result>(
  engine: PatchMap,
  timeMs: number,
  operation: () => Result | Promise<Result>,
): Promise<PatchMapVisibleMeasurement<Result>> {
  const beforeFrame = await nextAnimationFrameTime();
  const started = performance.now();
  const result = await operation();
  engine.publishFrame(timeMs);
  const visibleFrame = await nextAnimationFrameTime();
  return deepFreeze({
    result,
    actionToVisibleMs: visibleFrame - started,
    frameGapMs: visibleFrame - beforeFrame,
    frameTimeMs: visibleFrame,
  });
}

function nextAnimationFrameTime(): Promise<number> {
  if (typeof requestAnimationFrame !== 'function') {
    return Promise.resolve(performance.now());
  }
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve(performance.now()));
  });
}
