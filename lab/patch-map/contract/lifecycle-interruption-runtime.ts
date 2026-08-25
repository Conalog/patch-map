import productionShapedWorkloadJson from '../../../contracts/patch-map/evidence/production-shaped-workload.v1.json';
import type { PatchMap } from '../../../src/patch-map';

export const PATCH_MAP_LIFECYCLE_INTERRUPTION_RUNTIME_REVISION =
  'patch-map-lifecycle-interruption-runtime/1';
export const PATCH_MAP_LIFECYCLE_INTERRUPTION_CLEANUP_REVISION =
  'patch-map-lifecycle-interruption-cleanup/1';

export const PATCH_MAP_LIFECYCLE_INTERRUPTION_CASE_IDS = Object.freeze([
  'ERR-004',
  'ERR-006',
  'PRF-007',
  'CSM-017',
  'CSM-036',
] as const);

export type PatchMapLifecycleInterruptionCaseId =
  (typeof PATCH_MAP_LIFECYCLE_INTERRUPTION_CASE_IDS)[number];

interface ProductionDatasetRequest {
  readonly caseId: PatchMapLifecycleInterruptionCaseId;
  readonly generatorRef: 'production-shaped';
}

interface ResourceProbeRequest {
  readonly caseId: PatchMapLifecycleInterruptionCaseId;
  readonly engine: PatchMap;
  readonly label: string;
}

export interface PatchMapLifecycleInterruptionProductAdapter {
  productionDataset(
    input: ProductionDatasetRequest,
  ): readonly Readonly<Record<string, unknown>>[];
  resourceProbe(input: ResourceProbeRequest): Readonly<Record<string, unknown>>;
  forceGcSample(): Promise<Readonly<Record<string, unknown>>>;
  markForcedGcBaseline(sample: Readonly<Record<string, unknown>>): void;
}

export interface PatchMapLifecycleInterruptionRuntime {
  readonly product: PatchMapLifecycleInterruptionProductAdapter;
  postDestroyProductProbe(): Promise<Readonly<Record<string, unknown>>>;
}

/**
 * Actual-only lifecycle transport shared by interruption, destroyed-state,
 * repeated teardown, and consumer remount cases.
 *
 * It owns no Engine, renderer, listener, ticker, observer, or animation
 * callback. The one cached production input is caller-owned immutable data and
 * is released with the run-level cleanup probe.
 */
