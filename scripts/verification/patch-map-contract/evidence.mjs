import { createHash } from 'node:crypto';
import { lstat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createSemanticObservation } from './observe.mjs';

export const ACTUAL_ARTIFACT_SCHEMA = 'patch-map-actual-observation/1';
export const COMPARISON_ARTIFACT_SCHEMA = 'patch-map-comparison-evidence/1';
export const EVIDENCE_SCHEMA = 'patch-map-execution-evidence/1';
export const EXECUTION_OVERLAY_SCHEMA = 'patch-map-execution-overlay/1';

export const RESULT_STATUSES = Object.freeze([
  'pass',
  'fail',
  'not-implemented',
  'unsupported-environment',
  'not-run',
]);

const SESSION_IDS = Object.freeze(['fresh-a', 'fresh-b']);
const CLEANUP_FIELDS = Object.freeze([
  'canvas',
  'listener',
  'observer',
  'ticker',
  'animation',
  'textureLease',
  'pendingWork',
]);
const HEX_SHA256 = /^[a-f0-9]{64}$/;
const SAFE_SEGMENT = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9])?$/;
const CASE_ID = /^[A-Z]{3}-\d{3}$/;
const VOLATILE_SENTINEL = 'patch-map-declared-volatile/1';
const CANONICAL_SIZES = new Set(['100', '500', '1000', '2000', '5000', 'production']);

/**
 * Assemble one complete, append-only PatchMap execution run.
 *
 * Validation completes before the run directory is created. Every artifact write uses
 * exclusive creation; an interrupted run remains immutable and must be replaced by a
 * new run ID.
 */
export async function writeExecutionEvidenceRun(options) {
  assertJsonValue(options, '$options', new WeakSet());
  const model = buildRunModel(options);
  const outputRoot = path.resolve(options.outputRoot);
  const runDirectory = containedPath(outputRoot, options.runId, 'runId');

  await mkdir(outputRoot, { recursive: true });
  const outputRootStat = await lstat(outputRoot);
  assert(outputRootStat.isDirectory() && !outputRootStat.isSymbolicLink(), 'outputRoot must be a regular directory');
  try {
    await mkdir(runDirectory, { recursive: false });
  } catch (error) {
    if (error?.code === 'EEXIST') fail(`run already exists: ${options.runId}`);
    throw error;
  }

  await mkdir(containedPath(runDirectory, 'cases', 'cases directory'), { recursive: false });
  for (const record of model.caseArtifacts) {
    const caseDirectory = containedPath(runDirectory, `cases/${record.caseDirectory}`, 'case directory');
    await mkdir(caseDirectory, { recursive: false });

    for (const actual of record.actuals) {
      await writeExclusive(
        containedPath(caseDirectory, actual.fileName, 'actual artifact'),
        serializeJson(actual.document),
      );
    }
    await writeExclusive(
      containedPath(caseDirectory, 'comparison.json', 'comparison artifact'),
      record.comparisonBytes,
    );
    await writeExclusive(
      containedPath(caseDirectory, 'evidence.json', 'evidence artifact'),
      record.evidenceBytes,
    );
    await writeExclusive(
      containedPath(caseDirectory, 'evidence.json.sha256', 'evidence sidecar'),
      `${record.evidenceSha256}  evidence.json\n`,
    );
  }
  await writeExclusive(
    containedPath(runDirectory, 'execution-manifest.json', 'execution overlay'),
    serializeJson(model.overlay),
  );

  return deepFreeze({
    runDirectory,
    overlay: model.overlay,
  });
}

