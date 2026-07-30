import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import fixtureProfiles from '../../docs/reference/core-v2-functional-contract/evidence/catalog-fixture-profiles.v1.json';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  PatchMap,
  type PatchMapEngineSurface,
  type PatchMapEngineSurfaceFactory,
  type PatchMapPoint,
  type PatchMapSurfaceDebug,
  type PatchMapSurfaceGeometrySnapshot,
  type PatchMapSurfaceOptions,
} from '../../src/patch-map/engine';

type JsonRecord = Record<string, unknown>;
type Handler = (context: unknown, action: unknown) => unknown;
type HandlerEntry = readonly [string, Handler];

interface ContractAction {
  readonly index: number;
  readonly type: string;
  readonly operands: Readonly<JsonRecord>;
}

interface ActionDefinition {
  readonly type: string;
  readonly handlerId: string;
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

interface MaterializedCase extends CatalogCase {
  readonly actionTrace: readonly ContractAction[];
  readonly routeParams: Readonly<{ size: string; seed: number }>;
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

interface LifecycleRuntime {
  readonly LIFECYCLE_RESIZE_ACTION_TYPES: readonly string[];
  createLifecycleResizeHandlerEntries(this: void): readonly HandlerEntry[];
}

interface EngineFactoryMetadata {
  readonly caseId: string;
  readonly caseType: string;
  readonly role: string;
  readonly generation: number;
}

interface ManualClockContract {
  now(): number;
  advanceTo(timeMs: number): Promise<void>;
  withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T>;
}

interface CaseExecution {
  readonly caseId: string;
  readonly status: string;
  readonly actionResults: readonly Readonly<{
    readonly index: number;
    readonly type: string;
    readonly status: string;
    readonly delta: Readonly<{ readonly actual: JsonRecord; readonly semanticProbe: unknown }>;
  }>[];
  readonly eventJournalFailures: readonly unknown[];
  readonly terminalSnapshot: unknown;
  readonly terminalSemanticProbe: unknown;
  readonly cleanup: unknown;
  readonly error: unknown;
}

interface WorkerRuntime {
  executeContractCase(
    this: void,
    options: Readonly<{
      caseRecord: MaterializedCase;
      actionDefinitions: readonly ActionDefinition[];
      engineFactory: (metadata: EngineFactoryMetadata) => PatchMap;
      datasets: ReadonlyMap<string, unknown>;
      clock: ManualClockContract;
      handlerEntries: readonly HandlerEntry[];
    }>,
  ): Promise<CaseExecution>;
}

async function loadRuntime<T>(relativePath: string): Promise<T> {
  const namespace: unknown = await import(
    /* @vite-ignore */ new URL(relativePath, import.meta.url).href
  );
  return namespace as T;
}

const [catalogRuntime, materializeRuntime, lifecycleRuntime, workerRuntime] = await Promise.all([
  loadRuntime<CatalogRuntime>('../../scripts/verification/core-v2-contract/catalog.mjs'),
  loadRuntime<MaterializeRuntime>('../../scripts/verification/core-v2-contract/materialize.mjs'),
  loadRuntime<LifecycleRuntime>(
    '../../scripts/verification/core-v2-contract/handlers/lifecycle-resize.mjs',
  ),
  loadRuntime<WorkerRuntime>('../../scripts/verification/core-v2-contract/execute-worker.mjs'),
]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
const { LIFECYCLE_RESIZE_ACTION_TYPES, createLifecycleResizeHandlerEntries } = lifecycleRuntime;
const { executeContractCase } = workerRuntime;

let catalog: ExecutorCatalog;

beforeAll(async () => {
  catalog = await loadExecutorCatalog();
});

describe('LIF-004 actual-only lifecycle resize handler', () => {
  it('registers the exact browser-safe action surface', async () => {
    const entries = createLifecycleResizeHandlerEntries();
    const source = await readFile(
      fileURLToPath(new URL(
        '../../scripts/verification/core-v2-contract/handlers/lifecycle-resize.mjs',
        import.meta.url,
      )),
      'utf8',
    );
    const forbiddenEvidenceName = ['catalog', 'normalized', 'expected', 'v1', 'json'].join('-');

    expect(LIFECYCLE_RESIZE_ACTION_TYPES).toEqual([
      'loadDataset',
      'set-view',
      'select',
      'resizeHost',
      'publishFrame',
      'hitTest',
      'convertScreenToWorld',
    ]);
    expect(entries.map(([handlerId]) => handlerId)).toEqual(
      LIFECYCLE_RESIZE_ACTION_TYPES.map((type) => `contract/${type}`),
    );
    expect(source).not.toContain(forbiddenEvidenceName);
    expect(source).not.toMatch(/from\s+['"][^'"]*(?:compare|observe)\.mjs['"]/u);
    expect(source).not.toMatch(/node:/u);
    expect(source).not.toMatch(/^\s*import\s/mu);
  });

  it('observes resize, viewport, geometry, hit-test, and conversion through PatchMap', async () => {
    const plan = selectedCase();
    const planBefore = JSON.stringify(plan);
    const harness = createHarness();
    const clock = new ManualClock();
    const execution = await executeContractCase({
      caseRecord: plan,
      actionDefinitions: catalog.actionDefinitions,
      engineFactory: harness.engineFactory,
      datasets: datasets(),
      clock,
      handlerEntries: createLifecycleResizeHandlerEntries(),
    });

    expect(execution.status).toBe('completed');
    expect(execution.error).toBeNull();
    expect(execution.actionResults.map(({ index, type, status }) => ({ index, type, status })))
      .toEqual(LIFECYCLE_RESIZE_ACTION_TYPES.map((type, index) => ({
        index,
        type,
        status: 'completed',
      })));
    expect(clock.timeline).toEqual([0, 10, 16.666667]);
    expect(harness.metadata).toEqual([{
      caseId: 'LIF-004',
      caseType: 'capability',
      role: 'main',
      generation: 1,
    }]);
    expect(actualAt(execution, 0, 'input.unchanged')).toBe(true);
    expect(actualAt(execution, 3, 'changed')).toBe(true);
    expect(actualAt(execution, 3, 'snapshot.resources.canvas.cssSize')).toEqual([1024, 768]);
    expect(actualAt(execution, 3, 'snapshot.resources.canvas.backingSize')).toEqual([2048, 1536]);
    expect(actualAt(execution, 3, 'snapshot.viewport.screenBounds')).toEqual([0, 0, 1024, 768]);
    expect(actualAt(execution, 4, 'snapshot.frameRevision')).toBe(1);
    expect(actualAt(execution, 5, 'resizeHitIds')).toEqual(['rect-b']);
    expect(actualAt(execution, 6, 'world')).toEqual([200, 150]);
    expect(actualAt(execution, 6, 'geometry.relations.0.worldEndpoints')).toEqual([
      [60, 60],
      [180, 55],
    ]);
    expect(actualAt(execution, 6, 'geometry.relations.0.screenEndpoints')).toEqual([
      [232, 204],
      [472, 194],
    ]);
    expect(actualAt(execution, 6, 'geometry.selectionOverlay.screenBounds')).toEqual([
      432,
      164,
      80,
      60,
    ]);
    expect(execution.eventJournalFailures).toEqual([]);
    expect(execution.terminalSnapshot).toMatchObject({
      lifecycle: 'scene-ready',
      frameRevision: 1,
      resources: { canvasCount: 1 },
    });
    expect(execution.terminalSemanticProbe).toMatchObject({
      lifecycle: 'scene-ready',
      interaction: { selectionIds: ['rect-b'] },
    });
    expect(execution.cleanup).toMatchObject({ status: 'completed', errors: [] });
    expect(harness.surfaces).toHaveLength(1);
    expect(harness.surfaces[0]).toMatchObject({ destroyed: true, canvasCount: 0 });
    expect(JSON.stringify(plan)).toBe(planBefore);
    expect(JSON.stringify(execution)).not.toContain('"status":"pass"');
  });

  it('keeps action observations deterministic across fresh executions', async () => {
    const harness = createHarness();
    const entries = createLifecycleResizeHandlerEntries();
    const first = await executeContractCase({
      caseRecord: selectedCase(),
      actionDefinitions: catalog.actionDefinitions,
      engineFactory: harness.engineFactory,
      datasets: datasets(),
      clock: new ManualClock(),
      handlerEntries: entries,
    });
    const second = await executeContractCase({
      caseRecord: selectedCase(),
      actionDefinitions: catalog.actionDefinitions,
      engineFactory: harness.engineFactory,
      datasets: datasets(),
      clock: new ManualClock(),
      handlerEntries: entries,
    });

    expect(first.actionResults.map(({ delta }) => delta.actual)).toEqual(
      second.actionResults.map(({ delta }) => delta.actual),
    );
    expect(harness.surfaces).toHaveLength(2);
    expect(harness.surfaces.every(({ destroyed }) => destroyed)).toBe(true);
  });
});

function selectedCase(): MaterializedCase {
  const selected = selectCatalogCases(catalog, { caseIds: ['LIF-004'] })[0];
  if (selected === undefined) throw new Error('Missing approved LIF-004 case');
  return materializeCase(selected, { size: '100', seed: '319' });
}

function datasets(): ReadonlyMap<string, unknown> {
  const profiles = fixtureProfiles as Readonly<{
    datasets: Readonly<Record<string, unknown>>;
  }>;
  const interactive = profiles.datasets['interactive-scene'];
  if (interactive === undefined) throw new Error('Missing interactive-scene fixture');
  return new Map([['interactive-scene', structuredClone(interactive)]]);
}

function createHarness(): {
  readonly surfaces: GeometrySurface[];
  readonly metadata: EngineFactoryMetadata[];
  readonly engineFactory: (metadata: EngineFactoryMetadata) => PatchMap;
} {
  const surfaces: GeometrySurface[] = [];
  const metadata: EngineFactoryMetadata[] = [];
  const engineFactory = (nextMetadata: EngineFactoryMetadata): PatchMap => {
    metadata.push(nextMetadata);
    const surfaceFactory: PatchMapEngineSurfaceFactory = (options) => {
      const surface = new GeometrySurface(options);
      surfaces.push(surface);
      return Promise.resolve(surface);
    };
    return new PatchMap({ surfaceFactory });
  };
  return { surfaces, metadata, engineFactory };
}

class GeometrySurface implements PatchMapEngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  private width: number;
  private height: number;
  private pixelRatio: number;
  private dataset: readonly JsonRecord[] = Object.freeze([]);
  private selectionIds: readonly string[] = Object.freeze([]);
  private view: Readonly<{ x: number; y: number; scale: number; rotation: number }> =
    Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });

  public constructor(options: PatchMapSurfaceOptions) {
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = options.pixelRatio;
  }

  public load(input: unknown): void {
    if (!Array.isArray(input)) throw new Error('GeometrySurface requires an array dataset');
    this.dataset = input as readonly JsonRecord[];
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

  public hitTestScreen(point: PatchMapPoint): string | null {
    const world = this.screenToWorld(point);
    const candidates = this.entities().filter(({ visible, interactive, worldBounds }) => (
      visible
      && interactive
      && world.x >= worldBounds[0]
      && world.y >= worldBounds[1]
      && world.x <= worldBounds[0] + worldBounds[2]
      && world.y <= worldBounds[1] + worldBounds[3]
    ));
    return candidates.at(-1)?.id ?? null;
  }

  public screenToWorld(point: PatchMapPoint): PatchMapPoint {
    return Object.freeze({
      x: (point.x - this.view.x) / this.view.scale,
      y: (point.y - this.view.y) / this.view.scale,
    });
  }

  public debugSnapshot(): PatchMapSurfaceDebug {
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

  public geometrySnapshot(): PatchMapSurfaceGeometrySnapshot {
    const entities = this.entities();
    const geometryById = new Map(entities.map((entity) => [entity.id, entity]));
    const relations = this.dataset.flatMap((record) => {
      if (record.type !== 'relations' || !Array.isArray(record.links)) return [];
      return record.links.flatMap((value, index) => {
        if (!isRecord(value)) return [];
        const source = geometryById.get(String(value.source));
        const target = geometryById.get(String(value.target));
        if (source === undefined || target === undefined) return [];
        const sourceWorld = boundsCenter(source.worldBounds);
        const targetWorld = boundsCenter(target.worldBounds);
        return [Object.freeze({
          id: `${String(record.id)}:${index}`,
          sourceId: source.id,
          targetId: target.id,
          worldEndpoints: Object.freeze([sourceWorld, targetWorld] as const),
          screenEndpoints: Object.freeze([
            this.worldToScreen(sourceWorld),
            this.worldToScreen(targetWorld),
          ] as const),
        })];
      });
    });
    const selectedBounds = entities
      .filter(({ id }) => this.selectionIds.includes(id))
      .map(({ screenBounds }) => screenBounds);
    const selectionBounds = unionBounds(selectedBounds);
    return Object.freeze({
      entities: Object.freeze(entities),
      relations: Object.freeze(relations),
      selectionOverlay: selectionBounds === null
        ? null
        : Object.freeze({ screenBounds: selectionBounds }),
    });
  }

  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.canvasCount = 0;
    this.dataset = Object.freeze([]);
    this.selectionIds = Object.freeze([]);
    return Promise.resolve(true);
  }

  private entities(): PatchMapSurfaceGeometrySnapshot['entities'] {
    return Object.freeze(this.dataset.flatMap((record) => this.elementGeometries(record)));
  }

  private elementGeometries(record: JsonRecord): PatchMapSurfaceGeometrySnapshot['entities'] {
    if (record.type === 'relations') return Object.freeze([]);
    const id = String(record.id);
    const size = isRecord(record.size) ? record.size : {};
    const attrs = isRecord(record.attrs) ? record.attrs : {};
    const worldBounds = Object.freeze([
      numeric(attrs.x),
      numeric(attrs.y),
      numeric(size.width),
      numeric(size.height),
    ] as const);
    const visible = record.show !== false;
    const result = [Object.freeze({
      id,
      kind: String(record.type),
      worldBounds,
      screenBounds: this.screenBounds(worldBounds),
      visible,
      interactive: visible && record.locked !== true,
    })];
    if (record.type === 'group' && Array.isArray(record.children)) {
      result.push(...record.children.flatMap((child) => (
        isRecord(child) ? [...this.elementGeometries(child)] : []
      )));
    }
    return Object.freeze(result);
  }

  private screenBounds(
    bounds: readonly [number, number, number, number],
  ): readonly [number, number, number, number] {
    const topLeft = this.worldToScreen([bounds[0], bounds[1]]);
    return Object.freeze([
      topLeft[0],
      topLeft[1],
      bounds[2] * this.view.scale,
      bounds[3] * this.view.scale,
    ] as const);
  }

  private worldToScreen(point: readonly [number, number]): readonly [number, number] {
    return Object.freeze([
      this.view.x + point[0] * this.view.scale,
      this.view.y + point[1] * this.view.scale,
    ] as const);
  }
}

class ManualClock implements ManualClockContract {
  public readonly timeline: number[] = [];
  private current = 0;