export function createPatchMapLifecycleInterruptionRuntime(
  caseId: PatchMapLifecycleInterruptionCaseId,
): PatchMapLifecycleInterruptionRuntime {
  requireCaseId(caseId);
  let productionDataset:
    | readonly Readonly<Record<string, unknown>>[]
    | null = null;
  let productionDatasetBuildCount = 0;
  let resourceProbeCount = 0;
  let forcedGcSampleCount = 0;
  let lastForcedGcSample: Readonly<Record<string, unknown>> | null = null;
  let forcedGcBaseline: Readonly<Record<string, unknown>> | null = null;
  let released = false;
  let cleanupPromise: Promise<Readonly<Record<string, unknown>>> | null = null;

  async function takeForcedGcSample(): Promise<Readonly<Record<string, unknown>>> {
    forcedGcSampleCount += 1;
    const host = globalThis as typeof globalThis & Readonly<{
      gc?: () => void;
      performance?: Performance & Readonly<{
        memory?: Readonly<{ usedJSHeapSize?: number }>;
      }>;
    }>;
    const gc = typeof host.gc === 'function' ? host.gc : null;
    const memory = host.performance?.memory;
    const supported =
      gc !== null
      && typeof memory?.usedJSHeapSize === 'number'
      && Number.isFinite(memory.usedJSHeapSize);
    if (supported) {
      gc();
      await nextTask();
      gc();
      await nextTask();
    }
    const usedJSHeapSize = supported
      && typeof memory?.usedJSHeapSize === 'number'
      && Number.isFinite(memory.usedJSHeapSize)
      ? memory.usedJSHeapSize
      : null;
    lastForcedGcSample = deepFreeze({
      supported,
      sampleIndex: forcedGcSampleCount,
      usedJSHeapSize,
    });
    return lastForcedGcSample;
  }

  const product: PatchMapLifecycleInterruptionProductAdapter = Object.freeze({
    productionDataset(input: ProductionDatasetRequest) {
      assertActive(released, 'production dataset');
      invariant(input.caseId === caseId, 'production dataset case identity');
      invariant(input.generatorRef === 'production-shaped', 'production dataset generator');
      if (productionDataset === null) {
        productionDataset = deepFreeze(structuredClone(
          productionShapedWorkloadJson,
        )) as readonly Readonly<Record<string, unknown>>[];
        productionDatasetBuildCount += 1;
      }
      return productionDataset;
    },

    resourceProbe(input: ResourceProbeRequest) {
      assertActive(released, 'resource probe');
      invariant(input.caseId === caseId, 'resource probe case identity');
      invariant(
        typeof input.label === 'string' && input.label.length > 0,
        'resource probe label',
      );
      const snapshot = detach(input.engine.snapshot());
      const destroyed =
        snapshot.lifecycle === 'destroyed' || snapshot.lifecycle === 'destroying';
      resourceProbeCount += 1;
      return deepFreeze({
        revision: PATCH_MAP_LIFECYCLE_INTERRUPTION_RUNTIME_REVISION,
        caseId,
        label: input.label,
        probeIndex: resourceProbeCount,
        snapshot,
        semantic: detach(input.engine.semanticProbe()),
        dataset: destroyed ? [] : detach(input.engine.exportDataset()),
        geometry: destroyed ? null : detach(input.engine.geometryProbe()),
        pointerGesture: detach(input.engine.pointerGestureProbe()),
        transformerGesture: detach(input.engine.transformerGestureProbe()),
        transformerEdit: detach(input.engine.transformerEditProbe()),
        hostInteraction: detach(input.engine.hostInteractionProbe()),
        interactionOwnership:
          destroyed ? null : detach(input.engine.interactionOwnershipProbe()),
        history: destroyed ? null : detach(input.engine.historyInspection()),
        viewport: destroyed ? null : detach(input.engine.viewportProbe()),
        assets: detach(input.engine.assetProbe()),
        runtime: runtimeStats(
          productionDatasetBuildCount,
          productionDataset,
          resourceProbeCount,
          forcedGcSampleCount,
        ),
      });
    },

    async forceGcSample() {
      assertActive(released, 'forced GC sample');
      return takeForcedGcSample();
    },

    markForcedGcBaseline(sample: Readonly<Record<string, unknown>>) {
      assertActive(released, 'forced GC baseline');
      invariant(sample === lastForcedGcSample, 'forced GC baseline must be the latest sample');
      invariant(forcedGcBaseline === null, 'forced GC baseline is unique');
      forcedGcBaseline = sample;
    },
  });

  return Object.freeze({
    product,
    postDestroyProductProbe(): Promise<Readonly<Record<string, unknown>>> {
      if (cleanupPromise !== null) return cleanupPromise;
      cleanupPromise = (async () => {
        released = true;
        productionDataset = null;
        const finalForcedGcSample = caseId === 'PRF-007'
          ? await takeForcedGcSample()
          : null;
        const postDestroyForcedGcGrowthMiB = forcedGcGrowthMiB(
          forcedGcBaseline,
          finalForcedGcSample,
        );
        return deepFreeze({
          revision: PATCH_MAP_LIFECYCLE_INTERRUPTION_CLEANUP_REVISION,
          caseId,
          runtimeCounts: zeroOwnership(),
          forcedGc: {
            baseline: forcedGcBaseline,
            final: finalForcedGcSample,
          },
          postDestroyForcedGcGrowthMiB,
          stats: runtimeStats(
            productionDatasetBuildCount,
            productionDataset,
            resourceProbeCount,
            forcedGcSampleCount,
          ),
        });
      })();
      return cleanupPromise;
    },
  });
}

function forcedGcGrowthMiB(
  baseline: Readonly<Record<string, unknown>> | null,
  final: Readonly<Record<string, unknown>> | null,
): number | null {
  if (
    baseline?.supported !== true
    || final?.supported !== true
    || typeof baseline.usedJSHeapSize !== 'number'
    || !Number.isFinite(baseline.usedJSHeapSize)
    || typeof final.usedJSHeapSize !== 'number'
    || !Number.isFinite(final.usedJSHeapSize)
  ) {
    return null;
  }
  return Math.max(0, final.usedJSHeapSize - baseline.usedJSHeapSize)
    / (1024 * 1024);
}

function runtimeStats(
  productionDatasetBuildCount: number,
  productionDataset: readonly Readonly<Record<string, unknown>>[] | null,
  resourceProbeCount: number,
  forcedGcSampleCount: number,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    productionDatasetBuildCount,
    retainedProductionRootCount: productionDataset?.length ?? 0,
    resourceProbeCount,
    forcedGcSampleCount,
    ownership: zeroOwnership(),
  });
}

function zeroOwnership(): Readonly<Record<string, 0>> {
  return Object.freeze({
    engines: 0,
    renderers: 0,
    listeners: 0,
    observers: 0,
    timers: 0,
    tickers: 0,
    animationClosures: 0,
    pendingWork: 0,
  });
}

function requireCaseId(
  caseId: PatchMapLifecycleInterruptionCaseId,
): void {
  invariant(
    PATCH_MAP_LIFECYCLE_INTERRUPTION_CASE_IDS.includes(caseId),
    'unsupported case identity',
  );
}

function assertActive(released: boolean, operation: string): void {
  invariant(!released, `${operation} requires an active runtime`);
}

function detach<T>(value: T): T {
  return structuredClone(value);
}

function nextTask(): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Invalid PatchMap lifecycle/interruption runtime: ${message}`);
  }
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
