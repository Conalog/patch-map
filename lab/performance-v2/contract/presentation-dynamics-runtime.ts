export const CORE_V2_PRESENTATION_DYNAMICS_RUNTIME_REVISION =
  'core-v2-presentation-dynamics-runtime/1';
export const CORE_V2_PRESENTATION_DYNAMICS_CLEANUP_REVISION =
  'core-v2-presentation-dynamics-cleanup/1';

export const CORE_V2_PRESENTATION_DYNAMICS_CASE_IDS = Object.freeze([
  'UPD-005',
  'REN-009',
  'ANI-001',
  'ANI-002',
] as const);

type PresentationDynamicsCaseId =
  (typeof CORE_V2_PRESENTATION_DYNAMICS_CASE_IDS)[number];

interface ScheduleObservation {
  readonly scheduleIndex: number;
  readonly values: readonly number[];
}

interface EnginePublicationObservation {
  readonly lifecycle: string;
  readonly frameRevision: number;
  readonly publishedTuple: Readonly<{
    readonly scene: number;
    readonly view: number;
    readonly interaction: number;
  }>;
}

type PostDestroyAttemptObservation =
  | Readonly<{ readonly status: 'completed' }>
  | Readonly<{
      readonly status: 'rejected';
      readonly error: Readonly<{
        readonly code: string;
        readonly category: string;
        readonly operation: string;
        readonly recoverable: boolean;
        readonly retryable: boolean;
      }>;
    }>;

interface PostDestroyAdvanceObservation {
  readonly timeMs: number;
  readonly publications: number;
  readonly before: EnginePublicationObservation;
  readonly after: EnginePublicationObservation;
  readonly frameEventCount: number;
  readonly attemptedCall: PostDestroyAttemptObservation;
  readonly correlation: Readonly<{
    readonly frameRevisionDelta: number;
    readonly publishedTupleChanged: boolean;
  }>;
}

export interface CoreV2PresentationDynamicsProductAdapter {
  recordSchedule(input: Readonly<{
    caseId: 'ANI-002';
    scheduleIndex: number;
    values: readonly number[];
  }>): ScheduleObservation;
  markDestroyed(input: Readonly<{
    caseId: PresentationDynamicsCaseId;
    lifecycleGeneration: number;
  }>): Readonly<Record<string, unknown>>;
  observePostDestroyAdvance(input: Readonly<{
    caseId: 'ANI-002';
    timeMs: number;
    before: EnginePublicationObservation;
    after: EnginePublicationObservation;
    frameEventCount: number;
    attemptedCall: PostDestroyAttemptObservation;
  }>): PostDestroyAdvanceObservation;
  resourceProbe(input: Readonly<{
    caseId: PresentationDynamicsCaseId;
  }>): Readonly<Record<string, unknown>>;
}

export interface CoreV2PresentationDynamicsRuntime {
  readonly product: CoreV2PresentationDynamicsProductAdapter;
  postDestroyProductProbe(): Readonly<Record<string, unknown>>;
}

