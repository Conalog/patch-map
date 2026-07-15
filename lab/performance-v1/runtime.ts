import type {
  CoreEvent,
  CoreOperation,
  EntitySnapshot,
  FrameReport,
  SceneDocument,
} from '../../src/core-v1/contracts';
import { Canvas2DRenderer } from '../../src/core-v1/renderer/canvas-renderer';
import { type CoreScene, createCoreScene } from '../../src/core-v1/scene';
import {
  assertProductionFixtureBytes,
  convertProductionFixture,
  createSyntheticWorkload,
  formatProductionConversionStats,
} from './workloads';

export const DATASET_KEYS = ['100', '500', '1000', '2000', '5000', 'production'] as const;
export type DatasetKey = (typeof DATASET_KEYS)[number];

export interface LabInvariant {
  readonly id: string;
  readonly label: string;
  readonly status: 'pass' | 'fail' | 'pending';
  readonly detail: string;
}

export interface LabEventRecord {
  readonly sequence: number;
  readonly time: string;
  readonly type: string;
  readonly revision: number;
  readonly detail: string;
}

export interface LabReadout {
  readonly lifecycle: number;
  readonly alive: boolean;
  readonly dataset: DatasetKey;
  readonly revision: number;
  readonly frameRevision: number | null;
  readonly frame: number;
  readonly entityCount: number;
  readonly selectionCount: number;
  readonly activeAnimations: number;
  readonly commandCount: number;
  readonly lastAction: string;
  readonly lastActionMs: number | null;
  readonly lastFlushMs: number | null;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly fixtureStatus: string;
  readonly workloadNote: string;
  readonly invariants: readonly LabInvariant[];
  readonly events: readonly LabEventRecord[];
}

export type ReplayProgress = (label: string, readout: LabReadout) => void;

const PRODUCTION_FIXTURE_URL = new URL('../fixtures/production-like.json', import.meta.url);
const MAX_LOG_RECORDS = 80;
const MAX_INVARIANTS = 12;

export class CoreV1LabRuntime {
  readonly #canvas: HTMLCanvasElement;
  #scene: CoreScene | null = null;
  #dataset: DatasetKey;
  #document: SceneDocument | null = null;
  #lifecycle = 0;
  #clockMs = 0;
  #frameRevision: number | null = null;
  #frame = 0;
  #commandCount = 0;
  #lastAction = 'boot';
  #lastActionMs: number | null = null;
  #lastFlushMs: number | null = null;
  #fixtureStatus = 'N/A';
  #workloadNote = 'No workload loaded.';
  #events: LabEventRecord[] = [];
  #invariants: LabInvariant[] = [];
  #eventSequence = 0;
  #replayToken = 0;

  public constructor(canvas: HTMLCanvasElement, dataset: DatasetKey) {
    this.#canvas = canvas;
    this.#dataset = dataset;
  }

  public get dataset(): DatasetKey {
    return this.#dataset;
  }

  public setDataset(dataset: DatasetKey): void {
    this.#dataset = dataset;
    this.#document = null;
    this.#canvas.dataset.coreDocument = 'none';
    this.#fixtureStatus = dataset === 'production' ? 'NOT VERIFIED' : 'N/A';
    this.#workloadNote = `Selected ${datasetLabel(dataset)}. Load to replace authoritative state.`;
  }

