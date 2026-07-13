import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const CANONICAL_SIZES = Object.freeze([1_000, 2_000]);
const FULL_COMMIT_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const S3_SCENARIOS = Object.freeze([
  'bulkAlphaHighlight',
  'relationLinkRefresh',
  'relationVisibility',
  'sequentialMixed',
  'trustedBulk',
]);
const S3_TIMING_FIELDS = Object.freeze([
  'nextFrameAfterReturnMs',
  'renderMs',
  'syncMs',
  'totalMs',
]);
const S4_SCENARIOS = Object.freeze([
  'viewportPanZoom',
  'hover',
  'pointerHit',
  'boxSelection',
  'paintSelection',
  'transformerResize',
  'transformerRotation',
]);
const S4_METRICS = Object.freeze({
  durationMs: (measurement) => measurement.durationMs,
  frameIntervalMaxMs: (measurement) => measurement.frameStats?.max,
  frameIntervalMedianMs: (measurement) => measurement.frameStats?.median,
  frameIntervalP95Ms: (measurement) => measurement.frameStats?.p95,
  longTaskCount: (measurement) => measurement.longTaskCount,
  longTaskTotalMs: (measurement) => measurement.longTaskTotalMs,
});
const root = process.cwd();

const options = parseArgs(process.argv.slice(2));
const inputPath = resolveInside(root, options.input, 'input');
const outputPath = resolvePerfOutput(root, options.output);
const inputBytes = await readFile(inputPath);
const report = JSON.parse(inputBytes.toString('utf8'));

assert.equal(report.schemaVersion, 1, 'Unexpected interaction report schema');
assert.equal(report.target?.entry, '/src/index.ts', 'Unexpected browser entrypoint');
assert.equal(
  report.target?.side,
  'cleanroom-replacement',
  'Unexpected performance target side',
);
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
assert.equal(
  typeof report.environment?.platform,
  'string',
  'Report platform must be a string',
);
assert(
  report.environment.platform.trim().length > 0,
  'Report platform must not be empty',
);
assert.equal(report.run?.quick, false, 'Canonical evidence cannot be quick');
assert.equal(report.run?.warmups, 2, 'Canonical evidence requires 2 warmups');
assert.equal(report.run?.iterations, 7, 'Canonical evidence requires 7 samples');
assert.deepEqual(
  report.run?.sizes,
  CANONICAL_SIZES,
  'Canonical interaction evidence requires exact sizes [1000, 2000]',
);
assert.equal(
  report.run?.renderBoundary,
  'S3 synchronous return, explicit app.render, then next requestAnimationFrame',
  'Unexpected interaction render boundary',
);

const canonical = {
  eligible: true,
  requirements: {
    commit: true,
    deviceProfile: true,
    iterations: true,
    notQuick: true,
    powerMode: true,
    sizes: true,
    warmups: true,
  },
};
assert.deepEqual(
  report.run?.canonical,
  canonical,
  'Canonical predicate does not match the report inputs',
);
assert.equal(
  report.scenarios?.length,
  CANONICAL_SIZES.length,
  'Interaction report must contain exactly two scenarios',
);

const verifiedScenarios = [];
const recomputedAssertions = [];
for (const [scenarioIndex, itemCount] of CANONICAL_SIZES.entries()) {
  const scenario = report.scenarios[scenarioIndex];
  assert.equal(
    scenario?.itemCount,
    itemCount,
    `Scenario ${scenarioIndex} item count`,
  );
  assert.equal(
    scenario?.samples?.length,
    7,
    `${itemCount} items must preserve exactly 7 raw samples`,
  );

  for (const [sampleIndex, sample] of scenario.samples.entries()) {
    assert.equal(sample.itemCount, itemCount, 'Raw sample item count mismatch');
    assert.deepEqual(
      Object.keys(sample.s3 ?? {}).sort(),
      [...S3_SCENARIOS].sort(),
      `${itemCount} sample ${sampleIndex + 1} S3 scenario shape`,
    );
    assert.deepEqual(
      Object.keys(sample.s4 ?? {}).sort(),
      [...S4_SCENARIOS].sort(),
      `${itemCount} sample ${sampleIndex + 1} S4 scenario shape`,
    );
    const nestedAssertions = collectAssertions(sample);
    assert.deepEqual(
      sample.assertions,
      nestedAssertions,
      `${itemCount} sample ${sampleIndex + 1} assertions were not recomputed from measurements`,
    );
    for (const assertion of nestedAssertions) {
      assertAssertion(assertion, `${itemCount} sample ${sampleIndex + 1}`);
      recomputedAssertions.push({ ...assertion, itemCount, sampleIndex });
    }
  }

  const summary = recomputeSummary(scenario.samples, itemCount);
  assert.deepEqual(
    scenario.summary,
    summary,
    `${itemCount}-item interaction summary does not match raw samples`,
  );
  const noiseAssessment = assessNoise(summary);
  assert.deepEqual(
    scenario.noiseAssessment,
    noiseAssessment,
    `${itemCount}-item noise assessment is inconsistent`,
  );
  verifiedScenarios.push({
    itemCount,
    noiseAssessment,
    samples: scenario.samples,
    summary,
  });
}

assert(Array.isArray(report.verification?.pageErrors), 'pageErrors must be an array');
if (report.verification.pageErrors.length > 0) {
  recomputedAssertions.push({
    details: report.verification.pageErrors,
    name: 'browser-emitted-no-uncaught-errors',
    pass: false,
  });
}
const failedAssertions = recomputedAssertions.filter((entry) => !entry.pass);
const verification = {
  assertionCount: recomputedAssertions.length,
  failedAssertionCount: failedAssertions.length,
  failedAssertions,
  pageErrors: report.verification.pageErrors,
  pass: failedAssertions.length === 0,
};
assert.deepEqual(
  report.verification,
  verification,
  'Interaction verification aggregate does not match raw assertions',
);
assert(verification.pass, 'Canonical interaction evidence has failed assertions');

