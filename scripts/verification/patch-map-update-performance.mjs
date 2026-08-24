#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createServer } from 'vite';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DEFAULT_OUTPUT = path.join(
  ROOT,
  '.perf-results/patch-map/update-transactions.json',
);
const METRICS = Object.freeze([
  'fullBulkPatchMs',
  'partialBulkPatchMs',
  'emptyBulkPatchMs',
  'invalidRollbackMs',
]);

export const UPDATE_PERFORMANCE_PROTOCOL = Object.freeze({
  warmups: 2,
  measured: 7,
  scales: Object.freeze([100, 500, 1_000, 2_000, 5_000]),
  partialFraction: 0.1,
  seedBase: 0xc0de_7500,
});

/**
 * This checkpoint deliberately measures the newly introduced public Engine
 * transaction CPU path only: request validation, detached candidate creation,
 * semantic indexing, history preparation, and publication bookkeeping. The
 * injected surface accepts the already-built candidate but performs no PixiJS
 * renderer or GPU work. The canonical Chromium 4x matrix remains the source of
 * truth for aggregate rendering and upload performance.
 */
export async function runPatchMapUpdatePerformanceCheckpoint({
  outputPath = DEFAULT_OUTPUT,
} = {}) {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const runtime = await loadRuntime();
  try {
    const runs = [];
    for (const scale of UPDATE_PERFORMANCE_PROTOCOL.scales) {
      const warmupRaw = [];
      const measuredRaw = [];
      const total = UPDATE_PERFORMANCE_PROTOCOL.warmups + UPDATE_PERFORMANCE_PROTOCOL.measured;
      for (let index = 0; index < total; index += 1) {
        const trial = await runPatchMapUpdateTransactionTrial(runtime, scale, index);
        if (index < UPDATE_PERFORMANCE_PROTOCOL.warmups) warmupRaw.push(trial);
        else measuredRaw.push(trial);
      }
      runs.push(Object.freeze({
        scale,
        itemTargetCount: scale,
        partialTargetCount: partialTargetCount(scale),
        warmupRaw: Object.freeze(warmupRaw),
        measuredRaw: Object.freeze(measuredRaw),
        summary: summarizeTrials(measuredRaw),
      }));
    }

    const cpus = os.cpus();
    const output = Object.freeze({
      schemaVersion: 1,
      checkpoint: 'core-v2-update-transactions',
      generatedAt: startedAt,
      durationMs: performance.now() - started,
      protocol: Object.freeze({
        warmups: UPDATE_PERFORMANCE_PROTOCOL.warmups,
        measured: UPDATE_PERFORMANCE_PROTOCOL.measured,
        scales: UPDATE_PERFORMANCE_PROTOCOL.scales,
        operations: Object.freeze({
          full: 'bulkPatch over every item target',
          partial: `bulkPatch over nearest-lower ${UPDATE_PERFORMANCE_PROTOCOL.partialFraction * 100}% item targets`,
          empty: 'validated bulkPatch over an empty target set',
          invalid: 'strict transact with a valid first operation and missing final target',
        }),
      }),
      scope: Object.freeze({
        measured: Object.freeze([
          'public PatchMap transaction validation',
          'detached semantic candidate materialization',
          'component/text semantic indexing',
          'history preparation and publication bookkeeping',
        ]),
        excluded: Object.freeze([
          'PixiJS renderer reconciliation',
          'GPU upload',
          'frame publication',
          'browser scheduling',
          'retained heap',
        ]),
        surface: 'injected deterministic no-render surface',
        rendererEvidence: 'canonical PatchMap Chromium 4x matrix; not rerun by this checkpoint',
        productionDataset: 'covered by canonical full matrix; this isolated scale checkpoint uses seeded synthetic input',
      }),
      environment: Object.freeze({
        runtime: `node ${process.versions.node}`,
        platform: process.platform,
        architecture: process.arch,
        cpuModel: cpus[0]?.model ?? 'unknown',
        logicalCpuCount: cpus.length,
        timer: 'node:perf_hooks performance.now',
        chromium4x: 'not-run; tranche reuses existing surface reconciliation and this checkpoint isolates new Engine staging/orchestration',
        windowsNative: 'pending; this CPU-isolation checkpoint is not native target evidence',
      }),
      runs: Object.freeze(runs),
    });

    validatePatchMapUpdatePerformanceOutput(output);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    return output;
  } finally {
    await runtime.close();
  }
}

export function summarizeUpdateSamples(samples) {
  if (
    !Array.isArray(samples) ||
    samples.length === 0 ||
    samples.some((sample) => typeof sample !== 'number' || !Number.isFinite(sample) || sample < 0)
  ) {
    throw new TypeError('update performance samples must be finite non-negative numbers');
  }
  const sorted = [...samples].sort((left, right) => left - right);
  return Object.freeze({
    samples: Object.freeze([...samples]),
    min: sorted[0],
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted.at(-1),
  });
}

