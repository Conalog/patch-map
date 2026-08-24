export interface ContractAction {
  readonly index: number;
  readonly type: string;
  readonly operands: Readonly<Record<string, unknown>>;
}

export interface ActionDefinition {
  readonly type: string;
  readonly handlerId: string;
  readonly binding?: Readonly<{
    producesFields?: readonly string[];
    consumesFields?: readonly string[];
    capturePaths?: readonly string[];
  }>;
}

export interface CatalogCase {
  readonly id: string;
  readonly caseType: string;
  readonly fixture: Readonly<{
    readonly setup: Readonly<{ readonly params: Readonly<Record<string, unknown>> }>;
    readonly actionTrace: readonly ContractAction[];
    readonly captureCheckpoints: readonly unknown[];
    readonly cleanupTrace: readonly unknown[];
  }>;
}

export interface MaterializedCase extends CatalogCase {
  readonly actionTrace: readonly ContractAction[];
  readonly routeParams: Readonly<{ size: string; seed: number }>;
}

export type Handler = (context: unknown, action: unknown) => unknown;
export type HandlerEntry = readonly [string, Handler];

export interface ActionExecution {
  readonly index: number;
  readonly type: string;
  readonly status: string;
  readonly delta: unknown;
}

export interface EventJournalEntry {
  readonly sequence: number;
  readonly generation: number;
  readonly role: string;
  readonly event: string;
  readonly actual: unknown;
}

export interface CaseExecution {
  readonly caseId: string;
  readonly caseType: string;
  readonly status: string;
  readonly actionResults: readonly ActionExecution[];
  readonly captures: readonly unknown[];
  readonly bindings: Readonly<Record<string, unknown>>;
  readonly eventJournal: readonly EventJournalEntry[];
  readonly eventJournalFailures: readonly unknown[];
  readonly datasetObservations: Readonly<Record<string, unknown>>;
  readonly hostSeamDelta: unknown;
  readonly terminalSnapshot: unknown;
  readonly terminalSemanticProbe: unknown;
  readonly cleanup: unknown;
  readonly error: unknown;
}

export interface EngineFactoryMetadata {
  readonly caseId: string;
  readonly caseType: string;
  readonly role: string;
  readonly generation: number;
}

export interface ManualClockContract {
  now(): number;
  advanceTo(timeMs: number): Promise<void>;
  withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T>;
}

export interface ExecuteOptions {
  readonly caseRecord: MaterializedCase;
  readonly actionDefinitions: readonly ActionDefinition[];
  readonly engineFactory: (metadata: EngineFactoryMetadata) => FakeEngine | Promise<FakeEngine>;
  readonly datasets: ReadonlyMap<string, unknown>;
  readonly clock: ManualClockContract;
  readonly actionTimeoutMs?: number;
  readonly handlerEntries?: readonly HandlerEntry[];
}

export interface WorkerRuntime {
  executeContractCase(this: void, options: ExecuteOptions): Promise<CaseExecution>;
}

const SUPPORTED_TYPES = new Set(['group', 'grid', 'item', 'relations', 'image', 'text', 'rect']);
const PUBLIC_ENGINE_EVENTS = new Set([
  'ready',
  'sceneCommitted',
  'drawComplete',
  'frame',
  'diagnostic',
  'destroyed',
]);

export interface FakeEngineOptions {
  readonly failInitialize?: boolean;
  readonly hangInitialize?: boolean;
  readonly readyEventPayload?: () => unknown;
  readonly semanticProbePayload?: () => unknown;
  readonly unserializableDestroyedEvent?: boolean;
}

export interface EngineHarness {
  readonly engines: FakeEngine[];
  readonly metadata: EngineFactoryMetadata[];
  readonly engineFactory: (metadata: EngineFactoryMetadata) => FakeEngine;
}

export function createEngineHarness(options: FakeEngineOptions = {}): EngineHarness {
  const engines: FakeEngine[] = [];
  const metadata: EngineFactoryMetadata[] = [];
  return {
    engines,
    metadata,
    engineFactory: (factoryMetadata) => {
      metadata.push(structuredClone(factoryMetadata));
      const engine = new FakeEngine(factoryMetadata, options);
      engines.push(engine);
      return engine;
    },
  };
}

