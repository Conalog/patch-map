import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createSemanticObservation } from './observe.mjs';
import {
  ACTUAL_ARTIFACT_SCHEMA,
  aggregateComparisonSha256,
  assertSafeRelativePath,
  COMPARISON_ARTIFACT_SCHEMA,
  EVIDENCE_SCHEMA,
  EXECUTION_OVERLAY_SCHEMA,
  maskVolatile,
  RESULT_STATUSES,
  sessionComparisonSha256,
  sha256Bytes,
  stableActualSha256For,
  validateActionResults,
  validateCatalogBinding,
  validateCaseCatalogBinding,
  validateCleanup,
  validateEnvironment,
  validateErrors,
  validateInput,
  validatePackageBinding,
  validatePassEligibility,
  validatePublishedTuple,
  validateRunner,
  validateTiming,
} from './evidence.mjs';

const HEX_SHA256 = /^[a-f0-9]{64}$/;
const CANONICAL_CONTRACT_ROOT = fileURLToPath(new URL(
  '../../../contracts/patch-map/',
  import.meta.url,
));

/** Re-hash and validate one completed run without importing or launching PatchMap. */
export async function verifyExecutionResults(runDirectory, options = {}) {
  assert(typeof runDirectory === 'string' && runDirectory.length > 0, 'run directory path');
  assert(isPlainObject(options), 'verification options');
  assertExactKeys(
    options,
    ['catalogBinding', 'packageBinding', 'packedArtifactPath'].filter((field) => Object.hasOwn(options, field)),
    'verification options',
  );
  assert(options.catalogBinding !== undefined, 'external catalog binding required');
  const externalCatalog = validateExternalCatalogBinding(options.catalogBinding);
  assert(
    !(options.packageBinding !== undefined && options.packedArtifactPath !== undefined),
    'choose external package binding or packed artifact path',
  );
  const root = path.resolve(runDirectory);
  const runId = path.basename(root);
  assert(!runId.includes('/') && !runId.includes('\\'), 'run directory basename');
  assertSafeRelativePath(runId, 'runId');
  const rootStat = await lstat(root);
  assert(rootStat.isDirectory() && !rootStat.isSymbolicLink(), 'run root must be a regular directory');

  const overlay = await readJsonArtifact(root, 'execution-manifest.json', 'execution overlay');
  assertExactKeys(overlay, [
    '$schema',
    'runId',
    'catalogBinding',
    'package',
    'runner',
    'summary',
    'cases',
    'review',
  ], 'execution overlay');
  assert(overlay.$schema === EXECUTION_OVERLAY_SCHEMA, 'execution overlay schema');
  assert(overlay.runId === runId, 'execution overlay runId/path binding');
  const runCatalogBinding = validateCatalogBinding(overlay.catalogBinding);
  assert(deepEqual(runCatalogBinding, externalCatalog.catalog), 'external catalog binding mismatch');
  validatePackageBinding(overlay.package);
  validateRunner(overlay.runner, runId);
  assert(Array.isArray(overlay.cases) && overlay.cases.length > 0, 'execution overlay cases');
  assertNotReviewed(overlay.review, 'execution overlay');
  await assertRegularDirectory(containedRunPath(root, 'cases', 'cases directory'), 'cases directory');
  const containsPass = overlay.cases.some((row) => isPlainObject(row) && row.result === 'pass');
  const packageArtifactVerified = await verifyExternalPackageBinding(overlay.package, options);
  assert(!containsPass || packageArtifactVerified, 'external package binding required for pass results');

  const expectedSummary = Object.fromEntries(RESULT_STATUSES.map((status) => [status, 0]));
  const caseIds = new Set();
  const expectedCaseDirectories = [];
  for (const row of overlay.cases) {
    assert(isPlainObject(row), 'execution overlay case row');
    assertExactKeys(row, [
      'caseId',
      'evidencePath',
      'evidenceSha256',
      'actualObservationSha256',
      'comparisonPath',
      'comparisonArtifactSha256',
      'comparisonSha256',
      'result',
      'blockedBy',
      'review',
    ], 'execution overlay case row');
    assert(typeof row.caseId === 'string' && /^[A-Z]{3}-\d{3}$/.test(row.caseId), 'overlay case ID');
    assert(!caseIds.has(row.caseId), `duplicate overlay case ${row.caseId}`);
    caseIds.add(row.caseId);
    assert(RESULT_STATUSES.includes(row.result), `${row.caseId} overlay result`);
    expectedSummary[row.result] += 1;
    assertNotReviewed(row.review, `${row.caseId} overlay row`);

    const caseDirectory = row.caseId.toLowerCase();
    expectedCaseDirectories.push(caseDirectory);
    const expectedEvidencePath = `cases/${caseDirectory}/evidence.json`;
    const expectedComparisonPath = `cases/${caseDirectory}/comparison.json`;
    await assertRegularDirectory(
      containedRunPath(root, `cases/${caseDirectory}`, `${row.caseId} case directory`),
      `${row.caseId} case directory`,
    );
    assert(row.evidencePath === expectedEvidencePath, `${row.caseId} evidence path`);
    assert(row.comparisonPath === expectedComparisonPath, `${row.caseId} comparison path`);
    assertDigest(row.evidenceSha256, `${row.caseId} overlay evidence digest`);
    assertDigest(row.comparisonArtifactSha256, `${row.caseId} overlay comparison artifact digest`);
    assertDigest(row.comparisonSha256, `${row.caseId} overlay comparison digest`);
    assert(Array.isArray(row.actualObservationSha256), `${row.caseId} overlay actual digests`);

    const evidenceArtifact = await readTextArtifact(root, expectedEvidencePath, `${row.caseId} evidence`);
    assert(sha256Bytes(evidenceArtifact.bytes) === row.evidenceSha256, `${row.caseId} evidence digest mismatch`);
    const sidecar = await readTextArtifact(
      root,
      `cases/${caseDirectory}/evidence.json.sha256`,
      `${row.caseId} evidence sidecar`,
    );
    assert(sidecar.bytes === `${row.evidenceSha256}  evidence.json\n`, `${row.caseId} evidence sidecar mismatch`);
    const evidence = parseJson(evidenceArtifact.bytes, `${row.caseId} evidence`);
    const comparisonArtifact = await readTextArtifact(root, expectedComparisonPath, `${row.caseId} comparison`);
    assert(
      sha256Bytes(comparisonArtifact.bytes) === row.comparisonArtifactSha256,
      `${row.caseId} comparison artifact digest mismatch`,
    );
    const comparison = parseJson(comparisonArtifact.bytes, `${row.caseId} comparison`);

    const actualFileNames = await verifyCaseDocuments({
      root,
      row,
      overlay,
      runCatalogBinding,
      externalCatalog,
      evidence,
      comparison,
      caseDirectory,
    });
    await assertExactDirectoryEntries(
      containedRunPath(root, `cases/${caseDirectory}`, `${row.caseId} case directory`),
      ['comparison.json', 'evidence.json', 'evidence.json.sha256', ...actualFileNames],
      `${row.caseId} case directory`,
    );
  }

  assert(deepEqual(overlay.summary, expectedSummary), 'execution overlay summary counts');
  await assertExactDirectoryEntries(root, ['cases', 'execution-manifest.json'], 'run directory');
  await assertExactDirectoryEntries(
    containedRunPath(root, 'cases', 'cases directory'),
    expectedCaseDirectories,
    'cases directory',
  );

  return deepFreeze({
    runId,
    caseCount: overlay.cases.length,
    summary: expectedSummary,
    integrityVerified: true,
    catalogBindingVerified: true,
    packageArtifactVerified,
    executionPassed: expectedSummary.pass === overlay.cases.length,
    verified: packageArtifactVerified,
    promotionVerified: false,
  });
}