export function buildRunModel(options) {
  assert(isPlainObject(options), 'options must be a plain object');
  assertExactKeys(options, ['outputRoot', 'runId', 'catalog', 'package', 'runner', 'cases'], 'options');
  assert(typeof options.outputRoot === 'string' && options.outputRoot.length > 0, 'outputRoot path');
  assertSafeSegment(options.runId, 'runId');
  const catalog = validateCatalogBinding(options.catalog);
  const packageBinding = validatePackageBinding(options.package);
  const runner = validateRunner(options.runner, options.runId);
  assert(Array.isArray(options.cases) && options.cases.length > 0, 'non-empty cases array');

  const seen = new Set();
  const caseArtifacts = options.cases.map((record) => {
    assert(isPlainObject(record), 'case input object');
    assert(CASE_ID.test(record.caseId), `canonical case ID ${String(record.caseId)}`);
    assert(!seen.has(record.caseId), `duplicate case ${record.caseId}`);
    seen.add(record.caseId);
    return buildCaseArtifacts(record, { catalog, packageBinding, runner });
  });

  const summary = Object.fromEntries(RESULT_STATUSES.map((status) => [status, 0]));
  for (const record of caseArtifacts) summary[record.evidence.result] += 1;
  const overlay = {
    $schema: EXECUTION_OVERLAY_SCHEMA,
    runId: options.runId,
    catalogBinding: cloneJson(catalog),
    package: cloneJson(packageBinding),
    runner: cloneJson(runner),
    summary,
    cases: caseArtifacts.map((record) => ({
      caseId: record.evidence.caseId,
      evidencePath: `cases/${record.caseDirectory}/evidence.json`,
      evidenceSha256: record.evidenceSha256,
      actualObservationSha256: record.actuals.map((actual) => actual.document.actualObservationSha256),
      comparisonPath: `cases/${record.caseDirectory}/comparison.json`,
      comparisonArtifactSha256: record.comparisonArtifactSha256,
      comparisonSha256: record.comparison.comparisonSha256,
      result: record.evidence.result,
      blockedBy: record.evidence.blockedBy,
      review: notReviewed(),
    })),
    review: notReviewed(),
  };

  return deepFreeze({ caseArtifacts, overlay });
}

function buildCaseArtifacts(record, run) {
  assertExactKeys(record, [
    'caseId',
    'caseType',
    'priority',
    'catalogBinding',
    'input',
    'environment',
    'sessions',
    'result',
    'blockedBy',
  ], `${record.caseId} case input`);
  assert(['capability', 'consumer-journey'].includes(record.caseType), `${record.caseId} caseType`);
  assert(['P0', 'P1'].includes(record.priority), `${record.caseId} priority`);
  assert(RESULT_STATUSES.includes(record.result), `${record.caseId} result status`);
  assert(record.review === undefined, `${record.caseId} runner cannot supply review state`);
  assert(record.blockedBy === null || typeof record.blockedBy === 'string', `${record.caseId} blockedBy`);
  if (record.result === 'pass') assert(record.blockedBy === null, `${record.caseId} pass blockedBy must be null`);

  const catalogBinding = validateCaseCatalogBinding(record.catalogBinding, run.catalog, record.caseId);
  const input = validateInput(record.input, record.caseId);
  const environment = validateEnvironment(record.environment, record.caseId);
  assert(Array.isArray(record.sessions), `${record.caseId} sessions array`);
  assert(record.sessions.length <= 2, `${record.caseId} at most two fresh sessions`);
  const sessionIds = record.sessions.map((session) => session.id);
  assert(new Set(sessionIds).size === sessionIds.length, `${record.caseId} unique session IDs`);
  assert(sessionIds.every((id) => SESSION_IDS.includes(id)), `${record.caseId} canonical fresh session IDs`);

  const sessions = record.sessions.map((session) => buildSession(
    session,
    record,
    { catalogBinding, input, environment, ...run },
  ));
  const determinism = buildDeterminism(sessions, input.volatileFields);
  const comparison = buildComparisonArtifact(record.caseId, catalogBinding.expectedRecordSha256, sessions, determinism);
  const comparisonBytes = serializeJson(comparison);
  const comparisonArtifactSha256 = sha256Bytes(comparisonBytes);
  const aggregate = aggregateComparisonSummary(sessions, comparison);

  const evidence = {
    $schema: EVIDENCE_SCHEMA,
    caseId: record.caseId,
    caseType: record.caseType,
    priority: record.priority,
    catalogBinding,
    package: cloneJson(run.packageBinding),
    runner: cloneJson(run.runner),
    input,
    environment,
    sessions: sessions.map((session) => session.evidence),
    determinism,
    comparison: {
      expectedRecordSha256: catalogBinding.expectedRecordSha256,
      actualObservationSha256: sessions.map((session) => session.actual.actualObservationSha256),
      comparisonSha256: comparison.comparisonSha256,
      artifactSha256: comparisonArtifactSha256,
      assertionCount: aggregate.assertionCount,
      passed: aggregate.passed,
      failed: aggregate.failed,
      firstFailure: aggregate.firstFailure,
    },
    artifacts: {
      raw: sessions.map((session) => session.evidence.actualPath),
      comparison: 'comparison.json',
      screenshots: [],
      logs: [],
    },
    result: record.result,
    blockedBy: record.blockedBy,
    review: notReviewed(),
  };

  validatePassEligibility(evidence, comparison, run.catalog);
  const evidenceBytes = serializeJson(evidence);
  const evidenceSha256 = sha256Bytes(evidenceBytes);
  const caseDirectory = record.caseId.toLowerCase();
  return {
    caseDirectory,
    actuals: sessions.map((session) => ({
      fileName: `${session.id}.actual.json`,
      document: session.actual,
    })),
    comparison,
    comparisonBytes,
    comparisonArtifactSha256,
    evidence,
    evidenceBytes,
    evidenceSha256,
  };
}

