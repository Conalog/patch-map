export const SECURITY_OPERATIONS_FOLD_REVISION =
  'core-v2-security-operations-fold/1';

const OBSERVATION_REVISION = 'core-v2-semantic-observation/1';
const EXECUTION_REVISION = 'core-v2-contract-case-execution/1';
const CASE_IDS = new Set([
  'SEC-002',
  'SEC-003',
  'SEC-004',
  'OPS-001',
  'OPS-002',
]);
const CASE_ACTIONS = Object.freeze({
  'SEC-002': Object.freeze(['run-extraction-preflight-matrix']),
  'SEC-003': Object.freeze([
    'inject-sensitive-failure-fields',
    'capture-diagnostic-channels',
  ]),
  'SEC-004': Object.freeze([
    'build-and-pack',
    'inspect-package-contents',
    'run-dependency-license-vulnerability-audit',
  ]),
  'OPS-001': Object.freeze(['capture-runtime-diagnostics']),
  'OPS-002': Object.freeze([
    'register-callbacks',
    'configure-callback',
    'configure-callback',
    'emit-update',
    'dispose-callbacks',
  ]),
});
const DOMAIN_NAMES = Object.freeze([
  'case',
  'provenance',
  'environment',
  'revisions',
  'scene',
  'geometry',
  'text',
  'paint',
  'interaction',
  'events',
  'history',
  'accessibility',
  'outcome',
  'resources',
]);

/**
 * Fold only public product results and executor cleanup. This module has no
 * normalized expected import and performs no case-specific value fabrication.
 */
export function foldSecurityOperationsExecution(optionsValue) {
  const options = validateOptions(optionsValue);
  const plan = validatePlan(options.casePlan);
  const execution = validateExecution(options.execution, plan);
  const projected = projectCase(plan, execution);
  const provenance = clone(options.provenance);
  const environment = clone(options.environment);
  provenance.expectedEvidenceBound =
    provenance.fixtureSha256 === undefined
    || provenance.fixtureSha256 === plan.fixtureSha256;
  environment.contractProfileBound =
    environment.backend === 'webgl2'
    && Object.keys(recordValue(plan.fixtureProfiles, 'fixture profiles')).length > 0;
  const actual = {
    $schema: OBSERVATION_REVISION,
    case: {
      id: plan.id,
      caseType: plan.caseType,
      rootTestId: plan.rootTestId,
      fixtureSha256: plan.fixtureSha256,
      executionStatus: execution.status,
    },
    provenance,
    environment,
    revisions: {
      _availability: { publicProductProbes: 'available' },
      ...projected.revisions,
      valuesFinite: allNumbersFinite(projected.revisions),
    },
    scene: {
      _availability: { publicProductProbes: 'available' },
      ...projected.scene,
    },
    geometry: notExercised('security-operations-does-not-change-geometry-contract'),
    text: notExercised('security-operations-does-not-change-text-contract'),
    paint: notExercised('security-operations-does-not-change-paint-contract'),
    interaction: {
      _availability: { publicProductProbes: 'available' },
      ...projected.interaction,
    },
    events: {
      _availability: { executorJournal: 'available' },
      totalCount: execution.eventJournal.length,
      ...projected.events,
    },
    history: {
      _availability: { publicProductProbes: 'available' },
      ...projected.history,
    },
    accessibility: notExercised(
      'logical-accessibility-is-owned-by-the-accessibility-tranche',
    ),
    outcome: {
      _availability: { actualActionResults: 'available' },
      recorded: execution.actionResults.every(({ status }) => status === 'completed'),
      ...projected.outcome,
    },
    resources: {
      _availability: {
        executorCleanup: 'available',
        productCleanup: 'available',
      },
      leakDelta: cleanupLeakDelta(execution.cleanup),
      ...projected.resources,
    },
  };
  assert(
    DOMAIN_NAMES.every((domain) => isRecord(actual[domain])),
    'actual contains fourteen observation domains',
  );
  validateJson(actual, 'actual', new WeakSet());
  return deepFreeze({
    actual,
    fixtures: clone(plan.fixture.setup.params),
    captures: projectCaptures(plan, execution),
  });
}

function projectCase(plan, execution) {
  switch (plan.id) {
    case 'SEC-002':
      return projectExtraction(execution);
    case 'SEC-003':
      return projectRedaction(plan, execution);
    case 'SEC-004':
      return projectSupplyChain(execution);
    case 'OPS-001':
      return projectRuntimeDiagnostics(execution);
    case 'OPS-002':
      return projectCallbackIsolation(execution);
    default:
      throw new Error(`Unsupported Core v2 security/operations case ${String(plan.id)}`);
  }
}