/** Build the external catalog trust anchor from the checked-in canonical manifest. */
export async function loadCanonicalCatalogBinding() {
  const rootStat = await lstat(CANONICAL_CONTRACT_ROOT);
  assert(
    rootStat.isDirectory() && !rootStat.isSymbolicLink(),
    'canonical contract root must be a regular directory',
  );
  const manifestArtifact = await readCanonicalTextArtifact(
    CANONICAL_CONTRACT_ROOT,
    'evidence/catalog-evidence-manifest.v1.json',
    'canonical catalog manifest',
  );
  const manifest = parseJson(manifestArtifact.bytes, 'canonical catalog manifest');
  assert(isPlainObject(manifest), 'canonical catalog manifest object');
  assert(
    manifest.$schema === 'patch-map-contract-catalog-evidence-manifest/1',
    'canonical catalog manifest schema',
  );
  assert(isPlainObject(manifest.reviewFile), 'canonical review file binding');
  assert(isPlainObject(manifest.actionSchemaFile), 'canonical action schema file binding');
  assert(isPlainObject(manifest.observationSchemaFile), 'canonical observation schema file binding');

  await Promise.all([
    verifyCanonicalDigestBoundFile(CANONICAL_CONTRACT_ROOT, manifest.reviewFile, 'canonical review registry'),
    verifyCanonicalDigestBoundFile(CANONICAL_CONTRACT_ROOT, manifest.actionSchemaFile, 'canonical action schema'),
    verifyCanonicalDigestBoundFile(
      CANONICAL_CONTRACT_ROOT,
      manifest.observationSchemaFile,
      'canonical observation schema',
    ),
  ]);

  const catalog = validateCatalogBinding({
    contractRevision: manifest.contractRevision,
    observationRevision: manifest.observationRevision,
    catalogManifestSha256: sha256Bytes(manifestArtifact.bytes),
    reviewRegistrySha256: manifest.reviewFile.sha256,
    actionSchemaSha256: manifest.actionSchemaFile.sha256,
    observationSchemaSha256: manifest.observationSchemaFile.sha256,
  });
  assert(Array.isArray(manifest.cases) && manifest.cases.length > 0, 'canonical catalog cases');
  const cases = {};
  for (const record of manifest.cases) {
    assert(isPlainObject(record), 'canonical catalog case record');
    assert(typeof record.id === 'string' && /^[A-Z]{3}-\d{3}$/.test(record.id), 'canonical catalog case ID');
    assert(!Object.hasOwn(cases, record.id), `duplicate canonical catalog case ${record.id}`);
    cases[record.id] = validateCaseCatalogBinding({
      ...catalog,
      fixtureRef: record.fixtureRef,
      fixtureSha256: record.fixtureSha256,
      expectedRef: record.expectedRef,
      expectedRecordSha256: record.expectedRecordSha256,
    }, catalog, record.id);
  }
  return deepFreeze({ ...catalog, cases });
}