function buildSession(session, record, bindings) {
  assert(isPlainObject(session), `${record.caseId} session object`);
  assertExactKeys(session, [
    'id',
    'actual',
    'comparison',
    'publishedTuple',
    'actionResults',
    'timing',
    'errors',
    'cleanup',
  ], `${record.caseId}/${session.id} session`);
  assert(SESSION_IDS.includes(session.id), `${record.caseId} session ID`);
  assert(isPlainObject(session.actual), `${record.caseId}/${session.id} actual result`);
  assertExactKeys(
    session.actual,
    ['observation', 'actualSemanticSha256', 'actualObservationSha256'],
    `${record.caseId}/${session.id} actual result`,
  );
  const recomputed = createSemanticObservation({ observation: session.actual.observation });
  assert(
    session.actual.actualSemanticSha256 === recomputed.actualSemanticSha256,
    `${record.caseId}/${session.id} actual semantic digest mismatch`,
  );
  assert(
    session.actual.actualObservationSha256 === recomputed.actualObservationSha256,
    `${record.caseId}/${session.id} actual observation digest mismatch`,
  );
  validateActualBindings(recomputed.observation, record, bindings);

  const comparison = validateComparisonResult(
    session.comparison,
    record.caseId,
    bindings.catalogBinding.expectedRecordSha256,
    recomputed.actualObservationSha256,
    recomputed.observation,
    bindings.input.volatileFields,
  );
  const publishedTuple = validatePublishedTuple(session.publishedTuple, `${record.caseId}/${session.id}`);
  const actionResults = validateActionResults(
    session.actionResults,
    bindings.input.actionCount,
    `${record.caseId}/${session.id}`,
  );
  const timing = validateTiming(session.timing, `${record.caseId}/${session.id}`);
  const errors = validateErrors(session.errors, `${record.caseId}/${session.id}`);
  const cleanup = validateCleanup(session.cleanup, `${record.caseId}/${session.id}`);

  const actual = {
    $schema: ACTUAL_ARTIFACT_SCHEMA,
    sessionId: session.id,
    observation: recomputed.observation,
    actualSemanticSha256: recomputed.actualSemanticSha256,
    actualObservationSha256: recomputed.actualObservationSha256,
  };
  return {
    id: session.id,
    actual,
    comparison,
    maskedActual: maskVolatile(recomputed.observation, bindings.input.volatileFields),
    evidence: {
      id: session.id,
      actualPath: `${session.id}.actual.json`,
      actualSemanticSha256: recomputed.actualSemanticSha256,
      actualObservationSha256: recomputed.actualObservationSha256,
      stableActualSha256: comparison.stableActualSha256,
      comparisonSha256: comparison.comparisonSha256,
      publishedTuple,
      actionResults,
      assertions: {
        total: comparison.assertions.length,
        passed: comparison.passed,
        failed: comparison.failed,
        firstFailure: comparison.firstFailure,
      },
      timing,
      errors,
      cleanup,
    },
  };
}

function buildComparisonArtifact(caseId, expectedRecordSha256, sessions, determinism) {
  const document = {
    $schema: COMPARISON_ARTIFACT_SCHEMA,
    caseId,
    expectedRecordSha256,
    sessions: sessions.map((session) => ({
      id: session.id,
      actualObservationSha256: session.actual.actualObservationSha256,
      stableActualSha256: session.comparison.stableActualSha256,
      comparisonSha256: session.comparison.comparisonSha256,
      assertions: cloneJson(session.comparison.assertions),
      passed: session.comparison.passed,
      failed: session.comparison.failed,
      firstFailure: cloneJson(session.comparison.firstFailure),
    })),
    determinism: cloneJson(determinism),
  };
  return {
    ...document,
    comparisonSha256: aggregateComparisonSha256(document),
  };
}

