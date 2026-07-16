import catalogProfiles from '../../docs/reference/core-v2-functional-contract/evidence/catalog-fixture-profiles.v1.json';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  CoreV2Engine,
  type CoreV2EngineSurface,
  type CoreV2EngineSurfaceFactory,
  type CoreV2Point,
  type CoreV2SurfaceDebug,
  type CoreV2SurfaceOptions,
} from '../../src/core-v2/engine';

interface ContractAction {
  readonly index: number;
  readonly type: string;
  readonly operands: Readonly<Record<string, unknown>>;
}

interface CatalogCase {
  readonly id: string;
  readonly caseType: string;
  readonly fixture: Readonly<{
    readonly setup: Readonly<{ readonly params: Readonly<Record<string, unknown>> }>;
    readonly actionTrace: readonly ContractAction[];
    readonly captureCheckpoints: readonly unknown[];
    readonly cleanupTrace: readonly unknown[];
  }>;
}

interface MaterializedCase extends CatalogCase {
  readonly actionTrace: readonly ContractAction[];
  readonly routeParams: Readonly<{ size: string; seed: number }>;
}

interface ExecutorCatalog {
  readonly actionDefinitions: readonly Readonly<Record<string, unknown>>[];
  readonly cases: readonly CatalogCase[];
}

interface ContractExecution {
  readonly caseId: string;
  readonly status: string;
  readonly actionResults: readonly Readonly<Record<string, unknown>>[];
  readonly terminalSnapshot: unknown;
  readonly cleanup: unknown;
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
    route: Readonly<{ size: string; seed: string }>,
  ): MaterializedCase;
}

interface WorkerRuntime {
  executeContractCase(this: void, options: Readonly<Record<string, unknown>>): Promise<ContractExecution>;
}