function validateExternalCatalogBinding(value) {
  assert(isPlainObject(value), 'external catalog binding object');
  assertExactKeys(value, [
    'contractRevision',
    'observationRevision',
    'catalogManifestSha256',
    'reviewRegistrySha256',
    'actionSchemaSha256',
    'observationSchemaSha256',
    'cases',
  ], 'external catalog binding');
  const catalog = validateCatalogBinding({
    contractRevision: value.contractRevision,
    observationRevision: value.observationRevision,
    catalogManifestSha256: value.catalogManifestSha256,
    reviewRegistrySha256: value.reviewRegistrySha256,
    actionSchemaSha256: value.actionSchemaSha256,
    observationSchemaSha256: value.observationSchemaSha256,
  });
  assert(isPlainObject(value.cases) && Object.keys(value.cases).length > 0, 'external catalog cases');
  const cases = new Map();
  for (const [caseId, binding] of Object.entries(value.cases)) {
    assert(/^[A-Z]{3}-\d{3}$/.test(caseId), `external catalog case ID ${caseId}`);
    cases.set(caseId, validateCaseCatalogBinding(binding, catalog, caseId));
  }
  return { catalog, cases };
}

async function verifyExternalPackageBinding(runPackage, options) {
  if (options.packageBinding !== undefined) {
    const externalPackage = validatePackageBinding(options.packageBinding);
    assert(deepEqual(runPackage, externalPackage), 'external package binding mismatch');
    return true;
  }
  if (options.packedArtifactPath !== undefined) {
    assert(
      typeof options.packedArtifactPath === 'string' && options.packedArtifactPath.length > 0,
      'packed artifact path',
    );
    const artifactPath = path.resolve(options.packedArtifactPath);
    const artifactStat = await lstat(artifactPath);
    assert(
      artifactStat.isFile() && !artifactStat.isSymbolicLink(),
      'packed artifact must be a regular file',
    );
    const bytes = await readFile(artifactPath);
    assert(
      sha256Bytes(bytes) === runPackage.packedPackageSha256,
      'external packed artifact digest mismatch',
    );
    return true;
  }
  return false;
}

