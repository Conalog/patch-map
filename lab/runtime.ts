import type { Container } from 'pixi.js';

import {
  Patchmap,
  Transformer,
  type MapData,
  type PatchmapInitOptions,
  type PublicDisplayHandle,
  type UpdateOptions,
} from '../src/index';
import {
  LAB_ASSET_DEFINITIONS,
  LAB_FIXTURES,
  LAB_INVALID_INPUTS,
} from './cases/fixtures';
import type {
  LabAction,
  LabCase,
  LabCheckOperator,
  LabFixtureKey,
  LabInvariant,
  LabRunStatus,
  LabSelector,
  LabStep,
  LabUpdateRequest,
} from './cases/types';
import { PixiDevtoolsBridge } from './pixi-devtools';

const PATCHMAP_EVENTS = [
  'patchmap:initialized',
  'patchmap:draw',
  'patchmap:updated',
  'patchmap:destroyed',
  'patchmap:rotated',
  'patchmap:flipped',
] as const;

const HISTORY_EVENTS = [
  'history:executed',
  'history:undone',
  'history:redone',
  'history:cleared',
  'history:destroyed',
] as const;

const STATE_EVENTS = [
  'state:pushed',
  'state:popped',
  'state:set',
  'state:reset',
  'state:destroyed',
  'modifier:activated',
  'modifier:deactivated',
] as const;

const LAB_CANVAS_BACKGROUND = '#f4f6f2';
const MAX_SCENE_SNAPSHOT_HANDLES = 2_048;

const LIMITATIONS = Object.freeze({
  Q4: { status: 'partial' },
  Q7: { status: 'partial' },
  Q12: { status: 'partial', pixelNormative: false },
  Q18: { status: 'partial' },
  Q21: { status: 'partial', backendPrimitiveCount: 'unavailable' },
  windowsNative: { status: 'pending' },
  UPD005: { status: 'partial', pixelNormative: false },
});

type JsonRecord = Record<string, unknown>;

export interface LabEventRecord {
  readonly timestamp: number;
  readonly type: string;
  readonly target: string | null;
  readonly payload: unknown;
}

export interface LabAssertionResult {
  readonly invariant: LabInvariant;
  readonly actual: unknown;
  readonly expected: unknown;
  readonly pass: boolean;
}

export interface LabStepResult {
  readonly caseId: string;
  readonly stepId: string;
  readonly status: LabRunStatus;
  readonly assertions: readonly LabAssertionResult[];
  readonly error: LabRuntimeError | null;
  readonly durationMs: number;
  readonly timing: LabStepTiming;
  readonly observation: JsonRecord;
}

export interface LabStepTiming {
  readonly beforeSnapshotMs: number;
  readonly actionMs: number;
  readonly observationMs: number;
  readonly diagnosticsMs: number;
  readonly totalMs: number;
}

export interface LabRuntimeError {
  readonly name: string;
  readonly message: string;
  readonly stack: string;
}

export interface ManualObservationRequest {
  readonly title: string;
  readonly instruction: string;
  readonly completion: 'observe' | 'headed-windows-required' | 'oracle-required';
}

interface NamedSnapshot {
  readonly frozen: JsonRecord;
  readonly handles: readonly PublicDisplayHandle[];
  readonly transformer: Transformer | null;
}

interface RuntimeBefore {
  readonly frozen: JsonRecord;
  readonly handles: readonly PublicDisplayHandle[];
}

interface SceneCollection {
  readonly byId: Record<string, JsonRecord>;
  readonly byType: Record<string, JsonRecord>;
  readonly componentsByType: Record<string, JsonRecord>;
  readonly handles: PublicDisplayHandle[];
  readonly displayNodes: JsonRecord[];
  readonly topLevelCount: number;
  readonly truncated: number;
  readonly byIdTruncated: number;
}

const now = (): number => performance.now();

const isRecord = (value: unknown): value is JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const cloneValue = <T>(value: T): T => structuredClone(value);

const stableStringify = (value: unknown): string => {
  const seen = new WeakSet<object>();
  const normalize = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(normalize);
    if (!entry || typeof entry !== 'object') return entry;
    if (seen.has(entry)) return '[Circular]';
    seen.add(entry);
    const record = entry as JsonRecord;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .filter((key) => typeof record[key] !== 'function')
        .map((key) => [key, normalize(record[key])]),
    );
  };
  return JSON.stringify(normalize(value));
};

const jsonSafe = (
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet(),
): unknown => {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
  if (typeof value !== 'object') {
    return typeof value === 'symbol' ? value.description ?? 'Symbol' : '[Unknown]';
  }
  if (seen.has(value)) return '[Circular]';
  if (depth >= 5) return `[${value.constructor?.name ?? 'Object'}]`;
  seen.add(value);
  if (Array.isArray(value)) {
    const limit = 32;
    const entries = value.slice(0, limit).map((entry) => jsonSafe(entry, depth + 1, seen));
    if (value.length > limit) entries.push(`… ${value.length - limit} more`);
    return entries;
  }
  const output: JsonRecord = {};
  const input = value as JsonRecord;
  for (const key of Object.keys(input).slice(0, 48)) {
    if (typeof input[key] === 'function') continue;
    output[key] = jsonSafe(input[key], depth + 1, seen);
  }
  return output;
};

const normalizeEventPayload = (payload: unknown): unknown => {
  const safe = jsonSafe(payload);
  if (!isRecord(payload) || !Array.isArray(payload.elements) || !isRecord(safe)) return safe;
  safe.elements = payload.elements.map((entry) => {
    if (isRecord(entry) && typeof entry.id === 'string') return entry.id;
    return jsonSafe(entry);
  });
  return safe;
};

const errorFrom = (error: unknown): LabRuntimeError => {
  const value = error instanceof Error ? error : new Error(String(error));
  const safeStack = (value.stack ?? `${value.name}: ${value.message}`)
    .split('\n')
    .filter((line, index) => {
      if (index === 0) return true;
      if (/node_modules|\/dist\/|\.map(?::|$)|\.umd\.|\.bundle\./iu.test(line)) return false;
      return /(?:\/lab\/|\/src\/|lab\/runtime|lab\/main)/u.test(line);
    })
    .join('\n');
  return {
    name: value.name,
    message: value.message,
    stack: safeStack,
  };
};

const describeTarget = (payload: unknown): string | null => {
  if (!isRecord(payload)) return null;
  const target = payload.target;
  if (!isRecord(target)) return null;
  if (typeof target.id === 'string') return target.id;
  if (typeof target.type === 'string') return target.type;
  return target.constructor?.name ? String(target.constructor.name) : null;
};

const typeCounts = (data: unknown): Record<string, number> => {
  const output: Record<string, number> = {};
  if (!Array.isArray(data)) return output;
  for (const entry of data) {
    const type = isRecord(entry) && typeof entry.type === 'string' ? entry.type : 'unknown';
    output[type] = (output[type] ?? 0) + 1;
  }
  return output;
};

const deepEqual = (left: unknown, right: unknown): boolean =>
  stableStringify(left) === stableStringify(right);

const referencePrefixes = [
  'before.',
  'snapshots.',
  'scene.',
  'selected.',
  'history.',
  'patchmap.',
  'viewport.',
  'transformer.',
  'return.',
];

