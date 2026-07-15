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

const baseline = await loadJson(baselinePath);
verifyBaseline(baseline.data);

const typed = await loadJson(typedPath);
verifyTyped(typed.data);

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
    `Evidence files: baseline=${baseline.hash.slice(0, 12)}, typed-canvas=${typed.hash.slice(0, 12)}, flat-pixi=${flatFiles.length} files/${flatHashes.size} unique payloads`,
  );
}