function projectExtraction(execution) {
  const result = actionActual(execution, 0, 'run-extraction-preflight-matrix');
  const corsSafe = recordValue(result.corsSafe, 'safe extraction');
  const tainted = recordValue(result.tainted, 'tainted extraction');
  const failed = recordValue(result.failed, 'failed extraction');
  const replaced = recordValue(result.replaced, 'replaced extraction');
  return domains({
    revisions: {
      capturedTuple: clone(corsSafe.capturedTuple),
    },
    scene: {
      liveCanvasUsableAfterFailure: booleanValue(
        result.liveCanvasUsableAfterFailure,
        'live canvas usability',
      ),
    },
    outcome: {
      corsSafe: {
        capturedTuple: clone(corsSafe.capturedTuple),
      },
      tainted: {
        code: stringValue(tainted.code, 'tainted extraction code'),
      },
      failed: {
        code: stringValue(failed.code, 'failed extraction code'),
      },
      replaced: {
        code: stringValue(replaced.code, 'replaced extraction code'),
      },
    },
    resources: {
      temporaryExtractionResources: nonNegativeInteger(
        result.temporaryExtractionResources,
        'temporary extraction resources',
      ),
    },
  });
}

function projectRedaction(plan, execution) {
  const injection = actionActual(execution, 0, 'inject-sensitive-failure-fields');
  const capture = actionActual(execution, 1, 'capture-diagnostic-channels');
  const channels = recordValue(capture.captured, 'captured diagnostic channels');
  const marker = stringValue(plan.fixture.setup.params.marker, 'fixture marker');
  const serialized = JSON.stringify(channels);
  const diagnostic = recordValue(injection.diagnostic, 'returned diagnostic');
  return domains({
    revisions: {
      scene: nonNegativeInteger(
        recordValue(diagnostic.revisionStamp, 'diagnostic revision').sceneRevision,
        'diagnostic scene revision',
      ),
    },
    outcome: {
      markerMatches: countText(serialized, marker),
      rawUrlCount: countText(serialized, 'https://'),
      tokenCount: countText(serialized, 'Bearer '),
      dataUriCount: countText(serialized, 'data:'),
      stableFields: Object.keys(diagnostic).filter((key) =>
        [
          'code',
          'category',
          'operation',
          'logicalId',
          'revisionStamp',
          'sanitizedHash',
        ].includes(key)),
      channelCount: Object.keys(channels).length,
    },
  });
}

function projectSupplyChain(execution) {
  const built = actionActual(execution, 0, 'build-and-pack');
  const inspected = actionActual(execution, 1, 'inspect-package-contents');
  const audited = actionActual(
    execution,
    2,
    'run-dependency-license-vulnerability-audit',
  );
  const builds = arrayValue(built.builds, 'package builds');
  const packageInspection = recordValue(
    inspected.packageInspection,
    'package inspection',
  );
  const audit = recordValue(audited.audit, 'dependency audit');
  const licenses = recordValue(audited.licenses, 'license inventory');
  const sbom = recordValue(audited.sbom, 'SBOM');
  return domains({
    outcome: {
      packageDigest: builds.map((entry) =>
        digestValue(recordValue(entry, 'package build').sha256, 'package build digest')),
      reproducible: booleanValue(built.reproducible, 'reproducible package'),
      prohibitedEntryCount: nonNegativeInteger(
        packageInspection.prohibitedEntryCount,
        'prohibited package entry count',
      ),
      knownVulnerabilityCount: nonNegativeInteger(
        audit.knownVulnerabilityCount,
        'known vulnerability count',
      ),
      unapprovedLicenseCount: nonNegativeInteger(
        licenses.unapprovedLicenseCount,
        'unapproved license count',
      ),
      sbom: {
        packageDigest: digestValue(sbom.packageDigest, 'SBOM package digest'),
        packageCount: nonNegativeInteger(sbom.packageCount, 'SBOM package count'),
      },
    },
  });
}