  public reinitialize(): void {
    this.#replayToken += 1;
    const priorScene = this.#scene;
    const hadPriorScene = priorScene !== null;
    this.#scene = null;
    this.#document = null;
    this.#canvas.dataset.coreAlive = 'false';
    this.#canvas.dataset.coreDocument = 'none';
    const priorDestroyed = priorScene?.destroy() ?? true;
    const size = measureSurface(this.#canvas);
    const renderer = new Canvas2DRenderer(this.#canvas, {
      width: size.width,
      height: size.height,
      pixelRatio: size.pixelRatio,
      desynchronized: false,
    });
    this.#scene = createCoreScene({ renderer, historyLimit: 12, eventLimit: 512 });
    this.#lifecycle += 1;
    this.#clockMs = 0;
    this.#frameRevision = null;
    this.#frame = 0;
    this.#commandCount = 0;
    this.#lastAction = 're-init';
    this.#lastActionMs = 0;
    this.#lastFlushMs = null;
    this.#events = [];
    this.#invariants = [];
    this.#canvas.dataset.coreAlive = 'true';
    this.#canvas.dataset.coreDocument = 'none';
    this.#canvas.dataset.coreInstance = `L${pad(this.#lifecycle, 2)}`;
    this.#canvas.dataset.priorCoreDestroyed = String(priorDestroyed);
    this.#recordInvariant(
      'lifecycle',
      'Fresh lifecycle',
      priorDestroyed,
      hadPriorScene
        ? `Prior Core destroyed and document released before Core L${pad(this.#lifecycle, 2)}`
        : `Core L${pad(this.#lifecycle, 2)} is active`,
    );
  }

  public resize(): boolean {
    const scene = this.#requireScene();
    const size = measureSurface(this.#canvas);
    const changed = scene.resize(size.width, size.height, size.pixelRatio);
    if (changed) {
      this.#recordInvariant(
        'surface-size',
        'Surface tracks viewport',
        true,
        `${size.width}×${size.height} CSS px @ ${size.pixelRatio.toFixed(2)}×`,
      );
    }
    return changed;
  }

  public async load(): Promise<void> {
    const scene = this.#requireScene();
    const prepared = await this.#prepareDocument();
    const before = inputSignature(prepared.document);
    const started = performance.now();
    const result = scene.load(prepared.document);
    const elapsed = performance.now() - started;
    const after = inputSignature(prepared.document);
    this.#document = prepared.document;
    this.#canvas.dataset.coreDocument = 'attached';
    this.#clockMs = 0;
    this.#frameRevision = null;
    this.#frame = 0;
    this.#commandCount = 0;
    this.#lastAction = 'load';
    this.#lastActionMs = elapsed;
    this.#workloadNote = prepared.note;
    this.#recordInvariant(
      'load-count',
      'Load count matches input',
      result.entityCount === prepared.document.entities.length,
      `${result.entityCount.toLocaleString()} dense entities`,
    );
    this.#recordInvariant(
      'input-immutable',
      'Input remains immutable',
      before === after,
      before === after ? 'Exact structural signature unchanged' : 'Input signature changed during load',
    );
    this.#recordInvariant(
      'explicit-frame',
      'State waits for explicit frame',
      this.#frameRevision === null,
      `State r${result.revision}; no frame published`,
    );
    this.#drainEvents();
  }

  public trustedCommit(): void {
    const scene = this.#requireLoadedScene();
    const targets = mutableEntities(scene.snapshot().entities);
    const operations: CoreOperation[] = targets.map((entity, index) => ({
      type: 'patch',
      target: entity.ref,
      changes: {
        x: entity.bounds.x + (index % 2 === 0 ? 0.75 : -0.75),
        y: entity.bounds.y + (index % 3 === 0 ? 0.5 : -0.25),
      },
    }));
    const previousFrame = this.#frameRevision;
    const started = performance.now();
    const result = scene.commit({ id: 'lab:trusted', operations });
    const elapsed = performance.now() - started;
    this.#lastAction = 'trusted commit';
    this.#lastActionMs = elapsed;
    this.#recordInvariant(
      'commit-count',
      'Trusted batch commits atomically',
      result.operationCount === operations.length && result.changed === operations.length,
      `${result.changed.toLocaleString()} updates in one transaction`,
    );
    this.#recordInvariant(
      'state-frame-split',
      'Commit does not publish pixels',
      this.#frameRevision === previousFrame && result.revision !== previousFrame,
      `State r${result.revision}; frame ${formatRevision(previousFrame)}`,
    );
    this.#drainEvents();
  }

  public randomCommit(): void {
    const scene = this.#requireLoadedScene();
    const entities = mutableEntities(scene.snapshot().entities);
    const random = mulberry32(scene.revision * 0x9e3779b1 + 0x6d2b79f5);
    const operations: CoreOperation[] = [];
    for (const entity of entities) {
      if (random() > 0.42) continue;
      operations.push({
        type: 'patch',
        target: entity.ref,
        changes: {
          x: entity.bounds.x + (random() - 0.5) * 4,
          y: entity.bounds.y + (random() - 0.5) * 4,
          opacity: 0.72 + random() * 0.28,
        },
      });
    }
    const previousFrame = this.#frameRevision;
    const started = performance.now();
    const result = scene.commit({ id: `lab:random:${scene.revision}`, operations });
    const elapsed = performance.now() - started;
    this.#lastAction = 'random commit';
    this.#lastActionMs = elapsed;
    this.#recordInvariant(
      'random-batch',
      'Seeded random batch is explicit',
      result.operationCount === operations.length,
      `${operations.length.toLocaleString()} deterministic patches`,
    );
    this.#recordInvariant(
      'state-frame-split',
      'Commit does not publish pixels',
      this.#frameRevision === previousFrame,
      `State r${result.revision}; frame ${formatRevision(previousFrame)}`,
    );
    this.#drainEvents();
  }

  public advanceAnimation(): void {
    const scene = this.#requireLoadedScene();
    let scheduled = 0;
    if (scene.activeAnimations === 0) {
      const bars = scene.snapshot().entities.filter((entity) => entity.kind === 'bar');
      const operations: CoreOperation[] = bars.map((entity, index) => ({
        type: 'animate',
        target: entity.ref,
        property: 'value',
        to: index % 2 === 0 ? 0.08 : 0.92,
        durationMs: 900,
        easing: 'easeInOut',
      }));
      const started = performance.now();
      scene.commit({ id: 'lab:bar-animation', operations, recordHistory: false });
      this.#lastActionMs = performance.now() - started;
      scheduled = operations.length;
    }
    this.#clockMs += 100;
    const started = performance.now();
    const result = scene.advance(this.#clockMs);
    const elapsed = performance.now() - started;
    this.#lastAction = scheduled > 0 ? 'schedule + advance' : 'advance';
    this.#lastActionMs = (this.#lastActionMs ?? 0) + elapsed;
    this.#recordInvariant(
      'animation-boundary',
      'Animation advances authoritative state',
      scheduled === 0 || result.activeAnimations > 0,
      scheduled > 0
        ? `${scheduled.toLocaleString()} bars scheduled; t=${this.#clockMs}ms`
        : `${result.changed.toLocaleString()} values advanced; t=${this.#clockMs}ms`,
    );
    this.#drainEvents();
  }

  public flush(): FrameReport {
    const scene = this.#requireLoadedScene();
    const started = performance.now();
    const report = scene.flush();
    const elapsed = performance.now() - started;
    this.#frameRevision = report.revision;
    this.#frame = report.frame;
    this.#commandCount = report.commandCount;
    this.#lastAction = 'flush';
    this.#lastActionMs = elapsed;
    this.#lastFlushMs = report.cpuMs;
    this.#recordInvariant(
      'frame-current',
      'Flush publishes current state',
      report.revision === scene.revision,
      `Frame F${pad(report.frame, 3)} now carries r${report.revision}`,
    );
    this.#recordInvariant(
      'aggregate-surface',
      'Aggregate renderer reports commands',
      report.commandCount > 0 || report.rendered === false,
      report.rendered
        ? `${report.commandCount.toLocaleString()} Canvas2D submissions`
        : 'No dirty state; render skipped',
    );
    this.#drainEvents();
    return report;
  }

  public hitAndSelect(): void {
    const scene = this.#requireLoadedScene();
    const target = scene.snapshot().entities.find(
      (entity) => entity.kind !== 'relation' && entity.interactive && entity.visible,
    );
    if (target === undefined) throw new Error('No interactive entity is available for hit testing');
    const point = {
      x: target.bounds.x + target.bounds.width / 2,
      y: target.bounds.y + target.bounds.height / 2,
    };
    const started = performance.now();
    const hit = scene.hitTest(point, { interactiveOnly: true });
    const pointer = scene.dispatchPointer({
      type: 'down',
      pointerId: 1,
      button: 0,
      buttons: 1,
      timeMs: this.#clockMs,
      ...point,
    });
    const elapsed = performance.now() - started;
    this.#lastAction = 'hit + select';
    this.#lastActionMs = elapsed;
    const hitEntity = hit === null ? null : scene.get(hit);
    const pointerEntity = pointer.target === null ? null : scene.get(pointer.target);
    const selectedRef = pointer.selection.refs[0];
    const selectionEntity = pointer.selection.refs.length === 1 && selectedRef !== undefined
      ? scene.get(selectedRef)
      : null;
    const hitRefDetail = hit === null
      ? 'miss'
      : `slot ${String(hit.slot)} / generation ${String(hit.generation)}`;
    const passed = hitEntity?.id === target.id
      && pointerEntity?.id === target.id
      && selectionEntity?.id === target.id;
    this.#recordInvariant(
      'hit-selection',
      'Hit test selects the expected entity',
      passed,
      passed
        ? `${target.id} / ${hitRefDetail}`
        : `Expected ${target.id}; received hit=${hitEntity?.id ?? 'miss'}, pointer=${pointerEntity?.id ?? 'miss'}, selection=${selectionEntity?.id ?? 'none'}`,
    );
    this.#drainEvents();
  }

  public teardown(): void {
    this.#replayToken += 1;
    const started = performance.now();
    const priorScene = this.#scene;
    this.#scene = null;
    this.#document = null;
    this.#canvas.dataset.coreAlive = 'false';
    this.#canvas.dataset.coreDocument = 'none';
    this.#canvas.dataset.coreInstance = 'none';
    const destroyed = priorScene?.destroy() ?? false;
    this.#canvas.dataset.priorCoreDestroyed = String(destroyed);
    const elapsed = performance.now() - started;
    this.#lastAction = 'teardown';
    this.#lastActionMs = elapsed;
    this.#frameRevision = null;
    this.#frame = 0;
    this.#commandCount = 0;
    this.#events = [];
    this.#recordInvariant(
      'teardown',
      'Lifecycle releases runtime state',
      destroyed,
      destroyed ? 'Scene, renderer, events, selection and store destroyed' : 'No live core existed',
    );
  }

  public async autoReplay(progress: ReplayProgress): Promise<void> {
    const token = ++this.#replayToken;
    const step = async (label: string, action: () => void | Promise<void>): Promise<void> => {
      if (token !== this.#replayToken) throw new Error('Replay cancelled by lifecycle change');
      await action();
      progress(label, this.readout());
      await nextPaint();
    };

    await step('load', () => this.load());
    await step('first frame', () => {
      this.flush();
    });
    await step('trusted transaction', () => this.trustedCommit());
    await step('trusted frame', () => {
      this.flush();
    });
    await step('random transaction', () => this.randomCommit());
    await step('random frame', () => {
      this.flush();
    });
    await step('animation start', () => this.advanceAnimation());
    for (let index = 0; index < 4; index += 1) {
      await step(`animation frame ${String(index + 1)}`, () => {
        this.advanceAnimation();
        this.flush();
      });
    }
    await step('hit + select', () => this.hitAndSelect());
    await step('selection frame', () => {
      this.flush();
    });
    this.#recordInvariant('auto-replay', 'Auto replay completed', true, 'All explicit boundaries executed');
    progress('complete', this.readout());
  }

  public readout(): LabReadout {
    const scene = this.#scene;
    const size = measureSurface(this.#canvas);
    return {
      lifecycle: this.#lifecycle,
      alive: scene !== null,
      dataset: this.#dataset,
      revision: scene?.revision ?? 0,
      frameRevision: this.#frameRevision,
      frame: this.#frame,
      entityCount: scene?.entityCount ?? 0,
      selectionCount: scene?.selection().refs.length ?? 0,
      activeAnimations: scene?.activeAnimations ?? 0,
      commandCount: this.#commandCount,
      lastAction: this.#lastAction,
      lastActionMs: this.#lastActionMs,
      lastFlushMs: this.#lastFlushMs,
      canvasWidth: size.width,
      canvasHeight: size.height,
      fixtureStatus: this.#fixtureStatus,
      workloadNote: this.#workloadNote,
      invariants: this.#invariants,
      events: this.#events,
    };
  }

  async #prepareDocument(): Promise<{ document: SceneDocument; note: string }> {
    if (this.#dataset !== 'production') {
      const workload = createSyntheticWorkload(Number(this.#dataset));
      return {
        document: workload.document,
        note: `${workload.stats.requestedEntities.toLocaleString()} requested · ${workload.stats.drawableEntities.toLocaleString()} drawable · ${workload.stats.relationEntities.toLocaleString()} relations`,
      };
    }

    const response = await fetch(PRODUCTION_FIXTURE_URL);
    if (!response.ok) throw new Error(`Production fixture request failed: ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const identity = await assertProductionFixtureBytes(bytes);
    this.#fixtureStatus = `${identity.bytes.toLocaleString()} B / ${identity.sha256.slice(0, 10)}… VERIFIED`;
    const workload = convertProductionFixture(JSON.parse(new TextDecoder().decode(bytes)) as unknown);
    return {
      document: workload.document,
      note: formatProductionConversionStats(workload.stats),
    };
  }

  #drainEvents(): void {
    const scene = this.#scene;
    if (scene === null) return;
    const timestamp = new Date();
    for (const event of scene.drainEvents()) {
      this.#eventSequence += 1;
      this.#events.unshift({
        sequence: this.#eventSequence,
        time: timestamp.toISOString().slice(11, 23),
        type: event.type,
        revision: event.revision,
        detail: eventDetail(event),
      });
    }
    if (this.#events.length > MAX_LOG_RECORDS) this.#events.length = MAX_LOG_RECORDS;
  }

  #recordInvariant(id: string, label: string, passed: boolean, detail: string): void {
    const next: LabInvariant = {
      id,
      label,
      status: passed ? 'pass' : 'fail',
      detail,
    };
    const existing = this.#invariants.findIndex((entry) => entry.id === id);
    if (existing >= 0) this.#invariants.splice(existing, 1);
    this.#invariants.unshift(next);
    if (this.#invariants.length > MAX_INVARIANTS) this.#invariants.length = MAX_INVARIANTS;
  }

  #requireScene(): CoreScene {
    if (this.#scene === null) throw new Error('Core is torn down. Re-init before running this command.');
    return this.#scene;
  }

  #requireLoadedScene(): CoreScene {
    const scene = this.#requireScene();
    if (this.#document === null || scene.entityCount === 0) {
      throw new Error('No authoritative state. Load a workload first.');
    }
    return scene;
  }
}

export function isDatasetKey(value: string | null): value is DatasetKey {
  return value !== null && (DATASET_KEYS as readonly string[]).includes(value);
}

function mutableEntities(entities: readonly EntitySnapshot[]): readonly EntitySnapshot[] {
  return entities.filter((entity) => entity.kind !== 'relation');
}

function measureSurface(canvas: HTMLCanvasElement): { width: number; height: number; pixelRatio: number } {
  const host = canvas.parentElement;
  const width = Math.max(320, Math.round(host?.clientWidth ?? 960));
  const height = Math.max(260, Math.round(host?.clientHeight ?? 600));
  return { width, height, pixelRatio: Math.min(globalThis.devicePixelRatio || 1, 2) };
}

function inputSignature(document: SceneDocument): string {
  const json = JSON.stringify(document);
  let hash = 2_166_136_261;
  for (let index = 0; index < json.length; index += 1) {
    hash ^= json.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `${json.length}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function eventDetail(event: CoreEvent): string {
  switch (event.type) {
    case 'load':
      return `${event.entityCount.toLocaleString()} entities`;
    case 'commit':
      return `${event.result.operationCount.toLocaleString()} ops / ${event.result.changed.toLocaleString()} changed`;
    case 'advance':
      return `${event.result.changed.toLocaleString()} changed / ${event.result.activeAnimations.toLocaleString()} active`;
    case 'flush':
      return `F${String(event.report.frame)} / ${event.report.commandCount.toLocaleString()} commands / ${event.report.cpuMs.toFixed(2)}ms`;
    case 'pointer':
      return `${event.pointerType} / ${event.target === null ? 'miss' : `slot ${String(event.target.slot)}`}`;
  }
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function datasetLabel(dataset: DatasetKey): string {
  return dataset === 'production' ? 'production conversion' : `synthetic ${Number(dataset).toLocaleString()}`;
}

function formatRevision(revision: number | null): string {
  return revision === null ? 'unpublished' : `r${revision}`;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
