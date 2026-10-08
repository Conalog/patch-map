import {
  deepFreeze,
  heapMethod,
  requiredElement,
} from './browser-boundary';
import {
  type BenchmarkResult,
  type BenchmarkSpec,
  validateBenchmarkSpec,
} from './types';
import { runMeasuredBenchmarkTrial } from './trial';

declare global {
  interface Window {
    __PATCH_MAP_BENCHMARK__: {
      run(spec: BenchmarkSpec): Promise<BenchmarkResult>;
    };
    gc?: () => void;
  }
}

const surface = requiredElement<HTMLDivElement>('surface');
const status = requiredElement<HTMLPreElement>('status');

window.__PATCH_MAP_BENCHMARK__ = Object.freeze({
  async run(spec: BenchmarkSpec): Promise<BenchmarkResult> {
    validateBenchmarkSpec(spec);
    const warmupRaw: Readonly<Record<string, unknown>>[] = [];
    const measuredRaw: Readonly<Record<string, unknown>>[] = [];
    for (let index = 0; index < spec.warmups; index += 1) {
      status.textContent =
        `${String(spec.size)} warmup ${index + 1}/${spec.warmups}`;
      warmupRaw.push(
        await runMeasuredBenchmarkTrial(spec, index, true, surface),
      );
    }
    for (let index = 0; index < spec.measured; index += 1) {
      status.textContent =
        `${String(spec.size)} measured ${index + 1}/${spec.measured}`;
      measuredRaw.push(
        await runMeasuredBenchmarkTrial(spec, index, false, surface),
      );
    }
    status.textContent = `${String(spec.size)} complete`;
    return deepFreeze({
      warmupRaw,
      measuredRaw,
      environment: {
        userAgent: navigator.userAgent,
        devicePixelRatio,
        heapMethod: heapMethod(),
        backendRequest: 'webgl2',
        rendererPreference: 'webgl',
        framePublication: 'manual Engine.publishFrame plus requestAnimationFrame',
      },
    });
  },
});