export function validatePatchMapUpdatePerformanceOutput(output) {
  assert(output?.schemaVersion === 1, 'schemaVersion must be 1');
  assert(output?.checkpoint === 'core-v2-update-transactions', 'checkpoint name mismatch');
  assert(output?.protocol?.warmups === 2, 'checkpoint requires exactly two warmups');
  assert(output?.protocol?.measured === 7, 'checkpoint requires exactly seven measured trials');
  assert(
    sameNumbers(output?.protocol?.scales, UPDATE_PERFORMANCE_PROTOCOL.scales),
    'checkpoint scale matrix must be 100/500/1000/2000/5000',
  );
  assert(Array.isArray(output?.runs), 'runs must be an array');
  assert(output.runs.length === UPDATE_PERFORMANCE_PROTOCOL.scales.length, 'run count mismatch');

  for (const [runIndex, run] of output.runs.entries()) {
    const scale = UPDATE_PERFORMANCE_PROTOCOL.scales[runIndex];
    assert(run?.scale === scale, `run ${runIndex} scale mismatch`);
    assert(run?.itemTargetCount === scale, `run ${scale} full target count mismatch`);
    assert(
      run?.partialTargetCount === partialTargetCount(scale),
      `run ${scale} partial target count mismatch`,
    );
    assert(run?.warmupRaw?.length === 2, `run ${scale} warmup count mismatch`);
    assert(run?.measuredRaw?.length === 7, `run ${scale} measured count mismatch`);
    for (const [trialIndex, trial] of [...run.warmupRaw, ...run.measuredRaw].entries()) {
      validateTrial(trial, scale, trialIndex);
    }
    for (const metric of METRICS) {
      const samples = run.measuredRaw.map((trial) => trial.timings[metric]);
      const expected = summarizeUpdateSamples(samples);
      assert(sameNumbers(run.summary?.[metric]?.samples, expected.samples), `${scale}/${metric} raw samples mismatch`);
      for (const field of ['min', 'median', 'p95', 'max']) {
        assert(run.summary?.[metric]?.[field] === expected[field], `${scale}/${metric}/${field} mismatch`);
      }
    }
  }
  return true;
}

async function loadRuntime() {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    logLevel: 'error',
    appType: 'custom',
    server: { middlewareMode: true },
  });
  try {
    const core = await vite.ssrLoadModule('/src/patch-map/index.ts');
    const workloads = await vite.ssrLoadModule('/performance/patch-map/workloads.ts');
    assert(typeof core.PatchMap === 'function', 'PatchMap public export is unavailable');
    assert(
      typeof workloads.createSyntheticPatchMap === 'function',
      'PatchMap synthetic workload factory is unavailable',
    );
    return Object.freeze({
      PatchMap: core.PatchMap,
      createSyntheticPatchMap: workloads.createSyntheticPatchMap,
      close: () => vite.close(),
    });
  } catch (error) {
    await vite.close();
    throw error;
  }
}

