#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SUMMARY_PATH = path.join(
  ROOT,
  'performance/core-v2/results/contract-performance.json',
);
const LATEST_RAW_PATH = path.join(
  ROOT,
  'performance/core-v2/results/contract-performance-raw-latest.json',
);
const MANIFEST_PATH = path.join(
  ROOT,
  'docs/reference/core-v2-functional-contract/evidence/catalog-evidence-manifest.v1.json',
);
const SIZES = Object.freeze([
  100,
  500,
  1_000,
  2_000,
  5_000,
  'production-shaped-workload-v1',
]);
const CASE_IDS = Object.freeze([
  'PRF-001',
  'PRF-002',
  'PRF-003',
  'PRF-004',
  'PRF-005',
  'PRF-006',
  'PRF-009',
]);
const PRODUCTION_DATASET_SHA256 =
  '4bc16c65500b4f305114162fdc4472b45997eea7498020496072ca0b741e95c3';

async function main() {
  const summary = JSON.parse(await readFile(SUMMARY_PATH, 'utf8'));
  const rawPath = path.join(ROOT, summary.rawArtifact.path);
  const [rawText, latestText, manifestText] = await Promise.all([
    readFile(rawPath, 'utf8'),
    readFile(LATEST_RAW_PATH, 'utf8'),
    readFile(MANIFEST_PATH, 'utf8'),
  ]);
  const raw = JSON.parse(rawText);
  const manifest = JSON.parse(manifestText);
  const rawDigest = createHash('sha256').update(rawText).digest('hex');

  assert(summary.revision === 'core-v2-contract-performance-evidence/1', 'summary revision');
  assert(summary.status === 'complete', 'summary completion status');
  assert(raw.revision === 'core-v2-contract-performance-raw/1', 'raw revision');
  assert(rawDigest === summary.rawArtifact.sha256, 'raw artifact digest');
  assert(rawDigest === summary.provenance.rawArtifactSha256, 'provenance raw digest');
  assert(latestText === rawText, 'latest raw byte identity');
  assert(summary.provenance.codeCommit === raw.codeCommit, 'code commit binding');
  assert(summary.provenance.expectedEvidenceBound === true, 'expected evidence binding');
  assert(summary.environment.contractProfileBound === true, 'contract profile binding');
  assert(summary.environment.backend === 'webgl2', 'summary WebGL2 backend');
  assert(summary.environment.actualMode === 'headless', 'headless checkpoint mode');
  assert(summary.environment.headedReleaseStatus === 'pending', 'headed release pending');
  assert(summary.environment.windowsNative === 'pending', 'Windows native pending');
  assert(summary.browser.errorCount === 0, 'browser error count');
  assert(summary.browser.lifecycleFailureCount === 0, 'lifecycle failure count');
  assert(raw.browser.consoleErrors.length === 0, 'raw console errors');
  assert(raw.browser.pageErrors.length === 0, 'raw page errors');
  assert(raw.browser.networkFailures.length === 0, 'raw network failures');
  assert(sameJson(summary.protocol.sizes, SIZES), 'summary size matrix');
  assert(summary.protocol.warmups === 2, 'summary warmups');
  assert(summary.protocol.samples === 7, 'summary samples');
  assert(summary.protocol.seed === 319, 'summary seed');
  assert(summary.protocol.cpuThrottleRate === 4, 'summary CPU throttle');
  assert(raw.runs.length === SIZES.length, 'raw run count');

  const manifestById = new Map(manifest.cases.map((record) => [record.id, record]));
  for (const id of CASE_IDS) {
    const record = manifestById.get(id);
    assert(record !== undefined, `${id} manifest record`);
    assert(
      summary.provenance.expectedRecordDigests[id]
        === record.expectedRecordSha256,
      `${id} expected record digest`,
    );
  }

  for (const [index, run] of raw.runs.entries()) {
    assert(run.size === SIZES[index], `${String(run.size)} canonical order`);
    assert(run.seed === 319, `${String(run.size)} seed`);
    assert(run.warmupRaw.length === 2, `${String(run.size)} warmups`);
    assert(run.measuredRaw.length === 7, `${String(run.size)} samples`);
    for (const trial of [...run.warmupRaw, ...run.measuredRaw]) {
      validateTrial(trial, run.size);
    }
  }
  assert(summary.rawArtifact.sampleCount === 42, 'measured raw sample count');
  assert(summary.rawArtifact.warmupSampleCount === 12, 'warmup raw sample count');

  const allMeasured = raw.runs.flatMap((run) => run.measuredRaw);
  const allLongTasks = allMeasured.flatMap((trial) => trial.longTaskDurationsMs);
  const allVisible = allMeasured.flatMap(
    (trial) => trial.visible.actionToVisibleMs,
  );
  const allFrameGaps = allMeasured.flatMap(
    (trial) => trial.visible.frameGapsMs,
  );
  assert(
    summary.cases['PRF-001'].longTaskAtLeast100Ms
      === allLongTasks.filter((duration) => duration >= 100).length,
    'PRF-001 long task count',
  );
  assert(
    summary.cases['PRF-001'].actionToVisibleP95Ms
      === percentile(allVisible, 0.95),
    'PRF-001 action-to-visible p95',
  );
  assert(
    summary.cases['PRF-001'].frameGapP95Ms
      === percentile(allFrameGaps, 0.95),
    'PRF-001 frame gap p95',
  );

  const production = requireRun(raw, 'production-shaped-workload-v1');
  assert(
    production.measuredRaw.every(
      (trial) => (
        trial.diagnostics.canonicalDatasetSha256
        === PRODUCTION_DATASET_SHA256
      ),
    ),
    'production canonical dataset SHA',
  );
  const firstFrameP95 = Math.max(...raw.runs.map((run) =>
    percentile(
      run.measuredRaw.map((trial) => trial.phases.firstUsefulFrameMs),
      0.95,
    )));
  assert(
    summary.cases['PRF-002'].firstUsefulFrame.maxP95Ms === firstFrameP95,
    'PRF-002 first useful frame max p95',
  );
  assert(
    summary.cases['PRF-002'].firstUsefulFrame.semanticHash
      === PRODUCTION_DATASET_SHA256,
    'PRF-002 first useful frame semantic hash',
  );
  assert(summary.cases['PRF-002'].allPhaseValuesFinite === true, 'finite phase values');
  assert(summary.cases['PRF-002'].valuesFinite === true, 'finite revision values');

  const run2k = requireRun(raw, 2_000);
  const run5k = requireRun(raw, 5_000);
  assertCaseP95(
    summary.cases['PRF-003'].actionToVisibleP95Ms,
    run2k.measuredRaw.flatMap(
      (trial) => trial.visible.bar.actionToVisibleMs,
    ),
    'PRF-003 action-to-visible',
  );
  assertCaseP95(
    summary.cases['PRF-003'].frameGapP95Ms,
    run2k.measuredRaw.flatMap((trial) => trial.visible.bar.frameGapsMs),
    'PRF-003 frame gap',
  );
  assertCaseP95(
    summary.cases['PRF-004'].actionToVisibleP95Ms,
    run2k.measuredRaw.flatMap(
      (trial) => trial.visible.text.map((entry) => entry.actionToVisibleMs),
    ),
    'PRF-004 action-to-visible',
  );
  assertCaseP95(
    summary.cases['PRF-005'].actionToVisibleP95Ms,
    run5k.measuredRaw.flatMap(
      (trial) => trial.visible.bulk.map((entry) => entry.actionToVisibleMs),
    ),
    'PRF-005 action-to-visible',
  );
  assertCaseP95(
    summary.cases['PRF-006'].inputToVisibleP95Ms,
    run5k.measuredRaw.flatMap(
      (trial) => trial.visible.interaction.inputToVisibleMs,
    ),
    'PRF-006 input-to-visible',
  );
  assertCaseP95(
    summary.cases['PRF-006'].frameGapP95Ms,
    run5k.measuredRaw.flatMap(
      (trial) => trial.visible.interaction.frameGapsMs,
    ),
    'PRF-006 frame gap',
  );
  assert(
    summary.cases['PRF-005'].complexityExponentMax
      === complexityExponent(summary.cases['PRF-005'].bulkP95BySize),
    'PRF-005 complexity exponent',
  );

  process.stdout.write(
    `PatchMap contract performance evidence verified: `
      + `${raw.runs.length} workloads, 2+7, raw ${rawDigest}, `
      + `${allLongTasks.filter((duration) => duration >= 100).length} long tasks, `
      + `browser/lifecycle errors 0, headed and Windows pending\n`,
  );
}

