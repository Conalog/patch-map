import fixtureCatalogJson from '../../../docs/reference/core-v2-functional-contract/evidence/catalog-fixtures.v1.json';
import manifestJson from '../../../docs/reference/core-v2-functional-contract/evidence/catalog-evidence-manifest.v1.json';

import { isPatchMapExecutableCaseId } from './executable-cases';

export type PatchMapContractCaseType = 'capability' | 'consumer-journey';
export type PatchMapContractPriority = 'P0' | 'P1';

interface FixtureActionRecord {
  readonly index: number;
  readonly type: string;
}

interface FixtureCaseRecord {
  readonly id: string;
  readonly caseType: PatchMapContractCaseType;
  readonly title: string;
  readonly priority: PatchMapContractPriority;
  readonly lab: Readonly<{
    route: string;
    instruction: string;
  }>;
  readonly rootTestId: string;
  readonly actionTrace: readonly FixtureActionRecord[];
}

interface FixtureCatalog {
  readonly cases: readonly FixtureCaseRecord[];
}

interface ManifestCaseRecord {
  readonly id: string;
  readonly caseType: PatchMapContractCaseType;
  readonly labRoute: string;
}

interface ContractManifest {
  readonly cases: readonly ManifestCaseRecord[];
}

export interface PatchMapContractActionPresenter {
  readonly index: number;
  readonly type: string;
  readonly handlerId: `contract/${string}`;
  readonly label: string;
  readonly actionTestId: string;
  readonly primaryTestId: string | null;
}

export interface PatchMapContractPresenterDescriptor {
  readonly caseId: string;
  readonly presenterKey: `core-v2-contract/${string}`;
  readonly caseType: PatchMapContractCaseType;
  readonly priority: PatchMapContractPriority;
  readonly title: string;
  readonly instruction: string;
  readonly routeTemplate: string;
  readonly rootTestId: string;
  readonly resultTestId: string;
  readonly firstFailureTestId: string;
  readonly traceTestId: string;
  readonly gestureSurfaceTestId: string;
  readonly actions: readonly PatchMapContractActionPresenter[];
  readonly executionStatus: 'actual-observable' | 'not-implemented';
}

const APPROVED_CASE_COUNT = 173;
const fixtureCatalog = fixtureCatalogJson as unknown as FixtureCatalog;
const contractManifest = manifestJson as unknown as ContractManifest;

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Invalid PatchMap contract presenter catalog: ${message}`);
  }
}

function actionLabel(type: string): string {
  return type
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1-$2')
    .split('-')
    .filter((part) => part.length > 0)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
}

function createActionPresenter(
  caseId: string,
  rootTestId: string,
  action: FixtureActionRecord,
  expectedIndex: number,
): PatchMapContractActionPresenter {
  invariant(action.index === expectedIndex, `${caseId} action ${expectedIndex} index drift`);
  invariant(/^[A-Za-z][A-Za-z0-9-]*$/.test(action.type), `${caseId} action ${expectedIndex} type`);

  return Object.freeze({
    index: action.index,
    type: action.type,
    handlerId: `contract/${action.type}` as const,
    label: actionLabel(action.type),
    actionTestId: `${rootTestId}-action-${String(action.index).padStart(2, '0')}`,
    primaryTestId: action.index === 0 ? `${rootTestId}-primary` : null,
  });
}

function createPresenter(
  fixture: FixtureCaseRecord,
  manifest: ManifestCaseRecord,
): PatchMapContractPresenterDescriptor {
  const expectedRootTestId = `scenario-${fixture.id.toLowerCase()}`;
  const expectedRoute = `/lab/core-v2?scenario=${fixture.id}&size=<SIZE>&seed=<SEED>`;

  invariant(fixture.id === manifest.id, `${fixture.id} manifest identity`);
  invariant(fixture.caseType === manifest.caseType, `${fixture.id} case type`);
  invariant(fixture.rootTestId === expectedRootTestId, `${fixture.id} root test ID`);
  invariant(fixture.lab.route === expectedRoute, `${fixture.id} fixture route`);
  invariant(manifest.labRoute === expectedRoute, `${fixture.id} manifest route`);
  invariant(fixture.actionTrace.length > 0, `${fixture.id} action ownership`);

  const actions = Object.freeze(
    fixture.actionTrace.map((action, index) =>
      createActionPresenter(fixture.id, expectedRootTestId, action, index),
    ),
  );

  return Object.freeze({
    caseId: fixture.id,
    presenterKey: `core-v2-contract/${fixture.id}` as const,
    caseType: fixture.caseType,
    priority: fixture.priority,
    title: fixture.title,
    instruction: fixture.lab.instruction,
    routeTemplate: expectedRoute,
    rootTestId: expectedRootTestId,
    resultTestId: `${expectedRootTestId}-result`,
    firstFailureTestId: `${expectedRootTestId}-first-failure`,
    traceTestId: `${expectedRootTestId}-trace`,
    gestureSurfaceTestId: `${expectedRootTestId}-gesture-surface`,
    actions,
    executionStatus: isPatchMapExecutableCaseId(fixture.id)
      ? 'actual-observable'
      : 'not-implemented',
  });
}

invariant(fixtureCatalog.cases.length === APPROVED_CASE_COUNT, 'fixture count must be 173');
invariant(contractManifest.cases.length === APPROVED_CASE_COUNT, 'manifest count must be 173');

export const PATCH_MAP_CONTRACT_PRESENTERS: readonly PatchMapContractPresenterDescriptor[] =
  Object.freeze(
    fixtureCatalog.cases.map((fixture, index) => {
      const manifest = contractManifest.cases[index];
      invariant(manifest !== undefined, `${fixture.id} manifest record`);
      return createPresenter(fixture, manifest);
    }),
  );

const presenterById = new Map<string, PatchMapContractPresenterDescriptor>();
const presenterKeys = new Set<string>();
const rootTestIds = new Set<string>();

for (const presenter of PATCH_MAP_CONTRACT_PRESENTERS) {
  invariant(!presenterById.has(presenter.caseId), `${presenter.caseId} duplicate case ID`);
  invariant(!presenterKeys.has(presenter.presenterKey), `${presenter.caseId} duplicate presenter`);
  invariant(!rootTestIds.has(presenter.rootTestId), `${presenter.caseId} duplicate root test ID`);
  presenterById.set(presenter.caseId, presenter);
  presenterKeys.add(presenter.presenterKey);
  rootTestIds.add(presenter.rootTestId);
}

export const PATCH_MAP_CONTRACT_PRESENTER_BY_ID: ReadonlyMap<
  string,
  PatchMapContractPresenterDescriptor
> = presenterById;

export function selectPatchMapContractPresenter(caseId: string): PatchMapContractPresenterDescriptor {
  const presenter = PATCH_MAP_CONTRACT_PRESENTER_BY_ID.get(caseId);
  if (!presenter) {
    throw new Error(`Unknown PatchMap contract scenario: ${caseId}`);
  }
  return presenter;
}