export async function runPatchMapUpdateTransactionTrial(runtime, scale, trial) {
  const seed = UPDATE_PERFORMANCE_PROTOCOL.seedBase + scale * 31 + trial;
  const source = runtime.createSyntheticPatchMap(scale, seed);
  const sourceBefore = JSON.stringify(source);
  const surface = new TransactionCheckpointSurface();
  const engine = new runtime.PatchMap({ surfaceFactory: async () => surface });
  await engine.initialize({
    instanceId: `update-performance-${scale}-${trial}`,
    width: 960,
    height: 540,
    pixelRatio: 1,
    antialias: false,
    strategy: 'mesh',
    preference: 'webgl',
  });
  try {
    engine.loadDataset(source, { datasetRef: `synthetic:${scale}:${seed}` });
    const targets = Object.freeze(Array.from({ length: scale }, (_, index) => Object.freeze({
      kind: 'element',
      id: itemId(index),
    })));
    const partialTargets = Object.freeze(targets.slice(0, partialTargetCount(scale)));
    const markerPath = Object.freeze(['attrs', 'metadata', 'updateCheckpoint']);
    const fullRequest = Object.freeze({
      strict: true,
      actionId: `perf-full-${trial}`,
      targets,
      changes: Object.freeze([Object.freeze({ path: markerPath, value: `full-${trial}` })]),
    });
    const partialRequest = Object.freeze({
      strict: true,
      actionId: `perf-partial-${trial}`,
      targets: partialTargets,
      changes: Object.freeze([Object.freeze({ path: markerPath, value: `partial-${trial}` })]),
    });
    const emptyRequest = Object.freeze({
      strict: true,
      actionId: `perf-empty-${trial}`,
      targets: Object.freeze([]),
      changes: Object.freeze([Object.freeze({ path: markerPath, value: `empty-${trial}` })]),
    });
    const invalidRequest = Object.freeze({
      strict: true,
      actionId: `perf-invalid-${trial}`,
      operations: Object.freeze([
        Object.freeze({
          op: 'merge',
          target: targets[0],
          changes: Object.freeze([Object.freeze({ path: markerPath, value: `invalid-${trial}` })]),
        }),
        Object.freeze({
          op: 'merge',
          target: Object.freeze({ kind: 'element', id: `missing-${scale}` }),
          changes: Object.freeze([Object.freeze({ path: markerPath, value: `missing-${trial}` })]),
        }),
      ]),
    });

    const full = measure(() => engine.bulkPatch(fullRequest));
    const partial = measure(() => engine.bulkPatch(partialRequest));
    const revisionBeforeEmpty = engine.snapshot().revisions.sceneRevision;
    const empty = measure(() => engine.bulkPatch(emptyRequest));
    const authorityBeforeInvalid = engine.exportDataset();
    const revisionBeforeInvalid = engine.snapshot().revisions.sceneRevision;
    const invalid = measure(() => engine.transact(invalidRequest));

    assert(full.value.status === 'committed', `${scale}/full transaction did not commit`);
    assert(full.value.applied.length === scale, `${scale}/full applied count mismatch`);
    assert(partial.value.status === 'committed', `${scale}/partial transaction did not commit`);
    assert(
      partial.value.applied.length === partialTargets.length,
      `${scale}/partial applied count mismatch`,
    );
    assert(empty.value.status === 'unchanged', `${scale}/empty transaction changed state`);
    assert(
      empty.value.revisions.sceneRevision === revisionBeforeEmpty,
      `${scale}/empty transaction advanced revision`,
    );
    assert(invalid.value.status === 'rejected', `${scale}/invalid transaction was not rejected`);
    assert(
      invalid.value.transactionDiagnostic?.code === 'MISSING_TARGET',
      `${scale}/invalid transaction diagnostic mismatch`,
    );
    assert(
      invalid.value.revisions.sceneRevision === revisionBeforeInvalid,
      `${scale}/invalid transaction advanced revision`,
    );
    assert(engine.exportDataset() === authorityBeforeInvalid, `${scale}/invalid transaction replaced authority`);
    assert(JSON.stringify(source) === sourceBefore, `${scale}/transaction path mutated caller input`);
    assert(surface.reconcileCount === 2, `${scale}/surface publication count mismatch`);

    return Object.freeze({
      trial,
      seed,
      timings: Object.freeze({
        fullBulkPatchMs: full.durationMs,
        partialBulkPatchMs: partial.durationMs,
        emptyBulkPatchMs: empty.durationMs,
        invalidRollbackMs: invalid.durationMs,
      }),
      observations: Object.freeze({
        full: Object.freeze({ status: full.value.status, applied: full.value.applied.length }),
        partial: Object.freeze({
          status: partial.value.status,
          applied: partial.value.applied.length,
        }),
        empty: Object.freeze({
          status: empty.value.status,
          sceneRevisionDelta: empty.value.revisions.sceneRevision - revisionBeforeEmpty,
        }),
        invalid: Object.freeze({
          status: invalid.value.status,
          diagnosticCode: invalid.value.transactionDiagnostic?.code ?? null,
          sceneRevisionDelta: invalid.value.revisions.sceneRevision - revisionBeforeInvalid,
          authorityPreserved: engine.exportDataset() === authorityBeforeInvalid,
        }),
        reconcileCount: surface.reconcileCount,
        inputImmutable: JSON.stringify(source) === sourceBefore,
      }),
    });
  } finally {
    await engine.destroy();
  }
}

class TransactionCheckpointSurface {
  canvasCount = 0;
  destroyed = false;
  reconcileCount = 0;
  selectionIds = Object.freeze([]);
  dataset = null;
  width = 0;
  height = 0;
  pixelRatio = 1;

  load(input) {
    this.dataset = input;
  }

  reconcile(input) {
    this.dataset = input;
    this.reconcileCount += 1;
    return Object.freeze({
      status: 'committed',
      operationCount: Array.isArray(input) ? input.length : 0,
      denseChanged: true,
      diagnostics: Object.freeze([]),
    });
  }

  publishFrame() {}

  resize(width, height, pixelRatio) {
    const changed = width !== this.width || height !== this.height || pixelRatio !== this.pixelRatio;
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    return changed;
  }