function validateTrial(trial, size) {
  const phaseNames = [
    'validateMs',
    'materializeMs',
    'assetMs',
    'storeLoadMs',
    'uploadPrepareMs',
    'firstUsefulFrameMs',
    'destroyMs',
  ];
  for (const name of phaseNames) {
    assert(
      typeof trial.phases[name] === 'number'
        && Number.isFinite(trial.phases[name])
        && trial.phases[name] >= 0,
      `${String(size)} ${name}`,
    );
  }
  for (const value of [
    ...trial.visible.actionToVisibleMs,
    ...trial.visible.frameGapsMs,
    ...trial.longTaskDurationsMs,
  ]) {
    assert(typeof value === 'number' && Number.isFinite(value) && value >= 0, `${String(size)} timing`);
  }
  assert(trial.diagnostics.inputUnchanged === true, `${String(size)} input immutable`);
  assert(trial.diagnostics.requestedBackend === 'webgl2', `${String(size)} WebGL2 request`);
  assert(trial.diagnostics.rendererBackend === 'webgl', `${String(size)} Pixi WebGL backend`);
  assert(trial.diagnostics.destroyReturned === true, `${String(size)} destroy returned`);
  assert(trial.diagnostics.lifecycleAfterDestroy === 'destroyed', `${String(size)} destroyed`);
  assert(trial.diagnostics.canvasCountAfterDestroy === 0, `${String(size)} canvas cleanup`);
  assert(trial.diagnostics.pendingWorkAfterDestroy === 0, `${String(size)} work cleanup`);
  assert(trial.diagnostics.subscriptionCountAfterDestroy === 0, `${String(size)} subscription cleanup`);
  assert(trial.diagnostics.surfaceChildCountAfterDestroy === 0, `${String(size)} DOM cleanup`);
  assert(trial.diagnostics.revisionValuesFinite === true, `${String(size)} finite revisions`);
}

function requireRun(raw, size) {
  const run = raw.runs.find((entry) => entry.size === size);
  assert(run !== undefined, `${String(size)} raw run`);
  return run;
}

function assertCaseP95(actual, samples, label) {
  assert(actual === percentile(samples, 0.95), `${label} p95`);
}

function complexityExponent(rows) {
  return Math.max(
    0,
    ...rows.slice(1).map((entry, index) => {
      const previous = rows[index];
      if (entry.p95 <= 0 || previous.p95 <= 0) return 0;
      return Math.log(entry.p95 / previous.p95)
        / Math.log(entry.size / previous.size);
    }),
  );
}

function percentile(values, quantile) {
  assert(values.length > 0, 'percentile samples');
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)];
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`PatchMap contract performance verification failed: ${message}`);
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
