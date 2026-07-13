import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const CANONICAL_SIZES = [100, 500, 1_000, 2_000, 5_000];
const FULL_COMMIT_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const METRICS = Object.freeze({
  initMs: (sample) => sample.initMs,
  initialSyncMs: (sample) => sample.initial?.syncMs,
  initialRenderMs: (sample) => sample.initial?.renderMs,
  initialTotalMs: (sample) => sample.initial?.totalMs,
  updateSyncMs: (sample) => sample.update?.syncMs,
  updateRenderMs: (sample) => sample.update?.renderMs,
  updateTotalMs: (sample) => sample.update?.totalMs,
  teardownSyncMs: (sample) => sample.teardownSyncMs,
  retainedHeapAfterDrawBytes: (sample) => sample.retainedHeapAfterDrawBytes,
  retainedHeapAfterUpdateBytes: (sample) => sample.retainedHeapAfterUpdateBytes,
  postDestroyRetainedHeapBytes: (sample) => sample.postDestroyRetainedHeapBytes,
  initialManagedObjects: (sample) => sample.initial?.scene?.managed,
  initialSceneNodes: (sample) => sample.initial?.scene?.total,
  updatedManagedObjects: (sample) => sample.update?.scene?.managed,
  updatedSceneNodes: (sample) => sample.update?.scene?.total,
});
const root = process.cwd();

const options = parseArgs(process.argv.slice(2));
const inputPath = resolveInside(root, options.input, 'input');
const outputPath = resolvePerfOutput(root, options.output);
const inputBytes = await readFile(inputPath);
const report = JSON.parse(inputBytes.toString('utf8'));

assert.equal(report.schemaVersion, 4, 'Unexpected performance report schema');
assert.equal(report.target?.entry, '/src/index.ts', 'Unexpected browser entrypoint');
assert.match(
  options.commit,
  FULL_COMMIT_PATTERN,
  '--commit must be a full 40- or 64-character hexadecimal commit ID',
);
assert.equal(
  report.target?.commit,
  options.commit,
  'Report commit does not exactly match --commit',
);
assert.equal(
  report.environment?.cpuThrottle,
  options.cpuThrottle,
  'Report CPU throttle does not match the requested verification mode',
);
assertExplicitEnvironmentLabel(
  report.environment?.deviceProfile,
  'device profile',
);
assertExplicitEnvironmentLabel(report.environment?.powerMode, 'power mode');
assert.notEqual(report.run?.quick, true, 'Canonical evidence cannot be quick');
assert.equal(report.run?.warmups, 2, 'Canonical evidence requires 2 warmups');
assert.equal(report.run?.iterations, 7, 'Canonical evidence requires 7 samples');
assert.deepEqual(
  report.run?.sizes,
  CANONICAL_SIZES,
  'Canonical evidence must cover all required item counts in order',
);
assert.equal(
  report.run?.renderBoundary,
  'synchronous-final-state-app-render-after-return',
  'Unexpected render measurement boundary',
);
assert.equal(report.scenarios?.length, CANONICAL_SIZES.length);

const evidenceClassification = classifyEvidence(report.environment);
if (!options.allowProvisional) {
  assert.notEqual(
    evidenceClassification,
    'provisional-non-windows-native',
    'Non-Windows throttle-1 evidence requires --allow-provisional',
  );
}

const verifiedScenarios = [];
for (const [index, itemCount] of CANONICAL_SIZES.entries()) {
  const scenario = report.scenarios[index];
  assert.equal(scenario?.itemCount, itemCount, `Scenario ${index} item count`);
  assert.equal(
    scenario?.samples?.length,
    7,
    `${itemCount} items must preserve all 7 raw samples`,
  );
  for (const sample of scenario.samples) {
    assert.equal(sample.itemCount, itemCount, 'Raw sample item count mismatch');
  }

  const recomputedSummary = Object.fromEntries(
    Object.entries(METRICS).map(([name, read]) => {
      const values = scenario.samples.map(read);
      assertExactFiniteSamples(values, `${itemCount}.${name}`);
      return [name, summarize(values)];
    }),
  );
  assert.deepEqual(
    scenario.summary,
    recomputedSummary,
    `${itemCount}-item summary does not match its raw samples`,
  );

  const noisyMetrics = Object.entries(recomputedSummary)
    .filter(([, stats]) => stats?.median > 0 && stats.p95 / stats.median > 1.35)
    .map(([metric, stats]) => ({
      metric,
      p95MedianRatio: round(stats.p95 / stats.median),
    }));
  assert.deepEqual(
    scenario.noiseAssessment,
    { provisional: noisyMetrics.length > 0, noisyMetrics },
    `${itemCount}-item noise assessment is inconsistent`,
  );

  verifiedScenarios.push({
    itemCount,
    samples: scenario.samples,
    metrics: Object.fromEntries(
      Object.entries(recomputedSummary).map(([metric, stats]) => [
        metric,
        stats === null
          ? null
          : {
              ...stats,
              p95MedianRatio:
                stats.median > 0 ? round(stats.p95 / stats.median) : null,
            },
      ]),
    ),
    noiseAssessment: scenario.noiseAssessment,
  });
}