async function verifyCanonicalDigestBoundFile(root, descriptor, label) {
  assertExactKeys(descriptor, ['path', 'sha256'], `${label} descriptor`);
  assertDigest(descriptor.sha256, `${label} declared digest`);
  const artifact = await readCanonicalTextArtifact(root, descriptor.path, label);
  assert(sha256Bytes(artifact.bytes) === descriptor.sha256, `${label} digest mismatch`);
}

async function readCanonicalTextArtifact(root, relative, label) {
  const filePath = containedCanonicalPath(root, relative, label);
  const stat = await lstat(filePath);
  assert(stat.isFile() && !stat.isSymbolicLink(), `${label} must be a regular file`);
  return { filePath, bytes: await readFile(filePath, 'utf8') };
}

function containedCanonicalPath(root, relative, label) {
  assertSafeRelativePath(relative, label);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relative);
  assert(
    resolved.startsWith(`${resolvedRoot}${path.sep}`),
    `${label} escapes canonical contract root`,
  );
  return resolved;
}

async function verifyCaseDocuments({
  root,
  row,
  overlay,
  runCatalogBinding,
  externalCatalog,
  evidence,
  comparison,
  caseDirectory,
}) {
  assertExactKeys(evidence, [
    '$schema',
    'caseId',
    'caseType',
    'priority',
    'catalogBinding',
    'package',
    'runner',
    'input',
    'environment',
    'sessions',
    'determinism',
    'comparison',
    'artifacts',
    'result',
    'blockedBy',
    'review',
  ], `${row.caseId} evidence`);
  assert(evidence.$schema === EVIDENCE_SCHEMA, `${row.caseId} evidence schema`);
  assert(evidence.caseId === row.caseId, `${row.caseId} evidence identity`);
  assert(['capability', 'consumer-journey'].includes(evidence.caseType), `${row.caseId} evidence caseType`);
  assert(['P0', 'P1'].includes(evidence.priority), `${row.caseId} evidence priority`);
  assert(evidence.result === row.result && deepEqual(evidence.blockedBy, row.blockedBy), `${row.caseId} result binding`);
  assert(evidence.blockedBy === null || typeof evidence.blockedBy === 'string', `${row.caseId} blockedBy`);
  assertNotReviewed(evidence.review, `${row.caseId} evidence`);
  validateCaseCatalogBinding(evidence.catalogBinding, runCatalogBinding, row.caseId);
  const externalCaseBinding = externalCatalog.cases.get(row.caseId);
  assert(externalCaseBinding !== undefined, `${row.caseId} missing external catalog case binding`);
  assert(deepEqual(evidence.catalogBinding, externalCaseBinding), `${row.caseId} external catalog case mismatch`);
  assert(deepEqual(evidence.package, overlay.package), `${row.caseId} package binding`);
  assert(deepEqual(evidence.runner, overlay.runner), `${row.caseId} runner binding`);
  assert(Array.isArray(evidence.sessions), `${row.caseId} evidence sessions`);
  validateInput(evidence.input, row.caseId);
  validateEnvironment(evidence.environment, row.caseId);
  assertExactKeys(evidence.determinism, ['equal', 'firstDifferencePath', 'maskedVolatilePaths'], `${row.caseId} determinism`);
  assertExactKeys(evidence.comparison, [
    'expectedRecordSha256',
    'actualObservationSha256',
    'comparisonSha256',
    'artifactSha256',
    'assertionCount',
    'passed',
    'failed',
    'firstFailure',
  ], `${row.caseId} evidence comparison`);
  assertExactKeys(evidence.artifacts, ['raw', 'comparison', 'screenshots', 'logs'], `${row.caseId} artifacts`);

  assertExactKeys(comparison, [
    '$schema',
    'caseId',
    'expectedRecordSha256',
    'sessions',
    'determinism',
    'comparisonSha256',
  ], `${row.caseId} comparison`);
  assert(comparison.$schema === COMPARISON_ARTIFACT_SCHEMA, `${row.caseId} comparison schema`);
  assert(comparison.caseId === row.caseId, `${row.caseId} comparison identity`);
  assert(
    comparison.expectedRecordSha256 === evidence.catalogBinding.expectedRecordSha256,
    `${row.caseId} comparison expected binding`,
  );
  assert(Array.isArray(comparison.sessions), `${row.caseId} comparison sessions`);
  assert(comparison.sessions.length === evidence.sessions.length, `${row.caseId} comparison/session count`);
  assert(
    aggregateComparisonSha256(comparison) === comparison.comparisonSha256,
    `${row.caseId} aggregate comparison digest mismatch`,
  );
  assert(comparison.comparisonSha256 === row.comparisonSha256, `${row.caseId} overlay comparison binding`);
  assert(comparison.comparisonSha256 === evidence.comparison.comparisonSha256, `${row.caseId} evidence comparison binding`);
  assert(
    evidence.comparison.artifactSha256 === row.comparisonArtifactSha256,
    `${row.caseId} evidence comparison artifact binding`,
  );

  const actualFileNames = [];
  const actualDigests = [];
  const determinismSessions = [];
  for (const [index, sessionEvidence] of evidence.sessions.entries()) {
    const comparisonSession = comparison.sessions[index];
    assert(isPlainObject(sessionEvidence) && isPlainObject(comparisonSession), `${row.caseId} session ${index}`);
    validateSessionEvidenceShape(sessionEvidence, evidence.input.actionCount, `${row.caseId}/${sessionEvidence.id}`);
    assertExactKeys(comparisonSession, [
      'id',
      'actualObservationSha256',
      'stableActualSha256',
      'comparisonSha256',
      'assertions',
      'passed',
      'failed',
      'firstFailure',
    ], `${row.caseId} comparison session ${index}`);
    assert(['fresh-a', 'fresh-b'].includes(sessionEvidence.id), `${row.caseId} session ID ${index}`);
    assert(comparisonSession.id === sessionEvidence.id, `${row.caseId} comparison session identity ${index}`);
    const expectedActualPath = `${sessionEvidence.id}.actual.json`;
    assert(sessionEvidence.actualPath === expectedActualPath, `${row.caseId} actual path ${index}`);
    actualFileNames.push(expectedActualPath);

    const actualWrapper = await readJsonArtifact(
      root,
      `cases/${caseDirectory}/${expectedActualPath}`,
      `${row.caseId}/${sessionEvidence.id} actual`,
    );
    assertExactKeys(actualWrapper, [
      '$schema',
      'sessionId',
      'observation',
      'actualSemanticSha256',
      'actualObservationSha256',
    ], `${row.caseId}/${sessionEvidence.id} actual`);
    assert(actualWrapper.$schema === ACTUAL_ARTIFACT_SCHEMA, `${row.caseId}/${sessionEvidence.id} actual schema`);
    assert(actualWrapper.sessionId === sessionEvidence.id, `${row.caseId}/${sessionEvidence.id} actual session`);
    const recomputed = createSemanticObservation({ observation: actualWrapper.observation });
    assert(
      recomputed.actualSemanticSha256 === actualWrapper.actualSemanticSha256 &&
        recomputed.actualSemanticSha256 === sessionEvidence.actualSemanticSha256,
      `${row.caseId}/${sessionEvidence.id} actual semantic digest mismatch`,
    );
    assert(
      recomputed.actualObservationSha256 === actualWrapper.actualObservationSha256 &&
        recomputed.actualObservationSha256 === sessionEvidence.actualObservationSha256 &&
        recomputed.actualObservationSha256 === comparisonSession.actualObservationSha256,
      `${row.caseId}/${sessionEvidence.id} actual observation digest mismatch`,
    );
    const stable = stableActualSha256For(recomputed.observation, evidence.input.volatileFields);
    assert(
      stable === sessionEvidence.stableActualSha256 && stable === comparisonSession.stableActualSha256,
      `${row.caseId}/${sessionEvidence.id} stable digest mismatch`,
    );

    validateAssertionSummary(comparisonSession, sessionEvidence, row.caseId);
    const recomputedComparison = sessionComparisonSha256({
      caseId: row.caseId,
      expectedRecordSha256: comparison.expectedRecordSha256,
      actualObservationSha256: recomputed.actualObservationSha256,
      stableActualSha256: stable,
      assertions: comparisonSession.assertions,
      passed: comparisonSession.passed,
      failed: comparisonSession.failed,
    });
    assert(
      recomputedComparison === comparisonSession.comparisonSha256 &&
        recomputedComparison === sessionEvidence.comparisonSha256,
      `${row.caseId}/${sessionEvidence.id} comparison digest mismatch`,
    );
    validateActualBindings(recomputed.observation, evidence, overlay, `${row.caseId}/${sessionEvidence.id}`);
    actualDigests.push(recomputed.actualObservationSha256);
    determinismSessions.push({
      maskedActual: maskVolatile(recomputed.observation, evidence.input.volatileFields),
      actionResults: sessionEvidence.actionResults,
      publishedTuple: sessionEvidence.publishedTuple,
      assertions: comparisonSession.assertions,
    });
  }

  assert(deepEqual(row.actualObservationSha256, actualDigests), `${row.caseId} overlay actual digest list`);
  assert(deepEqual(evidence.comparison.actualObservationSha256, actualDigests), `${row.caseId} evidence actual digest list`);
  assert(deepEqual(evidence.artifacts.raw, actualFileNames), `${row.caseId} raw artifact list`);
  assert(evidence.artifacts.comparison === 'comparison.json', `${row.caseId} comparison artifact path`);
  assert(deepEqual(evidence.artifacts.screenshots, []) && deepEqual(evidence.artifacts.logs, []), `${row.caseId} unexpected auxiliary artifacts`);
  const recomputedDeterminism = deriveDeterminism(determinismSessions, evidence.input.volatileFields);
  assert(deepEqual(evidence.determinism, recomputedDeterminism), `${row.caseId} evidence determinism mismatch`);
  assert(deepEqual(comparison.determinism, recomputedDeterminism), `${row.caseId} comparison determinism mismatch`);
  validateAggregateSummary(evidence, comparison, row.caseId);
  validatePassEligibility(evidence, comparison, overlay.catalogBinding);
  return actualFileNames;
}