type Lifecycle = 'new' | 'initializing' | 'ready-empty' | 'scene-ready' | 'destroyed';

interface FrameEvent {
  readonly frameRevision: number;
  readonly publishedTuple: Readonly<{ scene: number; view: number; interaction: number }>;
}

class FakeProductError extends Error {
  public readonly code: string;
  public readonly category: string;
  public readonly datasetPath?: string;
  public readonly recoverable = false;
  public readonly retryable = false;
  public readonly appliedCount = 0;
  public readonly missingCount = 0;
  public readonly unchangedCount = 0;
  public readonly diagnostic: Readonly<Record<string, unknown>>;

  public constructor(code: string, operation: string, datasetPath?: string) {
    super(`${code}: ${operation}`);
    this.name = 'FakeProductError';
    this.code = code;
    this.category = code === 'NOT_READY' || code === 'SUPERSEDED' ? code : 'INVALID_INPUT';
    if (datasetPath !== undefined) this.datasetPath = datasetPath;
    this.diagnostic = diagnostic(code, operation);
  }
}

export class FakeEngine {
  public readonly role: string;
  public readonly semanticProbe: (() => unknown) | undefined;
  public initializeCalls = 0;
  public destroyCalls = 0;

  private readonly options: FakeEngineOptions;
  private lifecycle: Lifecycle = 'new';
  private instanceId: string | null = null;
  private lifecycleGeneration = 0;
  private sceneRevision = 0;
  private frameRevision = 0;
  private publishedSceneRevision = 0;
  private datasetRef: string | null = null;
  private semanticHash: string | null = null;
  private dataset: readonly Readonly<Record<string, unknown>>[] = [];
  private submissionSequence = 0;
  private pendingWork = 0;
  private canvasCount = 0;
  private readonly eventListeners = new Map<string, Set<(event: unknown) => void>>();

  public constructor(metadata: EngineFactoryMetadata, options: FakeEngineOptions) {
    this.role = metadata.role;
    this.options = options;
    this.semanticProbe = options.semanticProbePayload;
  }