const resolveByIdPath = (root: JsonRecord, path: string): unknown => {
  const prefix = 'scene.byId.';
  const remainder = path.slice(prefix.length);
  const byId = isRecord(isRecord(root.scene) ? root.scene.byId : null)
    ? (root.scene as JsonRecord).byId as JsonRecord
    : {};
  const matchingId = Object.keys(byId)
    .filter((id) => remainder === id || remainder.startsWith(`${id}.`))
    .sort((left, right) => right.length - left.length)[0];
  if (!matchingId) return remainder.endsWith('.exists') ? false : undefined;
  const suffix = remainder.slice(matchingId.length).replace(/^\./u, '');
  const value = suffix ? readPath(byId[matchingId], suffix) : byId[matchingId];
  return value === undefined && remainder.endsWith('.exists') ? false : value;
};

export const readPath = (root: unknown, path: string): unknown => {
  if (path === '') return root;
  if (isRecord(root) && path.startsWith('scene.byId.')) {
    return resolveByIdPath(root, path);
  }
  const tokens = path
    .replace(/\[(\d+)\]/gu, '.$1')
    .split('.')
    .filter(Boolean);
  let current = root;
  for (const token of tokens) {
    if (current === null || current === undefined) return token === 'exists' ? false : undefined;
    if (Array.isArray(current)) {
      if (token === 'length') {
        current = current.length;
        continue;
      }
      const index = Number(token);
      current = Number.isInteger(index) ? current[index] : undefined;
      continue;
    }
    if (!isRecord(current)) return undefined;
    if (token === 'exists' && !Object.hasOwn(current, token)) return true;
    current = current[token];
  }
  return current;
};

const resolveExpected = (observation: JsonRecord, expected: unknown): unknown => {
  if (
    typeof expected === 'string' &&
    referencePrefixes.some((prefix) => expected.startsWith(prefix))
  ) {
    return readPath(observation, expected);
  }
  return expected;
};

const compare = (
  operator: LabCheckOperator,
  actual: unknown,
  expected: unknown,
): boolean => {
  switch (operator) {
    case 'equals':
    case 'same-reference':
    case 'unchanged':
      return deepEqual(actual, expected);
    case 'approximately-equals': {
      const approximatelyEqual = (left: unknown, right: unknown): boolean => {
        if (typeof left === 'number' && typeof right === 'number') {
          return Math.abs(left - right) <= 1e-6;
        }
        if (Array.isArray(left) && Array.isArray(right)) {
          return left.length === right.length && left.every((value, index) => approximatelyEqual(value, right[index]));
        }
        if (isRecord(left) && isRecord(right)) {
          const keys = Object.keys(left);
          return keys.length === Object.keys(right).length && keys.every((key) => approximatelyEqual(left[key], right[key]));
        }
        return deepEqual(left, right);
      };
      return approximatelyEqual(actual, expected);
    }
    case 'not-equals':
    case 'different-reference':
      return !deepEqual(actual, expected);
    case 'includes':
      return Array.isArray(actual)
        ? actual.some((entry) => deepEqual(entry, expected))
        : typeof actual === 'string' && typeof expected === 'string'
          ? actual.includes(expected)
          : false;
    case 'matches':
      return typeof actual === 'string' && typeof expected === 'string'
        ? new RegExp(expected, 'u').test(actual)
        : false;
    case 'exists':
      return actual !== undefined && actual !== null;
    case 'not-exists':
      return actual === undefined || actual === null;
    case 'greater-than':
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'less-than':
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case 'at-least':
      return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
  }
};

export class LabRuntime {
  public patchmap = new Patchmap();
  public readonly events: LabEventRecord[] = [];
  public readonly caseResults = new Map<string, LabRunStatus>();
  public onChange: (() => void) | null = null;
  public onFrame: (() => void) | null = null;
  public onManual: ((request: ManualObservationRequest) => void) | null = null;
  public sandboxDrawProvider: (() => unknown) | null = null;
  public sandboxUpdateProvider: (() => LabUpdateRequest) | null = null;

  readonly #host: HTMLElement;
  readonly #pixiDevtools = new PixiDevtoolsBridge();
  readonly #references = new WeakMap<object, string>();
  readonly #snapshots = new Map<string, NamedSnapshot>();
  readonly #eventCounts = new Map<string, number>();
  readonly #trackedEventNames = new Set<string>();
  #referenceSequence = 0;
  #productionFixture: MapData | null = null;
  #selectedHandles: PublicDisplayHandle[] = [];
  #before: RuntimeBefore | null = null;
  #lastObservation: JsonRecord | null = null;
  #lastReturn: unknown = undefined;
  #lastError: LabRuntimeError | null = null;
  #lastInput: unknown = null;
  #lastInputBefore = '';
  #inputUnchanged = true;
  #lastFrameStart = 0;
  #lastEventStart = new Map<string, number>();
  #nativeFrames = 0;
  #renderFrames = 0;
  #nativeFrameRequest = 0;
  #tickerCallback: (() => void) | null = null;
  #selectionIds: string[] = [];
  #packageObservation: JsonRecord = {};
  #sandboxOutcome: unknown = null;
  #visualObservation: JsonRecord = { pixelMatch: 'non-normative' };
  #interactionObservation: JsonRecord = { elapsedMs: 'unasserted' };
  #interactionCallbacks: string[] = [];
  #activePointerAction: string | null = null;
  #animationPaused = false;
  #manualPending = false;
  #defaultAssetsRegistered = false;

  public constructor(host: HTMLElement) {
    this.#host = host;
    const countNativeFrame = (): void => {
      this.#nativeFrames += 1;
      this.#nativeFrameRequest = requestAnimationFrame(countNativeFrame);
      this.onFrame?.();
    };
    this.#nativeFrameRequest = requestAnimationFrame(countNativeFrame);
  }

  public get frameCount(): number {
    return this.#nativeFrames;
  }

  public get renderCount(): number {
    return this.#renderFrames;
  }

  public get isAnimationPaused(): boolean {
    return this.#animationPaused;
  }

  public get selectedId(): string | null {
    return this.#selectedHandles[0]?.id ?? null;
  }

  public get hasManualPending(): boolean {
    return this.#manualPending;
  }

  public async initialize(): Promise<void> {
    await this.reset();
  }