function projectRuntimeDiagnostics(execution) {
  const result = actionActual(execution, 0, 'capture-runtime-diagnostics');
  return domains({
    revisions: {
      stateLabelsByInstance: clone(result.stateLabelsByInstance),
    },
    outcome: {
      recordsPerInstance: nonNegativeInteger(
        result.recordsPerInstance,
        'records per instance',
      ),
      crossInstanceRecordCount: nonNegativeInteger(
        result.crossInstanceRecordCount,
        'cross-instance record count',
      ),
      mutableDiagnosticFieldCount: nonNegativeInteger(
        result.mutableDiagnosticFieldCount,
        'mutable diagnostic field count',
      ),
      sensitiveMarkerCount: nonNegativeInteger(
        result.sensitiveMarkerCount,
        'sensitive marker count',
      ),
      disabledCollectionCostMs: finiteNonNegative(
        result.disabledCollectionCostMs,
        'disabled collection cost',
      ),
    },
    resources: {
      recordsByInstance: clone(result.recordsByInstance),
    },
  });
}

function projectCallbackIsolation(execution) {
  const emitted = actionActual(execution, 3, 'emit-update');
  const disposed = actionActual(execution, 4, 'dispose-callbacks');
  const product = recordValue(disposed.product, 'disposed product');
  const snapshot = recordValue(product.snapshot, 'disposed snapshot');
  const revisions = recordValue(snapshot.revisions, 'disposed revisions');
  const semantic = recordValue(product.semantic, 'disposed semantic');
  const scene = recordValue(semantic.scene, 'disposed semantic scene');
  const operations = recordValue(product.operations, 'disposed operations');
  const failure = recordValue(disposed.callbackFailure, 'callback failure');
  return domains({
    revisions: {
      scene: nonNegativeInteger(revisions.sceneRevision, 'callback scene revision'),
    },
    scene: {
      invalidNodeCount: invalidNodeCount(scene),
    },
    events: {
      deliveryOrder: stringArray(disposed.deliveryOrder, 'callback delivery order'),
      afterDisposeCount: nonNegativeInteger(
        disposed.afterDisposeCount,
        'after-dispose callback count',
      ),
      dispatch: clone(emitted.dispatch),
    },
    outcome: {
      callbackFailure: {
        code: stringValue(failure.code, 'callback failure code'),
        category: stringValue(failure.category, 'callback failure category'),
      },
      queuedActionStatus: stringValue(
        recordValue(emitted.queuedAction, 'queued action').status,
        'queued action status',
      ),
    },
    resources: {
      callbackRegistrations: nonNegativeInteger(
        operations.callbackRegistrations,
        'callback registrations',
      ),
      queuedActionCount: nonNegativeInteger(
        operations.queuedActionCount,
        'queued action count',
      ),
    },
  });
}

function domains(partial) {
  return {
    revisions: partial.revisions ?? {},
    scene: partial.scene ?? {},
    interaction: partial.interaction ?? {},
    events: partial.events ?? {},
    history: partial.history ?? {},
    outcome: partial.outcome ?? {},
    resources: partial.resources ?? {},
  };
}

function actionActual(execution, index, type) {
  const result = execution.actionResults[index];
  assert(result !== undefined, `action result ${index}`);
  assert(result.index === index, `action result index ${index}`);
  assert(result.type === type, `action result type ${index}`);
  assert(result.status === 'completed', `action result status ${index}`);
  return recordValue(
    recordValue(result.delta, `action ${index} delta`).actual,
    `action ${index} actual`,
  );
}

function cleanupLeakDelta(cleanup) {
  let total = cleanup.status === 'completed' ? 0 : 1;
  const errors = arrayValue(cleanup.errors, 'cleanup errors');
  total += errors.length;
  for (const releaseValue of arrayValue(cleanup.releases, 'cleanup releases')) {
    const release = recordValue(releaseValue, 'cleanup release');
    const remaining = recordValue(release.remainingResources, 'remaining resources');
    for (const field of ['canvasCount', 'subscriptions', 'pendingWork']) {
      total += nonNegativeInteger(remaining[field], `remaining ${field}`);
    }
  }
  return total;
}

function projectCaptures(plan, execution) {
  assert(plan.captureCheckpoints.length === 0, 'plan has no capture checkpoints');
  assert(execution.captures.length === 0, 'execution has no captures');
  return {};
}

function validateOptions(value) {
  const options = recordValue(value, 'options');
  assertExactKeys(
    options,
    ['casePlan', 'environment', 'execution', 'provenance'],
    'options',
  );
  assert(isRecord(options.provenance), 'provenance');
  assert(isRecord(options.environment), 'environment');
  return options;
}