  public now(): number {
    return this.current;
  }

  public advanceTo(timeMs: number): Promise<void> {
    if (!Number.isFinite(timeMs) || timeMs < this.current) {
      throw new Error(`Invalid manual clock advance ${timeMs}`);
    }
    this.current = timeMs;
    this.timeline.push(timeMs);
    return Promise.resolve();
  }

  public async withTimeout<T>(promise: Promise<T>, _timeoutMs: number, _label: string): Promise<T> {
    return promise;
  }
}

function boundsCenter(
  bounds: readonly [number, number, number, number],
): readonly [number, number] {
  return Object.freeze([
    bounds[0] + bounds[2] / 2,
    bounds[1] + bounds[3] / 2,
  ] as const);
}

function unionBounds(
  bounds: readonly (readonly [number, number, number, number])[],
): readonly [number, number, number, number] | null {
  if (bounds.length === 0) return null;
  const minX = Math.min(...bounds.map((entry) => entry[0]));
  const minY = Math.min(...bounds.map((entry) => entry[1]));
  const maxX = Math.max(...bounds.map((entry) => entry[0] + entry[2]));
  const maxY = Math.max(...bounds.map((entry) => entry[1] + entry[3]));
  return Object.freeze([minX, minY, maxX - minX, maxY - minY] as const);
}

function numeric(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function actualAt(execution: CaseExecution, actionIndex: number, path: string): unknown {
  const action = execution.actionResults[actionIndex];
  if (action === undefined) throw new Error(`Missing action ${actionIndex}`);
  let value: unknown = action.delta.actual;
  for (const segment of path.split('.')) {
    if (Array.isArray(value) && /^\d+$/u.test(segment)) {
      value = value[Number(segment)];
      continue;
    }
    if (!isRecord(value) || !Object.hasOwn(value, segment)) {
      throw new Error(`Missing action ${actionIndex} path ${path}`);
    }
    value = value[segment];
  }
  return value;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
