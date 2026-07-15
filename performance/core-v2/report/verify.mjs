#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const DEFAULT_RESULT = path.join(ROOT, 'performance/core-v2/results/latest-full-4x.json');
const REQUIRED_SCALES = Object.freeze([100, 500, 1_000, 2_000, 5_000, 'production']);
const REQUIRED_WARMUPS = 2;
const REQUIRED_MEASURED = 7;

const METRICS = Object.freeze({
  applicationInitMs: (trial) => trial.phases.applicationInitMs,
  normalizeMs: (trial) => trial.phases.normalizeMs,
  storeLoadMs: (trial) => trial.phases.storeLoadMs,
  rendererBuildMs: (trial) => trial.phases.rendererBuildMs,
  gpuPrepareMs: (trial) => trial.phases.gpuPrepareMs,
  firstVisibleFrameMs: (trial) => trial.phases.firstVisibleFrameMs,
  panZoomP95Ms: (trial) => trial.phases.panZoom.p95Ms,
  barVisibilitySetupCommitMs: (trial) => trial.phases.barVisibilitySetup.commitMs,
  barVisibilitySetupRenderMs: (trial) => trial.phases.barVisibilitySetup.renderMs,
  barVisibilitySetupTotalMs: (trial) => trial.phases.barVisibilitySetup.totalMs,
  fullBarAnimationScheduleMs: (trial) => trial.phases.fullBarAnimation.scheduleMs,
  fullBarAnimationP95Ms: (trial) => trial.phases.fullBarAnimation.p95Ms,
  partialBarAnimationScheduleMs: (trial) => trial.phases.partialBarAnimation.scheduleMs,
  partialBarAnimationP95Ms: (trial) => trial.phases.partialBarAnimation.p95Ms,
  cjkFallbackFirstRenderCommitMs: (trial) => trial.phases.cjkFallbackFirstRender.commitMs,
  cjkFallbackFirstRenderRenderMs: (trial) => trial.phases.cjkFallbackFirstRender.renderMs,
  cjkFallbackFirstRenderTotalMs: (trial) => trial.phases.cjkFallbackFirstRender.totalMs,
  randomTextChangeCommitMs: (trial) => trial.phases.randomTextChange.commitMs,
  randomTextChangeRenderMs: (trial) => trial.phases.randomTextChange.renderMs,
  randomTextChangeTotalMs: (trial) => trial.phases.randomTextChange.totalMs,
  hitTestBatchMs: (trial) => trial.phases.hitTestBatchMs,
  hitTestPerOperationMs: (trial) => trial.phases.hitTestPerOperationMs,
  selectionCommitMs: (trial) => trial.phases.selection.commitMs,
  selectionRenderMs: (trial) => trial.phases.selection.renderMs,
  selectionTotalMs: (trial) => trial.phases.selection.totalMs,
  resizeMs: (trial) => trial.phases.resizeMs,
  destroyMs: (trial) => trial.phases.destroyMs,
  reinitializeMs: (trial) => trial.phases.reinitializeMs,
  retainedJsHeapBytes: (trial) => trial.phases.retainedJsHeapBytes,
});

const failures = [];
let trialCount = 0;
let summaryCount = 0;

function check(condition, message) {
  if (!condition) failures.push(message);
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function close(left, right) {
  return finite(left) && finite(right) && Math.abs(left - right) <= 1e-9;
}

function percentile(values, quantile) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * quantile) - 1);
  return sorted[index];
}

function computedStats(values) {
  return {
    samples: values,
    min: Math.min(...values),
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: Math.max(...values),
  };
}

function validateFramePhase(phase, label) {
  check(phase && typeof phase === 'object', `${label}: frame phase must be an object`);
  if (!phase || typeof phase !== 'object') return;
  check(Array.isArray(phase.framesMs) && phase.framesMs.length > 0, `${label}: framesMs must be non-empty`);
  if (Array.isArray(phase.framesMs)) {
    check(
      phase.framesMs.every((value) => finite(value) && value >= 0),
      `${label}: every frame must be finite and non-negative`,
    );
    if (phase.framesMs.length > 0 && phase.framesMs.every(finite)) {
      check(
        close(phase.p95Ms, percentile(phase.framesMs, 0.95)),
        `${label}: p95Ms does not match nearest-rank frame p95`,
      );
    }
  }
  check(finite(phase.p95Ms) && phase.p95Ms >= 0, `${label}: p95Ms must be finite and non-negative`);
}