function validateAssertionSummary(comparisonSession, sessionEvidence, caseId) {
  assert(Array.isArray(comparisonSession.assertions) && comparisonSession.assertions.length > 0, `${caseId} assertions`);
  for (const [index, assertion] of comparisonSession.assertions.entries()) {
    assert(isPlainObject(assertion) && assertion.index === index, `${caseId} assertion order ${index}`);
    assertExactKeys(assertion, ['index', 'path', 'operator', 'passed', 'matches', 'failure'], `${caseId} assertion ${index}`);
    assert(typeof assertion.path === 'string' && typeof assertion.operator === 'string', `${caseId} assertion identity ${index}`);
    assert(typeof assertion.passed === 'boolean', `${caseId} assertion status ${index}`);
    assert(Number.isInteger(assertion.matches) && assertion.matches >= 0, `${caseId} assertion matches ${index}`);
    assert(assertion.passed ? assertion.failure === null : isPlainObject(assertion.failure), `${caseId} assertion failure ${index}`);
    if (assertion.failure !== null) {
      assertExactKeys(
        assertion.failure,
        ['code', 'path', 'message', 'observedKind', 'expectedKind'],
        `${caseId} assertion failure ${index}`,
      );
    }
  }
  const passed = comparisonSession.assertions.filter((assertion) => assertion.passed).length;
  const failed = comparisonSession.assertions.length - passed;
  const firstFailure = comparisonSession.assertions.find((assertion) => !assertion.passed) ?? null;
  assert(comparisonSession.passed === passed && comparisonSession.failed === failed, `${caseId} comparison counts`);
  assert(deepEqual(comparisonSession.firstFailure, firstFailure), `${caseId} comparison first failure`);
  assert(sessionEvidence.assertions.total === comparisonSession.assertions.length, `${caseId} evidence assertion total`);
  assert(sessionEvidence.assertions.passed === passed && sessionEvidence.assertions.failed === failed, `${caseId} evidence assertion counts`);
  assert(deepEqual(sessionEvidence.assertions.firstFailure, firstFailure), `${caseId} evidence first failure`);
}

