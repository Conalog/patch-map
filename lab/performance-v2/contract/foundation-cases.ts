import actionSchemaJson from '../../../docs/reference/core-v2-functional-contract/evidence/catalog-action-schema.v1.json';
import manifestJson from '../../../docs/reference/core-v2-functional-contract/evidence/catalog-evidence-manifest.v1.json';
import profileJson from '../../../docs/reference/core-v2-functional-contract/evidence/catalog-fixture-profiles.v1.json';
import fixtureCatalogJson from '../../../docs/reference/core-v2-functional-contract/evidence/catalog-fixtures.v1.json';

export const CORE_V2_FOUNDATION_CASE_IDS = Object.freeze([
  'LIF-001',
  'LIF-002',
  'DAT-001',
  'DAT-002',
  'CSM-001',
  'CSM-003',
] as const);

export type CoreV2FoundationCaseId = (typeof CORE_V2_FOUNDATION_CASE_IDS)[number];

export const CORE_V2_FOUNDATION_EXECUTABLE_COUNT = 6;
export const CORE_V2_CONTRACT_STUB_COUNT = 167;

const CONTRACT_REVISION = 'core-v2-functional-contract/2026-07-16.2';
const ACTION_LANGUAGE_REVISION = 'core-v2-catalog-actions/1';
const APPROVED_CASE_COUNT = 173;
const APPROVED_ACTION_DEFINITION_COUNT = 381;
const FOUNDATION_ACTION_COUNT = 23;
const FOUNDATION_ACTION_TYPE_COUNT = 15;
const CANONICAL_SIZES = new Set(['100', '500', '1000', '2000', '5000', 'production']);
const FOUNDATION_ID_SET = new Set<string>(CORE_V2_FOUNDATION_CASE_IDS);

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
  readonly setup: Readonly<{ params: Readonly<Record<string, unknown>> }>;
  readonly actionTrace: readonly ContractAction[];
  readonly captureCheckpoints: readonly Readonly<Record<string, unknown>>[];
  readonly cleanupTrace: readonly Readonly<Record<string, unknown>>[];
  readonly requiredObservationDomains: readonly string[];
}

interface FixtureCatalog {
  readonly contractRevision: string;
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
}

export interface CoreV2FoundationCasePlan extends Readonly<Record<string, unknown>> {
  readonly id: CoreV2FoundationCaseId;
  readonly caseType: 'capability' | 'consumer-journey';
  readonly title: string;
  readonly priority: 'P0' | 'P1';
  readonly rootTestId: string;
  readonly route: string;
  readonly routeParams: Readonly<{ size: string; seed: number }>;
  readonly fixtureSha256: string;
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
invariant(profiles.environment.backend === 'webgl2', 'foundation production baseline must be WebGL2');

const manifestById = new Map(manifest.cases.map((record) => [record.id, record]));
const selectedFixtures = fixtureCatalog.cases.filter((record) => FOUNDATION_ID_SET.has(record.id));
invariant(selectedFixtures.length === CORE_V2_FOUNDATION_EXECUTABLE_COUNT, 'foundation fixture count');
invariant(
  selectedFixtures.every((record, index) => record.id === CORE_V2_FOUNDATION_CASE_IDS[index]),
  'foundation fixture identity or canonical order drift',
);

const fixtureById = new Map<CoreV2FoundationCaseId, FixtureRecord>();
const selectedActionTypes = new Set<string>();
let selectedActionCount = 0;

for (const fixture of selectedFixtures) {
  invariant(isCoreV2FoundationCaseId(fixture.id), `unexpected foundation fixture ${fixture.id}`);
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

invariant(selectedActionCount === FOUNDATION_ACTION_COUNT, 'foundation action count must remain 23');
invariant(
  selectedActionTypes.size === FOUNDATION_ACTION_TYPE_COUNT,
  'foundation action type count must remain 15',
);

const actionDefinitionByType = new Map(actionSchema.definitions.map((definition) => [definition.type, definition]));
const selectedActionDefinitions = [...selectedActionTypes].map((type) => {
  const definition = actionDefinitionByType.get(type);
  invariant(definition !== undefined, `missing action definition ${type}`);
  invariant(definition.handlerId === `contract/${type}`, `${type} handler identity drift`);
  return definition;
});

export const CORE_V2_FOUNDATION_ACTION_DEFINITIONS: readonly Readonly<Record<string, unknown>>[] =
  deepFreeze(structuredClone(selectedActionDefinitions));

export const CORE_V2_FOUNDATION_PROFILE_ENVIRONMENT: Readonly<Record<string, unknown>> =
  deepFreeze(structuredClone(profiles.environment));

export const CORE_V2_FOUNDATION_CLOCK_PROFILE = deepFreeze(structuredClone(profiles.clock));

const foundationDatasets: Readonly<Record<string, unknown>> =
  deepFreeze(structuredClone(profiles.datasets));

export function isCoreV2FoundationCaseId(value: string): value is CoreV2FoundationCaseId {
  return FOUNDATION_ID_SET.has(value);
}

export function materializeCoreV2FoundationCase(
  caseId: CoreV2FoundationCaseId,
  size: string,
  seed: number,
): CoreV2FoundationCasePlan {
  invariant(CANONICAL_SIZES.has(size), `${caseId} canonical size`);
  invariant(Number.isInteger(seed) && seed >= 0 && seed <= 0xffff_ffff, `${caseId} canonical uint32 seed`);
  const source = fixtureById.get(caseId);
  invariant(source !== undefined, `${caseId} approved fixture`);
  const manifestRecord = manifestById.get(caseId);
  invariant(manifestRecord !== undefined, `${caseId} approved manifest`);

  const fixture = {
    setup: structuredClone(source.setup),
    actionTrace: structuredClone(source.actionTrace),
    captureCheckpoints: structuredClone(source.captureCheckpoints),
    cleanupTrace: structuredClone(source.cleanupTrace),
    requiredObservationDomains: structuredClone(source.requiredObservationDomains),
  };
  const plan: CoreV2FoundationCasePlan = {
    id: caseId,
    caseType: source.caseType,
    title: source.title,
    priority: source.priority,
    rootTestId: source.rootTestId,
    route: source.lab.route.replace('<SIZE>', size).replace('<SEED>', String(seed)),
    routeParams: { size, seed },
    fixtureSha256: manifestRecord.fixtureSha256,
    fixture,
    actionTrace: structuredClone(fixture.actionTrace),
    captureCheckpoints: structuredClone(fixture.captureCheckpoints),
    cleanupTrace: structuredClone(fixture.cleanupTrace),
  };
  invariant(!Object.hasOwn(plan, 'expected'), `${caseId} plan must not contain approved expected evidence`);
  return deepFreeze(plan);
}

export function resolveCoreV2FoundationDataset(reference: string): unknown {
  invariant(reference.length > 0, 'dataset reference');
  return foundationDatasets[reference];
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid Core v2 foundation Lab catalog: ${message}`);
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