  public async initialize(options: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>> {
    this.initializeCalls += 1;
    if (this.options.failInitialize) throw new FakeProductError('ENGINE_INIT_FAILURE', 'initialize');
    if (this.options.hangInitialize) {
      this.lifecycle = 'initializing';
      return new Promise(() => undefined);
    }
    if (this.lifecycle === 'destroyed') throw new FakeProductError('DESTROYED', 'initialize');
    const firstReady = this.lifecycle === 'new' || this.lifecycle === 'initializing';
    if (firstReady) {
      this.lifecycleGeneration += 1;
      this.lifecycle = this.dataset.length > 0 ? 'scene-ready' : 'ready-empty';
      this.canvasCount = 1;
      this.instanceId = typeof options.instanceId === 'string' ? options.instanceId : null;
    }
    const result = {
      lifecycle: this.lifecycle,
      instanceId: this.instanceId,
      revisions: this.revisions(),
      facilities: ['renderer', 'state'],
    };
    if (firstReady) {
      this.emit('ready', this.options.readyEventPayload === undefined
        ? result
        : this.options.readyEventPayload());
    }
    return result;
  }

  public loadDataset(
    input: unknown,
    options: Readonly<{ datasetRef?: string }> = {},
  ): Readonly<Record<string, unknown>> {
    if (this.lifecycle === 'new' || this.lifecycle === 'initializing') {
      throw new FakeProductError('NOT_READY', 'loadDataset');
    }
    if (this.lifecycle === 'destroyed') throw new FakeProductError('DESTROYED', 'loadDataset');
    const dataset = normalizeFakeDataset(input);
    this.dataset = dataset;
    this.datasetRef = options.datasetRef ?? null;
    this.semanticHash = `fake:${JSON.stringify(dataset)}`;
    this.sceneRevision += 1;
    this.lifecycle = dataset.length > 0 ? 'scene-ready' : 'ready-empty';
    const result = {
      lifecycle: this.lifecycle,
      sceneRevision: this.sceneRevision,
      semanticHash: this.semanticHash,
      rootIds: this.rootIds(),
    };
    this.emit('sceneCommitted', result);
    return result;
  }

  public async submitDataset(submission: Readonly<{
    requestId: string;
    datasetRef?: string;
    input: Promise<unknown>;
  }>): Promise<Readonly<Record<string, unknown>>> {
    if (this.lifecycle === 'new' || this.lifecycle === 'initializing') {
      return {
        status: 'rejected',
        requestId: submission.requestId,
        diagnostic: diagnostic('NOT_READY', 'loadDataset'),
      };
    }
    const sequence = ++this.submissionSequence;
    this.pendingWork += 1;
    try {
      const input = await submission.input;
      if (sequence !== this.submissionSequence || this.lifecycle === 'destroyed') {
        return {
          status: 'superseded',
          requestId: submission.requestId,
          diagnostic: diagnostic('SUPERSEDED', 'loadDataset'),
        };
      }
      try {
        const result = this.loadDataset(input, {
          ...(submission.datasetRef ? { datasetRef: submission.datasetRef } : {}),
        });
        this.emit('drawComplete', {
          requestId: submission.requestId,
          sceneRevision: this.sceneRevision,
          semanticHash: this.semanticHash,
          datasetRef: submission.datasetRef ?? null,
        });
        return {
          status: 'committed',
          requestId: submission.requestId,
          sceneRevision: result.sceneRevision,
          semanticHash: result.semanticHash,
        };
      } catch (error) {
        const actualDiagnostic = diagnosticFromError(error, 'loadDataset');
        this.emit('diagnostic', actualDiagnostic);
        return {
          status: 'rejected',
          requestId: submission.requestId,
          diagnostic: actualDiagnostic,
        };
      }
    } finally {
      this.pendingWork -= 1;
    }
  }

  public publishFrame(_timeMs: number): void {
    if (this.lifecycle === 'destroyed') throw new FakeProductError('DESTROYED', 'publishFrame');
    this.frameRevision += 1;
    this.publishedSceneRevision = this.sceneRevision;
    const event: FrameEvent = {
      frameRevision: this.frameRevision,
      publishedTuple: { scene: this.sceneRevision, view: 0, interaction: 0 },
    };
    this.emit('frame', event);
  }

  public on(event: string, listener: (event: unknown) => void): () => void {
    if (!PUBLIC_ENGINE_EVENTS.has(event)) throw new FakeProductError('UNKNOWN_EVENT', event);
    const listeners = this.eventListeners.get(event) ?? new Set<(value: unknown) => void>();
    listeners.add(listener);
    this.eventListeners.set(event, listeners);
    return () => listeners.delete(listener);
  }

  public exportDataset(): readonly Readonly<Record<string, unknown>>[] {
    if (this.lifecycle === 'destroyed') throw new FakeProductError('DESTROYED', 'exportDataset');
    return structuredClone(this.dataset);
  }

  public snapshot(): Readonly<Record<string, unknown>> {
    return {
      lifecycle: this.lifecycle,
      instanceId: this.instanceId,
      revisions: this.revisions(),
      publishedTuple: { scene: this.publishedSceneRevision, view: 0, interaction: 0 },
      frameRevision: this.frameRevision,
      datasetRef: this.datasetRef,
      semanticHash: this.semanticHash,
      rootIds: this.rootIds(),
      historyDepth: 0,
      pendingWork: this.pendingWork,
      resources: {
        canvasCount: this.canvasCount,
        subscriptions: { active: this.subscriptionCount(), duplicates: 0 },
      },
    };
  }

  public destroy(): Promise<boolean> {
    if (this.lifecycle === 'destroyed') return Promise.resolve(false);
    this.destroyCalls += 1;
    this.submissionSequence += 1;
    this.lifecycle = 'destroyed';
    this.canvasCount = 0;
    this.dataset = [];
    this.datasetRef = null;
    this.semanticHash = null;
    this.emit('destroyed', this.options.unserializableDestroyedEvent
      ? { callback: () => undefined }
      : { lifecycleGeneration: this.lifecycleGeneration });
    this.eventListeners.clear();
    return Promise.resolve(true);
  }

  private emit(event: string, value: unknown): void {
    for (const listener of [...(this.eventListeners.get(event) ?? [])]) {
      try {
        listener(value);
      } catch {
        // Product event delivery isolates listener failures from engine operations.
      }
    }
  }

  private subscriptionCount(): number {
    return [...this.eventListeners.values()].reduce((total, listeners) => total + listeners.size, 0);
  }

  private revisions(): Readonly<Record<string, number>> {
    return {
      lifecycleGeneration: this.lifecycleGeneration,
      sceneRevision: this.sceneRevision,
      viewRevision: 0,
      interactionRevision: 0,
    };
  }

  private rootIds(): readonly string[] {
    return this.dataset.map((record, index) => (
      typeof record.id === 'string' ? record.id : `@root:${index}`
    ));
  }
}

class ManualTimeoutError extends Error {
  public readonly code = 'ACTION_TIMEOUT';