/** Zero-resource observation journal shared by all four presentation cases. */
export function createCoreV2PresentationDynamicsRuntime(
  caseId: PresentationDynamicsCaseId,
): CoreV2PresentationDynamicsRuntime {
  invariant(
    CORE_V2_PRESENTATION_DYNAMICS_CASE_IDS.includes(caseId),
    'unsupported case identity',
  );
  const schedules = new Map<number, readonly number[]>();
  const journal: Readonly<Record<string, unknown>>[] = [];
  let sequence = 0;
  let resourceProbeCount = 0;
  let destroyMarkCount = 0;
  let postDestroyAdvanceCount = 0;
  let publicationsAfterDestroy = 0;
  const postDestroyObservations: PostDestroyAdvanceObservation[] = [];
  let destroyed = false;
  let released = false;
  let lifecycleGeneration: number | null = null;
  let cleanupProbe: Readonly<Record<string, unknown>> | null = null;

  const append = (event: string, details: Readonly<Record<string, unknown>>): void => {
    sequence += 1;
    journal.push(deepFreeze({ sequence, event, ...details }));
  };

  const product: CoreV2PresentationDynamicsProductAdapter = Object.freeze({
    recordSchedule(input: Readonly<{
      caseId: 'ANI-002';
      scheduleIndex: number;
      values: readonly number[];
    }>) {
      assertActive(released, 'recordSchedule');
      invariant(caseId === 'ANI-002' && input.caseId === caseId, 'schedule case identity');
      invariant(Number.isSafeInteger(input.scheduleIndex) && input.scheduleIndex >= 0, 'schedule index');
      invariant(!schedules.has(input.scheduleIndex), 'schedule index recorded once');
      const values = Object.freeze(input.values.map((value, index) =>
        finite(value, `schedule values[${index}]`)));
      schedules.set(input.scheduleIndex, values);
      append('schedule-observed', {
        caseId,
        scheduleIndex: input.scheduleIndex,
        valueCount: values.length,
      });
      return deepFreeze({ scheduleIndex: input.scheduleIndex, values });
    },

    markDestroyed(input: Readonly<{
      caseId: PresentationDynamicsCaseId;
      lifecycleGeneration: number;
    }>) {
      assertActive(released, 'markDestroyed');
      invariant(input.caseId === caseId, 'destroy case identity');
      const generation = positiveSafeInteger(
        input.lifecycleGeneration,
        'lifecycleGeneration',
      );
      destroyMarkCount += 1;
      destroyed = true;
      lifecycleGeneration = generation;
      append('engine-destroyed', { caseId, lifecycleGeneration: generation });
      return deepFreeze({
        caseId,
        lifecycleGeneration: generation,
        destroyMarkCount,
        destroyed: true,
      });
    },

    observePostDestroyAdvance(input: Readonly<{
      caseId: 'ANI-002';
      timeMs: number;
      before: EnginePublicationObservation;
      after: EnginePublicationObservation;
      frameEventCount: number;
      attemptedCall: PostDestroyAttemptObservation;
    }>) {
      assertActive(released, 'observePostDestroyAdvance');
      invariant(caseId === 'ANI-002' && input.caseId === caseId, 'post-destroy case identity');
      invariant(destroyed, 'post-destroy advance requires a destroyed engine');
      const timeMs = finite(input.timeMs, 'post-destroy timeMs');
      const before = publicationObservation(input.before, 'post-destroy before');
      const after = publicationObservation(input.after, 'post-destroy after');
      const frameEventCount = nonNegativeSafeInteger(
        input.frameEventCount,
        'post-destroy frameEventCount',
      );
      const attemptedCall = attemptObservation(input.attemptedCall);
      const frameRevisionDelta = after.frameRevision - before.frameRevision;
      invariant(frameRevisionDelta >= 0, 'post-destroy frame revision must not move backwards');
      const publishedTupleChanged = !samePublicationTuple(
        before.publishedTuple,
        after.publishedTuple,
      );
      const publications = Math.max(
        frameRevisionDelta,
        frameEventCount,
        attemptedCall.status === 'completed' ? 1 : 0,
        publishedTupleChanged ? 1 : 0,
      );
      postDestroyAdvanceCount += 1;
      publicationsAfterDestroy += publications;
      const observation = deepFreeze({
        timeMs,
        publications,
        before,
        after,
        frameEventCount,
        attemptedCall,
        correlation: {
          frameRevisionDelta,
          publishedTupleChanged,
        },
      });
      postDestroyObservations.push(observation);
      append('post-destroy-advance-observed', {
        caseId,
        timeMs,
        publications,
        cumulativePublications: publicationsAfterDestroy,
        frameEventCount,
        attemptStatus: attemptedCall.status,
      });
      return observation;
    },

    resourceProbe(input: Readonly<{
      caseId: PresentationDynamicsCaseId;
    }>) {
      assertActive(released, 'resourceProbe');
      invariant(input.caseId === caseId, 'resource probe case identity');
      resourceProbeCount += 1;
      append('runtime-observed', { caseId, resourceProbeCount });
      return deepFreeze({
        revision: CORE_V2_PRESENTATION_DYNAMICS_RUNTIME_REVISION,
        caseId,
        ownership: zeroOwnership(),
        state: {
          destroyed,
          lifecycleGeneration,
          scheduleCount: schedules.size,
          destroyMarkCount,
          postDestroyAdvanceCount,
          publicationsAfterDestroy,
        },
        journal: journal.map((entry) => deepFreeze({ ...entry })),
      });
    },
  });

  return Object.freeze({
    product,
    postDestroyProductProbe(): Readonly<Record<string, unknown>> {
      if (cleanupProbe !== null) return cleanupProbe;
      released = true;
      append('runtime-released', {
        caseId,
        destroyed,
        scheduleCount: schedules.size,
        publicationsAfterDestroy,
      });
      cleanupProbe = deepFreeze({
        revision: CORE_V2_PRESENTATION_DYNAMICS_CLEANUP_REVISION,
        caseId,
        runtimeCounts: zeroOwnership(),
        state: {
          destroyed,
          lifecycleGeneration,
          scheduleCount: schedules.size,
          destroyMarkCount,
          postDestroyAdvanceCount,
          publicationsAfterDestroy,
        },
        postDestroy: {
          publications: publicationsAfterDestroy,
          observations: postDestroyObservations.map((entry) => deepFreeze({ ...entry })),
        },
        journal: journal.map((entry) => deepFreeze({ ...entry })),
      });
      return cleanupProbe;
    },
  });
}

