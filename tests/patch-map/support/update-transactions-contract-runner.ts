import { expect } from 'vitest';

import { PatchMap } from '../../../src/patch-map/engine';
import {
  UpdateContractSurface,
  createTestAssetRuntime,
  deepFreeze,
  isRecord,
  requireArray,
  requireInteger,
  requireRecord,
  zeroOwnership,
  type JsonRecord,
  type SurfaceFault,
} from './update-transactions-contract-surface';
import {
  hierarchyScene,
  testDatasets,
} from './update-transactions-contract-fixtures';

type HandlerEntry = readonly [string, (context: unknown, action: unknown) => unknown];

interface ContractAction {
  readonly index: number;
  readonly type: string;
  readonly operands: Readonly<JsonRecord>;
}

interface CatalogCase {
  readonly id: string;
  readonly caseType: string;
  readonly fixture: Readonly<{
    readonly setup: Readonly<{ readonly params: Readonly<JsonRecord> }>;
    readonly actionTrace: readonly ContractAction[];
    readonly captureCheckpoints: readonly unknown[];
    readonly cleanupTrace: readonly unknown[];
  }>;
}

export interface MaterializedCase extends CatalogCase {
  readonly actionTrace: readonly ContractAction[];
  readonly routeParams: Readonly<{ readonly size: string; readonly seed: number }>;
}

interface ActionDefinition {
  readonly type: string;
  readonly handlerId: string;
}

interface ExecutorCatalog {
  readonly actionDefinitions: readonly ActionDefinition[];
  readonly cases: readonly CatalogCase[];
}

interface CatalogRuntime {
  loadExecutorCatalog(this: void): Promise<ExecutorCatalog>;
  selectCatalogCases(
    this: void,
    catalog: ExecutorCatalog,
    selection: Readonly<{ readonly caseIds: readonly string[] }>,
  ): readonly CatalogCase[];
}

interface MaterializeRuntime {
  materializeCase(
    this: void,
    record: CatalogCase,
    options: Readonly<{ readonly size: string; readonly seed: string }>,
  ): MaterializedCase;
}

interface HandlerRuntime {
  readonly UPDATE_TRANSACTIONS_ACTION_TYPES: readonly string[];
  readonly UPDATE_TRANSACTIONS_CASE_IDS: readonly string[];
  createUpdateTransactionHandlerEntries(
    this: void,
    product: Readonly<JsonRecord>,
  ): readonly HandlerEntry[];
}

interface ClockContract {
  now(): number;
  advanceTo(timeMs: number): Promise<void>;
  withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T>;
}

export interface CaseExecution extends JsonRecord {
  readonly caseId: string;
  readonly status: string;
  readonly actionResults: readonly Readonly<{
    readonly index: number;
    readonly type: string;
    readonly status: string;
    readonly delta: Readonly<{ readonly actual: JsonRecord }>;
  }>[];
  readonly captures: readonly Readonly<JsonRecord>[];
  readonly cleanup: Readonly<JsonRecord>;
  readonly eventJournalFailures: readonly unknown[];
}

interface WorkerRuntime {
  executeContractCase(
    this: void,
    options: Readonly<{
      readonly caseRecord: MaterializedCase;
      readonly actionDefinitions: readonly ActionDefinition[];
      readonly engineFactory: () => PatchMap;
      readonly datasets: ReadonlyMap<string, unknown>;
      readonly clock: ClockContract;
      readonly handlerEntries: readonly HandlerEntry[];
    }>,
  ): Promise<CaseExecution>;
}

interface FoldRuntime {
  foldUpdateTransactionExecution(
    this: void,
    options: Readonly<{
      readonly casePlan: MaterializedCase;
      readonly execution: Readonly<JsonRecord>;
      readonly provenance: Readonly<JsonRecord>;
      readonly environment: Readonly<JsonRecord>;
    }>,
  ): Readonly<{
    readonly actual: Readonly<JsonRecord>;
    readonly fixtures: Readonly<JsonRecord>;
    readonly captures: Readonly<JsonRecord>;
  }>;
}