  public constructor(label: string) {
    super(`manual timeout: ${label}`);
    this.name = 'ManualTimeoutError';
  }
}

export class ManualClock implements ManualClockContract {
  public readonly timeline: number[] = [];
  private current = 0;
  private readonly timeOut: boolean;

  public constructor(timeOut = false) {
    this.timeOut = timeOut;
  }

  public now(): number {
    return this.current;
  }

  public advanceTo(timeMs: number): Promise<void> {
    if (timeMs < this.current) throw new Error(`manual clock moved backwards to ${timeMs}`);
    this.current = timeMs;
    this.timeline.push(timeMs);
    return Promise.resolve();
  }

  public async withTimeout<T>(promise: Promise<T>, _timeoutMs: number, label: string): Promise<T> {
    if (!this.timeOut) return promise;
    for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
    throw new ManualTimeoutError(label);
  }
}

export function createSymbolPropertyPayload(): unknown {
  return Object.defineProperty({}, Symbol('hidden'), { enumerable: true, value: 1 });
}

export function createSparseArrayPayload(): unknown {
  const payload: unknown[] = [];
  payload.length = 2;
  return payload;
}

export function createCyclicPayload(): unknown {
  const payload: Record<string, unknown> = {};
  payload.self = payload;
  return payload;
}

export function createAccessorPayload(): unknown {
  return Object.defineProperty({}, 'value', { enumerable: true, get: () => 1 });
}

function normalizeFakeDataset(input: unknown): readonly Readonly<Record<string, unknown>>[] {
  if (!Array.isArray(input)) throw new FakeProductError('INVALID_VALUE', 'loadDataset');
  for (const [index, record] of input.entries()) {
    if (!isRecord(record) || typeof record.type !== 'string' || !SUPPORTED_TYPES.has(record.type)) {
      throw new FakeProductError('INVALID_RECORD_KIND', 'loadDataset', `$[${index}].type`);
    }
  }
  return structuredClone(input) as readonly Readonly<Record<string, unknown>>[];
}

function diagnostic(code: string, operation: string): Readonly<Record<string, unknown>> {
  return {
    code,
    category: code === 'NOT_READY' || code === 'SUPERSEDED' ? code : 'INVALID_INPUT',
    operation,
    appliedCount: 0,
    missingCount: 0,
    unchangedCount: 0,
  };
}

function diagnosticFromError(error: unknown, operation: string): Readonly<Record<string, unknown>> {
  if (error instanceof FakeProductError) return error.diagnostic;
  return diagnostic(error instanceof Error ? error.name : 'UNKNOWN_FAILURE', operation);
}

export async function captureFailure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected execution to fail');
}

export function valueAt(value: unknown, path: string): unknown {
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
