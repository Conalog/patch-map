import {
  Canvas2DRenderer,
  createCoreScene,
  type CoreOperation,
  type EntityInput,
  type SceneDocument,
} from '../../../src/core-v1/index';
import {
  PRODUCTION_FIXTURE_IDENTITY,
  assertProductionFixtureBytes,
  convertProductionFixture,
  createSyntheticWorkload,
} from '../../../lab/performance-v1/workloads/index';

const EXPECTED_PRODUCTION_ENTITIES = 37_071;
const VIEWPORT = Object.freeze({ width: 960, height: 540, pixelRatio: 1 });

export interface TrialSpec {
  readonly id: string;
  readonly kind: 'synthetic' | 'production';
  readonly entityCount?: number;
  readonly animationFrames: number;
  readonly updateRatio: number;
  readonly seed: number;
}

export interface TrialMetrics {
  readonly workload: string;
  readonly entityCount: number;
  readonly barCount: number;
  readonly normalizeMs: number;
  readonly rendererInitMs: number;
  readonly coreInitMs: number;
  readonly loadMs: number;
  readonly firstFlushMs: number;
  readonly firstFlushCoreCpuMs: number;
  readonly firstFlushCommands: number;
  readonly trustedOperationCount: number;
  readonly trustedCommitMs: number;
  readonly trustedFlushMs: number;
  readonly trustedCommitFlushMs: number;
  readonly randomOperationCount: number;
  readonly randomCommitMs: number;
  readonly randomFlushMs: number;
  readonly randomCommitFlushMs: number;
  readonly animationScheduleMs: number;
  readonly animationFrameMs: readonly number[];
  readonly animationAdvanceMs: readonly number[];
  readonly animationFlushMs: readonly number[];
  readonly hitTestCount: number;
  readonly hitTestHits: number;
  readonly hitTestMs: number;
  readonly postUpdateHitTestHits: number;
  readonly postUpdateHitTestMs: number;
  readonly selectionCount: number;
  readonly selectionCommitFlushMs: number;
  readonly destroyMs: number;
  readonly finalRevision: number;
  readonly invariantCount: number;
}

export interface HarnessApi {
  readonly fixture: {
    readonly bytes: number;
    readonly sha256: string;
    readonly expectedEntities: number;
  };
  runTrial(spec: TrialSpec): TrialMetrics;
  runInvariantSmoke(): Readonly<Record<string, number | boolean>>;
}

declare global {
  interface Window {
    __CORE_V1_SELECTED_PERF__?: HarnessApi;
    __CORE_V1_SELECTED_PERF_READY__?: Promise<HarnessApi>;
  }
}

const status = document.querySelector<HTMLPreElement>('#status');
const surface = document.querySelector<HTMLDivElement>('#surface');
if (!status || !surface) throw new Error('selected performance harness DOM is incomplete');

let productionBytes: Uint8Array;

