import actionSchemaJson from '../../../contracts/patch-map/evidence/catalog-action-schema.v1.json';
import manifestJson from '../../../contracts/patch-map/evidence/catalog-evidence-manifest.v1.json';
import profileJson from '../../../contracts/patch-map/evidence/catalog-fixture-profiles.v1.json';
import fixtureCatalogJson from '../../../contracts/patch-map/evidence/catalog-fixtures.v1.json';
import {
  deepFreezePatchMapLabValue as deepFreeze,
  isPatchMapLabRecord as isRecord,
} from './runtime-values';

export const PATCH_MAP_EXECUTABLE_CASE_IDS = Object.freeze([
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
  'DET-001',
  'DET-002',
  'DET-003',
  'DET-004',
  'PRF-001',
  'PRF-002',
  'PRF-003',
  'PRF-004',
  'PRF-005',
  'PRF-006',
  'PRF-007',
  'PRF-008',
  'PRF-009',
  'LIF-001',
  'LIF-002',
  'LIF-003',
  'LIF-004',
  'LIF-005',
  'LIF-006',
  'DAT-001',
  'DAT-002',
  'DAT-003',
  'DAT-004',
  'DAT-005',
  'DAT-007',
  'DAT-008',
  'PIX-001',
  'PIX-002',
  'PIX-003',
  'PIX-004',
  'PIX-005',
  'PKG-001',
  'PKG-002',
  'PKG-003',
  'PKG-004',
  'PKG-005',
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
  'SEC-002',
  'SEC-003',
  'SEC-004',
  'ACC-001',
  'ACC-002',
  'ACC-003',
  'OPS-001',
  'OPS-002',
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
  'ANI-003',
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
  'CSM-014',
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

export type PatchMapExecutableCaseId = (typeof PATCH_MAP_EXECUTABLE_CASE_IDS)[number];

export const PATCH_MAP_EXECUTABLE_COUNT = PATCH_MAP_EXECUTABLE_CASE_IDS.length;
export const PATCH_MAP_CONTRACT_STUB_COUNT = 0;

const CONTRACT_REVISION = 'patch-map-contract/1';
const ACTION_LANGUAGE_REVISION = 'patch-map-catalog-actions/1';
const CANONICAL_SIZES = new Set(['100', '500', '1000', '2000', '5000', 'production']);
const EXECUTABLE_ID_SET = new Set<string>(PATCH_MAP_EXECUTABLE_CASE_IDS);

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

export interface PatchMapExecutableCasePlan extends Readonly<Record<string, unknown>> {
  readonly id: PatchMapExecutableCaseId;
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
invariant(
  fixtureCatalog.cases.length === PATCH_MAP_EXECUTABLE_COUNT,
  'fixture case count must match the executable case inventory',
);
invariant(
  manifest.cases.length === PATCH_MAP_EXECUTABLE_COUNT,
  'manifest case count must match the executable case inventory',
);
invariant(profiles.seed === 319, 'canonical profile seed drift');
invariant(profiles.clock.kind === 'manual', 'canonical profile clock drift');
invariant(profiles.environment.backend === 'webgl2', 'production baseline must be WebGL2');

const manifestById = new Map(manifest.cases.map((record) => [record.id, record]));
const selectedFixtures = fixtureCatalog.cases.filter((record) => EXECUTABLE_ID_SET.has(record.id));
invariant(selectedFixtures.length === PATCH_MAP_EXECUTABLE_COUNT, 'executable fixture count');
invariant(
  selectedFixtures.every((record, index) => record.id === PATCH_MAP_EXECUTABLE_CASE_IDS[index]),
  'executable fixture identity or canonical order drift',
);

const fixtureById = new Map<PatchMapExecutableCaseId, FixtureRecord>();
const fixtureProfileValuesById = new Map<
  PatchMapExecutableCaseId,
  Readonly<Record<string, Readonly<Record<string, unknown>>>>
>();
const selectedActionTypes = new Set<string>();
let selectedActionCount = 0;

for (const fixture of selectedFixtures) {
  invariant(isPatchMapExecutableCaseId(fixture.id), `unexpected executable fixture ${fixture.id}`);
  const manifestRecord = manifestById.get(fixture.id);
  invariant(manifestRecord !== undefined, `${fixture.id} manifest record`);
  invariant(manifestRecord.caseType === fixture.caseType, `${fixture.id} case type drift`);
  invariant(manifestRecord.labRoute === fixture.lab.route, `${fixture.id} Lab route drift`);
  invariant(/^[a-f0-9]{64}$/.test(manifestRecord.fixtureSha256), `${fixture.id} fixture digest`);
  invariant(fixture.rootTestId === `scenario-${fixture.id.toLowerCase()}`, `${fixture.id} root identity`);
  invariant(
    fixture.lab.route === `/lab/patch-map?scenario=${fixture.id}&size=<SIZE>&seed=<SEED>`,
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

invariant(selectedActionCount > 0, 'executable action inventory must not be empty');
invariant(selectedActionTypes.size > 0, 'executable action type inventory must not be empty');

const actionDefinitionByType = new Map(actionSchema.definitions.map((definition) => [definition.type, definition]));
invariant(
  actionDefinitionByType.size === actionSchema.definitions.length,
  'action definition types must be unique',
);
const selectedActionDefinitions = [...selectedActionTypes].map((type) => {
  const definition = actionDefinitionByType.get(type);
  invariant(definition !== undefined, `missing action definition ${type}`);
  invariant(definition.handlerId === `contract/${type}`, `${type} handler identity drift`);
  return definition;
});

export const PATCH_MAP_EXECUTABLE_ACTION_DEFINITIONS: readonly Readonly<Record<string, unknown>>[] =
  deepFreeze(structuredClone(selectedActionDefinitions));

export const PATCH_MAP_EXECUTABLE_PROFILE_ENVIRONMENT: Readonly<Record<string, unknown>> =
  deepFreeze(structuredClone(profiles.environment));

export const PATCH_MAP_EXECUTABLE_CLOCK_PROFILE = deepFreeze(structuredClone(profiles.clock));

const executableDatasets: Readonly<Record<string, unknown>> =
  deepFreeze(structuredClone(profiles.datasets));

export function isPatchMapExecutableCaseId(value: string): value is PatchMapExecutableCaseId {
  return EXECUTABLE_ID_SET.has(value);
}

export function materializePatchMapExecutableCase(
  caseId: PatchMapExecutableCaseId,
  size: string,
  seed: number,
): PatchMapExecutableCasePlan {
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
  const plan: PatchMapExecutableCasePlan = {
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

export function selectPatchMapExecutableActionDefinitions(
  plan: PatchMapExecutableCasePlan,
): readonly Readonly<Record<string, unknown>>[] {
  const requiredTypes = new Set(plan.actionTrace.map((action) => action.type));
  const definitions = PATCH_MAP_EXECUTABLE_ACTION_DEFINITIONS.filter((definition) =>
    typeof definition.type === 'string' && requiredTypes.has(definition.type));
  invariant(definitions.length === requiredTypes.size, `${plan.id} exact action definitions`);
  return definitions;
}

export function resolvePatchMapExecutableDataset(reference: string): unknown {
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
  if (!condition) throw new Error(`Invalid PatchMap executable Lab catalog: ${message}`);
}