function zeroOwnership(): Readonly<Record<string, number>> {
  return Object.freeze({
    activeSessionCount: 0,
    tickerCount: 0,
    schedulerCount: 0,
    listenerCount: 0,
    animationClosureCount: 0,
    pendingWorkCount: 0,
  });
}

function assertActive(released: boolean, operation: string): void {
  invariant(!released, `${operation} requires an active runtime`);
}

function positiveSafeInteger(value: number, label: string): number {
  invariant(Number.isSafeInteger(value) && value > 0, `${label} must be positive`);
  return value;
}

function nonNegativeSafeInteger(value: number, label: string): number {
  invariant(Number.isSafeInteger(value) && value >= 0, `${label} must be non-negative`);
  return value;
}

function publicationObservation(
  value: EnginePublicationObservation,
  label: string,
): EnginePublicationObservation {
  invariant(value !== null && typeof value === 'object', `${label} must be an object`);
  invariant(typeof value.lifecycle === 'string' && value.lifecycle.length > 0, `${label} lifecycle`);
  const tuple = value.publishedTuple;
  invariant(tuple !== null && typeof tuple === 'object', `${label} publishedTuple`);
  return deepFreeze({
    lifecycle: value.lifecycle,
    frameRevision: nonNegativeSafeInteger(value.frameRevision, `${label} frameRevision`),
    publishedTuple: {
      scene: nonNegativeSafeInteger(tuple.scene, `${label} published scene`),
      view: nonNegativeSafeInteger(tuple.view, `${label} published view`),
      interaction: nonNegativeSafeInteger(tuple.interaction, `${label} published interaction`),
    },
  });
}

function attemptObservation(
  value: PostDestroyAttemptObservation,
): PostDestroyAttemptObservation {
  invariant(value !== null && typeof value === 'object', 'post-destroy attemptedCall');
  invariant(value.status === 'completed' || value.status === 'rejected', 'post-destroy attempt status');
  if (value.status === 'completed') return Object.freeze({ status: 'completed' });
  const error = value.error;
  invariant(error !== null && typeof error === 'object', 'post-destroy attempt error');
  for (const [field, member] of [
    ['code', error.code],
    ['category', error.category],
    ['operation', error.operation],
  ] as const) {
    invariant(typeof member === 'string' && member.length > 0, `post-destroy error ${field}`);
  }
  invariant(typeof error.recoverable === 'boolean', 'post-destroy error recoverable');
  invariant(typeof error.retryable === 'boolean', 'post-destroy error retryable');
  return deepFreeze({
    status: 'rejected',
    error: {
      code: error.code,
      category: error.category,
      operation: error.operation,
      recoverable: error.recoverable,
      retryable: error.retryable,
    },
  });
}

function samePublicationTuple(
  left: EnginePublicationObservation['publishedTuple'],
  right: EnginePublicationObservation['publishedTuple'],
): boolean {
  return left.scene === right.scene &&
    left.view === right.view &&
    left.interaction === right.interaction;
}

function finite(value: number, label: string): number {
  invariant(typeof value === 'number' && Number.isFinite(value), `${label} must be finite`);
  return Object.is(value, -0) ? 0 : value;
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid Core v2 presentation dynamics runtime: ${message}`);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
