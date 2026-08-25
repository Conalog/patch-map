import { selectCatalogCases } from './catalog.mjs';

export const CANONICAL_DATASET_SIZES = Object.freeze([
  '100',
  '500',
  '1000',
  '2000',
  '5000',
  'production',
]);

const MAX_UNSIGNED_32_BIT = 0xffff_ffff;

export function createExecutorPlan(catalog, options) {
  assert(options && typeof options === 'object' && !Array.isArray(options), 'plan options must be an object');
  const routeParams = parseRouteParams(options);
  const selection = selectionFromOptions(options);
  const selectedCases = selectCatalogCases(catalog, selection);
  const cases = selectedCases.map((record) => materializeSelectedCase(record, routeParams));

  return deepFreeze({
    $schema: 'patch-map-executor-plan/1',
    contractRevision: catalog.contractRevision,
    observationRevision: catalog.observationRevision,
    catalogManifestSha256: catalog.manifestSha256,
    selection: {
      tranche: selection.tranche ?? null,
      caseIds: cases.map((record) => record.id),
    },
    routeParams,
    routes: cases.map((record) => ({
      id: record.id,
      route: record.route,
      rootTestId: record.rootTestId,
    })),
    cases,
  });
}

export function materializeCase(record, routeOptions) {
  assert(record && typeof record === 'object' && !Array.isArray(record), 'case record must be an object');
  return deepFreeze(materializeSelectedCase(record, parseRouteParams(routeOptions)));
}

export function parseCanonicalSize(value) {
  assert(
    typeof value === 'string' && CANONICAL_DATASET_SIZES.includes(value),
    `size must be one of ${CANONICAL_DATASET_SIZES.join(', ')}`,
  );
  return value;
}

export function parseCanonicalSeed(value) {
  assert(typeof value === 'string' && /^(?:0|[1-9]\d*)$/.test(value), 'seed must be a canonical unsigned decimal integer');
  const seed = Number(value);
  assert(Number.isSafeInteger(seed) && seed <= MAX_UNSIGNED_32_BIT, 'seed must fit unsigned 32-bit range');
  return seed;
}

function parseRouteParams(options) {
  assert(options && typeof options === 'object' && !Array.isArray(options), 'route options must be an object');
  return {
    size: parseCanonicalSize(options.size),
    seed: parseCanonicalSeed(options.seed),
  };
}

function selectionFromOptions(options) {
  const hasTranche = options.tranche !== undefined;
  const hasCaseIds = options.caseIds !== undefined;
  assert(!(hasTranche && hasCaseIds), 'select either tranche or case IDs, not both');
  if (hasCaseIds) return { caseIds: options.caseIds };
  return { tranche: options.tranche ?? 'all' };
}

function materializeSelectedCase(record, routeParams) {
  assert(typeof record.id === 'string' && record.id.length > 0, 'case ID');
  assert(typeof record.rootTestId === 'string' && record.rootTestId.length > 0, `${record.id} root test ID`);
  assert(typeof record.labRoute === 'string', `${record.id} Lab route`);

  const expectedTemplate = `/lab/patch-map?scenario=${record.id}&size=<SIZE>&seed=<SEED>`;
  assert(record.labRoute === expectedTemplate, `${record.id} canonical Lab route template`);
  const fixture = structuredClone(record.fixture);

  return {
    id: record.id,
    caseType: record.caseType,
    title: record.title,
    priority: record.priority,
    capabilities: structuredClone(record.capabilities),
    rootTestId: record.rootTestId,
    route: record.labRoute
      .replace('<SIZE>', routeParams.size)
      .replace('<SEED>', String(routeParams.seed)),
    routeParams: structuredClone(routeParams),
    fixtureSha256: record.fixtureSha256,
    expected: structuredClone(record.expected),
    fixture,
    actionTrace: fixture.actionTrace,
    cleanupTrace: fixture.cleanupTrace,
    captureCheckpoints: fixture.captureCheckpoints,
    requiredObservationDomains: fixture.requiredObservationDomains,
  };
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`PatchMap materialization invalid: ${message}`);
}