interface CompareRuntime {
  compareObservation(
    this: void,
    options: Readonly<{
      readonly expectedCase: Readonly<JsonRecord>;
      readonly actual: Readonly<JsonRecord>;
      readonly fixtures: Readonly<JsonRecord>;
      readonly captures: Readonly<JsonRecord>;
    }>,
  ): Readonly<{
    readonly passed: number;
    readonly failed: number;
    readonly assertions: readonly Readonly<{
      readonly path: string;
      readonly passed: boolean;
    }>[];
  }>;
}

export type AdapterFault =
  | 'duplicate-subscription'
  | 'subscription-drop'
  | 'zero-asset-session';

export interface ExecuteCaseOptions {
  readonly surfaceFault?: SurfaceFault;
  readonly adapterFault?: AdapterFault;
  readonly resourceJournal?: string[];
}

async function loadRuntime<T>(relativePath: string): Promise<T> {
  const namespace: unknown = await import(
    /* @vite-ignore */ new URL(relativePath, import.meta.url).href
  );
  return namespace as T;
}

const [
  catalogRuntime,
  materializeRuntime,
  handlerRuntime,
  workerRuntime,
  foldRuntime,
  compareRuntime,
] = await Promise.all([
  loadRuntime<CatalogRuntime>('../../../scripts/verification/core-v2-contract/catalog.mjs'),
  loadRuntime<MaterializeRuntime>(
    '../../../scripts/verification/core-v2-contract/materialize.mjs',
  ),
  loadRuntime<HandlerRuntime>(
    '../../../scripts/verification/core-v2-contract/handlers/update-transactions.mjs',
  ),
  loadRuntime<WorkerRuntime>(
    '../../../scripts/verification/core-v2-contract/execute-worker.mjs',
  ),
  loadRuntime<FoldRuntime>(
    '../../../scripts/verification/core-v2-contract/fold-update-transactions.mjs',
  ),
  loadRuntime<CompareRuntime>(
    '../../../scripts/verification/core-v2-contract/compare.mjs',
  ),
]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
export const {
  UPDATE_TRANSACTIONS_ACTION_TYPES,
  UPDATE_TRANSACTIONS_CASE_IDS,
  createUpdateTransactionHandlerEntries,
} = handlerRuntime;
const { executeContractCase } = workerRuntime;
export const { foldUpdateTransactionExecution } = foldRuntime;
export const { compareObservation } = compareRuntime;
const catalog = await loadExecutorCatalog();

export async function executeCase(
  plan: MaterializedCase,
  options: ExecuteCaseOptions = {},
): Promise<CaseExecution> {
  const adapter = createProductAdapter(options.adapterFault);
  const entries = createUpdateTransactionHandlerEntries(adapter);
  const required = new Set(plan.actionTrace.map((action) => `contract/${action.type}`));
  const datasets = new Map(testDatasets());
  if (plan.id === 'UPD-009') datasets.set('all-kinds-scene', hierarchyScene());
  return executeContractCase({
    caseRecord: plan,
    actionDefinitions: catalog.actionDefinitions,
    engineFactory: () => new PatchMap({
      historyLimit: 32,
      assetRuntime: createTestAssetRuntime(),
      surfaceFactory: (surfaceOptions) => Promise.resolve(new UpdateContractSurface(
        surfaceOptions,
        plan.id === 'UPD-008',
        options.surfaceFault,
        options.resourceJournal,
      )),
    }),
    datasets,
    clock: new ManualClock(),
    handlerEntries: entries.filter(([id]) => required.has(id)),
  });
}

export function selectedCase(caseId: string): MaterializedCase {
  const selected = selectCatalogCases(catalog, { caseIds: [caseId] });
  const record = selected[0];
  if (record === undefined) throw new Error(`Missing case ${caseId}`);
  return materializeCase(record, { size: '100', seed: '319' });
}

export function createProductAdapter(fault?: AdapterFault): Readonly<JsonRecord> {
  let probeCount = 0;
  return Object.freeze({
    createSyntheticScene(inputValue: unknown) {
      const input = requireRecord(inputValue, 'synthetic request');
      const size = requireInteger(input.size, 'synthetic size');
      expect(input).toMatchObject({ caseId: 'UPD-007', seed: 319 });
      return deepFreeze(Array.from({ length: size }, (_, index) => ({
        type: 'item',
        id: `node-${index}`,
        size: { width: 80, height: 50 },
        padding: 2,
        attrs: { x: (index % 40) * 90, y: Math.floor(index / 40) * 60 },
        components: [
          { type: 'background', id: 'bg', source: { type: 'rect', fill: '#eeeeee' } },
          {
            type: 'bar',
            id: 'bar',
            source: { type: 'rect', fill: '#22aa66' },
            size: { width: 60, height: 10 },
            placement: 'bottom',
          },
          {
            type: 'text',
            id: 'label',
            text: `Node ${index}`,
            placement: 'center',
            style: { fontFamily: 'FiraCode', fontSize: 12, fill: '#111111' },
          },
        ],
      })));
    },
    resourceProbe(inputValue: unknown) {
      const input = requireRecord(inputValue, 'resource probe request');
      const engine = input.engine as PatchMap;
      probeCount += 1;
      const snapshot = structuredClone(engine.snapshot());
      if (input.caseId === 'UPD-008') {
        const hasIcon = engine.exportDataset().some((element) => (
          Array.isArray(element.components) && element.components.some((component: unknown) => (
            isRecord(component) && component.id === 'icon'
          ))
        ));
        const resources = requireRecord(snapshot.resources, 'snapshot resources');
        if (fault === 'zero-asset-session') {
          const assets = requireRecord(resources.assets, 'snapshot assets');
          resources.assets = { ...assets, pendingCount: 0, leaseCount: 0, acquisitionCount: 0 };
        }
        const subscriptions = requireRecord(resources.subscriptions, 'snapshot subscriptions');
        if (fault === 'subscription-drop') {
          resources.subscriptions = { ...subscriptions, active: hasIcon ? 1 : 0 };
        } else if (fault === 'duplicate-subscription' && !hasIcon) {
          resources.subscriptions = { ...subscriptions, duplicates: 1 };
        }
      }
      const destroyed = snapshot.lifecycle === 'destroyed' || snapshot.lifecycle === 'destroying';
      return deepFreeze({
        revision: 'test-update-resource-probe/1',
        caseId: input.caseId,
        engine: {
          snapshot,
          semantic: engine.semanticProbe(),
          interactionOwnership: destroyed ? null : engine.interactionOwnershipProbe(),
        },
        runtime: {
          ownership: zeroOwnership(),
          stats: { probeCount },
        },
        journal: [{ sequence: probeCount, event: 'public-engine-observed' }],
      });
    },
  });
}


class ManualClock implements ClockContract {
  private timeMs = 0;

  public now(): number {
    return this.timeMs;
  }

  public advanceTo(timeMs: number): Promise<void> {
    if (!Number.isFinite(timeMs) || timeMs < this.timeMs) {
      return Promise.reject(new Error('clock cannot move backwards'));
    }
    this.timeMs = timeMs;
    return Promise.resolve();
  }

  public withTimeout<T>(promise: Promise<T>): Promise<T> {
    return promise;
  }
}


export function actualAt(execution: CaseExecution, index: number): JsonRecord {
  const result = execution.actionResults[index];
  if (result === undefined) throw new Error(`Missing action ${index}`);
  return result.delta.actual;
}

export function captureValues(execution: CaseExecution, id: string): JsonRecord {
  const capture = execution.captures.find((entry) => entry.id === id);
  return requireRecord(capture?.values, `capture ${id}`);
}

export function segment(actual: JsonRecord, key: string): JsonRecord {
  const relationState = requireRecord(actual.relationState, 'relation state');
  const segments = requireArray(relationState.segments, 'relation segments');
  const found = segments.find((value) => requireRecord(value, 'relation segment').key === key);
  return requireRecord(found, `relation segment ${key}`);
}

export function segmentCountTo(actual: JsonRecord, targetId: string): number {
  const relationState = requireRecord(actual.relationState, 'relation state');
  return requireArray(relationState.segments, 'relation segments').filter((value) => (
    requireRecord(value, 'relation segment').targetId === targetId ||
    requireRecord(value, 'relation segment').sourceId === targetId
  )).length;
}


export { isRecord, requireArray, requireRecord, type JsonRecord };

