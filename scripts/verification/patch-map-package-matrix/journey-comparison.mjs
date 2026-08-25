import { compareObservation } from '../patch-map-contract/compare.mjs';
import { patchMapDeclaredCsmConflicts } from '../patch-map-contract/immutable-conflicts.mjs';

export function comparePackedJourneyRuns({
  browserResult,
  packageDigest,
  expectedDocument,
}) {
  const expectedById = new Map(
    expectedDocument.cases
      .filter((record) => record.id.startsWith('CSM-'))
      .map((record) => [record.id, record]),
  );
  const rows = [];
  for (const run of browserResult.runs ?? []) {
    if (
      run.executionStatus !== 'observed'
      || !run.actualObservation
      || typeof run.actualObservation !== 'object'
      || Array.isArray(run.actualObservation)
    ) {
      rows.push(Object.freeze({
        id: run.id,
        status: 'fail',
        failure: run.error ?? {
          name: 'Error',
          message: 'packed journey returned no actual observation',
          stack: null,
        },
        cleanupFailureCount: countCleanupFailures(run.cleanup),
        digestBound: false,
      }));
      continue;
    }
    const expectedCase = expectedById.get(run.id);
    if (!expectedCase) {
      rows.push(Object.freeze({
        id: run.id,
        status: 'fail',
        failure: 'missing normalized expected record',
      }));
      continue;
    }
    try {
      const comparison = compareObservation({
        expectedCase,
        actual: run.actualObservation,
        fixtures: run.fixtures,
        captures: run.captures,
      });
      const observedConflicts = comparison.assertions
        .filter((assertion) => !assertion.passed)
        .map((assertion) => ({
          path: assertion.path,
          code: assertion.failure?.code ?? null,
          failurePath: assertion.failure?.path ?? null,
        }))
        .sort(compareConflict);
      const declaredConflicts = [...patchMapDeclaredCsmConflicts(run.id)].sort(compareConflict);
      const exactDeclaredConflicts =
        JSON.stringify(observedConflicts) === JSON.stringify(declaredConflicts);
      const executionCleanupFailureCount = countCleanupFailures(run.cleanup);
      const destroyCleanupFailureCount = countDestroySummaryFailures(run.destroySummary);
      const cleanupFailureCount = executionCleanupFailureCount + destroyCleanupFailureCount;
      const digestBound =
        run.actualObservation?.provenance?.packedPackageSha256 === packageDigest;
      const passed =
        run.executionStatus === 'observed'
        && run.destroyed === true
        && run.canvasCountAfterDestroy === 0
        && cleanupFailureCount === 0
        && digestBound
        && exactDeclaredConflicts;
      rows.push(Object.freeze({
        id: run.id,
        status: passed ? 'pass' : 'fail',
        assertionCount: comparison.assertions.length,
        assertionPassed: comparison.passed,
        assertionFailed: comparison.failed,
        observedConflicts,
        declaredConflicts,
        exactDeclaredConflicts,
        cleanupFailureCount,
        executionCleanupFailureCount,
        destroyCleanupFailureCount,
        digestBound,
      }));
    } catch (error) {
      rows.push(Object.freeze({
        id: run.id,
        status: 'fail',
        failure: serializeError(error),
      }));
    }
  }
  const ids = rows.map(({ id }) => id);
  const passedJourneyCount = rows.filter(({ status }) => status === 'pass').length;
  const packageDigests = new Set(
    (browserResult.runs ?? []).map(
      (run) => run.actualObservation?.provenance?.packedPackageSha256,
    ),
  );
  return Object.freeze({
    journeyIds: Object.freeze(ids),
    journeyCount: rows.length,
    passedJourneyCount,
    failedJourneyCount: rows.length - passedJourneyCount,
    packageDigestAcrossJourneys:
      packageDigests.size === 1 && packageDigests.has(packageDigest)
        ? packageDigest
        : null,
    cleanupFailureCount: rows.reduce(
      (total, row) => total + (row.cleanupFailureCount ?? 1),
      0,
    ),
    rows: Object.freeze(rows),
  });
}

function compareConflict(left, right) {
  return left.path.localeCompare(right.path);
}

function countCleanupFailures(cleanup) {
  if (!cleanup || typeof cleanup !== 'object') return 1;
  let count = cleanup.status === 'completed' ? 0 : 1;
  const visit = (value, key = '') => {
    if (Array.isArray(value)) {
      if (key === 'errors') count += value.length;
      else for (const entry of value) visit(entry);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      visit(nestedValue, nestedKey);
    }
  };
  visit(cleanup);
  return count;
}

function countDestroySummaryFailures(summary) {
  if (!summary || typeof summary !== 'object') return 1;
  let count = summary.status === 'completed' ? 0 : 1;
  for (const key of [
    'retainedCanvasCount',
    'retainedSubscriptionCount',
    'retainedPendingWork',
  ]) {
    if (summary[key] !== 0) count += 1;
  }
  return count;
}

function serializeError(error) {
  return {
    name: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack ?? null : null,
  };
}
