#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const baselinePath = path.join(repoRoot, 'performance/core-v1/results/baseline-quick.json');
const typedPath = path.join(
  repoRoot,
  'performance/core-v1/spikes/typed-canvas/results.quick.json',
);
const flatDirectory = path.join(repoRoot, 'performance/core-v1/spikes/flat-pixi/results');
const selectedPath = path.join(
  repoRoot,
  'performance/core-v1/selected/results/latest-full-4x.json',
);

const failures = [];
let metricCount = 0;
let workloadCount = 0;

function check(condition, message) {
  if (!condition) failures.push(message);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function verifySummary(metric, label, { requireRawArray }) {
  check(metric && typeof metric === 'object', `${label}: summary must be an object`);
  if (!metric || typeof metric !== 'object') return;

  for (const field of ['min', 'median', 'p95', 'max']) {
    check(isFiniteNumber(metric[field]), `${label}: ${field} must be finite`);
  }

  if (requireRawArray) {
    check(Array.isArray(metric.raw) && metric.raw.length > 0, `${label}: raw must be non-empty`);
    if (Array.isArray(metric.raw)) {
      check(metric.raw.every(isFiniteNumber), `${label}: every raw value must be finite`);
    }
  } else {
    check(Number.isInteger(metric.rawCount) && metric.rawCount > 0, `${label}: rawCount must be positive`);
  }

  if (
    isFiniteNumber(metric.min) &&
    isFiniteNumber(metric.median) &&
    isFiniteNumber(metric.p95) &&
    isFiniteNumber(metric.max)
  ) {
    check(metric.min <= metric.median, `${label}: min exceeds median`);
    check(metric.median <= metric.p95, `${label}: median exceeds p95`);
    check(metric.p95 <= metric.max, `${label}: p95 exceeds max`);
  }

  metricCount += 1;
}

async function loadJson(file) {
  const source = await readFile(file, 'utf8');
  return {
    data: JSON.parse(source),
    hash: createHash('sha256').update(source).digest('hex'),
  };
}

function verifyBaseline(data) {
  check(data?.run?.rawSamplesPreserved === true, 'baseline: rawSamplesPreserved must be true');
  check(Array.isArray(data?.scenarios) && data.scenarios.length > 0, 'baseline: scenarios must be non-empty');

  for (const scenario of data.scenarios ?? []) {
    const label = `baseline/${scenario.name ?? '<unnamed>'}`;
    const topLevel = scenario?.workload?.topLevelElements;
    const gridCells = scenario?.workload?.gridCells;
    check(isFiniteNumber(topLevel) && topLevel > 0, `${label}: topLevelElements must be positive`);
    check(isFiniteNumber(gridCells) && gridCells >= 0, `${label}: gridCells must be non-negative`);
    check(Array.isArray(scenario.samples) && scenario.samples.length > 0, `${label}: raw samples must be non-empty`);
    check(scenario.summary && Object.keys(scenario.summary).length > 0, `${label}: summary must be non-empty`);
    for (const [name, metric] of Object.entries(scenario.summary ?? {})) {
      verifySummary(metric, `${label}/${name}`, { requireRawArray: false });
    }
    workloadCount += 1;
  }
}

function verifyTyped(data) {
  check(Array.isArray(data?.workloads) && data.workloads.length > 0, 'typed-canvas: workloads must be non-empty');
  for (const workload of data.workloads ?? []) {
    const label = `typed-canvas/${workload.name ?? '<unnamed>'}`;
    check(isFiniteNumber(workload.entityCount) && workload.entityCount > 0, `${label}: entityCount must be positive`);
    check(workload.metrics && Object.keys(workload.metrics).length > 0, `${label}: metrics must be non-empty`);
    for (const [name, metric] of Object.entries(workload.metrics ?? {})) {
      verifySummary(metric, `${label}/${name}`, { requireRawArray: true });
    }
    workloadCount += 1;
  }
}

function verifyFlat(data, fileName) {
  const entries = Object.entries(data?.workloads ?? {});
  check(entries.length > 0, `flat-pixi/${fileName}: workloads must be non-empty`);
  for (const [name, workload] of entries) {
    const label = `flat-pixi/${fileName}/${name}`;
    check(isFiniteNumber(workload.entityCount) && workload.entityCount > 0, `${label}: entityCount must be positive`);
    check(Array.isArray(workload.raw) && workload.raw.length > 0, `${label}: top-level raw samples must be non-empty`);
    check(workload.summary && Object.keys(workload.summary).length > 0, `${label}: summary must be non-empty`);
    for (const [metricName, metric] of Object.entries(workload.summary ?? {})) {
      verifySummary(metric, `${label}/${metricName}`, { requireRawArray: true });
    }
    workloadCount += 1;
  }
}

function verifySelected(data) {
  const expected = new Map([
    ['synthetic-100', 100],
    ['synthetic-500', 500],
    ['synthetic-1000', 1_000],
    ['synthetic-2000', 2_000],
    ['synthetic-5000', 5_000],
    ['production-37071', 37_071],
  ]);
  check(data?.schemaVersion >= 2, 'selected: schemaVersion must include post-update spatial evidence');
  check(data?.mode === 'full', 'selected: latest full result must use full mode');
  check(data?.warmupCount === 2, 'selected: warmupCount must be 2');
  check(data?.sampleCount === 7, 'selected: sampleCount must be 7');
  check(data?.environment?.cpuThrottleRate === 4, 'selected: Chromium CPU throttle must be 4x');
  check(data?.environment?.windowsNative === 'pending', 'selected: Windows-native status must remain pending');
  check(data?.fixture?.bytes === 1_317_998, 'selected: production fixture byte size changed');
  check(
    data?.fixture?.sha256 === '9afd9e179c613b3833acd99cbe0a747fe2068475dc14ab9dada5d512fdbd1a86',
    'selected: production fixture SHA-256 changed',
  );
  check(data?.fixture?.expectedEntities === 37_071, 'selected: production entity expansion changed');
  check(data?.browser?.errors?.length === 0, 'selected: browser errors must be empty');
  check(data?.browser?.networkFailures?.length === 0, 'selected: network failures must be empty');
  check(Array.isArray(data?.workloads) && data.workloads.length === expected.size, 'selected: workload matrix is incomplete');

  for (const workload of data?.workloads ?? []) {
    const label = `selected/${workload.id ?? '<unnamed>'}`;
    check(expected.get(workload.id) === workload.entityCount, `${label}: entityCount changed`);
    expected.delete(workload.id);
    check(
      Array.isArray(workload.rawSamples) && workload.rawSamples.length === data.sampleCount,
      `${label}: raw sample count must match measured samples`,
    );
    check(workload.summary && Object.keys(workload.summary).length > 0, `${label}: summary must be non-empty`);
    check(
      workload.summary?.postUpdateHitTestMs,
      `${label}: post-update spatial refresh metric is required`,
    );
    for (const [metricName, metric] of Object.entries(workload.summary ?? {})) {
      verifySummary(metric, `${label}/${metricName}`, { requireRawArray: true });
      check(metric.samples === metric.raw.length, `${label}/${metricName}: samples must match raw length`);
    }
    workloadCount += 1;
  }
  check(expected.size === 0, `selected: missing workloads ${[...expected.keys()].join(', ')}`);
}

const baseline = await loadJson(baselinePath);
verifyBaseline(baseline.data);

const typed = await loadJson(typedPath);
verifyTyped(typed.data);

const selected = await loadJson(selectedPath);
verifySelected(selected.data);

const flatFiles = (await readdir(flatDirectory))
  .filter((file) => file.endsWith('.json'))
  .sort();
check(flatFiles.length > 0, 'flat-pixi: at least one result JSON is required');

const flatHashes = new Set();
for (const file of flatFiles) {
  const result = await loadJson(path.join(flatDirectory, file));
  flatHashes.add(result.hash);
  verifyFlat(result.data, file);
}

if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} evidence validation error(s)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `PASS: ${workloadCount} workload records and ${metricCount} summaries contain nonzero workload, raw evidence, median, and p95`,
  );
  console.log(
    `Evidence files: baseline=${baseline.hash.slice(0, 12)}, typed-canvas=${typed.hash.slice(0, 12)}, selected=${selected.hash.slice(0, 12)}, flat-pixi=${flatFiles.length} files/${flatHashes.size} unique payloads`,
  );
}
