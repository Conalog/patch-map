import { createHash } from 'node:crypto';

import {
  CPU_PROFILE,
  MEASURED,
  PRODUCTION_DATASET_SHA256,
  SEED,
  SIZES,
  WARMUPS,
  assert,
  isRecord,
} from './protocol.mjs';

function percentile(values, quantile) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)];
}
function stats(values, label) {
  assert(
    values.length > 0
      && values.every((value) => typeof value === 'number' && Number.isFinite(value)),
    `${label} finite samples`,
  );
  return {
    samples: values,
    min: Math.min(...values),
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: Math.max(...values),
  };
}

export function hashText(value) {
  return createHash('sha256').update(value).digest('hex');
}

export async function summarizeBenchmark(raw, runInfo) {
  const allMeasured = raw.runs.flatMap((run) => run.measuredRaw);
  const longTasks = allMeasured.flatMap((trial) => trial.longTaskDurationsMs);
  const allVisible = allMeasured.flatMap(
    (trial) => trial.visible.actionToVisibleMs,
  );
  const allFrameGaps = allMeasured.flatMap((trial) => trial.visible.frameGapsMs);
  const runBySize = new Map(raw.runs.map((run) => [run.size, run]));
  const loadRows = raw.runs.map((run) => loadTimingRow(run));
  const production = runBySize.get('production-shaped-workload-v1');
  assert(isRecord(production), 'production performance run');
  const productionHashes = production.measuredRaw.map(
    (trial) => trial.diagnostics.canonicalDatasetSha256,
  );
  assert(
    productionHashes.every((digest) => digest === PRODUCTION_DATASET_SHA256),
    'production dataset canonical hash',
  );
  const run2k = runBySize.get(2_000);
  const run5k = runBySize.get(5_000);
  assert(isRecord(run2k), '2,000 performance run');
  assert(isRecord(run5k), '5,000 performance run');
  const barAction = run2k.measuredRaw.flatMap(
    (trial) => trial.visible.bar?.actionToVisibleMs ?? [],
  );
  const barFrames = run2k.measuredRaw.flatMap(
    (trial) => trial.visible.bar?.frameGapsMs ?? [],
  );
  const textAction = run2k.measuredRaw.flatMap(
    (trial) => trial.visible.text.map((entry) => entry.actionToVisibleMs),
  );
  const bulkAction = run5k.measuredRaw.flatMap(
    (trial) => trial.visible.bulk.map((entry) => entry.actionToVisibleMs),
  );
  const interactionAction = run5k.measuredRaw.flatMap(
    (trial) => trial.visible.interaction?.inputToVisibleMs ?? [],
  );
  const interactionFrames = run5k.measuredRaw.flatMap(
    (trial) => trial.visible.interaction?.frameGapsMs ?? [],
  );
  const lifecycleFailures = allMeasured.filter(
    (trial) => (
      trial.diagnostics.destroyReturned !== true
      || trial.diagnostics.lifecycleAfterDestroy !== 'destroyed'
      || trial.diagnostics.canvasCountAfterDestroy !== 0
      || trial.diagnostics.pendingWorkAfterDestroy !== 0
      || trial.diagnostics.subscriptionCountAfterDestroy !== 0
      || trial.diagnostics.surfaceChildCountAfterDestroy !== 0
      || trial.diagnostics.inputUnchanged !== true
    ),
  ).length;
  const phaseNames = [
    'validateMs',
    'materializeMs',
    'assetMs',
    'uploadPrepareMs',
    'firstUsefulFrameMs',
  ];
  const phaseValues = allMeasured.flatMap((trial) =>
    phaseNames.map((name) => trial.phases[name]));
  const firstFrameStats = raw.runs.map((run) =>
    stats(
      run.measuredRaw.map((trial) => trial.phases.firstUsefulFrameMs),
      `${String(run.size)} first useful frame`,
    ));
  const bulkP95BySize = [100, 500, 1_000, 2_000, 5_000].map((size) => {
    const run = runBySize.get(size);
    assert(isRecord(run), `${size} bulk complexity run`);
    const samples = run.measuredRaw.flatMap((trial) =>
      trial.visible.bulk.slice(0, 1).map((entry) => entry.actionToVisibleMs));
    return { size, p95: stats(samples, `${size} bulk action`).p95 };
  });
  const complexityExponentMax = Math.max(
    0,
    ...bulkP95BySize.slice(1).map((entry, index) => {
      const previous = bulkP95BySize[index];
      if (entry.p95 <= 0 || previous.p95 <= 0) return 0;
      return Math.log(entry.p95 / previous.p95)
        / Math.log(entry.size / previous.size);
    }),
  );
  const browserErrorCount = runInfo.browserErrorCount;
  return {
    revision: 'patch-map-benchmark-summary/1',
    status:
      browserErrorCount === 0 && lifecycleFailures === 0
        ? 'complete'
        : 'failed',
    generatedAt: raw.generatedAt,
    protocol: {
      warmups: WARMUPS,
      samples: MEASURED,
      sizes: SIZES,
      seed: SEED,
      backend: 'webgl2',
      cpuThrottleRate: raw.protocol.cpuThrottleRate,
    },
    provenance: {
      codeCommit: runInfo.codeCommit,
      rawArtifactSha256: null,
    },
    environment: {
      backend: 'webgl2',
      cpuProfile: CPU_PROFILE,
      browserVersion: raw.environment.browserVersion,
      browserTarget: raw.environment.browserTarget,
      runtimeResourceIds: [],
      measurementClass: raw.environment.measurementClass,
      requestedHeaded: runInfo.requestedHeaded,
      actualMode: runInfo.actualMode,
      windowsNative: runInfo.nativeWindows,
      cellId: raw.environment.cellId,
      osRelease: raw.environment.osRelease,
      cpuModel: raw.environment.cpuModel,
      logicalCpuCount: raw.environment.logicalCpuCount,
      totalMemoryBytes: raw.environment.totalMemoryBytes,
      gpu: raw.environment.gpu,
    },
    rawArtifact: null,
    browser: {
      actualMode: runInfo.actualMode,
      requestedHeaded: runInfo.requestedHeaded,
      errorCount: browserErrorCount,
      consoleErrorCount: raw.browser.consoleErrors.length,
      pageErrorCount: raw.browser.pageErrors.length,
      networkFailureCount: raw.browser.networkFailures.length,
      lifecycleFailureCount: lifecycleFailures,
    },
    metrics: {
      overview: {
        workloadCount: SIZES.length,
        samplesPerWorkload: MEASURED,
        warmupsPerWorkload: WARMUPS,
        longTaskAtLeast100Ms: longTasks.filter((duration) => duration >= 100).length,
        frameGapP95Ms: stats(allFrameGaps, 'matrix frame gaps').p95,
        actionToVisibleP95Ms: stats(allVisible, 'matrix action-to-visible').p95,
        rawTimingSamples: raw.runs.map((run) => ({
          size: run.size,
          actionToVisibleMs: run.measuredRaw.flatMap(
            (trial) => trial.visible.actionToVisibleMs,
          ),
          frameGapsMs: run.measuredRaw.flatMap(
            (trial) => trial.visible.frameGapsMs,
          ),
        })),
      },
      load: {
        workloadsMeasured: SIZES,
        samplesPerWorkload: MEASURED,
        phaseCountPerWorkload: phaseNames.length,
        allPhaseValuesFinite: phaseValues.every(Number.isFinite),
        firstUsefulFrame: {
          maxP95Ms: Math.max(...firstFrameStats.map((entry) => entry.p95)),
          semanticHash: PRODUCTION_DATASET_SHA256,
        },
        longTaskAtLeast100Ms: longTasks.filter((duration) => duration >= 100).length,
        valuesFinite: allMeasured.every(
          (trial) => trial.diagnostics.revisionValuesFinite === true,
        ),
        rawTimingSamples: loadRows,
      },
      bar: {
        longTaskAtLeast100Ms: longTasksForRun(run2k),
        actionToVisibleP95Ms: stats(barAction, 'bar action-to-visible').p95,
        frameGapP95Ms: stats(barFrames, 'bar frame gaps').p95,
        rawTimingSamples: run2k.measuredRaw.map((trial) => trial.visible.bar),
      },
      text: {
        longTaskAtLeast100Ms: longTasksForRun(run2k),
        actionToVisibleP95Ms: stats(textAction, 'text action-to-visible').p95,
        rawTimingSamples: run2k.measuredRaw.map((trial) => trial.visible.text),
      },
      bulk: {
        longTaskAtLeast100Ms: longTasksForRun(run5k),
        actionToVisibleP95Ms: stats(bulkAction, 'bulk action-to-visible').p95,
        complexityExponentMax,
        bulkP95BySize,
        rawTimingSamples: run5k.measuredRaw.map((trial) => trial.visible.bulk),
      },
      interaction: {
        longTaskAtLeast100Ms: longTasksForRun(run5k),
        inputToVisibleP95Ms: stats(
          interactionAction,
          'interaction input-to-visible',
        ).p95,
        frameGapP95Ms: stats(interactionFrames, 'interaction frame gaps').p95,
        rawTimingSamples: run5k.measuredRaw.map(
          (trial) => trial.visible.interaction,
        ),
      },
    },
  };
}

function loadTimingRow(run) {
  const names = [
    'validateMs',
    'materializeMs',
    'assetMs',
    'storeLoadMs',
    'uploadPrepareMs',
    'firstUsefulFrameMs',
  ];
  return {
    size: run.size,
    phases: Object.fromEntries(names.map((name) => [
      name,
      stats(
        run.measuredRaw.map((trial) => trial.phases[name]),
        `${String(run.size)} ${name}`,
      ),
    ])),
  };
}

function longTasksForRun(run) {
  return run.measuredRaw
    .flatMap((trial) => trial.longTaskDurationsMs)
    .filter((duration) => duration >= 100)
    .length;
}