function buildDeterminism(sessions, volatileFields) {
  if (sessions.length !== 2) {
    return {
      equal: false,
      firstDifferencePath: '/sessions',
      maskedVolatilePaths: cloneJson(volatileFields),
    };
  }
  let firstDifferencePath = firstDifference(sessions[0].maskedActual, sessions[1].maskedActual, '');
  if (firstDifferencePath === null) {
    firstDifferencePath = firstDifference(
      sessions[0].evidence.actionResults,
      sessions[1].evidence.actionResults,
      '/sessions/actionResults',
    );
  }
  if (firstDifferencePath === null) {
    firstDifferencePath = firstDifference(
      sessions[0].evidence.publishedTuple,
      sessions[1].evidence.publishedTuple,
      '/sessions/publishedTuple',
    );
  }
  if (firstDifferencePath === null) {
    firstDifferencePath = firstDifference(
      sessions[0].comparison.assertions,
      sessions[1].comparison.assertions,
      '/sessions/assertions',
    );
  }
  return {
    equal: firstDifferencePath === null,
    firstDifferencePath,
    maskedVolatilePaths: cloneJson(volatileFields),
  };
}

function aggregateComparisonSummary(sessions, comparison) {
  if (sessions.length === 0) {
    return { assertionCount: 0, passed: 0, failed: 0, firstFailure: null };
  }
  const assertionCount = Math.max(...sessions.map((session) => session.comparison.assertions.length));
  const passed = Math.min(...sessions.map((session) => session.comparison.passed));
  const failed = Math.max(...sessions.map((session) => session.comparison.failed));
  const failedSession = comparison.sessions.find((session) => session.firstFailure !== null);
  return {
    assertionCount,
    passed,
    failed,
    firstFailure: failedSession === undefined ? null : {
      sessionId: failedSession.id,
      assertion: cloneJson(failedSession.firstFailure),
    },
  };
}

export function validatePassEligibility(evidence, comparison, runCatalogBinding) {
  if (evidence.result !== 'pass') return;
  assert(evidence.blockedBy === null, `${evidence.caseId} pass blockedBy`);
  assert(evidence.runner.headed === true, `${evidence.caseId} pass requires headed execution`);
  assert(evidence.environment.browser === 'Chromium', `${evidence.caseId} pass browser`);
  assert(evidence.environment.backend === 'webgl2', `${evidence.caseId} pass backend`);
  assert(evidence.input.actionCount > 0, `${evidence.caseId} pass action count`);
  assert(
    deepEqual(evidence.sessions.map((session) => session.id), SESSION_IDS),
    `${evidence.caseId} pass requires exact fresh-a/fresh-b sessions`,
  );
  assert(evidence.determinism.equal === true, `${evidence.caseId} pass determinism`);
  assert(evidence.determinism.firstDifferencePath === null, `${evidence.caseId} pass difference path`);
  assert(
    comparison.sessions.length === 2 && comparison.sessions.every((session) =>
      session.failed === 0 && session.passed === session.assertions.length &&
      session.assertions.every((assertion) => assertion.passed === true)),
    `${evidence.caseId} pass assertions`,
  );
  for (const session of evidence.sessions) {
    assert(
      Object.values(session.errors).every((entries) => Array.isArray(entries) && entries.length === 0),
      `${evidence.caseId}/${session.id} pass errors`,
    );
    assert(
      CLEANUP_FIELDS.every((field) => session.cleanup[field] === 0),
      `${evidence.caseId}/${session.id} pass cleanup`,
    );
    assert(
      session.actionResults.length === evidence.input.actionCount &&
        session.actionResults.every((action) => action.status === 'completed'),
      `${evidence.caseId}/${session.id} pass actions`,
    );
  }
  assert(
    evidence.catalogBinding.catalogManifestSha256 === runCatalogBinding.catalogManifestSha256 &&
      evidence.catalogBinding.reviewRegistrySha256 === runCatalogBinding.reviewRegistrySha256,
    `${evidence.caseId} pass catalog binding`,
  );
}

export function validateCatalogBinding(value) {
  assert(isPlainObject(value), 'catalog binding object');
  assertExactKeys(value, [
    'contractRevision',
    'observationRevision',
    'catalogManifestSha256',
    'reviewRegistrySha256',
    'actionSchemaSha256',
    'observationSchemaSha256',
  ], 'catalog binding');
  assert(typeof value.contractRevision === 'string' && value.contractRevision.length > 0, 'contract revision');
  assert(value.observationRevision === 'patch-map-semantic-observation/1', 'observation revision');
  for (const field of [
    'catalogManifestSha256',
    'reviewRegistrySha256',
    'actionSchemaSha256',
    'observationSchemaSha256',
  ]) assertDigest(value[field], `catalog ${field}`);
  return cloneJson(value);
}