const evidenceClassification = classifyEvidence(
  report.environment.platform,
  report.environment.cpuThrottle,
);
assert.equal(
  report.run.evidenceStatus,
  evidenceClassification,
  'Interaction evidence classification is inconsistent',
);
assert.equal(
  report.run.windowsNativeGate,
  evidenceClassification === 'candidate-windows-native'
    ? 'candidate'
    : 'pending',
  'Windows native gate is inconsistent',
);
if (!options.allowProvisional) {
  assert.notEqual(
    evidenceClassification,
    'provisional-canonical-unsupported-environment',
    'Unsupported native environment requires --allow-provisional',
  );
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
    ...verification,
    canonicalSizes: CANONICAL_SIZES,
    expectedCommit: options.commit,
    rawSamplesPerScenario: 7,
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
    commit: options.commit,
    evidenceClassification,
    scenarios: verifiedScenarios.length,
    rawSamples: verifiedScenarios.reduce(
      (count, scenario) => count + scenario.samples.length,
      0,
    ),
    assertions: verification.assertionCount,
    pass: verification.pass,
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
    if (!['commit', 'cpu-throttle', 'input', 'output'].includes(key)) {
      throw new Error(`Unknown option: ${argument}`);
    }
    const value = args[++index];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${argument}`);
    }
    values.set(key, value);
  }
  const commit = values.get('commit');
  const input = values.get('input');
  const output = values.get('output');
  if (!commit) throw new Error('--commit is required');
  if (!input) throw new Error('--input is required');
  if (!output) throw new Error('--output is required');
  const cpuThrottle = Number(values.get('cpu-throttle'));
  if (cpuThrottle !== 1 && cpuThrottle !== 4) {
    throw new Error('--cpu-throttle must be exactly 1 or 4');
  }
  return { allowProvisional, commit, cpuThrottle, input, output };
}

function recomputeSummary(samples, itemCount) {
  const summary = { s3: {}, s4: {} };
  for (const scenario of S3_SCENARIOS) {
    summary.s3[scenario] = {};
    for (const field of S3_TIMING_FIELDS) {
      const values = samples.map((sample) => sample.s3[scenario]?.[field]);
      summary.s3[scenario][field] = summarizeExact(
        values,
        `${itemCount}.s3.${scenario}.${field}`,
      );
    }
  }
  for (const scenario of S4_SCENARIOS) {
    summary.s4[scenario] = {};
    for (const [metric, read] of Object.entries(S4_METRICS)) {
      const values = samples.map((sample) => read(sample.s4[scenario] ?? {}));
      summary.s4[scenario][metric] = summarizeExact(
        values,
        `${itemCount}.s4.${scenario}.${metric}`,
      );
    }
  }
  return summary;
}

function collectAssertions(sample) {
  const assertions = [];
  for (const [scenario, measurement] of Object.entries({
    ...sample.s3,
    ...sample.s4,
  })) {
    assert(
      Array.isArray(measurement.assertions),
      `${scenario} assertions must be an array`,
    );
    for (const assertion of measurement.assertions) {
      assertions.push({
        ...assertion,
        name: `${scenario}:${assertion.name}`,
      });
    }
  }
  return assertions;
}

function assertAssertion(assertion, label) {
  assert.equal(typeof assertion?.name, 'string', `${label} assertion name`);
  assert(assertion.name.length > 0, `${label} assertion name must not be empty`);
  assert.equal(typeof assertion.pass, 'boolean', `${label} assertion pass`);
}

function summarizeExact(values, metric) {
  assert.equal(values.length, 7, `${metric} must have exactly 7 raw values`);
  for (const [index, value] of values.entries()) {
    assert(
      Number.isFinite(value),
      `${metric} raw value ${index + 1} must be finite`,
    );
  }
  const sorted = [...values].sort((left, right) => left - right);
  const median = percentile(sorted, 0.5);
  const p95 = percentile(sorted, 0.95);
  return {
    max: round(sorted.at(-1)),
    median: round(median),
    min: round(sorted[0]),
    p95: round(p95),
    p95MedianRatio: median > 0 ? round(p95 / median) : null,
  };
}

function assessNoise(summary) {
  const noisyMetrics = [];
  walkStats(summary, [], (metric, stats) => {
    if (stats.median > 0 && stats.p95MedianRatio > 1.35) {
      noisyMetrics.push({
        metric: metric.join('.'),
        p95MedianRatio: stats.p95MedianRatio,
      });
    }
  });
  return {
    noisyMetrics,
    provisional: noisyMetrics.length > 0,
  };
}

function walkStats(value, pathParts, visit) {
  if (!value || typeof value !== 'object') return;
  if (
    Object.hasOwn(value, 'median')
    && Object.hasOwn(value, 'p95')
    && Object.hasOwn(value, 'p95MedianRatio')
  ) {
    visit(pathParts, value);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    walkStats(child, [...pathParts, key], visit);
  }
}

function classifyEvidence(platform, cpuThrottle) {
  if (platform === 'win32' && cpuThrottle === 1) {
    return 'candidate-windows-native';
  }
  if (cpuThrottle === 4) return 'candidate-canonical-4x-proxy';
  return 'provisional-canonical-unsupported-environment';
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

function percentile(sortedValues, ratio) {
  const index = Math.max(0, Math.ceil(sortedValues.length * ratio) - 1);
  return sortedValues[index];
}

function round(value) {
  return Number(value.toFixed(3));
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