function validateSessionEvidenceShape(session, actionCount, label) {
  assertExactKeys(session, [
    'id',
    'actualPath',
    'actualSemanticSha256',
    'actualObservationSha256',
    'stableActualSha256',
    'comparisonSha256',
    'publishedTuple',
    'actionResults',
    'assertions',
    'timing',
    'errors',
    'cleanup',
  ], `${label} session evidence`);
  validatePublishedTuple(session.publishedTuple, label);
  validateActionResults(session.actionResults, actionCount, label);
  assertExactKeys(session.assertions, ['total', 'passed', 'failed', 'firstFailure'], `${label} assertion summary`);
  validateTiming(session.timing, label);
  validateErrors(session.errors, label);
  validateCleanup(session.cleanup, label);
}

function deriveDeterminism(sessions, volatileFields) {
  if (sessions.length !== 2) {
    return {
      equal: false,
      firstDifferencePath: '/sessions',
      maskedVolatilePaths: cloneJson(volatileFields),
    };
  }
  let difference = firstDifference(sessions[0].maskedActual, sessions[1].maskedActual, '');
  if (difference === null) difference = firstDifference(sessions[0].actionResults, sessions[1].actionResults, '/sessions/actionResults');
  if (difference === null) difference = firstDifference(sessions[0].publishedTuple, sessions[1].publishedTuple, '/sessions/publishedTuple');
  if (difference === null) difference = firstDifference(sessions[0].assertions, sessions[1].assertions, '/sessions/assertions');
  return {
    equal: difference === null,
    firstDifferencePath: difference,
    maskedVolatilePaths: cloneJson(volatileFields),
  };
}