export function validateCaseCatalogBinding(value, catalog, caseId) {
  assert(isPlainObject(value), `${caseId} catalog binding`);
  assertExactKeys(value, [
    ...Object.keys(catalog),
    'fixtureRef',
    'fixtureSha256',
    'expectedRef',
    'expectedRecordSha256',
  ], `${caseId} catalog binding`);
  for (const field of Object.keys(catalog)) {
    assert(value[field] === catalog[field], `${caseId} catalog ${field} mismatch`);
  }
  assert(typeof value.fixtureRef === 'string' && /#\/cases\/\d+$/.test(value.fixtureRef), `${caseId} fixtureRef`);
  assert(typeof value.expectedRef === 'string' && /#\/cases\/\d+$/.test(value.expectedRef), `${caseId} expectedRef`);
  assertDigest(value.fixtureSha256, `${caseId} fixtureSha256`);
  assertDigest(value.expectedRecordSha256, `${caseId} expectedRecordSha256`);
  return cloneJson(value);
}

export function validatePackageBinding(value) {
  assert(isPlainObject(value), 'package binding object');
  assertExactKeys(value, [
    'name',
    'subpath',
    'version',
    'packedPackageSha256',
    'implementationCommit',
    'pixiVersion',
  ], 'package binding');
  assert(value.name === '@conalog/patch-map', 'package name');
  assert(value.subpath === '@conalog/patch-map', 'package subpath');
  for (const field of ['version', 'implementationCommit', 'pixiVersion']) {
    assert(typeof value[field] === 'string' && value[field].length > 0, `package ${field}`);
  }
  assertDigest(value.packedPackageSha256, 'packed package digest');
  return cloneJson(value);
}

export function validateRunner(value, runId) {
  assert(isPlainObject(value), 'runner object');
  assert(
    deepEqual(Object.keys(value).sort(), ['command', 'headed', 'id', 'runId', 'version'].filter((field) =>
      field !== 'runId' || Object.hasOwn(value, 'runId')).sort()),
    'runner exact fields',
  );
  assert(value.id === 'patch-map-contract-runner', 'runner ID');
  assert(typeof value.version === 'string' && value.version.length > 0, 'runner version');
  assert(Array.isArray(value.command) && value.command.length > 0 && value.command.every((entry) => typeof entry === 'string'), 'runner command');
  assert(value.headed === true || value.headed === false, 'runner headed boolean');
  if (value.runId !== undefined) assert(value.runId === runId, 'runner runId mismatch');
  return { ...cloneJson(value), runId };
}

export function validateInput(value, caseId) {
  assert(isPlainObject(value), `${caseId} input object`);
  assertExactKeys(value, [
    'route',
    'size',
    'seed',
    'repeatIndex',
    'datasetSha256',
    'actionTraceSha256',
    'actionCount',
    'volatileFields',
  ], `${caseId} input`);
  assert(CANONICAL_SIZES.has(value.size), `${caseId} canonical size`);
  assert(Number.isInteger(value.seed) && value.seed >= 0 && value.seed <= 0xffff_ffff, `${caseId} seed`);
  assert(value.repeatIndex === 0, `${caseId} canonical repeat index`);
  assert(
    value.route === `/lab/patch-map?scenario=${caseId}&size=${value.size}&seed=${value.seed}`,
    `${caseId} canonical route`,
  );
  assertDigest(value.datasetSha256, `${caseId} dataset digest`);
  assertDigest(value.actionTraceSha256, `${caseId} action trace digest`);
  assert(Number.isInteger(value.actionCount) && value.actionCount >= 0, `${caseId} action count`);
  assert(Array.isArray(value.volatileFields), `${caseId} volatile fields`);
  assert(new Set(value.volatileFields).size === value.volatileFields.length, `${caseId} unique volatile fields`);
  assert(
    value.volatileFields.every((field) => typeof field === 'string' &&
      /^(?:case|provenance|environment|revisions|scene|geometry|text|paint|interaction|events|history|accessibility|outcome|resources)(?:\.[A-Za-z_$][\w$-]*)+$/.test(field)),
    `${caseId} volatile field syntax`,
  );
  return cloneJson(value);
}

export function validateEnvironment(value, caseId) {
  assert(isPlainObject(value), `${caseId} environment`);
  assertExactKeys(value, [
    'browser',
    'browserVersion',
    'os',
    'hardware',
    'backend',
    'devicePixelRatio',
    'viewportCssPx',
    'powerProfile',
    'fontFixtureRevision',
    'assetFixtureRevision',
  ], `${caseId} environment`);
  for (const field of [
    'browser',
    'browserVersion',
    'os',
    'hardware',
    'backend',
    'powerProfile',
    'fontFixtureRevision',
    'assetFixtureRevision',
  ]) assert(typeof value[field] === 'string' && value[field].length > 0, `${caseId} environment ${field}`);
  assert(typeof value.devicePixelRatio === 'number' && Number.isFinite(value.devicePixelRatio) && value.devicePixelRatio > 0, `${caseId} DPR`);
  assert(
    Array.isArray(value.viewportCssPx) && value.viewportCssPx.length === 2 &&
      value.viewportCssPx.every((entry) => Number.isInteger(entry) && entry > 0),
    `${caseId} viewport`,
  );
  return cloneJson(value);
}

function validateActualBindings(observation, record, bindings) {
  assert(observation.case.id === record.caseId, `${record.caseId} actual case ID`);
  assert(observation.case.caseType === record.caseType, `${record.caseId} actual caseType`);
  const expectedProvenance = {
    catalogManifestSha256: bindings.catalogBinding.catalogManifestSha256,
    reviewRegistrySha256: bindings.catalogBinding.reviewRegistrySha256,
    fixtureSha256: bindings.catalogBinding.fixtureSha256,
    expectedRecordSha256: bindings.catalogBinding.expectedRecordSha256,
    actionSchemaSha256: bindings.catalogBinding.actionSchemaSha256,
    observationSchemaSha256: bindings.catalogBinding.observationSchemaSha256,
    packedPackageSha256: bindings.packageBinding.packedPackageSha256,
    runnerVersion: bindings.runner.version,
  };
  for (const [field, expected] of Object.entries(expectedProvenance)) {
    assert(observation.provenance[field] === expected, `${record.caseId} actual provenance ${field}`);
  }
  for (const [field, expected] of Object.entries(bindings.environment)) {
    assert(deepEqual(observation.environment[field], expected), `${record.caseId} actual environment ${field}`);
  }
}

function validateComparisonResult(value, caseId, expectedRecordSha256, actualObservationSha256, observation, volatileFields) {
  assert(isPlainObject(value), `${caseId} comparison result`);
  assertExactKeys(value, [
    'assertions',
    'passed',
    'failed',
    'firstFailure',
    'stableActualSha256',
    'comparisonSha256',
  ], `${caseId} comparison result`);
  assert(Array.isArray(value.assertions) && value.assertions.length > 0, `${caseId} comparison assertions`);
  for (const [index, assertion] of value.assertions.entries()) {
    assert(isPlainObject(assertion), `${caseId} comparison assertion ${index}`);
    assertExactKeys(assertion, ['index', 'path', 'operator', 'passed', 'matches', 'failure'], `${caseId} comparison assertion ${index}`);
    assert(assertion.index === index, `${caseId} comparison assertion order ${index}`);
    assert(typeof assertion.path === 'string' && typeof assertion.operator === 'string', `${caseId} comparison assertion identity ${index}`);
    assert(typeof assertion.passed === 'boolean', `${caseId} comparison assertion status ${index}`);
    assert(Number.isInteger(assertion.matches) && assertion.matches >= 0, `${caseId} comparison assertion matches ${index}`);
    assert(assertion.passed ? assertion.failure === null : isPlainObject(assertion.failure), `${caseId} comparison assertion failure ${index}`);
    if (assertion.failure !== null) {
      assertExactKeys(
        assertion.failure,
        ['code', 'path', 'message', 'observedKind', 'expectedKind'],
        `${caseId} comparison assertion failure ${index}`,
      );
    }
  }
  const passed = value.assertions.filter((assertion) => assertion.passed).length;
  const failed = value.assertions.length - passed;
  const firstFailure = value.assertions.find((assertion) => !assertion.passed) ?? null;
  assert(value.passed === passed && value.failed === failed, `${caseId} comparison counts`);
  assert(deepEqual(value.firstFailure, firstFailure), `${caseId} comparison first failure`);
  const stableActualSha256 = stableActualSha256For(observation, volatileFields);
  assert(value.stableActualSha256 === stableActualSha256, `${caseId} stable actual digest mismatch`);
  const expectedComparisonSha256 = sessionComparisonSha256({
    caseId,
    expectedRecordSha256,
    actualObservationSha256,
    stableActualSha256,
    assertions: value.assertions,
    passed,
    failed,
  });
  assert(value.comparisonSha256 === expectedComparisonSha256, `${caseId} comparison digest mismatch`);
  return cloneJson(value);
}

export function validatePublishedTuple(value, label) {
  assert(isPlainObject(value), `${label} published tuple`);
  assertExactKeys(value, ['scene', 'view', 'interaction'], `${label} published tuple`);
  for (const field of ['scene', 'view', 'interaction']) {
    assert(Number.isInteger(value[field]) && value[field] >= 0, `${label} published ${field}`);
  }
  return cloneJson(value);
}

export function validateActionResults(value, actionCount, label) {
  assert(Array.isArray(value) && value.length === actionCount, `${label} action result count`);
  for (const [index, action] of value.entries()) {
    assert(isPlainObject(action) && action.index === index, `${label} action index ${index}`);
    assertExactKeys(action, ['index', 'handlerId', 'status'], `${label} action ${index}`);
    assert(typeof action.handlerId === 'string' && action.handlerId.startsWith('contract/'), `${label} action handler ${index}`);
    assert(['completed', 'failed'].includes(action.status), `${label} action status ${index}`);
  }
  return cloneJson(value);
}

export function validateTiming(value, label) {
  assert(isPlainObject(value), `${label} timing`);
  assertExactKeys(value, ['actionMs', 'maximumFrameGapMs', 'longTaskCount'], `${label} timing`);
  for (const field of ['actionMs', 'maximumFrameGapMs']) {
    assert(typeof value[field] === 'number' && Number.isFinite(value[field]) && value[field] >= 0, `${label} timing ${field}`);
  }
  assert(Number.isInteger(value.longTaskCount) && value.longTaskCount >= 0, `${label} long tasks`);
  return cloneJson(value);
}

export function validateErrors(value, label) {
  assert(isPlainObject(value), `${label} errors`);
  assertExactKeys(value, ['console', 'page', 'network'], `${label} errors`);
  for (const field of ['console', 'page', 'network']) assert(Array.isArray(value[field]), `${label} error ${field}`);
  return cloneJson(value);
}

export function validateCleanup(value, label) {
  assert(isPlainObject(value), `${label} cleanup`);
  assert(deepEqual(Object.keys(value).sort(), [...CLEANUP_FIELDS].sort()), `${label} exact cleanup fields`);
  for (const field of CLEANUP_FIELDS) {
    assert(Number.isInteger(value[field]) && value[field] >= 0, `${label} cleanup ${field}`);
  }
  return cloneJson(value);
}

export function sessionComparisonSha256({
  caseId,
  expectedRecordSha256,
  actualObservationSha256,
  stableActualSha256,
  assertions,
  passed,
  failed,
}) {
  return canonicalSha256({
    $schema: 'patch-map-contract-comparison/1',
    caseId,
    expectedRecordSha256,
    actualObservationSha256,
    stableActualSha256,
    assertions: assertions.map(compactAssertion),
    passed,
    failed,
  });
}

function compactAssertion({ index, path, operator, passed, matches, failure }) {
  return {
    index,
    path,
    operator,
    passed,
    matches,
    failure: failure === null ? null : {
      code: failure.code,
      path: failure.path,
      observedKind: failure.observedKind,
      expectedKind: failure.expectedKind,
    },
  };
}

export function aggregateComparisonSha256(document) {
  return canonicalSha256({
    $schema: 'patch-map-two-fresh-session-comparison/1',
    caseId: document.caseId,
    expectedRecordSha256: document.expectedRecordSha256,
    sessions: document.sessions.map((session) => ({
      id: session.id,
      actualObservationSha256: session.actualObservationSha256,
      stableActualSha256: session.stableActualSha256,
      comparisonSha256: session.comparisonSha256,
    })),
    determinism: document.determinism,
  });
}

export function stableActualSha256For(observation, volatileFields) {
  return canonicalSha256(maskVolatile(observation, volatileFields));
}

export function maskVolatile(observation, volatileFields) {
  const masked = cloneJson(observation);
  for (const field of volatileFields) {
    assert(typeof field === 'string' && field.length > 0, `volatile field ${String(field)}`);
    const segments = field.split('.');
    let owner = masked;
    for (const segment of segments.slice(0, -1)) {
      assert(isPlainObject(owner) && Object.hasOwn(owner, segment), `volatile field does not resolve: ${field}`);
      owner = owner[segment];
    }
    const leaf = segments.at(-1);
    assert(isPlainObject(owner) && Object.hasOwn(owner, leaf), `volatile field does not resolve: ${field}`);
    owner[leaf] = VOLATILE_SENTINEL;
  }
  return masked;
}

export function assertSafeRelativePath(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} path`);
  assert(!path.isAbsolute(value), `${label} must be relative`);
  assert(!value.includes('\\'), `${label} backslash is forbidden`);
  const normalized = path.posix.normalize(value);
  assert(normalized === value && !normalized.startsWith('../') && normalized !== '..', `${label} traversal`);
  for (const segment of value.split('/')) assertSafeSegment(segment, label);
  return value;
}

export function canonicalSha256(value) {
  return sha256Bytes(JSON.stringify(canonicalize(value)));
}

export function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function containedPath(root, relative, label) {
  assertSafeRelativePath(relative, label);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relative);
  assert(resolved.startsWith(`${resolvedRoot}${path.sep}`), `${label} escapes root`);
  return resolved;
}

async function writeExclusive(filePath, bytes) {
  try {
    await writeFile(filePath, bytes, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error?.code === 'EEXIST') fail(`artifact already exists: ${path.basename(filePath)}`);
    throw error;
  }
}

function notReviewed() {
  return { status: 'not-reviewed', reviewer: null, reviewedAt: null, supersedes: null };
}

function assertSafeSegment(value, label) {
  assert(typeof value === 'string' && SAFE_SEGMENT.test(value) && value !== '.' && value !== '..', `${label} unsafe path segment`);
}

function assertDigest(value, label) {
  assert(typeof value === 'string' && HEX_SHA256.test(value), `${label} SHA-256`);
}

function firstDifference(left, right, pointer) {
  if (deepEqual(left, right)) return null;
  if (Array.isArray(left) && Array.isArray(right)) {
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      if (index >= left.length || index >= right.length) return `${pointer}/${index}`;
      const nested = firstDifference(left[index], right[index], `${pointer}/${index}`);
      if (nested !== null) return nested;
    }
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) {
      if (!Object.hasOwn(left, key) || !Object.hasOwn(right, key)) return `${pointer}/${escapePointer(key)}`;
      const nested = firstDifference(left[key], right[key], `${pointer}/${escapePointer(key)}`);
      if (nested !== null) return nested;
    }
  }
  return pointer || '/';
}

function deepEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((value, index) => deepEqual(value, right[index]));
  }
  if (!isPlainObject(left) || !isPlainObject(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] && deepEqual(left[key], right[key]));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function cloneJson(value) {
  if (Array.isArray(value)) return value.map(cloneJson);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, cloneJson(nested)]));
}

function assertJsonValue(value, label, ancestors) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    assert(Number.isFinite(value), `${label} finite number`);
    return;
  }
  assert(typeof value === 'object', `${label} JSON value`);
  assert(!ancestors.has(value), `${label} cycle`);
  assert(Array.isArray(value) || isPlainObject(value), `${label} plain JSON object`);
  ancestors.add(value);
  if (Array.isArray(value)) {
    const expectedKeys = Array.from({ length: value.length }, (_, index) => String(index));
    assert(
      Object.keys(value).length === expectedKeys.length && expectedKeys.every((key) => Object.hasOwn(value, key)),
      `${label} dense array`,
    );
    value.forEach((nested, index) => assertJsonValue(nested, `${label}/${index}`, ancestors));
  } else {
    for (const [key, nested] of Object.entries(value)) assertJsonValue(nested, `${label}/${escapePointer(key)}`, ancestors);
  }
  ancestors.delete(value);
}

function assertExactKeys(value, expected, label) {
  assert(deepEqual(Object.keys(value).sort(), [...expected].sort()), `${label} exact fields`);
}

function escapePointer(value) {
  return String(value).replaceAll('~', '~0').replaceAll('/', '~1');
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function fail(message) {
  throw new Error(`PatchMap execution evidence invalid: ${message}`);
}
