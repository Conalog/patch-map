import { beforeAll } from 'vitest';

import type { JsonRecord } from './contract-render-text-values';

export {
  arrayValue,
  isRecord,
  numberValue,
  requireRecord,
  stringValue,
  valueAt,
  type JsonRecord,
} from './contract-render-text-values';

export interface ContractAction {
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
  readonly routeParams: Readonly<{ size: string; seed: number }>;
}

interface ExecutorCatalog {
  readonly cases: readonly CatalogCase[];
}

interface CatalogRuntime {
  loadExecutorCatalog(this: void): Promise<ExecutorCatalog>;
  selectCatalogCases(
    this: void,
    catalog: ExecutorCatalog,
    selection: Readonly<{ caseIds: readonly string[] }>,
  ): readonly CatalogCase[];
}

interface MaterializeRuntime {
  materializeCase(
    this: void,
    record: CatalogCase,
    options: Readonly<{ size: string; seed: string }>,
  ): MaterializedCase;
}

interface FoldResult {
  readonly actual: Readonly<JsonRecord>;
  readonly fixtures: Readonly<JsonRecord>;
  readonly captures: Readonly<JsonRecord>;
}

interface FoldRuntime {
  readonly RENDER_TEXT_FOLD_REVISION: string;
  foldRenderTextExecution(
    this: void,
    options: Readonly<{
      casePlan: MaterializedCase;
      execution: Readonly<JsonRecord>;
      provenance: Readonly<JsonRecord>;
      environment: Readonly<JsonRecord>;
    }>,
  ): FoldResult;
}

async function loadRuntime<T>(relativePath: string): Promise<T> {
  const namespace: unknown = await import(
    /* @vite-ignore */ new URL(relativePath, import.meta.url).href
  );
  return namespace as T;
}

const [catalogRuntime, materializeRuntime, foldRuntime] = await Promise.all([
  loadRuntime<CatalogRuntime>('../../../scripts/verification/patch-map-contract/catalog.mjs'),
  loadRuntime<MaterializeRuntime>('../../../scripts/verification/patch-map-contract/materialize.mjs'),
  loadRuntime<FoldRuntime>('../../../scripts/verification/patch-map-contract/fold-render-text.mjs'),
]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
export const {
  RENDER_TEXT_FOLD_REVISION,
  foldRenderTextExecution,
} = foldRuntime;

export const DOMAIN_NAMES = [
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
] as const;

let catalog: ExecutorCatalog;

beforeAll(async () => {
  catalog = await loadExecutorCatalog();
});

export function selectedCase(caseId: 'REN-006' | 'REN-011'): MaterializedCase {
  const selected = selectCatalogCases(catalog, { caseIds: [caseId] })[0];
  if (!selected) throw new Error(`Missing approved ${caseId} case`);
  return materializeCase(selected, { size: '100', seed: '319' });
}

export function fold(plan: MaterializedCase, execution: JsonRecord): FoldResult {
  return foldRenderTextExecution({
    casePlan: plan,
    execution,
    provenance: {
      codeCommit: 'test-commit',
      packedPackageSha256: 'test-package',
      contractRevision: 'patch-map-contract/1',
    },
    environment: {
      browserVersion: 'unit-test',
      platform: process.platform,
      locale: 'en-US',
      devicePixelRatio: 1,
    },
  });
}