  setView() {}

  select(ids) {
    this.selectionIds = Object.freeze([...ids]);
  }

  hitTestScreen() {
    return null;
  }

  screenToWorld(point) {
    return Object.freeze({ x: point.x, y: point.y });
  }

  debugSnapshot() {
    return Object.freeze({
      cssSize: Object.freeze([this.width, this.height]),
      backingSize: Object.freeze([
        Math.round(this.width * this.pixelRatio),
        Math.round(this.height * this.pixelRatio),
      ]),
      selectionIds: this.selectionIds,
      activeAnimationCount: 0,
      activeGestureCount: 0,
      renderCommandCount: 0,
      visiblePrimitiveCount: 0,
    });
  }

  async destroy() {
    if (this.destroyed) return false;
    this.destroyed = true;
    this.dataset = null;
    return true;
  }
}

function summarizeTrials(trials) {
  return Object.freeze(Object.fromEntries(METRICS.map((metric) => [
    metric,
    summarizeUpdateSamples(trials.map((trial) => trial.timings[metric])),
  ])));
}

function validateTrial(trial, scale, trialIndex) {
  assert(
    trial?.trial === trialIndex,
    `${scale}/trial ${trialIndex} index mismatch (received ${String(trial?.trial)})`,
  );
  const expectedSeed = UPDATE_PERFORMANCE_PROTOCOL.seedBase + scale * 31 + trialIndex;
  assert(
    trial?.seed === expectedSeed,
    `${scale}/trial ${trialIndex} seed mismatch (received ${String(trial?.seed)})`,
  );
  for (const metric of METRICS) {
    const value = trial?.timings?.[metric];
    assert(
      typeof value === 'number' && Number.isFinite(value) && value >= 0,
      `${scale}/trial ${trialIndex}/${metric} is invalid`,
    );
  }
  assert(trial?.observations?.full?.status === 'committed', `${scale}/trial ${trialIndex} full status mismatch`);
  assert(trial?.observations?.full?.applied === scale, `${scale}/trial ${trialIndex} full count mismatch`);
  assert(trial?.observations?.partial?.status === 'committed', `${scale}/trial ${trialIndex} partial status mismatch`);
  assert(
    trial?.observations?.partial?.applied === partialTargetCount(scale),
    `${scale}/trial ${trialIndex} partial count mismatch`,
  );
  assert(trial?.observations?.empty?.status === 'unchanged', `${scale}/trial ${trialIndex} empty status mismatch`);
  assert(trial?.observations?.empty?.sceneRevisionDelta === 0, `${scale}/trial ${trialIndex} empty revision mismatch`);
  assert(trial?.observations?.invalid?.status === 'rejected', `${scale}/trial ${trialIndex} invalid status mismatch`);
  assert(
    trial?.observations?.invalid?.diagnosticCode === 'MISSING_TARGET',
    `${scale}/trial ${trialIndex} invalid diagnostic mismatch`,
  );
  assert(trial?.observations?.invalid?.sceneRevisionDelta === 0, `${scale}/trial ${trialIndex} rollback revision mismatch`);
  assert(trial?.observations?.invalid?.authorityPreserved === true, `${scale}/trial ${trialIndex} authority mismatch`);
  assert(trial?.observations?.reconcileCount === 2, `${scale}/trial ${trialIndex} reconcile count mismatch`);
  assert(trial?.observations?.inputImmutable === true, `${scale}/trial ${trialIndex} input mutation`);
}

function measure(run) {
  const started = performance.now();
  const value = run();
  return Object.freeze({ durationMs: performance.now() - started, value });
}

function percentile(sortedSamples, quantile) {
  const index = Math.max(0, Math.ceil(sortedSamples.length * quantile) - 1);
  return sortedSamples[index];
}

function partialTargetCount(scale) {
  return Math.max(1, Math.floor(scale * UPDATE_PERFORMANCE_PROTOCOL.partialFraction));
}

function itemId(index) {
  return `item-${String(index).padStart(5, '0')}`;
}

function sameNumbers(left, right) {
  return Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function assert(condition, message) {
  if (!condition) throw new Error(`PatchMap update performance checkpoint: ${message}`);
}

async function main() {
  const outputPath = argumentValue('--output') ?? DEFAULT_OUTPUT;
  const output = await runPatchMapUpdatePerformanceCheckpoint({ outputPath: path.resolve(outputPath) });
  process.stdout.write(
    `PASS: ${output.runs.length} scales, ${output.protocol.warmups}+${output.protocol.measured} update transaction trials -> ${path.resolve(outputPath)}\n`,
  );
}

function argumentValue(name) {
  const prefix = `${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