function validatePlan(value) {
  const plan = recordValue(value, 'case plan');
  assert(CASE_IDS.has(plan.id), `case ${String(plan.id)}`);
  const actions = CASE_ACTIONS[plan.id];
  assert(Array.isArray(plan.actionTrace), 'plan action trace');
  assert(
    plan.actionTrace.length === actions.length
      && plan.actionTrace.every((action, index) => action.type === actions[index]),
    `${plan.id} action trace`,
  );
  assert(isRecord(plan.fixture), 'plan fixture');
  assert(isRecord(plan.fixture.setup), 'plan setup');
  assert(isRecord(plan.fixture.setup.params), 'plan params');
  assert(Array.isArray(plan.captureCheckpoints), 'plan captures');
  return plan;
}

function validateExecution(value, plan) {
  const execution = recordValue(value, 'execution');
  assert(execution.$schema === EXECUTION_REVISION, 'execution schema');
  assert(execution.caseId === plan.id, 'execution case');
  assert(execution.status === 'completed', 'execution status');
  assert(Array.isArray(execution.actionResults), 'execution action results');
  assert(execution.actionResults.length === plan.actionTrace.length, 'action result count');
  assert(Array.isArray(execution.eventJournal), 'event journal');
  assert(isRecord(execution.cleanup), 'execution cleanup');
  assert(Array.isArray(execution.captures), 'execution captures');
  validateProductCleanup(execution.cleanup, plan.id);
  return execution;
}

function validateProductCleanup(cleanup, caseId) {
  const product = recordValue(cleanup.productResources, 'product cleanup');
  assertExactKeys(
    product,
    [
      'callbackRegistrations',
      'caseId',
      'queuedActionCount',
      'retainedChannelRecordCount',
      'revision',
    ],
    'product cleanup',
  );
  assert(
    product.revision === 'core-v2-security-operations-cleanup/1',
    'product cleanup revision',
  );
  assert(product.caseId === caseId, 'product cleanup case');
  for (const field of [
    'callbackRegistrations',
    'queuedActionCount',
    'retainedChannelRecordCount',
  ]) {
    assert(nonNegativeInteger(product[field], `product cleanup ${field}`) === 0,
      `product cleanup ${field} is zero`);
  }
}

function notExercised(reason) {
  return {
    _availability: {
      publicProductProbes: 'not-exercised',
      reason,
    },
  };
}

function invalidNodeCount(scene) {
  const nodes = arrayValue(scene.nodes, 'semantic nodes');
  return nodes.filter((node) => !isRecord(node) || !isRecord(node.target)).length;
}

function countText(value, marker) {
  if (marker.length === 0) return 0;
  return value.split(marker).length - 1;
}

function assertExactKeys(value, required, label) {
  const keys = Object.keys(value).sort();
  const expected = [...required].sort();
  assert(
    keys.length === expected.length
      && keys.every((key, index) => key === expected[index]),
    `${label} exact keys`,
  );
}

function recordValue(value, label) {
  assert(isRecord(value), label);
  return value;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function arrayValue(value, label) {
  assert(Array.isArray(value), label);
  return value;
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, label);
  return value;
}

function stringArray(value, label) {
  return arrayValue(value, label).map((entry, index) =>
    stringValue(entry, `${label}[${index}]`));
}

function booleanValue(value, label) {
  assert(typeof value === 'boolean', label);
  return value;
}

function nonNegativeInteger(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0, label);
  return value;
}

function finiteNonNegative(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value) && value >= 0, label);
  return value;
}

function allNumbersFinite(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(allNumbersFinite);
  if (!isRecord(value)) return true;
  return Object.values(value).every(allNumbersFinite);
}

function digestValue(value, label) {
  const digest = stringValue(value, label);
  assert(/^[a-f0-9]{64}$/u.test(digest), label);
  return digest;
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function validateJson(value, label, seen) {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) return;
  if (typeof value === 'number') {
    assert(Number.isFinite(value), `${label} finite number`);
    return;
  }
  assert(typeof value === 'object', `${label} JSON value`);
  assert(!seen.has(value), `${label} acyclic`);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateJson(entry, `${label}[${index}]`, seen));
  } else {
    Object.entries(value).forEach(([key, entry]) =>
      validateJson(entry, `${label}.${key}`, seen));
  }
  seen.delete(value);
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid Core v2 security/operations fold: ${message}`);
}