function validateAnimationPhase(phase, label) {
  validateFramePhase(phase, label);
  if (!phase || typeof phase !== 'object') return;
  check(finite(phase.scheduleMs) && phase.scheduleMs >= 0, `${label}/scheduleMs: must be finite and non-negative`);
  check(Number.isInteger(phase.scheduledCount) && phase.scheduledCount > 0, `${label}/scheduledCount: must be a positive integer`);
}

function validateSplitPhase(phase, label) {
  check(phase && typeof phase === 'object', `${label}: split phase must be an object`);
  if (!phase || typeof phase !== 'object') return;
  for (const field of ['commitMs', 'renderMs', 'totalMs']) {
    check(finite(phase[field]) && phase[field] >= 0, `${label}/${field}: must be finite and non-negative`);
  }
  if (finite(phase.totalMs) && finite(phase.commitMs) && finite(phase.renderMs)) {
    check(
      phase.totalMs + 1e-9 >= Math.max(phase.commitMs, phase.renderMs),
      `${label}: totalMs must cover the larger split`,
    );
  }
}

function validateTrial(trial, run, label) {
  check(trial && typeof trial === 'object', `${label}: trial must be an object`);
  if (!trial || typeof trial !== 'object') return;
  check(Number.isInteger(trial.trial) && trial.trial >= 0, `${label}: trial index must be non-negative`);
  check(Number.isInteger(trial.seed), `${label}: seed must be an integer`);
  check(trial.phases && typeof trial.phases === 'object', `${label}: phases must be an object`);
  if (trial.phases && typeof trial.phases === 'object') {
    for (const field of [
      'applicationInitMs',
      'normalizeMs',
      'storeLoadMs',
      'rendererBuildMs',
      'gpuPrepareMs',
      'firstVisibleFrameMs',
      'hitTestBatchMs',
      'hitTestPerOperationMs',
      'resizeMs',
      'destroyMs',
      'reinitializeMs',
    ]) {
      check(
        finite(trial.phases[field]) && trial.phases[field] >= 0,
        `${label}/phases/${field}: must be finite and non-negative`,
      );
    }
    check(
      finite(trial.phases.retainedJsHeapBytes),
      `${label}/phases/retainedJsHeapBytes: retained heap evidence must be finite`,
    );
    validateFramePhase(trial.phases.panZoom, `${label}/phases/panZoom`);
    for (const field of ['fullBarAnimation', 'partialBarAnimation']) {
      validateAnimationPhase(trial.phases[field], `${label}/phases/${field}`);
    }
    for (const field of ['barVisibilitySetup', 'cjkFallbackFirstRender', 'randomTextChange', 'selection']) {
      validateSplitPhase(trial.phases[field], `${label}/phases/${field}`);
    }
  }

  const diagnostics = trial.diagnostics;
  check(diagnostics && typeof diagnostics === 'object', `${label}: diagnostics must be an object`);
  if (diagnostics && typeof diagnostics === 'object') {
    for (const field of [
      'sourceRecordCount',
      'expandedEntityCount',
      'componentCount',
      'relationCount',
      'aggregateRenderObjects',
      'uploadedChunks',
      'uploadedBytes',
      'dynamicFullUploadCount',
      'staticInvalidatedUploadCount',
      'particleFullUploadCount',
      'sourceVisibleBarCount',
      'barVisibilitySetupCount',
      'animatedVisibleBarCount',
      'fullBarAnimationUploadedChunks',
      'fullBarAnimationUploadedBytes',
      'partialBarAnimationUploadedChunks',
      'partialBarAnimationUploadedBytes',
      'hitCount',
      'selectedCount',
      'cjkFallbackFirstRenderCount',
      'randomTextChangeCount',
      'initialBitmapTextCount',
      'initialFallbackTextCount',
    ]) {
      check(
        Number.isInteger(diagnostics[field]) && diagnostics[field] >= 0,
        `${label}/diagnostics/${field}: must be a non-negative integer`,
      );
    }
    check(
      diagnostics.strategy === run.strategy,
      `${label}/diagnostics/strategy: expected ${run.strategy}, received ${diagnostics.strategy}`,
    );
    check(diagnostics.cjkFallbackFirstRenderCount > 0, `${label}/diagnostics/cjkFallbackFirstRenderCount: must prove an inserted CJK fallback render`);
    check(diagnostics.randomTextChangeCount > 0, `${label}/diagnostics/randomTextChangeCount: must prove a non-noop text update`);
    if (run.scale !== 'production') {
      check(diagnostics.initialBitmapTextCount > 0, `${label}/diagnostics/initialBitmapTextCount: synthetic input must prove initial BitmapText materialization`);
      check(diagnostics.sourceVisibleBarCount > 0, `${label}/diagnostics/sourceVisibleBarCount: synthetic bars must start visible`);
      check(diagnostics.barVisibilitySetupCount === 0, `${label}/diagnostics/barVisibilitySetupCount: synthetic bars must not need visibility setup`);
    } else {
      check(diagnostics.sourceVisibleBarCount === 0, `${label}/diagnostics/sourceVisibleBarCount: frozen production bars are expected to start hidden`);
      check(diagnostics.barVisibilitySetupCount > 0, `${label}/diagnostics/barVisibilitySetupCount: production animation must explicitly reveal hidden bars`);
    }
    check(diagnostics.animatedVisibleBarCount > 0, `${label}/diagnostics/animatedVisibleBarCount: animation workload must contain visible bars`);
    if (run.strategy === 'mesh') {
      check(diagnostics.fullBarAnimationUploadedChunks > 0, `${label}/diagnostics/fullBarAnimationUploadedChunks: Mesh full animation must publish dirty chunks`);
      check(diagnostics.partialBarAnimationUploadedChunks > 0, `${label}/diagnostics/partialBarAnimationUploadedChunks: Mesh partial animation must publish dirty chunks`);
      check(diagnostics.fullBarAnimationUploadedBytes > 0, `${label}/diagnostics/fullBarAnimationUploadedBytes: Mesh full animation must upload dirty bar bytes`);
      check(diagnostics.partialBarAnimationUploadedBytes > 0, `${label}/diagnostics/partialBarAnimationUploadedBytes: Mesh partial animation must upload dirty bar bytes`);
    }
    check(
      trial.phases.fullBarAnimation.scheduledCount === diagnostics.animatedVisibleBarCount,
      `${label}: full animation scheduled count must cover every visible benchmark bar`,
    );
    check(
      typeof diagnostics.backend === 'string' && diagnostics.backend.length > 0,
      `${label}/diagnostics/backend: must be present`,
    );
    check(
      typeof diagnostics.checksum === 'string' && diagnostics.checksum.length > 0,
      `${label}/diagnostics/checksum: must be present`,
    );
  }
  trialCount += 1;
}