function validateAggregateSummary(evidence, comparison, caseId) {
  const counts = comparison.sessions.map((session) => ({
    total: session.assertions.length,
    passed: session.passed,
    failed: session.failed,
  }));
  const assertionCount = counts.length === 0 ? 0 : Math.max(...counts.map((count) => count.total));
  const passed = counts.length === 0 ? 0 : Math.min(...counts.map((count) => count.passed));
  const failed = counts.length === 0 ? 0 : Math.max(...counts.map((count) => count.failed));
  const failureSession = comparison.sessions.find((session) => session.firstFailure !== null);
  const firstFailure = failureSession === undefined ? null : {
    sessionId: failureSession.id,
    assertion: failureSession.firstFailure,
  };
  assert(evidence.comparison.assertionCount === assertionCount, `${caseId} aggregate assertion count`);
  assert(evidence.comparison.passed === passed && evidence.comparison.failed === failed, `${caseId} aggregate assertion result`);
  assert(deepEqual(evidence.comparison.firstFailure, firstFailure), `${caseId} aggregate first failure`);
}

function validateActualBindings(observation, evidence, overlay, label) {
  assert(observation.case.id === evidence.caseId && observation.case.caseType === evidence.caseType, `${label} case binding`);
  const provenance = {
    catalogManifestSha256: evidence.catalogBinding.catalogManifestSha256,
    reviewRegistrySha256: evidence.catalogBinding.reviewRegistrySha256,
    fixtureSha256: evidence.catalogBinding.fixtureSha256,
    expectedRecordSha256: evidence.catalogBinding.expectedRecordSha256,
    actionSchemaSha256: evidence.catalogBinding.actionSchemaSha256,
    observationSchemaSha256: evidence.catalogBinding.observationSchemaSha256,
    packedPackageSha256: overlay.package.packedPackageSha256,
    runnerVersion: overlay.runner.version,
  };
  for (const [field, expected] of Object.entries(provenance)) {
    assert(observation.provenance[field] === expected, `${label} provenance ${field}`);
  }
  for (const [field, expected] of Object.entries(evidence.environment)) {
    assert(deepEqual(observation.environment[field], expected), `${label} environment ${field}`);
  }
}

