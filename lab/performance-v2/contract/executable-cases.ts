import actionSchemaJson from '../../../docs/reference/core-v2-functional-contract/evidence/catalog-action-schema.v1.json';
import manifestJson from '../../../docs/reference/core-v2-functional-contract/evidence/catalog-evidence-manifest.v1.json';
import profileJson from '../../../docs/reference/core-v2-functional-contract/evidence/catalog-fixture-profiles.v1.json';
import fixtureCatalogJson from '../../../docs/reference/core-v2-functional-contract/evidence/catalog-fixtures.v1.json';

export const CORE_V2_EXECUTABLE_CASE_IDS = Object.freeze([
  'EVT-001',
  'EVT-002',
  'EVT-003',
  'EVT-004',
  'EVT-005',
  'EVT-006',
  'EVT-007',
  'EVT-008',
  'EVT-009',
  'QRY-001',
  'QRY-002',
  'SEL-001',
  'SEL-002',
  'SEL-003',
  'SEL-004',
  'SEL-005',
  'SEL-006',
  'SEL-007',
  'SEL-008',
  'SEL-009',
  'HIS-001',
  'HIS-002',
  'HIS-003',
  'HIS-004',
  'HIS-005',
  'HIS-006',
  'ERR-001',
  'ERR-002',
  'ERR-003',
  'ERR-004',
  'ERR-005',
  'ERR-006',
  'DET-004',
  'PRF-007',
  'PRF-008',
  'LIF-001',
  'LIF-002',
  'LIF-003',
  'LIF-004',
  'LIF-005',
  'DAT-001',
  'DAT-002',
  'DAT-003',
  'DAT-004',
  'DAT-005',
  'DAT-006',
  'DAT-007',
  'DAT-008',
  'PIX-004',
  'REN-001',
  'REN-002',
  'REN-003',
  'REN-004',
  'REN-005',
  'REN-006',
  'REN-007',
  'REN-008',
  'REN-009',
  'REN-010',
  'REN-011',
  'LAY-001',
  'LAY-002',
  'LAY-003',
  'LAY-004',
  'LAY-005',
  'AST-001',
  'AST-002',
  'AST-003',
  'SEC-001',
  'UPD-001',
  'UPD-002',
  'UPD-003',
  'UPD-004',
  'UPD-005',
  'UPD-006',
  'UPD-007',
  'UPD-008',
  'UPD-009',
  'UPD-010',
  'UPD-011',
  'UPD-012',
  'ANI-001',
  'ANI-002',
  'UPD-013',
  'UPD-014',
  'VIE-001',
  'VIE-002',
  'VIE-003',
  'VIE-004',
  'VIE-005',
  'VIE-006',
  'VIE-007',
  'VIE-008',
  'TRN-001',
  'TRN-002',
  'TRN-003',
  'TRN-004',
  'TRN-005',
  'TRN-006',
  'TRN-007',
  'TRN-008',
  'TRN-009',
  'TRN-010',
  'CSM-001',
  'CSM-002',
  'CSM-003',
  'CSM-004',
  'CSM-005',
  'CSM-006',
  'CSM-007',
  'CSM-008',
  'CSM-009',
  'CSM-010',
  'CSM-011',
  'CSM-012',
  'CSM-013',
  'CSM-015',
  'CSM-016',
  'CSM-017',
  'CSM-018',
  'CSM-019',
  'CSM-020',
  'CSM-021',
  'CSM-022',
  'CSM-023',
  'CSM-024',
  'CSM-025',
  'CSM-026',
  'CSM-027',
  'CSM-028',
  'CSM-029',
  'CSM-030',
  'CSM-031',
  'CSM-032',
  'CSM-033',
  'CSM-034',
  'CSM-035',
  'CSM-036',
  'CSM-037',
  'CSM-038',
] as const);

export type CoreV2ExecutableCaseId = (typeof CORE_V2_EXECUTABLE_CASE_IDS)[number];

export const CORE_V2_EXECUTABLE_COUNT = 140;
export const CORE_V2_CONTRACT_STUB_COUNT = 33;

const CONTRACT_REVISION = 'core-v2-functional-contract/2026-07-16.2';
const ACTION_LANGUAGE_REVISION = 'core-v2-catalog-actions/1';
const APPROVED_CASE_COUNT = 173;
const APPROVED_ACTION_DEFINITION_COUNT = 381;
const EXECUTABLE_ACTION_COUNT = 545;
const EXECUTABLE_ACTION_TYPE_COUNT = 304;
const CANONICAL_SIZES = new Set(['100', '500', '1000', '2000', '5000', 'production']);
const EXECUTABLE_ID_SET = new Set<string>(CORE_V2_EXECUTABLE_CASE_IDS);