function validateSummary(run, label) {
  check(run.summary && typeof run.summary === 'object', `${label}: summary must be an object`);
  if (!run.summary || typeof run.summary !== 'object') return;
  for (const [metric, read] of Object.entries(METRICS)) {
    let values;
    try {
      values = run.measuredRaw.map(read);
    } catch (error) {
      failures.push(`${label}/${metric}: cannot read phase (${error instanceof Error ? error.message : error})`);
      continue;
    }
    if (!values.every(finite)) {
      failures.push(`${label}/${metric}: measured values must all be finite`);
      continue;
    }
    const expected = computedStats(values);
    const actual = run.summary[metric];
    check(actual && typeof actual === 'object', `${label}/${metric}: summary is missing`);
    if (!actual || typeof actual !== 'object') continue;
    check(
      Array.isArray(actual.samples) && actual.samples.length === REQUIRED_MEASURED,
      `${label}/${metric}: summary must preserve seven samples`,
    );
    if (Array.isArray(actual.samples)) {
      check(
        actual.samples.length === expected.samples.length &&
          actual.samples.every((value, index) => close(value, expected.samples[index])),
        `${label}/${metric}: summary samples do not match measured trial order`,
      );
    }
    for (const field of ['min', 'median', 'p95', 'max']) {
      check(
        close(actual[field], expected[field]),
        `${label}/${metric}: ${field}=${actual[field]} does not match recomputed ${expected[field]}`,
      );
    }
    summaryCount += 1;
  }
}

function key(role, strategy, scale) {
  return `${role}/${strategy}/${scale}`;
}