function now(): number {
  return performance.now();
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Core v1 invariant failed: ${message}`);
}

function normalize(spec: TrialSpec): SceneDocument {
  if (spec.kind === 'production') {
    const input = JSON.parse(new TextDecoder().decode(productionBytes)) as unknown;
    const workload = convertProductionFixture(input);
    assert(
      workload.document.entities.length === EXPECTED_PRODUCTION_ENTITIES,
      `production expands to ${EXPECTED_PRODUCTION_ENTITIES} entities`,
    );
    return workload.document;
  }
  assert(spec.entityCount !== undefined, 'synthetic entity count is present');
  return createSyntheticWorkload(spec.entityCount).document;
}

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function nonRelationEntities(document: SceneDocument): readonly EntityInput[] {
  return document.entities.filter((entity) => entity.kind !== 'relation');
}

function trustedOperations(document: SceneDocument, ratio: number): readonly CoreOperation[] {
  const candidates = nonRelationEntities(document);
  const count = Math.max(1, Math.min(candidates.length, Math.floor(document.entities.length * ratio)));
  const stride = Math.max(1, Math.floor(candidates.length / count));
  const result: CoreOperation[] = [];
  for (let cursor = 0; cursor < candidates.length && result.length < count; cursor += stride) {
    const entity = candidates[cursor];
    if (!entity || entity.kind === 'relation') continue;
    result.push({
      type: 'patch',
      target: entity.id,
      changes: { x: entity.x + 1 + (result.length % 3) },
    });
  }
  return result;
}

function randomValidatedOperations(
  document: SceneDocument,
  ratio: number,
  seed: number,
): readonly CoreOperation[] {
  const targetCount = Math.max(1, Math.min(document.entities.length, Math.floor(document.entities.length * ratio)));
  const random = seeded(seed);
  const selected = new Set<number>();
  while (selected.size < targetCount) selected.add(Math.floor(random() * document.entities.length));
  return [...selected].sort((a, b) => a - b).map((index) => {
    const entity = document.entities[index] as EntityInput;
    return {
      type: 'patch' as const,
      target: entity.id,
      changes: { opacity: 0.55 + random() * 0.4 },
    };
  });
}

function animationOperations(document: SceneDocument): readonly CoreOperation[] {
  return document.entities
    .filter((entity) => entity.kind === 'bar')
    .map((entity) => ({
      type: 'animate' as const,
      target: entity.id,
      property: 'value' as const,
      to: entity.value > ((entity.min ?? 0) + (entity.max ?? 1)) / 2 ? (entity.min ?? 0) : (entity.max ?? 1),
      durationMs: 240,
      easing: 'linear' as const,
    }));
}

function hitPoints(document: SceneDocument, limit = 128): readonly { x: number; y: number }[] {
  const candidates = nonRelationEntities(document).filter((entity) => entity.visible !== false);
  const count = Math.min(limit, candidates.length);
  const stride = Math.max(1, Math.floor(candidates.length / Math.max(1, count)));
  const points: { x: number; y: number }[] = [];
  for (let cursor = 0; cursor < candidates.length && points.length < count; cursor += stride) {
    const entity = candidates[cursor];
    if (!entity || entity.kind === 'relation') continue;
    points.push({ x: entity.x + entity.width / 2, y: entity.y + entity.height / 2 });
  }
  return points;
}

function runTrial(spec: TrialSpec): TrialMetrics {
  let invariantCount = 0;
  const normalizeStarted = now();
  const document = normalize(spec);
  const normalizeMs = now() - normalizeStarted;
  const entityCount = document.entities.length;
  const firstInput = document.entities[0];
  const inputSentinel = firstInput === undefined ? '' : JSON.stringify(firstInput);

  const canvas = documentGlobal().createElement('canvas');
  surface.replaceChildren(canvas);
  const rendererStarted = now();
  const renderer = new Canvas2DRenderer(canvas, VIEWPORT);
  const rendererInitMs = now() - rendererStarted;

  const coreStarted = now();
  const scene = createCoreScene({ renderer, initialCapacity: entityCount, eventLimit: 16 });
  const coreInitMs = now() - coreStarted;

  const loadStarted = now();
  const load = scene.load(document);
  const loadMs = now() - loadStarted;
  assert(load.entityCount === entityCount, 'load reports every normalized entity');
  assert(scene.entityCount === entityCount, 'authoritative entity count matches input');
  invariantCount += 2;

  const firstFlushStarted = now();
  const firstFrame = scene.flush();
  const firstFlushMs = now() - firstFlushStarted;
  assert(firstFrame.rendered, 'first flush publishes a frame');
  assert(firstFrame.commandCount > 0, 'first flush submits aggregate commands');
  invariantCount += 2;

  const points = hitPoints(document);
  const hitStarted = now();
  const hits = points.map((point) => scene.hitTest(point));
  const hitTestMs = now() - hitStarted;
  const hitRefs = hits.filter((ref) => ref !== null);
  assert(points.length > 0 && hitRefs.length > 0, 'hit testing reaches visible entities');
  invariantCount += 1;

  const selectionTargets = hitRefs.slice(0, 32);
  const selectionStarted = now();
  scene.commit({
    operations: [{ type: 'selection', targets: selectionTargets, mode: 'replace' }],
    recordHistory: false,
  });
  scene.flush();
  const selectionCommitFlushMs = now() - selectionStarted;
  assert(scene.selection().refs.length > 0, 'selection is published through the batch API');
  invariantCount += 1;

  const trusted = trustedOperations(document, spec.updateRatio);
  const trustedStarted = now();
  const trustedCommitStarted = now();
  const trustedResult = scene.commit({ operations: trusted, recordHistory: false });
  const trustedCommitMs = now() - trustedCommitStarted;
  const trustedSample = trusted[0];
  if (trustedSample?.type === 'patch' && typeof trustedSample.target === 'string') {
    const snapshot = scene.get(trustedSample.target);
    assert(snapshot !== null, 'trusted commit is synchronously queryable before flush');
    invariantCount += 1;
  }
  const trustedFlushStarted = now();
  const trustedFrame = scene.flush();
  const trustedFlushMs = now() - trustedFlushStarted;
  const trustedCommitFlushMs = now() - trustedStarted;
  assert(trustedResult.operationCount === trusted.length, 'trusted batch operation count is exact');
  assert(trustedFrame.revision === trustedResult.revision, 'trusted state/frame revision boundary is explicit');
  invariantCount += 2;

  const random = randomValidatedOperations(document, spec.updateRatio, spec.seed);
  const randomStarted = now();
  const randomCommitStarted = now();
  const randomResult = scene.commit({ operations: random, recordHistory: false });
  const randomCommitMs = now() - randomCommitStarted;
  const randomFlushStarted = now();
  const randomFrame = scene.flush();
  const randomFlushMs = now() - randomFlushStarted;
  const randomCommitFlushMs = now() - randomStarted;
  assert(randomResult.operationCount === random.length, 'random validated batch operation count is exact');
  assert(randomFrame.revision === randomResult.revision, 'random state/frame revision boundary is explicit');
  invariantCount += 2;

  const postUpdateHitStarted = now();
  const postUpdateHits = points.map((point) => scene.hitTest(point));
  const postUpdateHitTestMs = now() - postUpdateHitStarted;
  const postUpdateHitRefs = postUpdateHits.filter((ref) => ref !== null);
  assert(postUpdateHitRefs.length > 0, 'post-update hit testing refreshes authoritative spatial state');
  invariantCount += 1;

  const animations = animationOperations(document);
  const animationScheduleStarted = now();
  if (animations.length > 0) scene.commit({ operations: animations, recordHistory: false });
  const animationScheduleMs = now() - animationScheduleStarted;
  const animationFrameMs: number[] = [];
  const animationAdvanceMs: number[] = [];
  const animationFlushMs: number[] = [];
  for (let frame = 0; frame < spec.animationFrames; frame += 1) {
    const frameStarted = now();
    const advanceStarted = now();
    scene.advance((frame + 1) * (240 / spec.animationFrames));
    animationAdvanceMs.push(now() - advanceStarted);
    const flushStarted = now();
    scene.flush();
    animationFlushMs.push(now() - flushStarted);
    animationFrameMs.push(now() - frameStarted);
  }
  assert(scene.activeAnimations === 0, 'animation reaches its explicit final frame');
  invariantCount += 1;

  assert(firstInput === undefined || JSON.stringify(firstInput) === inputSentinel, 'input object remains unchanged');
  invariantCount += 1;
  const finalRevision = scene.revision;
  const destroyStarted = now();
  const firstDestroy = scene.destroy();
  const secondDestroy = scene.destroy();
  const destroyMs = now() - destroyStarted;
  canvas.remove();
  assert(firstDestroy && !secondDestroy, 'destroy is idempotent');
  invariantCount += 1;

  return {
    workload: spec.id,
    entityCount,
    barCount: animations.length,
    normalizeMs,
    rendererInitMs,
    coreInitMs,
    loadMs,
    firstFlushMs,
    firstFlushCoreCpuMs: firstFrame.cpuMs,
    firstFlushCommands: firstFrame.commandCount,
    trustedOperationCount: trusted.length,
    trustedCommitMs,
    trustedFlushMs,
    trustedCommitFlushMs,
    randomOperationCount: random.length,
    randomCommitMs,
    randomFlushMs,
    randomCommitFlushMs,
    animationScheduleMs,
    animationFrameMs,
    animationAdvanceMs,
    animationFlushMs,
    hitTestCount: points.length,
    hitTestHits: hitRefs.length,
    hitTestMs,
    postUpdateHitTestHits: postUpdateHitRefs.length,
    postUpdateHitTestMs,
    selectionCount: selectionTargets.length,
    selectionCommitFlushMs,
    destroyMs,
    finalRevision,
    invariantCount,
  };
}

function runInvariantSmoke(): Readonly<Record<string, number | boolean>> {
  const workload = createSyntheticWorkload(100);
  const canvas = documentGlobal().createElement('canvas');
  const renderer = new Canvas2DRenderer(canvas, VIEWPORT);
  const scene = createCoreScene({ renderer });
  scene.load(workload.document);
  const frame = scene.flush();
  const revision = scene.revision;
  let atomicFailure = false;
  try {
    scene.commit({ operations: [{ type: 'patch', target: 'missing:id', changes: { x: 1 } }] });
  } catch {
    atomicFailure = scene.revision === revision && scene.entityCount === 100;
  }
  const destroyed = scene.destroy();
  const idempotent = scene.destroy() === false;
  return Object.freeze({
    entityCount: 100,
    firstFrameRendered: frame.rendered,
    firstFrameCommands: frame.commandCount,
    atomicFailure,
    destroyed,
    idempotent,
  });
}

function documentGlobal(): Document {
  return globalThis.document;
}

async function boot(): Promise<HarnessApi> {
  const response = await fetch('/lab/fixtures/production-like.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`production fixture fetch failed: ${response.status}`);
  productionBytes = new Uint8Array(await response.arrayBuffer());
  const fixture = await assertProductionFixtureBytes(productionBytes);
  const api: HarnessApi = Object.freeze({
    fixture: Object.freeze({ ...fixture, expectedEntities: EXPECTED_PRODUCTION_ENTITIES }),
    runTrial,
    runInvariantSmoke,
  });
  window.__CORE_V1_SELECTED_PERF__ = api;
  status.textContent = `ready · fixture ${fixture.bytes} bytes · ${fixture.sha256}`;
  return api;
}

window.__CORE_V1_SELECTED_PERF_READY__ = boot().catch((error: unknown) => {
  status.textContent = error instanceof Error ? error.stack ?? error.message : String(error);
  throw error;
});

void PRODUCTION_FIXTURE_IDENTITY;