interface ContractAction {
  readonly index: number;
  readonly type: string;
  readonly operands: Readonly<Record<string, unknown>>;
}

interface FixtureRecord {
  readonly id: string;
  readonly caseType: 'capability' | 'consumer-journey';
  readonly title: string;
  readonly priority: 'P0' | 'P1';
  readonly rootTestId: string;
  readonly lab: Readonly<{ route: string }>;
  readonly fixtureProfiles: readonly Readonly<{
    readonly id: string;
    readonly sha256: string;
  }>[];
  readonly setup: Readonly<{ params: Readonly<Record<string, unknown>> }>;
  readonly actionTrace: readonly ContractAction[];
  readonly captureCheckpoints: readonly Readonly<Record<string, unknown>>[];
  readonly cleanupTrace: readonly Readonly<Record<string, unknown>>[];
  readonly requiredObservationDomains: readonly string[];
  readonly hostEngineSeam?: Readonly<{
    readonly hostSupplies: Readonly<Record<string, unknown>>;
  }>;
}

interface FixtureCatalog {
  readonly contractRevision: string;
  readonly sharedProfiles: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly cases: readonly FixtureRecord[];
}

interface ManifestRecord {
  readonly id: string;
  readonly caseType: 'capability' | 'consumer-journey';
  readonly labRoute: string;
  readonly fixtureSha256: string;
}

interface ContractManifest {
  readonly contractRevision: string;
  readonly cases: readonly ManifestRecord[];
}

interface ActionDefinition extends Readonly<Record<string, unknown>> {
  readonly type: string;
  readonly handlerId: string;
}

interface ActionSchema {
  readonly actionLanguageRevision: string;
  readonly definitions: readonly ActionDefinition[];
}