function validateRun(run, expectedKeys) {
  const label = key(run?.role ?? '<role>', run?.strategy ?? '<strategy>', run?.scale ?? '<scale>');
  check(run && typeof run === 'object', `${label}: run must be an object`);
  if (!run || typeof run !== 'object') return;
  check(run.role === 'spike' || run.role === 'selected', `${label}: role must be spike or selected`);
  check(run.strategy === 'mesh' || run.strategy === 'particle', `${label}: invalid strategy`);
  check(REQUIRED_SCALES.includes(run.scale), `${label}: scale is outside the full matrix`);
  check(expectedKeys.delete(label), `${label}: run is duplicate or unexpected`);
  check(Number.isInteger(run.seed), `${label}: seed must be an integer`);
  check(
    Array.isArray(run.warmupRaw) && run.warmupRaw.length === REQUIRED_WARMUPS,
    `${label}: must preserve exactly two warmup trials`,
  );
  check(
    Array.isArray(run.measuredRaw) && run.measuredRaw.length === REQUIRED_MEASURED,
    `${label}: must preserve exactly seven measured trials`,
  );
  for (const [index, trial] of (run.warmupRaw ?? []).entries()) {
    validateTrial(trial, run, `${label}/warmup/${index}`);
  }
  for (const [index, trial] of (run.measuredRaw ?? []).entries()) {
    validateTrial(trial, run, `${label}/measured/${index}`);
  }
  if (Array.isArray(run.measuredRaw) && run.measuredRaw.length === REQUIRED_MEASURED) {
    validateSummary(run, label);
  }
  check(
    run.harnessEnvironment === null || typeof run.harnessEnvironment === 'object',
    `${label}: harnessEnvironment must be an object or null`,
  );
}

const positional = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
const resultPath = positional ? path.resolve(process.cwd(), positional) : DEFAULT_RESULT;
const output = JSON.parse(await readFile(resultPath, 'utf8'));

check(output.schemaVersion === 1, 'schemaVersion must be 1');
check(output.mode === 'full', 'result mode must be full');
check(output.protocol?.warmups === REQUIRED_WARMUPS, 'protocol warmups must be 2');
check(output.protocol?.measured === REQUIRED_MEASURED, 'protocol measured trials must be 7');
check(output.protocol?.cpuThrottleRate === 4, 'protocol Chromium CPU throttle must be 4x');
check(
  Array.isArray(output.protocol?.scales) &&
    output.protocol.scales.length === REQUIRED_SCALES.length &&
    REQUIRED_SCALES.every((scale) => output.protocol.scales.includes(scale)),
  'protocol scale matrix must contain 100/500/1000/2000/5000/production',
);
check(output.selection?.selectedStrategy === 'mesh' || output.selection?.selectedStrategy === 'particle', 'selected strategy must be mesh or particle');
check(output.environment?.cpuThrottleRate === 4, 'environment CPU throttle must be 4x');
check(output.environment?.windowsNative === 'pending', 'Windows-native status must remain pending');
check(output.environment?.gpu && typeof output.environment.gpu === 'object', 'GPU environment metadata must be present');
check(output.environment?.gpu?.webgl && typeof output.environment.gpu.webgl === 'object', 'WebGL metadata must be present');
check(output.environment?.gpu?.webgpu && typeof output.environment.gpu.webgpu === 'object', 'WebGPU availability metadata must be present');
check(Array.isArray(output.browser?.consoleErrors) && output.browser.consoleErrors.length === 0, 'console errors must be empty');
check(Array.isArray(output.browser?.pageErrors) && output.browser.pageErrors.length === 0, 'page errors must be empty');
check(Array.isArray(output.browser?.networkFailures) && output.browser.networkFailures.length === 0, 'network failures must be empty');

const expectedKeys = new Set();
for (const scale of REQUIRED_SCALES) {
  expectedKeys.add(key('spike', 'mesh', scale));
  expectedKeys.add(key('spike', 'particle', scale));
  if (output.selection?.selectedStrategy === 'mesh' || output.selection?.selectedStrategy === 'particle') {
    expectedKeys.add(key('selected', output.selection.selectedStrategy, scale));
  }
}

check(Array.isArray(output.runs), 'runs must be an array');
for (const run of output.runs ?? []) validateRun(run, expectedKeys);
check(expectedKeys.size === 0, `missing required runs: ${[...expectedKeys].join(', ')}`);

if (failures.length > 0) {
  process.stderr.write(`FAIL: ${failures.length} Core v2 performance evidence error(s)\n`);
  for (const failure of failures) process.stderr.write(`- ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `PASS: ${output.runs.length} full-matrix runs, ${trialCount} raw trials, and ${summaryCount} recomputed summaries; Chromium 4x proxy valid, Windows native pending\n`,
  );
}