const verifiedReport = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: {
    path: path.relative(root, inputPath),
    sha256: createHash('sha256').update(inputBytes).digest('hex'),
    schemaVersion: report.schemaVersion,
  },
  target: report.target,
  environment: report.environment,
  run: report.run,
  evidenceClassification,
  verification: {
    canonicalSizes: CANONICAL_SIZES,
    rawSamplesPerScenario: 7,
    summaryFields: ['min', 'median', 'p95', 'max'],
    allMetricNoiseRatiosPreserved: true,
    expectedCommit: options.commit,
    pass: true,
    provisionalEnvironmentAllowed: options.allowProvisional,
    statisticsRecomputed: true,
  },
  scenarios: verifiedScenarios,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify(verifiedReport, null, 2)}\n`,
  'utf8',
);
process.stdout.write(
  `${JSON.stringify({
    input: path.relative(root, inputPath),
    output: path.relative(root, outputPath),
    cpuThrottle: options.cpuThrottle,
    scenarios: verifiedScenarios.length,
    rawSamples: verifiedScenarios.reduce(
      (count, scenario) => count + scenario.samples.length,
      0,
    ),
    allMetricNoiseRatiosPreserved: true,
    commit: options.commit,
    evidenceClassification,
  })}\n`,
);

function parseArgs(args) {
  const values = new Map();
  let allowProvisional = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--allow-provisional') {
      allowProvisional = true;
      continue;
    }
    if (!argument.startsWith('--')) {
      throw new Error(`Unexpected argument: ${argument}`);
    }
    const key = argument.slice(2);
    if (!['commit', 'input', 'output', 'cpu-throttle'].includes(key)) {
      throw new Error(`Unknown option: ${argument}`);
    }
    const value = args[++index];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${argument}`);
    }
    values.set(key, value);
  }
  const input = values.get('input');
  const output = values.get('output');
  const commit = values.get('commit');
  if (!input) throw new Error('--input is required');
  if (!output) throw new Error('--output is required');
  if (!commit) throw new Error('--commit is required');
  const cpuThrottle = Number(values.get('cpu-throttle'));
  if (cpuThrottle !== 1 && cpuThrottle !== 4) {
    throw new Error('--cpu-throttle must be exactly 1 or 4');
  }
  return { allowProvisional, commit, cpuThrottle, input, output };
}

function summarize(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    min: round(sorted[0]),
    median: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    max: round(sorted.at(-1)),
  };
}

function assertExactFiniteSamples(values, metric) {
  assert.equal(values.length, 7, `${metric} must have exactly 7 raw values`);
  for (const [index, value] of values.entries()) {
    assert(
      Number.isFinite(value),
      `${metric} raw value ${index + 1} must be finite`,
    );
  }
}

function assertExplicitEnvironmentLabel(value, label) {
  assert.equal(typeof value, 'string', `Report ${label} must be a string`);
  assert(value.trim().length > 0, `Report ${label} must not be empty`);
  assert.notEqual(
    value.trim().toLowerCase(),
    'unspecified',
    `Report ${label} must not be unspecified`,
  );
}

function classifyEvidence(environment) {
  if (environment?.platform === 'win32' && environment.cpuThrottle === 1) {
    return 'candidate-windows-native';
  }
  if (environment?.cpuThrottle === 4) return 'candidate-canonical-4x-proxy';
  return 'provisional-non-windows-native';
}

function percentile(sortedValues, ratio) {
  const index = Math.max(0, Math.ceil(sortedValues.length * ratio) - 1);
  return sortedValues[index];
}

function round(value) {
  return Number(value.toFixed(2));
}

function resolveInside(base, candidate, label) {
  const absolute = path.resolve(base, candidate);
  const relative = path.relative(base, absolute);
  assert(
    relative !== '..' && !relative.startsWith(`..${path.sep}`),
    `${label} path must stay inside the current worktree`,
  );
  return absolute;
}

function resolvePerfOutput(base, candidate) {
  const absolute = resolveInside(base, candidate, 'output');
  const perfRoot = path.resolve(base, '.perf-results');
  const relative = path.relative(perfRoot, absolute);
  assert(
    relative !== '..' && !relative.startsWith(`..${path.sep}`),
    'Verifier output must stay inside .perf-results',
  );
  return absolute;
}