interface FixtureProfiles {
  readonly contractRevision: string;
  readonly seed: number;
  readonly clock: Readonly<{
    readonly kind: string;
    readonly startMs: number;
    readonly frameStepMs: number;
  }>;
  readonly environment: Readonly<Record<string, unknown>>;
  readonly datasets: Readonly<Record<string, unknown>>;
  readonly profiles: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

export interface CoreV2ExecutableCasePlan extends Readonly<Record<string, unknown>> {
  readonly id: CoreV2ExecutableCaseId;
  readonly caseType: 'capability' | 'consumer-journey';
  readonly title: string;
  readonly priority: 'P0' | 'P1';
  readonly rootTestId: string;
  readonly route: string;
  readonly routeParams: Readonly<{ size: string; seed: number }>;
  readonly fixtureSha256: string;
  readonly fixtureProfiles: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly hostSupplies: Readonly<Record<string, unknown>>;
  readonly fixture: Readonly<{
    readonly setup: Readonly<{ readonly params: Readonly<Record<string, unknown>> }>;
    readonly actionTrace: readonly ContractAction[];
    readonly captureCheckpoints: readonly Readonly<Record<string, unknown>>[];
    readonly cleanupTrace: readonly Readonly<Record<string, unknown>>[];
    readonly requiredObservationDomains: readonly string[];
  }>;
  readonly actionTrace: readonly ContractAction[];
  readonly captureCheckpoints: readonly Readonly<Record<string, unknown>>[];
  readonly cleanupTrace: readonly Readonly<Record<string, unknown>>[];
}

const fixtureCatalog = fixtureCatalogJson as unknown as FixtureCatalog;
const manifest = manifestJson as unknown as ContractManifest;
const actionSchema = actionSchemaJson as unknown as ActionSchema;
const profiles = profileJson as unknown as FixtureProfiles;

invariant(fixtureCatalog.contractRevision === CONTRACT_REVISION, 'fixture contract revision drift');
invariant(manifest.contractRevision === CONTRACT_REVISION, 'manifest contract revision drift');
invariant(profiles.contractRevision === CONTRACT_REVISION, 'profile contract revision drift');
invariant(actionSchema.actionLanguageRevision === ACTION_LANGUAGE_REVISION, 'action language revision drift');
invariant(fixtureCatalog.cases.length === APPROVED_CASE_COUNT, 'fixture case count must remain 173');
invariant(manifest.cases.length === APPROVED_CASE_COUNT, 'manifest case count must remain 173');
invariant(
  actionSchema.definitions.length === APPROVED_ACTION_DEFINITION_COUNT,
  'action definition count must remain 381',
);
invariant(profiles.seed === 319, 'canonical profile seed drift');
invariant(profiles.clock.kind === 'manual', 'canonical profile clock drift');
invariant(profiles.environment.backend === 'webgl2', 'production baseline must be WebGL2');

const manifestById = new Map(manifest.cases.map((record) => [record.id, record]));
const selectedFixtures = fixtureCatalog.cases.filter((record) => EXECUTABLE_ID_SET.has(record.id));
invariant(selectedFixtures.length === CORE_V2_EXECUTABLE_COUNT, 'executable fixture count');
invariant(
  selectedFixtures.every((record, index) => record.id === CORE_V2_EXECUTABLE_CASE_IDS[index]),
  'executable fixture identity or canonical order drift',
);

const fixtureById = new Map<CoreV2ExecutableCaseId, FixtureRecord>();
const fixtureProfileValuesById = new Map<
  CoreV2ExecutableCaseId,
  Readonly<Record<string, Readonly<Record<string, unknown>>>>
>();
const selectedActionTypes = new Set<string>();
let selectedActionCount = 0;

for (const fixture of selectedFixtures) {
  invariant(isCoreV2ExecutableCaseId(fixture.id), `unexpected executable fixture ${fixture.id}`);
  const manifestRecord = manifestById.get(fixture.id);
  invariant(manifestRecord !== undefined, `${fixture.id} manifest record`);
  invariant(manifestRecord.caseType === fixture.caseType, `${fixture.id} case type drift`);
  invariant(manifestRecord.labRoute === fixture.lab.route, `${fixture.id} Lab route drift`);
  invariant(/^[a-f0-9]{64}$/.test(manifestRecord.fixtureSha256), `${fixture.id} fixture digest`);
  invariant(fixture.rootTestId === `scenario-${fixture.id.toLowerCase()}`, `${fixture.id} root identity`);
  invariant(
    fixture.lab.route === `/lab/core-v2?scenario=${fixture.id}&size=<SIZE>&seed=<SEED>`,
    `${fixture.id} canonical route`,
  );
  fixtureProfileValuesById.set(fixture.id, resolveDigestBoundProfileValues(fixture));
  invariant(fixture.actionTrace.length > 0, `${fixture.id} action trace`);
  fixture.actionTrace.forEach((action, index) => {
    invariant(action.index === index, `${fixture.id} action index ${index}`);
    invariant(action.type.length > 0, `${fixture.id} action type ${index}`);
    invariant(isRecord(action.operands), `${fixture.id} action operands ${index}`);
    selectedActionTypes.add(action.type);
    selectedActionCount += 1;
  });
  fixtureById.set(fixture.id, fixture);
}

invariant(
  selectedActionCount === EXECUTABLE_ACTION_COUNT,
  `executable action count drift: ${selectedActionCount}`,
);
invariant(
  selectedActionTypes.size === EXECUTABLE_ACTION_TYPE_COUNT,
  `executable action type count drift: ${selectedActionTypes.size}`,
);

const actionDefinitionByType = new Map(actionSchema.definitions.map((definition) => [definition.type, definition]));
const selectedActionDefinitions = [...selectedActionTypes].map((type) => {
  const definition = actionDefinitionByType.get(type);
  invariant(definition !== undefined, `missing action definition ${type}`);
  invariant(definition.handlerId === `contract/${type}`, `${type} handler identity drift`);
  return definition;
});

export const CORE_V2_EXECUTABLE_ACTION_DEFINITIONS: readonly Readonly<Record<string, unknown>>[] =
  deepFreeze(structuredClone(selectedActionDefinitions));

export const CORE_V2_EXECUTABLE_PROFILE_ENVIRONMENT: Readonly<Record<string, unknown>> =
  deepFreeze(structuredClone(profiles.environment));

export const CORE_V2_EXECUTABLE_CLOCK_PROFILE = deepFreeze(structuredClone(profiles.clock));

const executableDatasets: Readonly<Record<string, unknown>> =
  deepFreeze(structuredClone(profiles.datasets));

export function isCoreV2ExecutableCaseId(value: string): value is CoreV2ExecutableCaseId {
  return EXECUTABLE_ID_SET.has(value);
}

export function materializeCoreV2ExecutableCase(
  caseId: CoreV2ExecutableCaseId,
  size: string,
  seed: number,
): CoreV2ExecutableCasePlan {
  invariant(CANONICAL_SIZES.has(size), `${caseId} canonical size`);
  invariant(Number.isInteger(seed) && seed >= 0 && seed <= 0xffff_ffff, `${caseId} canonical uint32 seed`);
  const source = fixtureById.get(caseId);
  invariant(source !== undefined, `${caseId} approved fixture`);
  const manifestRecord = manifestById.get(caseId);
  invariant(manifestRecord !== undefined, `${caseId} approved manifest`);
  const fixtureProfiles = fixtureProfileValuesById.get(caseId);
  invariant(fixtureProfiles !== undefined, `${caseId} digest-bound fixture profiles`);

  const fixture = {
    setup: structuredClone(source.setup),
    actionTrace: structuredClone(source.actionTrace),
    captureCheckpoints: structuredClone(source.captureCheckpoints),
    cleanupTrace: structuredClone(source.cleanupTrace),
    requiredObservationDomains: structuredClone(source.requiredObservationDomains),
  };
  const plan: CoreV2ExecutableCasePlan = {
    id: caseId,
    caseType: source.caseType,
    title: source.title,
    priority: source.priority,
    rootTestId: source.rootTestId,
    route: source.lab.route.replace('<SIZE>', size).replace('<SEED>', String(seed)),
    routeParams: { size, seed },
    fixtureSha256: manifestRecord.fixtureSha256,
    fixtureProfiles: structuredClone(fixtureProfiles),
    hostSupplies: structuredClone(source.hostEngineSeam?.hostSupplies ?? {}),
    fixture,
    actionTrace: structuredClone(fixture.actionTrace),
    captureCheckpoints: structuredClone(fixture.captureCheckpoints),
    cleanupTrace: structuredClone(fixture.cleanupTrace),
  };
  invariant(!Object.hasOwn(plan, 'expected'), `${caseId} plan must not contain approved expected evidence`);
  invariant(
    !['engineReturns', 'failureRollback', 'finalState'].some((key) =>
      Object.hasOwn(plan.hostSupplies, key)),
    `${caseId} plan host input must not contain approved result evidence`,
  );
  return deepFreeze(plan);
}

export function selectCoreV2ExecutableActionDefinitions(
  plan: CoreV2ExecutableCasePlan,
): readonly Readonly<Record<string, unknown>>[] {
  const requiredTypes = new Set(plan.actionTrace.map((action) => action.type));
  const definitions = CORE_V2_EXECUTABLE_ACTION_DEFINITIONS.filter((definition) =>
    typeof definition.type === 'string' && requiredTypes.has(definition.type));
  invariant(definitions.length === requiredTypes.size, `${plan.id} exact action definitions`);
  return definitions;
}

export function resolveCoreV2ExecutableDataset(reference: string): unknown {
  invariant(reference.length > 0, 'dataset reference');
  return executableDatasets[reference];
}

function resolveDigestBoundProfileValues(
  fixture: FixtureRecord,
): Readonly<Record<string, Readonly<Record<string, unknown>>>> {
  invariant(
    Array.isArray(fixture.fixtureProfiles) && fixture.fixtureProfiles.length > 0,
    `${fixture.id} fixture profile bindings`,
  );
  const selected: Record<string, Readonly<Record<string, unknown>>> = {};
  for (const binding of fixture.fixtureProfiles) {
    invariant(isRecord(binding), `${fixture.id} fixture profile binding`);
    invariant(
      typeof binding.id === 'string' && binding.id.length > 0,
      `${fixture.id} fixture profile ID`,
    );
    invariant(
      typeof binding.sha256 === 'string' && /^[a-f0-9]{64}$/u.test(binding.sha256),
      `${fixture.id} fixture profile digest`,
    );
    invariant(!Object.hasOwn(selected, binding.id), `${fixture.id} duplicate fixture profile ${binding.id}`);

    const shared = fixtureCatalog.sharedProfiles[binding.id];
    const value = profiles.profiles[binding.id];
    invariant(shared !== undefined, `${fixture.id} shared fixture profile ${binding.id}`);
    invariant(value !== undefined, `${fixture.id} fixture profile value ${binding.id}`);
    invariant(shared.sha256 === binding.sha256, `${fixture.id} fixture profile ${binding.id} digest binding`);

    const sharedValueKeys = Object.keys(shared)
      .filter((key) => !['actionIndexStartsAt', 'sha256', 'sourceRefs'].includes(key))
      .sort();
    const profileValueKeys = Object.keys(value).sort();
    invariant(
      sharedValueKeys.length === profileValueKeys.length
        && sharedValueKeys.every((key, index) => key === profileValueKeys[index]),
      `${fixture.id} fixture profile ${binding.id} value keys`,
    );
    invariant(
      profileValueKeys.every((key) => sameJson(shared[key], value[key])),
      `${fixture.id} fixture profile ${binding.id} value binding`,
    );
    selected[binding.id] = structuredClone(value);
  }
  return deepFreeze(selected);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid Core v2 executable Lab catalog: ${message}`);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