async function readJsonArtifact(root, relative, label) {
  const artifact = await readTextArtifact(root, relative, label);
  return parseJson(artifact.bytes, label);
}

async function readTextArtifact(root, relative, label) {
  const filePath = containedRunPath(root, relative, label);
  const stat = await lstat(filePath);
  assert(stat.isFile() && !stat.isSymbolicLink(), `${label} must be a regular file`);
  return { filePath, bytes: await readFile(filePath, 'utf8') };
}

function containedRunPath(root, relative, label) {
  assertSafeRelativePath(relative, label);
  const resolved = path.resolve(root, relative);
  assert(resolved.startsWith(`${root}${path.sep}`), `${label} escapes run directory`);
  return resolved;
}

async function assertExactDirectoryEntries(directory, expected, label) {
  await assertRegularDirectory(directory, label);
  const actual = (await readdir(directory)).sort();
  assert(deepEqual(actual, [...expected].sort()), `${label} entries mismatch`);
}

async function assertRegularDirectory(directory, label) {
  const stat = await lstat(directory);
  assert(stat.isDirectory() && !stat.isSymbolicLink(), `${label} must be a regular directory`);
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes);
  } catch (error) {
    throw new Error(`PatchMap result verification failed: ${label} is not JSON`, { cause: error });
  }
}

function assertNotReviewed(value, label) {
  assert(deepEqual(value, {
    status: 'not-reviewed',
    reviewer: null,
    reviewedAt: null,
    supersedes: null,
  }), `${label} review state`);
}

function assertDigest(value, label) {
  assert(typeof value === 'string' && HEX_SHA256.test(value), `${label} SHA-256`);
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

function cloneJson(value) {
  if (Array.isArray(value)) return value.map(cloneJson);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, cloneJson(nested)]));
}

function assertExactKeys(value, expected, label) {
  assert(isPlainObject(value), `${label} object`);
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
  if (!condition) throw new Error(`PatchMap result verification failed: ${message}`);
}

async function runCli() {
  const args = process.argv.slice(2);
  if (!(args.length === 1 || (args.length === 3 && args[1] === '--artifact'))) {
    throw new Error('usage: node verify-results.mjs <run-directory> [--artifact <packed-file>]');
  }
  const [runDirectory, , packedArtifactPath] = args;
  const catalogBinding = await loadCanonicalCatalogBinding();
  const result = await verifyExecutionResults(runDirectory, {
    catalogBinding,
    ...(packedArtifactPath === undefined ? {} : { packedArtifactPath }),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