  public async reset(options: PatchmapInitOptions = {}): Promise<void> {
    this.#unbindTicker();
    this.#before = null;
    this.#lastObservation = null;
    this.#pixiDevtools.clear();
    this.patchmap.destroy();
    this.#host.replaceChildren();
    this.#selectedHandles = [];
    this.#snapshots.clear();
    this.#selectionIds = [];
    this.#lastReturn = undefined;
    this.#lastError = null;
    this.#lastInput = null;
    this.#lastInputBefore = '';
    this.#inputUnchanged = true;
    this.#packageObservation = {};
    this.#sandboxOutcome = null;
    this.#manualPending = false;
    this.#animationPaused = false;
    this.#interactionObservation = { elapsedMs: 'unasserted' };
    this.#interactionCallbacks = [];
    this.#activePointerAction = null;
    this.events.splice(0);
    this.#eventCounts.clear();
    this.#trackedEventNames.clear();
    this.#lastEventStart.clear();
    this.#bindPatchmapEvents();

    const appOptions = {
      background: LAB_CANVAS_BACKGROUND,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      resizeTo: this.#host,
      preference: 'webgl' as const,
      ...(options.app ?? {}),
    };
    const initOptions: PatchmapInitOptions = {
      ...options,
      app: appOptions,
    };
    const registersDefaultAssets = options.assets === undefined && !this.#defaultAssetsRegistered;
    if (options.assets !== undefined) initOptions.assets = options.assets;
    else if (registersDefaultAssets) initOptions.assets = LAB_ASSET_DEFINITIONS;
    await this.patchmap.init(this.#host, initOptions);
    if (registersDefaultAssets) this.#defaultAssetsRegistered = true;
    if (this.patchmap.app) this.#pixiDevtools.publish(this.patchmap.app);
    this.#bindHistoryEvents();
    this.#bindStateEvents();
    this.#bindTicker();
    this.onChange?.();
  }

  public destroy(): void {
    cancelAnimationFrame(this.#nativeFrameRequest);
    this.#unbindTicker();
    this.#pixiDevtools.clear();
    this.#lastObservation = null;
    this.patchmap.destroy();
  }

  public async executeStep(testCase: LabCase, step: LabStep): Promise<LabStepResult> {
    const started = now();
    const beforeStarted = now();
    const beforeObservation = this.#lastObservation ?? this.observation();
    this.#before = {
      frozen: beforeObservation,
      handles: [...this.#selectedHandles],
    };
    const beforeSnapshotMs = now() - beforeStarted;
    this.#lastError = null;
    this.#lastReturn = undefined;
    this.#manualPending = false;
    this.#lastFrameStart = this.#nativeFrames;
    this.#lastEventStart = new Map(this.#eventCounts);
    const actionStarted = now();
    try {
      await this.#executeAction(step.action, step);
      await Promise.resolve();
    } catch (error) {
      this.#lastError = errorFrom(error);
    }
    const actionMs = now() - actionStarted;

    let observation: JsonRecord;
    const observationStarted = now();
    try {
      observation = this.observation();
    } catch (error) {
      this.#lastError = errorFrom(error);
      observation = {
        error: {
          exists: true,
          name: this.#lastError.name,
          message: this.#lastError.message,
          stack: this.#lastError.stack,
        },
      };
    }
    const observationMs = now() - observationStarted;
    const totalMs = now() - started;
    const timing: LabStepTiming = {
      beforeSnapshotMs,
      actionMs,
      observationMs,
      diagnosticsMs: beforeSnapshotMs + observationMs,
      totalMs,
    };
    this.#lastObservation = observation;
    const result = this.#resultFromObservation(testCase, step, observation, timing);
    this.onChange?.();
    return result;
  }

  public completeManualStep(testCase: LabCase, step: LabStep): LabStepResult {
    this.#manualPending = false;
    const started = now();
    const observation = this.observation();
    const observationMs = now() - started;
    const timing: LabStepTiming = {
      beforeSnapshotMs: 0,
      actionMs: 0,
      observationMs,
      diagnosticsMs: observationMs,
      totalMs: observationMs,
    };
    this.#lastObservation = observation;
    const result = this.#resultFromObservation(testCase, step, observation, timing);
    this.onChange?.();
    return result;
  }

  public skipManualStep(): void {
    this.#manualPending = false;
    this.onChange?.();
  }

  #resultFromObservation(
    testCase: LabCase,
    step: LabStep,
    observation: JsonRecord,
    timing: LabStepTiming,
  ): LabStepResult {
    const assertions = step.expectations.map((invariant): LabAssertionResult => {
      const actual = readPath(observation, invariant.path);
      const expected = resolveExpected(observation, invariant.expected);
      return {
        invariant,
        actual,
        expected,
        pass: compare(invariant.operator, actual, expected),
      };
    });
    const normativeFailure = assertions.some(
      (assertion) => assertion.invariant.normative && !assertion.pass,
    );
    const expectsError = step.expectations.some(
      (expectation) =>
        expectation.path.startsWith('error.') &&
        (expectation.operator === 'exists' || expectation.operator === 'matches'),
    );
    const unexpectedError = this.#lastError !== null && !expectsError;
    let status: LabRunStatus = normativeFailure || unexpectedError ? 'fail' : 'pass';
    const evidenceStatus = step.evidenceStatus ?? testCase.evidenceStatus;
    if (status !== 'fail') {
      if (evidenceStatus === 'pending') status = 'pending';
      else if (
        evidenceStatus === 'partial' ||
        evidenceStatus === 'manual' ||
        this.#manualPending ||
        step.expectations.some((expectation) => !expectation.normative)
      ) {
        status = 'partial';
      }
    }
    const result: LabStepResult = {
      caseId: testCase.id,
      stepId: step.id,
      status,
      assertions,
      error: this.#lastError,
      durationMs: timing.totalMs,
      timing,
      observation,
    };
    return result;
  }

  public observation(): JsonRecord {
    const scene = this.#collectScene();
    const selected = this.#snapshotHandle(this.#selectedHandles[0]);
    const events: JsonRecord = {};
    const observedEventNames = new Set([
      ...PATCHMAP_EVENTS,
      ...HISTORY_EVENTS,
      ...STATE_EVENTS,
      ...this.#trackedEventNames,
      ...this.#eventCounts.keys(),
    ]);
    for (const name of observedEventNames) {
      const count = this.#eventCounts.get(name) ?? 0;
      const last = [...this.events].reverse().find((entry) => entry.type === name);
      events[name] = {
        count,
        delta: count - (this.#lastEventStart.get(name) ?? 0),
        last: last?.payload ?? null,
      };
    }
    const history = this.patchmap.undoRedoManager;
    const viewport = this.patchmap.viewport;
    const transformer = this.patchmap.transformer;
    const screen = this.patchmap.app?.renderer?.screen;
    const snapshots = Object.fromEntries(
      [...this.#snapshots].map(([name, snapshot]) => [
        name,
        this.#materializeNamedSnapshot(snapshot),
      ]),
    );
    const inputAfter = this.#lastInput === null ? '' : stableStringify(this.#lastInput);
    const error = this.#lastError;

    return {
      patchmap: {
        isInit: this.patchmap.isInit,
        app: { exists: this.patchmap.app !== null },
        world: { exists: this.patchmap.world !== null },
        transformer: { exists: transformer !== null },
        theme: jsonSafe(this.patchmap.theme),
        animationContext: {
          exists: this.patchmap.animationContext !== null,
          reference: this.#reference(this.patchmap.animationContext),
        },
        rotation: { value: this.patchmap.rotation.value },
        flip: { x: this.patchmap.flip.x, y: this.patchmap.flip.y },
      },
      scene: {
        exists: this.patchmap.world !== null,
        topLevelCount: scene.topLevelCount,
        handleCount: scene.handles.length,
        byId: scene.byId,
        byType: scene.byType,
        componentsByType: scene.componentsByType,
        displayNodes: scene.displayNodes,
        truncated: scene.truncated,
        byIdTruncated: scene.byIdTruncated,
        handlesHaveProps: scene.handles.every((handle) => isRecord(handle.props)),
        allHandlesHaveId: scene.handles.every((handle) => handle.id.length > 0),
        allTopLevelShown: (this.patchmap.world?.children ?? []).every((child) => {
          const props = (child as unknown as JsonRecord).props;
          return !isRecord(props) || props.show === true;
        }),
        allTopLevelUnlocked: (this.patchmap.world?.children ?? []).every((child) => {
          const props = (child as unknown as JsonRecord).props;
          return !isRecord(props) || props.locked === false;
        }),
      },
      selected,
      before: this.#materializeBefore(),
      return: this.#normalizeReturn(this.#lastReturn),
      error: {
        exists: error !== null,
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
        sceneConsistentWithBefore: this.#sceneConsistentWithBefore(scene),
      },
      events,
      history: {
        canUndo: history.canUndo(),
        canRedo: history.canRedo(),
        commandCount: history.commands.length,
        commands: {
          count: history.commands.length,
          delta: history.commands.length - Number(readPath(this.#before?.frozen, 'history.commandCount') ?? 0),
        },
        reference: this.#reference(history),
      },
      viewport: {
        scale: viewport?.scale.x ?? null,
        scaleFinite: Number.isFinite(viewport?.scale.x),
        center: viewport ? { x: viewport.center.x, y: viewport.center.y } : null,
      },
      renderer: {
        screen: screen ? { width: screen.width, height: screen.height } : null,
      },
      frames: {
        current: this.#nativeFrames,
        delta: this.#nativeFrames - this.#lastFrameStart,
        rendered: this.#renderFrames,
      },
      input: {
        unchanged: this.#inputUnchanged && this.#lastInputBefore === inputAfter,
      },
      draw: {
        inputTopLevelCount: Array.isArray(this.#lastInput) ? this.#lastInput.length : null,
        inputTypeCounts: typeCounts(this.#lastInput),
      },
      canvasEvents: {
        ids: Object.keys(this.patchmap.event.getAll()),
      },
      transformer: {
        exists: transformer !== null,
        reference: transformer ? this.#reference(transformer) : null,
        destroyed: transformer?.destroyed ?? null,
        elements: {
          ids: transformer?.elements.map((element) => {
            const id = (element as unknown as JsonRecord).id;
            return typeof id === 'string' ? id : this.#reference(element);
          }) ?? [],
        },
        gestureActive: 'not-public',
      },
      selection: {
        ids: [...this.#selectionIds],
      },
      state: {
        selectionRegistered: this.patchmap.stateManager !== null,
        current: this.patchmap.stateManager?.current?.constructor.name ?? null,
      },
      package: this.#packageObservation,
      limitations: LIMITATIONS,
      visual: this.#visualObservation,
      interactions: this.#interactionObservation,
      sandbox: { outcome: this.#sandboxOutcome },
      snapshots,
    };
  }

  public sceneDisplaySnapshot(observation?: JsonRecord): JsonRecord {
    const observedScene = observation && isRecord(observation.scene) ? observation.scene : null;
    if (observedScene && Array.isArray(observedScene.displayNodes)) {
      const byType = isRecord(observedScene.byType) ? observedScene.byType : {};
      return {
        summary: {
          topLevel: observedScene.topLevelCount ?? 0,
          publicHandles: observedScene.handleCount ?? 0,
          types: Object.fromEntries(
            Object.entries(byType).map(([type, value]) => [
              type,
              isRecord(value) && typeof value.count === 'number' ? value.count : 0,
            ]),
          ),
        },
        nodes: observedScene.displayNodes,
        truncated: observedScene.truncated ?? 0,
      };
    }
    const scene = this.#collectScene();
    return {
      summary: {
        topLevel: scene.topLevelCount,
        publicHandles: scene.handles.length,
        types: Object.fromEntries(
          Object.entries(scene.byType).map(([type, value]) => [type, value.count]),
        ),
      },
      nodes: scene.displayNodes,
      truncated: scene.truncated,
    };
  }

  public selectedDisplaySnapshot(observation?: JsonRecord): unknown {
    const selected = observation?.selected;
    if (isRecord(selected)) return selected;
    return this.#snapshotHandle(this.#selectedHandles[0]);
  }

  public selectHandle(id: string): boolean {
    const handle = this.#resolveId(id);
    this.#selectedHandles = handle ? [handle] : [];
    this.#lastObservation = null;
    this.onChange?.();
    return handle !== null;
  }

  public fitSelected(): void {
    this.#lastObservation = null;
    this.patchmap.fit(this.selectedId ?? null, { padding: 24 });
    this.onChange?.();
  }

  public focusSelected(): void {
    this.#lastObservation = null;
    this.patchmap.focus(this.selectedId ?? null);
    this.onChange?.();
  }

  public toggleAnimation(): boolean {
    if (!this.patchmap.app) return this.#animationPaused;
    this.#animationPaused = !this.#animationPaused;
    this.#lastObservation = null;
    if (this.#animationPaused) this.patchmap.app.stop();
    else this.patchmap.app.start();
    this.onChange?.();
    return this.#animationPaused;
  }

  public async drawSandbox(data: unknown): Promise<void> {
    this.#lastObservation = null;
    this.#before = { frozen: this.observation(), handles: [...this.#selectedHandles] };
    this.#lastError = null;
    try {
      this.#sandboxOutcome = this.#drawData(data);
      this.#lastReturn = this.#sandboxOutcome;
    } catch (error) {
      this.#lastError = errorFrom(error);
      this.#sandboxOutcome = { error: this.#lastError.message };
    }
    await Promise.resolve();
    this.onChange?.();
  }

  public async updateSandbox(request: LabUpdateRequest): Promise<void> {
    this.#lastObservation = null;
    this.#before = { frozen: this.observation(), handles: [...this.#selectedHandles] };
    this.#lastError = null;
    try {
      this.#sandboxOutcome = this.#applyUpdate(request);
      this.#lastReturn = this.#sandboxOutcome;
    } catch (error) {
      this.#lastError = errorFrom(error);
      this.#sandboxOutcome = { error: this.#lastError.message };
    }
    await Promise.resolve();
    this.onChange?.();
  }

  public report(testCase: LabCase | null, result: LabStepResult | null): JsonRecord {
    return {
      generatedAt: new Date().toISOString(),
      case: testCase
        ? {
            id: testCase.id,
            title: testCase.title,
            category: testCase.category,
            risk: testCase.risk,
            evidenceStatus: testCase.evidenceStatus,
          }
        : null,
      step: result
        ? {
            id: result.stepId,
            status: result.status,
            durationMs: Number(result.durationMs.toFixed(2)),
            timing: {
              beforeSnapshotMs: Number(result.timing.beforeSnapshotMs.toFixed(2)),
              actionMs: Number(result.timing.actionMs.toFixed(2)),
              observationMs: Number(result.timing.observationMs.toFixed(2)),
              diagnosticsMs: Number(result.timing.diagnosticsMs.toFixed(2)),
              totalMs: Number(result.timing.totalMs.toFixed(2)),
            },
            assertions: result.assertions.map((assertion) => ({
              id: assertion.invariant.id,
              label: assertion.invariant.label,
              normative: assertion.invariant.normative,
              pass: assertion.pass,
              actual: jsonSafe(assertion.actual),
              expected: jsonSafe(assertion.expected),
            })),
            error: result.error,
          }
        : null,
      publicObservation: this.observation(),
      eventLog: this.events.slice(-100),
      limitations: LIMITATIONS,
    };
  }

  async #executeAction(action: LabAction, step: LabStep): Promise<void> {
    switch (action.kind) {
      case 'reset':
        await this.reset(action.options);
        return;
      case 'draw':
        this.#lastReturn = this.#drawData(await this.#fixture(action.fixture));
        return;
      case 'draw-inline':
        this.#lastReturn = this.#drawData(action.data);
        return;
      case 'draw-invalid': {
        const input = LAB_INVALID_INPUTS[action.inputKey];
        if (input === undefined) throw new Error(`Unknown invalid input key: ${action.inputKey}`);
        this.#lastReturn = this.#drawData(input);
        return;
      }
      case 'update': {
        const result = this.#applyUpdate(action.request);
        this.#lastReturn = result;
        const firstId = result[0]?.id;
        if (action.fitFirstResult === true && typeof firstId === 'string') {
          this.patchmap.fit(firstId, { padding: 80 });
        }
        return;
      }
      case 'wait-frame':
        await this.#waitFrames(action.frames ?? 1);
        return;
      case 'inspect': {
        if (action.target) this.#selectedHandles = this.#resolveSelector(action.target);
        if (action.snapshot) {
          this.#snapshots.set(action.snapshot, {
            frozen: this.observation(),
            handles: [...this.#selectedHandles],
            transformer: this.patchmap.transformer,
          });
        }
        return;
      }
      case 'view':
        if (action.method === 'fit') {
          this.patchmap.fit(action.ids, action.padding === undefined ? {} : { padding: action.padding });
        } else {
          this.patchmap.focus(action.ids);
        }
        return;
      case 'viewport': {
        const viewport = this.patchmap.viewport;
        if (!viewport) return;
        if (action.method === 'zoom' && action.scale !== undefined) {
          viewport.setZoom(action.scale, false);
        } else if (action.method === 'pan') {
          viewport.moveCenter(action.x ?? viewport.center.x, action.y ?? viewport.center.y);
        }
        return;
      }
      case 'rotation':
        if (action.method === 'set') this.patchmap.rotation.value = action.value ?? 0;
        else if (action.method === 'rotateBy') this.#lastReturn = this.patchmap.rotation.rotateBy(action.value ?? 0);
        else this.#lastReturn = this.patchmap.rotation.reset();
        return;
      case 'flip':
        if (action.method === 'set') {
          const next: { x?: boolean; y?: boolean } = {};
          if (action.x !== undefined) next.x = action.x;
          if (action.y !== undefined) next.y = action.y;
          this.#lastReturn = this.patchmap.flip.set(next);
        }
        else if (action.method === 'toggleX') this.#lastReturn = this.patchmap.flip.toggleX();
        else if (action.method === 'toggleY') this.#lastReturn = this.patchmap.flip.toggleY();
        else this.#lastReturn = this.patchmap.flip.reset();
        return;
      case 'selection':
        this.#configureSelection(action);
        return;
      case 'pointer':
        await this.#dispatchPointerAction(action);
        return;
      case 'transformer':
        this.#runTransformerAction(action);
        return;
      case 'transformer-gesture':
        this.#requestManual(
          step.title,
          `Use the visible ${action.gesture} handle on the selected public element. The lab does not inspect private Transformer handle maps.`,
          'observe',
        );
        return;
      case 'canvas-event':
        this.#runCanvasEventAction(action);
        return;
      case 'history': {
        const history = this.patchmap.undoRedoManager;
        if (action.method === 'undo') await history.undo();
        else if (action.method === 'redo') await history.redo();
        else if (action.method === 'clear') history.clear();
        else this.#lastReturn = history.commands;
        return;
      }
      case 'lifecycle':
        await this.#runLifecycleAction(action);
        return;
      case 'animation':
        if (action.method === 'pause' && !this.#animationPaused) this.toggleAnimation();
        if (action.method === 'resume' && this.#animationPaused) this.toggleAnimation();
        if (action.durationMs) await new Promise((resolve) => window.setTimeout(resolve, action.durationMs));
        return;
      case 'package-import': {
        const browserModule = await import('../src/index');
        const names = Object.keys(browserModule).sort();
        const instance = new browserModule.Patchmap();
        this.#packageObservation = {
          exports: {
            names,
            Patchmap: { type: typeof browserModule.Patchmap },
          },
          instance: { constructed: instance instanceof browserModule.Patchmap },
        };
        return;
      }
      case 'sandbox-draw': {
        const value = this.sandboxDrawProvider?.();
        this.#sandboxOutcome = this.#drawData(value);
        this.#lastReturn = this.#sandboxOutcome;
        return;
      }
      case 'sandbox-update': {
        const request = this.sandboxUpdateProvider?.();
        if (!request) throw new Error('Sandbox update editor is not connected.');
        this.#sandboxOutcome = this.#applyUpdate(request);
        this.#lastReturn = this.#sandboxOutcome;
        return;
      }
      case 'manual':
        this.#requestManual(step.title, action.instruction, action.completion);
        return;
    }
  }

  async #fixture(key: LabFixtureKey): Promise<unknown> {
    if (key === 'production-like') {
      if (this.#productionFixture) return cloneValue(this.#productionFixture);
      const url = new URL('./fixtures/production-like.json', import.meta.url);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Production fixture request failed: ${response.status}`);
      const value: unknown = await response.json();
      if (!Array.isArray(value)) throw new TypeError('Production fixture must be a JSON array.');
      this.#productionFixture = value as MapData;
      return cloneValue(this.#productionFixture);
    }
    if (key === 'sandbox') return this.sandboxDrawProvider?.() ?? [];
    const fixture = LAB_FIXTURES[key];
    if (!fixture) throw new Error(`Unknown lab fixture: ${key}`);
    return cloneValue(fixture.data);
  }

  #drawData(data: unknown): unknown {
    this.#lastInput = data;
    this.#lastInputBefore = stableStringify(data);
    const result = this.patchmap.draw(data as MapData);
    this.#inputUnchanged = this.#lastInputBefore === stableStringify(data);
    const first = this.#collectScene().handles[0];
    this.#selectedHandles = first ? [first] : [];
    this.#selectionIds = [];
    return result;
  }

  #applyUpdate(request: LabUpdateRequest): PublicDisplayHandle[] {
    const options: UpdateOptions<PublicDisplayHandle> = {};
    if (request.changes !== undefined) options.changes = request.changes;
    if (request.mergeStrategy !== undefined) options.mergeStrategy = request.mergeStrategy;
    if (request.refresh !== undefined) options.refresh = request.refresh;
    if (request.relativeTransform !== undefined) options.relativeTransform = request.relativeTransform;
    if (request.rotateOrigin !== undefined) options.rotateOrigin = request.rotateOrigin;
    if (request.history !== undefined) options.history = request.history;
    if (request.validateSchema !== undefined) options.validateSchema = request.validateSchema;
    if (request.normalize !== undefined) options.normalize = request.normalize;
    if (request.emit !== undefined) options.emit = request.emit;
    const target = request.target;
    if (target?.mode === 'path') options.path = target.path;
    else if (target?.mode === 'path-and-id') {
      options.path = target.path;
      const handle = this.#resolveId(target.id);
      if (handle) options.elements = handle;
    } else if (target) {
      const handles = this.#resolveSelector(target);
      if (handles.length === 1 && handles[0]) options.elements = handles[0];
      else options.elements = handles;
    }
    const result = this.patchmap.update(options);
    this.#selectedHandles = [...result];
    return result;
  }

  #resolveSelector(selector: LabSelector): PublicDisplayHandle[] {
    switch (selector.mode) {
      case 'path':
        return this.patchmap.selector<PublicDisplayHandle>(selector.path);
      case 'id': {
        const value = this.#resolveId(selector.id);
        return value ? [value] : [];
      }
      case 'ids':
        return selector.ids
          .map((id) => this.#resolveId(id))
          .filter((value): value is PublicDisplayHandle => value !== null);
      case 'path-and-id': {
        const direct = this.#resolveId(selector.id);
        return [
          ...this.patchmap.selector<PublicDisplayHandle>(selector.path),
          ...(direct ? [direct] : []),
        ];
      }
      case 'current-selection':
        return this.patchmap.transformer?.elements as PublicDisplayHandle[] ?? [];
    }
  }

  #resolveId(id: string): PublicDisplayHandle | null {
    const encoded = JSON.stringify(id);
    return this.patchmap.selector<PublicDisplayHandle>(
      `$..children[?(@.id===${encoded})]`,
    )[0] ?? null;
  }

  #configureSelection(action: Extract<LabAction, { kind: 'selection' }>): void {
    const manager = this.patchmap.stateManager;
    if (!manager) return;
    if (action.method === 'clear') {
      manager.resetState();
      this.#selectionIds = [];
      return;
    }
    const targets = action.target ? this.#resolveSelector(action.target) : [];
    if (action.method === 'set') {
      this.#selectionIds = targets.map((target) => target.id);
      this.#selectedHandles = targets;
      return;
    }
    const requestedOptions = { ...(action.options ?? {}) };
    if (requestedOptions.filter === 'label-present') {
      requestedOptions.filter = (target: unknown): boolean => {
        if (!isRecord(target)) return false;
        return typeof target.label === 'string' && target.label.length > 0;
      };
    }
    const recordSelection = (value: unknown, event: unknown, type: string): void => {
      const values = Array.isArray(value) ? value : [value];
      const handles = values.filter(
        (entry): entry is PublicDisplayHandle =>
          isRecord(entry) && typeof entry.id === 'string' && typeof entry.type === 'string',
      );
      this.#selectionIds = handles.map((handle) => handle.id);
      this.#selectedHandles = handles;
      this.#interactionCallbacks.push(type);
      const eventRecord = isRecord(event) ? event : {};
      const authoredType = this.#activePointerAction;
      this.#interactionObservation = {
        ...this.#interactionObservation,
        last: {
          type: authoredType ?? type,
          callback: type,
          callbackShape: ['target', 'event'],
          targetIds: handles.map((handle) => handle.id),
          detail: typeof eventRecord.detail === 'number' ? eventRecord.detail : null,
        },
        dragLifecycle: this.#interactionCallbacks.filter((entry) =>
          entry === 'drag-start' || entry === 'drag' || entry === 'drag-end'
        ),
      };
      this.#recordEvent(`selection:${type}`, { target: handles, event });
    };
    manager.setState('selection', {
      ...requestedOptions,
      onDown: (target: unknown, event: unknown) => recordSelection(target, event, 'down'),
      onUp: (target: unknown, event: unknown) => recordSelection(target, event, 'up'),
      onClick: (target: unknown, event: unknown) => recordSelection(target, event, 'click'),
      onDoubleClick: (target: unknown, event: unknown) => recordSelection(target, event, 'double-click'),
      onRightClick: (target: unknown, event: unknown) => recordSelection(target, event, 'right-click'),
      onDragStart: (value: unknown, event: unknown) => recordSelection(value, event, 'drag-start'),
      onDrag: (value: unknown, event: unknown) => recordSelection(value, event, 'drag'),
      onDragEnd: (value: unknown, event: unknown) => recordSelection(value, event, 'drag-end'),
      onOver: (target: unknown, event: unknown) => recordSelection(target, event, 'over'),
    });
  }

  async #dispatchPointerAction(action: Extract<LabAction, { kind: 'pointer' }>): Promise<void> {
    if (!this.patchmap.app) return;
    const target = action.target ? this.#resolveSelector(action.target)[0] : null;
    const targetBounds = target?.getBounds();
    const center = targetBounds
      ? {
          x: targetBounds.x + targetBounds.width / 2,
          y: targetBounds.y + targetBounds.height / 2,
        }
      : {
          x: this.patchmap.app.screen.width / 2,
          y: this.patchmap.app.screen.height / 2,
        };
    const start = action.from ?? center;
    const end = action.to ?? { x: start.x + 36, y: start.y + 24 };
    const modifiers = new Set(action.modifiers ?? []);
    const dispatch = (
      type: string,
      point: { x: number; y: number },
      detail = 0,
    ): void => {
      const event = {
        type,
        target,
        global: point,
        pointerId: 1,
        pointerType: action.action === 'touch-tap' ? 'touch' : 'mouse',
        isPrimary: true,
        button: action.action === 'right-click' ? 2 : 0,
        buttons: type === 'pointerup' || type === 'pointerupoutside' ? 0 : 1,
        detail,
        shiftKey: modifiers.has('shift'),
        metaKey: modifiers.has('meta'),
        ctrlKey: modifiers.has('control'),
        altKey: modifiers.has('alt'),
        preventDefault: () => undefined,
        nativeEvent: { preventDefault: () => undefined },
      };
      this.patchmap.stateManager?.dispatch(type, event);
      target?.emit(type, event);
    };

    const callbackStart = this.#interactionCallbacks.length;
    this.#activePointerAction = action.action;
    if (action.action === 'hover') {
      dispatch('pointerover', start);
    } else if (action.action === 'cancel') {
      dispatch('pointerupoutside', start);
    } else if (action.action === 'pointerupoutside') {
      dispatch('pointerdown', start);
      dispatch('pointerupoutside', end);
    } else if (
      action.action === 'drag' ||
      action.action === 'box-select' ||
      action.action === 'paint-select'
    ) {
      dispatch('pointerdown', start);
      for (let index = 1; index <= 5; index += 1) {
        dispatch('pointermove', {
          x: start.x + ((end.x - start.x) * index) / 5,
          y: start.y + ((end.y - start.y) * index) / 5,
        });
        await this.#waitFrames(1);
      }
      dispatch('pointerup', end);
    } else {
      dispatch('pointerdown', start);
      dispatch('pointerup', start);
      if (action.action === 'right-click') dispatch('rightclick', start, 1);
      else if (action.action === 'touch-tap') dispatch('tap', start, action.detail ?? 1);
      else dispatch('click', start, action.detail ?? (action.action === 'double-click' ? 2 : 1));
    }
    await this.#waitFrames(1);
    const callbacks = this.#interactionCallbacks.slice(callbackStart);
    const previousLast = isRecord(this.#interactionObservation.last)
      ? this.#interactionObservation.last
      : {};
    this.#interactionObservation = {
      ...this.#interactionObservation,
      last: {
        ...previousLast,
        type: action.action,
        callbacks,
        callbackShape: callbacks.length > 0 ? ['target', 'event'] : null,
        suppressedClick: action.action === 'double-click'
          ? callbacks.includes('double-click') && !callbacks.includes('click')
          : null,
      },
      dragLifecycle: this.#interactionCallbacks.filter((entry) =>
        entry === 'drag-start' || entry === 'drag' || entry === 'drag-end'
      ),
      dispatchMode: 'public-state-simulation',
      elapsedMs: 'unasserted',
    };
    this.#activePointerAction = null;
  }

  #runTransformerAction(action: Extract<LabAction, { kind: 'transformer' }>): void {
    if (action.method === 'destroy') {
      this.patchmap.transformer = null;
      return;
    }
    if (action.method === 'clear') {
      this.patchmap.transformer?.selection.clear();
      return;
    }
    if (action.method === 'select') {
      const targets = action.target ? this.#resolveSelector(action.target) : [];
      this.patchmap.transformer?.selection.set(targets);
      this.#selectedHandles = targets;
      return;
    }
    const targets = action.target ? this.#resolveSelector(action.target) : [];
    const transformer = new Transformer({
      ...(action.options ?? {}),
      elements: targets,
    });
    this.patchmap.transformer = transformer;
    this.#selectedHandles = targets;
  }

  #runCanvasEventAction(action: Extract<LabAction, { kind: 'canvas-event' }>): void {
    const event = this.patchmap.event;
    switch (action.method) {
      case 'add':
        for (const name of (action.actions ?? 'click').split(/\s+/u).filter(Boolean)) {
          this.#trackedEventNames.add(`canvas:${name}`);
        }
        this.#lastReturn = event.add({
          ...(action.id ? { id: action.id } : {}),
          path: action.path ?? '$',
          action: action.actions ?? 'click',
          fn: (payload: unknown) => {
            const eventType = isRecord(payload) && typeof payload.type === 'string'
              ? payload.type
              : (action.actions ?? 'click').split(/\s+/u).filter(Boolean)[0] ?? 'click';
            this.#recordEvent(`canvas:${eventType}`, payload);
          },
        });
        return;
      case 'get':
        this.#lastReturn = action.id ? event.get(action.id) : undefined;
        return;
      case 'getAll':
        this.#lastReturn = event.getAll();
        return;
      case 'on':
        if (action.id) event.on(action.id);
        return;
      case 'off':
        if (action.id) event.off(action.id);
        return;
      case 'remove':
        if (action.id) event.remove(action.id);
        return;
      case 'removeAll':
        event.removeAll();
        return;
    }
  }

  async #runLifecycleAction(action: Extract<LabAction, { kind: 'lifecycle' }>): Promise<void> {
    if (action.method === 'destroy') {
      this.#unbindTicker();
      this.#pixiDevtools.clear();
      this.patchmap.destroy();
      this.#selectedHandles = [];
      this.#selectionIds = [];
      return;
    }
    if (action.method === 'resize') {
      if (action.width) this.#host.style.width = `${action.width}px`;
      if (action.height) this.#host.style.height = `${action.height}px`;
      window.dispatchEvent(new Event('resize'));
      return;
    }
    if (action.method === 'theme-reset') {
      await this.reset();
      return;
    }
    if (action.method === 'init' && !this.patchmap.isInit) {
      this.#bindPatchmapEvents();
      await this.patchmap.init(this.#host, action.options);
      if (this.patchmap.app) this.#pixiDevtools.publish(this.patchmap.app);
      this.#bindHistoryEvents();
      this.#bindStateEvents();
      this.#bindTicker();
      return;
    }
    if (action.method === 're-init') {
      if (this.patchmap.isInit) {
        this.#pixiDevtools.clear();
        this.patchmap.destroy();
      }
      this.#selectedHandles = [];
      this.#selectionIds = [];
      this.#bindPatchmapEvents();
      const initOptions: PatchmapInitOptions = {
        ...(action.options ?? {}),
        app: {
          resizeTo: this.#host,
          background: LAB_CANVAS_BACKGROUND,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          ...(action.options?.app ?? {}),
        },
      };
      const registersDefaultAssets = action.options?.assets === undefined && !this.#defaultAssetsRegistered;
      if (action.options?.assets !== undefined) initOptions.assets = action.options.assets;
      else if (registersDefaultAssets) initOptions.assets = LAB_ASSET_DEFINITIONS;
      await this.patchmap.init(this.#host, initOptions);
      if (registersDefaultAssets) this.#defaultAssetsRegistered = true;
      if (this.patchmap.app) this.#pixiDevtools.publish(this.patchmap.app);
      this.#bindHistoryEvents();
      this.#bindStateEvents();
      this.#bindTicker();
    }
  }

  #requestManual(
    title: string,
    instruction: string,
    completion: ManualObservationRequest['completion'],
  ): void {
    this.#manualPending = true;
    this.onManual?.({ title, instruction, completion });
  }

  #collectScene(): SceneCollection {
    const byId: Record<string, JsonRecord> = {};
    const typeHandles = new Map<string, PublicDisplayHandle[]>();
    const componentHandles = new Map<string, PublicDisplayHandle[]>();
    const finiteBoundsByType = new Map<string, boolean>();
    const finiteBoundsByComponentType = new Map<string, boolean>();
    const sampledBoundsByType = new Map<string, number>();
    const sampledBoundsByComponentType = new Map<string, number>();
    let byIdCount = 0;
    const handles: PublicDisplayHandle[] = [];
    const displayNodes: JsonRecord[] = [];
    const world = this.patchmap.world;
    const roots = world?.children ?? [];
    const visit = (container: Container, depth: number): void => {
      const record = container as unknown as JsonRecord;
      const id = typeof record.id === 'string' ? record.id : null;
      const type = typeof record.type === 'string' ? record.type : null;
      const props = record.props;
      if (id && type && isRecord(props)) {
        const handle = container as PublicDisplayHandle;
        handles.push(handle);
        const current = typeHandles.get(type) ?? [];
        current.push(handle);
        typeHandles.set(type, current);
        const parentRecord = handle.parent as unknown as JsonRecord | null;
        const parentType = parentRecord && typeof parentRecord.type === 'string'
          ? parentRecord.type
          : null;
        const isComponent = type === 'background' || type === 'bar' || type === 'icon' ||
          (type === 'text' && parentType === 'item');
        if (isComponent) {
          const components = componentHandles.get(type) ?? [];
          components.push(handle);
          componentHandles.set(type, components);
        }
        const shouldSnapshot = byIdCount < MAX_SCENE_SNAPSHOT_HANDLES ||
          this.#selectedHandles.includes(handle);
        if (shouldSnapshot) {
          const snapshot = this.#snapshotHandle(handle);
          if (!Object.prototype.hasOwnProperty.call(byId, id)) byIdCount += 1;
          byId[id] = snapshot;
          const boundsFinite = snapshot.boundsFinite === true;
          finiteBoundsByType.set(type, (finiteBoundsByType.get(type) ?? true) && boundsFinite);
          sampledBoundsByType.set(type, (sampledBoundsByType.get(type) ?? 0) + 1);
          if (isComponent) {
            finiteBoundsByComponentType.set(
              type,
              (finiteBoundsByComponentType.get(type) ?? true) && boundsFinite,
            );
            sampledBoundsByComponentType.set(
              type,
              (sampledBoundsByComponentType.get(type) ?? 0) + 1,
            );
          }
        }
        if (displayNodes.length < 160 && byId[id]) {
          const snapshot = byId[id];
          displayNodes.push({ depth, ...snapshot });
        }
      }
      for (const child of container.children) visit(child, depth + 1);
    };
    for (const root of roots) visit(root, 0);
    const summarizeTypes = (
      source: Map<string, PublicDisplayHandle[]>,
      finiteBounds: Map<string, boolean>,
      sampledBounds: Map<string, number>,
    ): Record<string, JsonRecord> =>
      Object.fromEntries(
        [...source].map(([type, entries]) => [
          type,
          {
            count: entries.length,
            allFiniteBounds: finiteBounds.get(type) ?? true,
            boundsSampled: sampledBounds.get(type) ?? 0,
            boundsComplete: (sampledBounds.get(type) ?? 0) === entries.length,
          },
        ]),
      );
    return {
      byId,
      byType: summarizeTypes(typeHandles, finiteBoundsByType, sampledBoundsByType),
      componentsByType: summarizeTypes(
        componentHandles,
        finiteBoundsByComponentType,
        sampledBoundsByComponentType,
      ),
      handles,
      displayNodes,
      topLevelCount: roots.filter((root) => {
        const record = root as unknown as JsonRecord;
        return typeof record.id === 'string' && typeof record.type === 'string';
      }).length,
      truncated: Math.max(0, handles.length - displayNodes.length),
      byIdTruncated: Math.max(0, handles.length - byIdCount),
    };
  }

  #snapshotHandle(handle: PublicDisplayHandle | undefined): JsonRecord {
    if (!handle) return { exists: false };
    const destroyed = handle.destroyed;
    const safely = <T>(read: () => T, fallback: T): T => {
      if (!destroyed) return read();
      try {
        return read();
      } catch {
        return fallback;
      }
    };
    let bounds: { x: number; y: number; width: number; height: number } | null = null;
    if (!destroyed) {
      const value = handle.getBounds();
      bounds = { x: value.x, y: value.y, width: value.width, height: value.height };
    } else {
      try {
        const value = handle.getBounds();
        bounds = { x: value.x, y: value.y, width: value.width, height: value.height };
      } catch {
        bounds = null;
      }
    }
    const parent = safely(() => handle.parent, null);
    const parentRecord = parent as unknown as JsonRecord | null;
    const handleChildren = safely(() => [...handle.children], []);
    const children = handleChildren.filter((child) => {
      const record = child as unknown as JsonRecord;
      return typeof record.id === 'string' && isRecord(record.props);
    });
    const props = jsonSafe(safely(() => handle.props, null));
    const angleValue = safely<number | null>(() => handle.angle, null);
    const angle = angleValue !== null && Number.isFinite(angleValue) ? angleValue : null;
    const scale = safely<{ x: number | null; y: number | null }>(
      () => ({ x: handle.scale.x, y: handle.scale.y }),
      { x: null, y: null },
    );
    const x = safely<number | null>(() => handle.x, null);
    const y = safely<number | null>(() => handle.y, null);
    const rotation = safely<number | null>(() => handle.rotation, null);
    return {
      exists: true,
      reference: this.#reference(handle),
      id: safely(() => handle.id, '[destroyed]'),
      type: safely(() => handle.type, '[destroyed]'),
      label: safely(() => handle.label ?? null, null),
      props,
      x,
      y,
      angle,
      rotation,
      angleModulo15: angle === null ? null : ((angle % 15) + 15) % 15,
      scale,
      transform: { exists: true, x, y, rotation, scale },
      visible: safely<boolean | null>(() => handle.visible, null),
      renderable: safely<boolean | null>(() => handle.renderable, null),
      destroyed,
      childrenCount: handleChildren.length,
      componentCount: children.length,
      parent: {
        exists: parent !== null,
        id: parentRecord && typeof parentRecord.id === 'string' ? parentRecord.id : null,
        type: parentRecord && typeof parentRecord.type === 'string' ? parentRecord.type : null,
      },
      bounds,
      boundsFinite: bounds !== null && Object.values(bounds).every(Number.isFinite),
      center: bounds
        ? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
        : null,
    };
  }

  #materializeBefore(): JsonRecord {
    if (!this.#before) return {};
    const selectedFrozen = readPath(this.#before.frozen, 'selected');
    const selectedLive = this.#snapshotHandle(this.#before.handles[0]);
    const selected = isRecord(selectedFrozen)
      ? {
          ...selectedFrozen,
          destroyed: selectedLive.destroyed,
          parent: selectedLive.parent,
        }
      : selectedLive;
    return { ...this.#before.frozen, selected };
  }

  #materializeNamedSnapshot(snapshot: NamedSnapshot): JsonRecord {
    const selectedFrozen = readPath(snapshot.frozen, 'selected');
    const selectedLive = this.#snapshotHandle(snapshot.handles[0]);
    const selected = isRecord(selectedFrozen)
      ? {
          ...selectedFrozen,
          destroyed: selectedLive.destroyed,
          parent: selectedLive.parent,
        }
      : selectedLive;
    const frozenById = readPath(snapshot.frozen, 'scene.byId');
    const byId = isRecord(frozenById) ? frozenById : {};
    const transformerFrozen = snapshot.transformer
      ? {
          reference: this.#reference(snapshot.transformer),
          destroyed: snapshot.transformer.destroyed,
        }
      : { reference: null, destroyed: null };
    return {
      ...snapshot.frozen,
      selected,
      references: snapshot.handles.map((handle) => this.#reference(handle)),
      byId,
      parent: isRecord(selected) ? selected.parent : null,
      bounds: isRecord(selected) ? selected.bounds : null,
      reference: snapshot.transformer
        ? this.#reference(snapshot.transformer)
        : isRecord(selected) && typeof selected.reference === 'string'
          ? selected.reference
          : readPath(snapshot.frozen, 'history.reference'),
      destroyed: transformerFrozen.destroyed,
      transformer: transformerFrozen,
    };
  }

  #normalizeReturn(value: unknown): JsonRecord {
    if (Array.isArray(value)) {
      const records = value.filter(isRecord);
      return {
        exists: true,
        length: value.length,
        ids: records.map((entry) => entry.id).filter((id): id is string => typeof id === 'string'),
        references: records.map((entry) => this.#reference(entry)),
        value: jsonSafe(value),
      };
    }
    if (isRecord(value)) {
      const ids = Object.keys(value);
      return {
        exists: true,
        ids,
        value: jsonSafe(value),
      };
    }
    return {
      exists: value !== undefined && value !== null,
      length: typeof value === 'string' ? value.length : undefined,
      value: jsonSafe(value),
    };
  }

  #sceneConsistentWithBefore(scene: SceneCollection): boolean {
    if (!this.#before) return true;
    const beforeScene = readPath(this.#before.frozen, 'scene.byId');
    if (!isRecord(beforeScene)) return true;
    return deepEqual(beforeScene, scene.byId);
  }

  #reference(value: object): string {
    const existing = this.#references.get(value);
    if (existing) return existing;
    const next = `ref-${String(++this.#referenceSequence).padStart(4, '0')}`;
    this.#references.set(value, next);
    return next;
  }

  #bindPatchmapEvents(): void {
    for (const name of PATCHMAP_EVENTS) {
      this.patchmap.on(name, (payload: unknown) => this.#recordEvent(name, payload));
    }
  }

  #bindHistoryEvents(): void {
    const history = this.patchmap.undoRedoManager;
    for (const name of HISTORY_EVENTS) {
      history.on(name, (payload: unknown) => this.#recordEvent(name, payload));
    }
  }

  #bindStateEvents(): void {
    const state = this.patchmap.stateManager;
    if (!state) return;
    for (const name of STATE_EVENTS) {
      state.on(name, (payload: unknown) => this.#recordEvent(name, payload));
    }
  }

  #recordEvent(type: string, payload: unknown): void {
    this.#lastObservation = null;
    this.#eventCounts.set(type, (this.#eventCounts.get(type) ?? 0) + 1);
    this.events.push({
      timestamp: now(),
      type,
      target: describeTarget(payload),
      payload: normalizeEventPayload(payload),
    });
    if (this.events.length > 500) this.events.splice(0, this.events.length - 500);
    this.onChange?.();
  }

  #bindTicker(): void {
    const app = this.patchmap.app;
    if (!app) return;
    const callback = (): void => {
      this.#renderFrames += 1;
      this.onFrame?.();
    };
    this.#tickerCallback = callback;
    app.ticker.add(callback);
  }

  #unbindTicker(): void {
    const app = this.patchmap.app;
    if (app && this.#tickerCallback) app.ticker.remove(this.#tickerCallback);
    this.#tickerCallback = null;
  }

  #waitFrames(frames: number): Promise<void> {
    const count = Math.max(1, Math.trunc(frames));
    return new Promise((resolve) => {
      let remaining = count;
      const wait = (): void => {
        remaining -= 1;
        if (remaining <= 0) resolve();
        else requestAnimationFrame(wait);
      };
      requestAnimationFrame(wait);
    });
  }
}
