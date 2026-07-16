import fixtureCatalogJson from '../../../docs/reference/core-v2-functional-contract/evidence/catalog-fixtures.v1.json';
import manifestJson from '../../../docs/reference/core-v2-functional-contract/evidence/catalog-evidence-manifest.v1.json';

import { isCoreV2FoundationCaseId } from './foundation-cases';

export type CoreV2ContractCaseType = 'capability' | 'consumer-journey';
export type CoreV2ContractPriority = 'P0' | 'P1';

interface FixtureActionRecord {
  readonly index: number;
  readonly type: string;
}

interface FixtureCaseRecord {
  readonly id: string;
  readonly caseType: CoreV2ContractCaseType;
  readonly title: string;
  readonly priority: CoreV2ContractPriority;
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
  readonly caseType: CoreV2ContractCaseType;
  readonly labRoute: string;
}

interface ContractManifest {
  readonly cases: readonly ManifestCaseRecord[];
}

export interface CoreV2ContractActionPresenter {
  readonly index: number;
  readonly type: string;
  readonly handlerId: `contract/${string}`;
  readonly label: string;
  readonly actionTestId: string;
  readonly primaryTestId: string | null;
}

export interface CoreV2ContractPresenterDescriptor {
  readonly caseId: string;
  readonly presenterKey: `core-v2-contract/${string}`;
  readonly caseType: CoreV2ContractCaseType;
  readonly priority: CoreV2ContractPriority;
  readonly title: string;
  readonly instruction: string;
  readonly routeTemplate: string;
  readonly rootTestId: string;
  readonly resultTestId: string;
  readonly firstFailureTestId: string;
  readonly traceTestId: string;
  readonly gestureSurfaceTestId: string;
  readonly actions: readonly CoreV2ContractActionPresenter[];
  readonly executionStatus: 'foundation-observable' | 'not-implemented';
}

const APPROVED_CASE_COUNT = 173;
const fixtureCatalog = fixtureCatalogJson as unknown as FixtureCatalog;
const contractManifest = manifestJson as unknown as ContractManifest;

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Invalid Core v2 contract presenter catalog: ${message}`);
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
): CoreV2ContractActionPresenter {
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
): CoreV2ContractPresenterDescriptor {
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
    executionStatus: isCoreV2FoundationCaseId(fixture.id)
      ? 'foundation-observable'
      : 'not-implemented',
  });
}

invariant(fixtureCatalog.cases.length === APPROVED_CASE_COUNT, 'fixture count must be 173');
invariant(contractManifest.cases.length === APPROVED_CASE_COUNT, 'manifest count must be 173');

export const CORE_V2_CONTRACT_PRESENTERS: readonly CoreV2ContractPresenterDescriptor[] =
  Object.freeze(
    fixtureCatalog.cases.map((fixture, index) => {
      const manifest = contractManifest.cases[index];
      invariant(manifest !== undefined, `${fixture.id} manifest record`);
      return createPresenter(fixture, manifest);
    }),
  );

const presenterById = new Map<string, CoreV2ContractPresenterDescriptor>();
const presenterKeys = new Set<string>();
const rootTestIds = new Set<string>();

for (const presenter of CORE_V2_CONTRACT_PRESENTERS) {
  invariant(!presenterById.has(presenter.caseId), `${presenter.caseId} duplicate case ID`);
  invariant(!presenterKeys.has(presenter.presenterKey), `${presenter.caseId} duplicate presenter`);
  invariant(!rootTestIds.has(presenter.rootTestId), `${presenter.caseId} duplicate root test ID`);
  presenterById.set(presenter.caseId, presenter);
  presenterKeys.add(presenter.presenterKey);
  rootTestIds.add(presenter.rootTestId);
}

export const CORE_V2_CONTRACT_PRESENTER_BY_ID: ReadonlyMap<
  string,
  CoreV2ContractPresenterDescriptor
> = presenterById;

export function selectCoreV2ContractPresenter(caseId: string): CoreV2ContractPresenterDescriptor {
  const presenter = CORE_V2_CONTRACT_PRESENTER_BY_ID.get(caseId);
  if (!presenter) {
    throw new Error(`Unknown Core v2 contract scenario: ${caseId}`);
  }
  return presenter;
}