const [catalogRuntime, materializeRuntime, workerRuntime] = await Promise.all([
  loadRuntime<CatalogRuntime>('../../scripts/verification/core-v2-contract/catalog.mjs'),
  loadRuntime<MaterializeRuntime>('../../scripts/verification/core-v2-contract/materialize.mjs'),
  loadRuntime<WorkerRuntime>('../../scripts/verification/core-v2-contract/execute-worker.mjs'),
]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
const { executeContractCase } = workerRuntime;

let catalog: ExecutorCatalog;

beforeAll(async () => {
  catalog = await loadExecutorCatalog();
});

describe('Core v2 approved foundation executor against the product engine', () => {
  it('runs the six-case foundation slice through CoreV2Engine without a contract-aware fake', async () => {
    const executions = new Map<string, ContractExecution>();
    for (const caseId of ['LIF-001', 'LIF-002', 'DAT-001', 'DAT-002', 'CSM-001', 'CSM-003']) {
      const execution = await executeContractCase({
        caseRecord: selectedCase(caseId),
        actionDefinitions: catalog.actionDefinitions,
        engineFactory: () => new CoreV2Engine({ surfaceFactory: createSurfaceFactory() }),
        datasets: {
          resolve(reference: string): unknown {
            return (catalogProfiles.datasets as Readonly<Record<string, unknown>>)[reference];
          },
        },
        clock: new ManualClock(),
      });
      executions.set(caseId, execution);
      expect(execution.status, caseId).toBe('completed');
      expect(execution.actionResults.every((action) => action.status === 'completed'), caseId).toBe(true);
      expect(JSON.stringify(execution), caseId).not.toContain('"status":"pass"');
      expect(valueAt(execution.cleanup, 'status'), caseId).toBe('completed');
      expect(valueAt(execution.cleanup, 'errors'), caseId).toEqual([]);
    }

    expect(valueAt(executions.get('LIF-002'), 'actionResults.2.delta.actual.drawCompleteEvents')).toEqual([
      expect.objectContaining({ requestId: 'draw-b', sceneRevision: 1 }),
    ]);
    expect(valueAt(executions.get('LIF-002'), 'actionResults.2.delta.actual.failedLater.diagnostic.code')).toBe(
      'INVALID_VALUE',
    );
    expect(valueAt(executions.get('DAT-001'), 'actionResults.2.delta.actual.diagnostic.code')).toBe(
      'INVALID_RECORD_KIND',
    );
    expect(valueAt(executions.get('DAT-001'), 'actionResults.2.delta.actual.atomicRetained')).toBe(true);
    expect(valueAt(executions.get('CSM-001'), 'terminalSnapshot.datasetRef')).toBe('interactive-scene');
    expect(valueAt(executions.get('CSM-003'), 'terminalSnapshot.lifecycle')).toBe('ready-empty');
    expect(valueAt(executions.get('CSM-003'), 'actionResults.3.delta.actual.result')).toBeNull();
  });
});

async function loadRuntime<T>(relativePath: string): Promise<T> {
  const moduleNamespace: unknown = await import(
    /* @vite-ignore */ new URL(relativePath, import.meta.url).href
  );
  return moduleNamespace as T;
}

function selectedCase(caseId: string): MaterializedCase {
  const record = selectCatalogCases(catalog, { caseIds: [caseId] })[0];
  if (!record) throw new Error(`missing approved case ${caseId}`);
  return materializeCase(record, { size: '100', seed: '319' });
}

function createSurfaceFactory(): CoreV2EngineSurfaceFactory {
  return (options) => Promise.resolve(new ContractProductSurface(options));
}

class ContractProductSurface implements CoreV2EngineSurface {
  public canvasCount = 1;
  public destroyed = false;

  private width: number;
  private height: number;
  private pixelRatio: number;
  private selectionIds: readonly string[] = Object.freeze([]);
  private view: Readonly<{ x: number; y: number; scale: number; rotation: number }> =
    Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });

  public constructor(options: CoreV2SurfaceOptions) {
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = options.pixelRatio;
  }

  public load(_input: unknown): void {
    this.selectionIds = Object.freeze([]);
  }

  public publishFrame(_timeMs: number): void {}

  public resize(width: number, height: number, pixelRatio: number): boolean {
    const changed = width !== this.width || height !== this.height || pixelRatio !== this.pixelRatio;
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    return changed;
  }

  public setView(view: Readonly<{ x: number; y: number; scale: number; rotation: number }>): void {
    this.view = Object.freeze({ ...view });
  }

  public select(ids: readonly string[]): void {
    this.selectionIds = Object.freeze([...ids]);
  }

  public hitTestScreen(_point: CoreV2Point): string | null {
    return null;
  }

  public screenToWorld(point: CoreV2Point): CoreV2Point {
    return Object.freeze({
      x: (point.x - this.view.x) / this.view.scale,
      y: (point.y - this.view.y) / this.view.scale,
    });
  }

  public debugSnapshot(): CoreV2SurfaceDebug {
    return Object.freeze({
      cssSize: Object.freeze([this.width, this.height] as const),
      backingSize: Object.freeze([
        Math.round(this.width * this.pixelRatio),
        Math.round(this.height * this.pixelRatio),
      ] as const),
      selectionIds: this.selectionIds,
      activeAnimationCount: 0,
    });
  }

  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.canvasCount = 0;
    this.selectionIds = Object.freeze([]);
    return Promise.resolve(true);
  }
}

class ManualClock {
  private current = 0;

  public now(): number {
    return this.current;
  }

  public advanceTo(timeMs: number): Promise<void> {
    if (timeMs < this.current) throw new Error(`manual clock cannot rewind to ${timeMs}`);
    this.current = timeMs;
    return Promise.resolve();
  }

  public withTimeout<T>(promise: Promise<T>): Promise<T> {
    return promise;
  }
}

function valueAt(value: unknown, path: string): unknown {
  let cursor = value;
  for (const segment of path.split('.')) {
    if (Array.isArray(cursor)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= cursor.length) {
        throw new Error(`unresolved array path ${path}`);
      }
      cursor = cursor[index];
      continue;
    }
    if (!isRecord(cursor) || !Object.hasOwn(cursor, segment)) {
      throw new Error(`unresolved object path ${path}`);
    }
    cursor = cursor[segment];
  }
  return cursor;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
