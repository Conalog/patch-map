import { Texture } from 'pixi.js';

import {
  PatchMapAssetError,
  type PatchMapAssetBackend,
  type PatchMapAssetBackendRequest,
  type PatchMapAssetPolicy,
  type PatchMapAssetPolicyContext,
  type PatchMapAssetRegistration,
  type PatchMapAssetRegistrationResult,
} from '../../src/assets/contracts';
import { PatchMapAssetRuntime } from '../../src/assets';
import type { PatchMapAssetDescriptor } from '../../src/semantic/dataset/contracts';

const INSTANCE_ID = 'ren-005-images-engine';
const FIXTURE_ALIAS = 'fixture-image';
const FIXTURE_ALIAS_SOURCE = 'fixture://fixture-image-80x40.svg';
const DIRECT_URL_SOURCE = 'https://assets.example.test/image.png';
const DESCRIPTOR_SOURCE = 'https://assets.example.test/image.svg';
const FAILED_SOURCE = 'fixture://failed-image.png';
const DATA_URI_SOURCE =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%228%22/%3E';

const FIXTURE_REGISTRATIONS: readonly PatchMapAssetRegistration[] = Object.freeze([
  Object.freeze({
    alias: FIXTURE_ALIAS,
    descriptor: FIXTURE_ALIAS_SOURCE,
    kind: 'image' as const,
  }),
]);

type FixtureRequestKind = 'alias' | 'url' | 'descriptor' | 'data-uri' | 'failed';
type FixtureRequestState = 'pending' | 'resolved' | 'rejected' | 'unloaded';

interface FixtureDescription {
  readonly kind: FixtureRequestKind;
  readonly normalizedResourceIdentity: string;
  readonly cacheIdentity: string;
}

interface FixtureRequestRecord {
  readonly token: string;
  readonly key: string;
  readonly request: PatchMapAssetBackendRequest;
  readonly description: FixtureDescription;
  state: FixtureRequestState;
  completion: Deferred<Texture> | null;
}

interface ControlledRequestRecord {
  readonly requestId: string;
  readonly targetId: string;
  readonly completeAtMs: number;
  readonly fixtureRequestToken: string;
  readonly generation: number;
  readonly bindingKey: string;
  terminalAttempt: ControlledAttemptEvidence | null;
}

interface ControlledAttemptEvidence {
  readonly generation: number;
  readonly bindingKey: string;
  readonly sourceCacheIdentity: string;
  readonly state: string;
  readonly attachmentState: string;
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason?: unknown): void;
}

interface RenderImagesEngine {
  registerAssets(
    instanceId: string,
    registrations: readonly PatchMapAssetRegistration[],
  ): PatchMapAssetRegistrationResult;
  snapshot(): unknown;
  sceneImageProbe(): unknown;
}

export interface PatchMapRenderImagesProductAdapter {
  registerFixtureAssets(engine: unknown): Readonly<Record<string, unknown>>;
  settleImmediateAssets(): Promise<Readonly<Record<string, unknown>>>;
  bindControlledRequest(input: unknown): Readonly<Record<string, unknown>>;
  completeControlledRequest(input: unknown): Promise<Readonly<Record<string, unknown>>>;
  requestProbe(): Readonly<Record<string, unknown>>;
}

export interface PatchMapRenderImagesRuntime {
  readonly assetRuntime: PatchMapAssetRuntime;
  readonly assetPolicy: PatchMapAssetPolicy;
  readonly product: PatchMapRenderImagesProductAdapter;
  postDestroyProductProbe(): Readonly<Record<string, unknown>>;
}

/**
 * Creates an isolated REN-005 asset runtime. Every successful decode returns
 * Pixi's public WHITE texture, so the focused route exercises real Texture and
 * Sprite ownership without issuing a network request.
 */
export function createPatchMapRenderImagesRuntime(): PatchMapRenderImagesRuntime {
  const backend = new RenderImagesFixtureBackend();
  const assetRuntime = new PatchMapAssetRuntime(backend);
  const assetPolicy: PatchMapAssetPolicy = (context) => validateFixturePolicy(context);
  const controlled = new Map<string, ControlledRequestRecord>();
  const product = createProductAdapter(assetRuntime, backend, controlled);
  return Object.freeze({
    assetRuntime,
    assetPolicy,
    product,
    postDestroyProductProbe(): Readonly<Record<string, unknown>> {
      return projectPostDestroyProductProbe(assetRuntime, backend, controlled);
    },
  });
}

class RenderImagesFixtureBackend implements PatchMapAssetBackend {
  public readonly keyNamespace = 'patch-map-ren-005-fixture-assets/1';

  private readonly recordsByKey = new Map<string, FixtureRequestRecord>();
  private readonly recordsByToken = new Map<string, FixtureRequestRecord>();
  private readonly journalValue: Readonly<Record<string, unknown>>[] = [];
  private requestSequence = 0;
  private journalSequence = 0;

  public get(request: PatchMapAssetBackendRequest): unknown {
    const record = this.ensureRecord(request);
    this.append(record, 'lookup-miss');
    return undefined;
  }

  public load(request: PatchMapAssetBackendRequest): Promise<unknown> {
    const record = this.ensureRecord(request);
    invariant(record.state === 'pending', `request ${record.token} loads once`);
    this.append(record, 'load-start');
    if (record.description.kind === 'descriptor') {
      const completion = deferred<Texture>();
      record.completion = completion;
      return completion.promise;
    }
    if (record.description.kind === 'failed') {
      record.state = 'rejected';
      this.append(record, 'load-rejected');
      return Promise.reject(
        new PatchMapAssetError('ASSET_LOAD_FAILED', 'ASSET_FAILURE', true),
      );
    }
    record.state = 'resolved';
    this.append(record, 'load-resolved');
    return Promise.resolve(Texture.WHITE);
  }

  public describe(
    request: PatchMapAssetBackendRequest,
    resource: unknown,
  ): Readonly<{ readonly normalizedResourceIdentity: string; readonly cacheIdentity: string }> {
    invariant(resource === Texture.WHITE, 'fixture decoder returns Pixi Texture.WHITE');
    const record = this.recordsByKey.get(request.key);
    invariant(record !== undefined, 'described request exists');
    return Object.freeze({
      normalizedResourceIdentity: record.description.normalizedResourceIdentity,
      cacheIdentity: record.description.cacheIdentity,
    });
  }

  public unload(key: string): Promise<void> {
    const record = this.recordsByKey.get(key);
    invariant(record !== undefined, 'unload owns a fixture request');
    invariant(record.state === 'resolved', 'only resolved fixture requests unload');
    record.state = 'unloaded';
    record.completion = null;
    this.append(record, 'unload');
    return Promise.resolve();
  }

  public pendingDescriptor(): FixtureRequestRecord {
    const pending = [...this.recordsByToken.values()].filter(
      ({ description, state }) => description.kind === 'descriptor' && state === 'pending',
    );
    invariant(pending.length === 1, 'one controlled descriptor request is pending');
    return pending[0]!;
  }

  public complete(token: string): void {
    const record = this.recordsByToken.get(token);
    invariant(record !== undefined, `controlled request ${token} exists`);
    invariant(record.description.kind === 'descriptor', 'controlled request is a descriptor');
    invariant(record.state === 'pending' && record.completion !== null, 'controlled request is pending');
    record.state = 'resolved';
    this.append(record, 'load-resolved');
    record.completion.resolve(Texture.WHITE);
  }

  public request(token: string): FixtureRequestRecord {
    const record = this.recordsByToken.get(token);
    invariant(record !== undefined, `fixture request ${token} exists`);
    return record;
  }

  public hasUncontrolledPending(): boolean {
    return [...this.recordsByToken.values()].some(
      ({ description, state }) => state === 'pending' && description.kind !== 'descriptor',
    );
  }

  public probe(): Readonly<Record<string, unknown>> {
    const records = [...this.recordsByToken.values()];
    return deepFreeze({
      requestCount: records.length,
      pendingCount: records.filter(({ state }) => state === 'pending').length,
      resolvedCount: records.filter(({ state }) => state === 'resolved').length,
      rejectedCount: records.filter(({ state }) => state === 'rejected').length,
      unloadedCount: records.filter(({ state }) => state === 'unloaded').length,
      requests: records.map(({ token, key, description, state }) => ({
        token,
        key,
        kind: description.kind,
        state,
        normalizedResourceIdentity: description.normalizedResourceIdentity,
        cacheIdentity: description.cacheIdentity,
      })),
      journal: [...this.journalValue],
    });
  }

  private ensureRecord(request: PatchMapAssetBackendRequest): FixtureRequestRecord {
    const existing = this.recordsByKey.get(request.key);
    if (existing) return existing;
    const record: FixtureRequestRecord = {
      token: `image-request-${++this.requestSequence}`,
      key: request.key,
      request,
      description: describeFixture(request.descriptor),
      state: 'pending',
      completion: null,
    };
    this.recordsByKey.set(record.key, record);
    this.recordsByToken.set(record.token, record);
    return record;
  }

  private append(record: FixtureRequestRecord, event: string): void {
    this.journalValue.push(deepFreeze({
      sequence: ++this.journalSequence,
      event,
      requestToken: record.token,
      requestKey: record.key,
      kind: record.description.kind,
      state: record.state,
    }));
  }
}

function createProductAdapter(
  assetRuntime: PatchMapAssetRuntime,
  backend: RenderImagesFixtureBackend,
  controlled: Map<string, ControlledRequestRecord>,
): PatchMapRenderImagesProductAdapter {
  let engine: RenderImagesEngine | null = null;

  return Object.freeze({
    registerFixtureAssets(engineValue: unknown): Readonly<Record<string, unknown>> {
      const selected = requireEngine(engineValue);
      invariant(engine === null || engine === selected, 'one engine per render-images run');
      engine = selected;
      const result = selected.registerAssets(INSTANCE_ID, FIXTURE_REGISTRATIONS);
      return deepFreeze({
        registeredAliases: [...result.registeredAliases],
        duplicateAliases: [...result.duplicateAliases],
        fixtureDescriptor: FIXTURE_ALIAS_SOURCE,
      });
    },

    async settleImmediateAssets(): Promise<Readonly<Record<string, unknown>>> {
      const selected = requireCurrentEngine(engine);
      await pollEngine(selected, () => {
        if (backend.hasUncontrolledPending()) return false;
        const probe = requireImageProbe(selected.sceneImageProbe());
        return immediateImagesSettled(probe);
      }, 'immediate image assets');
      return deepFreeze({ settled: true, requestProbe: backend.probe() });
    },

    bindControlledRequest(inputValue: unknown): Readonly<Record<string, unknown>> {
      const selected = requireCurrentEngine(engine);
      const input = requireRecord(inputValue, 'controlled request');
      const targetId = requireString(input.targetId, 'controlled targetId');
      const requestId = requireString(input.requestId, 'controlled requestId');
      const completeAtMs = requireFinite(input.completeAtMs, 'controlled completeAtMs');
      invariant(!controlled.has(requestId), `controlled request ${requestId} is unique`);
      const request = backend.pendingDescriptor();
      const probe = requireImageProbe(selected.sceneImageProbe());
      const attempt = requireCurrentPendingAttempt(
        probe,
        targetId,
        request.description.cacheIdentity,
      );
      const controlledRequest: ControlledRequestRecord = {
        requestId,
        targetId,
        completeAtMs,
        fixtureRequestToken: request.token,
        generation: attempt.generation,
        bindingKey: attempt.bindingKey,
        terminalAttempt: null,
      };
      controlled.set(requestId, controlledRequest);
      return projectControlled(controlledRequest, selected, backend);
    },

    async completeControlledRequest(
      inputValue: unknown,
    ): Promise<Readonly<Record<string, unknown>>> {
      const selected = requireCurrentEngine(engine);
      const input = requireRecord(inputValue, 'controlled completion');
      const requestId = requireString(input.requestId, 'completion requestId');
      const timeMs = requireFinite(input.timeMs, 'completion timeMs');
      const request = controlled.get(requestId);
      invariant(request !== undefined, `controlled request ${requestId} exists`);
      invariant(request.terminalAttempt === null, `controlled request ${requestId} completes once`);
      invariant(timeMs === request.completeAtMs, 'controlled completion time');
      backend.complete(request.fixtureRequestToken);
      await pollEngine(selected, () => {
        const evidence = controlledEvidence(request, selected, backend);
        if (evidence.state !== 'stale-discarded') return false;
        request.terminalAttempt = Object.freeze({
          generation: evidence.generation,
          bindingKey: evidence.bindingKey,
          sourceCacheIdentity: requireString(
            evidence.sourceCacheIdentity,
            'controlled sourceCacheIdentity',
          ),
          state: evidence.attemptState,
          attachmentState: evidence.attachmentState,
        });
        return backendPendingCount(backend.probe()) === 0;
      }, 'stale descriptor completion');
      return projectControlled(request, selected, backend);
    },

    requestProbe(): Readonly<Record<string, unknown>> {
      const backendProbe = backend.probe();
      const values = [...controlled.values()].map((request) => (
        controlledEvidence(request, requireCurrentEngine(engine), backend)
      ));
      const runtimeProbe = assetRuntime.probe();
      return deepFreeze({
        pendingCount: values.filter(({ state }) => state === 'pending').length,
        completedCount: values.filter(({ state }) => state === 'stale-discarded').length,
        staleCompletionCount: values.filter(({ state }) => state === 'stale-discarded').length,
        attachedCount: values.filter(({ attached }) => attached).length,
        retainedPendingCount: backendPendingCount(backendProbe),
        controlledRequests: values,
        runtime: projectAssetRuntimeTotals(runtimeProbe),
        backend: backendProbe,
      });
    },
  });
}

function validateFixturePolicy(context: PatchMapAssetPolicyContext): void {
  if (context.packageOwned) return;
  try {
    describeFixture(context.descriptor);
  } catch {
    throw new PatchMapAssetError('ASSET_POLICY_REJECTED', 'ASSET_FAILURE', false);
  }
}

function describeFixture(descriptor: PatchMapAssetDescriptor): FixtureDescription {
  const keys = Object.keys(descriptor).sort();
  if (keys.length === 1 && descriptor.src === FIXTURE_ALIAS_SOURCE) {
    return Object.freeze({
      kind: 'alias',
      normalizedResourceIdentity: 'fixture-image@1',
      cacheIdentity: `alias:${FIXTURE_ALIAS}`,
    });
  }
  if (keys.length === 1 && descriptor.src === DIRECT_URL_SOURCE) {
    return Object.freeze({
      kind: 'url',
      normalizedResourceIdentity: `${fixtureStem(descriptor.src)}-64x32@1`,
      cacheIdentity: `url:${descriptor.src}`,
    });
  }
  if (isResolutionTwoDescriptor(descriptor)) {
    const resolution = requireFinite(descriptor.data?.resolution, 'descriptor resolution');
    return Object.freeze({
      kind: 'descriptor',
      normalizedResourceIdentity: `fixture-svg-${sourceBasename(descriptor.src)}@resolution-${resolution}`,
      cacheIdentity: `descriptor:${descriptor.src}?resolution=${resolution}`,
    });
  }
  if (keys.length === 1 && descriptor.src === DATA_URI_SOURCE) {
    const dimensions = dataUriDimensions(descriptor.src);
    const stem = `fixture-data-uri-svg-${dimensions[0]}x${dimensions[1]}`;
    return Object.freeze({
      kind: 'data-uri',
      normalizedResourceIdentity: `${stem}@1`,
      cacheIdentity: `data-uri:${stem}`,
    });
  }
  if (keys.length === 1 && descriptor.src === FAILED_SOURCE) {
    return Object.freeze({
      kind: 'failed',
      normalizedResourceIdentity: 'fixture-failed-image@rejected',
      cacheIdentity: `url:${descriptor.src}`,
    });
  }
  throw new TypeError('unsupported REN-005 fixture descriptor');
}

function isResolutionTwoDescriptor(descriptor: PatchMapAssetDescriptor): boolean {
  if (descriptor.src !== DESCRIPTOR_SOURCE) return false;
  if (!descriptor.data || Object.keys(descriptor.data).length !== 1) return false;
  if (Object.keys(descriptor).sort().join(',') !== 'data,src') return false;
  return descriptor.data.resolution === 2;
}

function fixtureStem(source: string): string {
  return `fixture-${source === DIRECT_URL_SOURCE ? 'url-' : ''}${sourceBasename(source)}`;
}

function sourceBasename(source: string): string {
  const match = /\/([^/?#]+)\.[a-z0-9]+(?:[?#]|$)/iu.exec(source);
  invariant(match?.[1] !== undefined, 'fixture source basename');
  return match[1];
}

function dataUriDimensions(source: string): readonly [number, number] {
  const decoded = decodeURIComponent(source.slice(source.indexOf(',') + 1));
  const width = /\bwidth=["'](\d+(?:\.\d+)?)["']/u.exec(decoded)?.[1];
  const height = /\bheight=["'](\d+(?:\.\d+)?)["']/u.exec(decoded)?.[1];
  invariant(width !== undefined && height !== undefined, 'data URI intrinsic dimensions');
  return Object.freeze([Number(width), Number(height)]);
}

function requireEngine(value: unknown): RenderImagesEngine {
  invariant(isObjectLike(value), 'render-images engine');
  const candidate = value as Partial<RenderImagesEngine>;
  for (const method of ['registerAssets', 'snapshot', 'sceneImageProbe'] as const) {
    invariant(typeof candidate[method] === 'function', `engine ${method}()`);
  }
  return candidate as RenderImagesEngine;
}

function requireCurrentEngine(value: RenderImagesEngine | null): RenderImagesEngine {
  invariant(value !== null, 'fixture assets are registered before inspection');
  return value;
}

async function pollEngine(
  engine: RenderImagesEngine,
  predicate: () => boolean,
  label: string,
): Promise<void> {
  for (let attempt = 0; attempt < 256; attempt += 1) {
    const snapshot = requireRecord(engine.snapshot(), 'engine snapshot');
    invariant(snapshot.lifecycle === 'scene-ready', `${label} scene lifecycle`);
    if (predicate()) return;
    await Promise.resolve();
    if (attempt % 32 === 31) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  throw new Error(`PatchMap REN-005 runtime timed out waiting for ${label}`);
}

function requireImageProbe(value: unknown): Readonly<Record<string, unknown>> {
  const probe = requireRecord(value, 'scene image probe');
  requireRecord(probe.images, 'scene image records');
  return probe;
}

function immediateImagesSettled(probe: Readonly<Record<string, unknown>>): boolean {
  const images = requireRecord(probe.images, 'scene image records');
  for (const id of ['alias', 'url', 'data-uri', 'transformed']) {
    const image = optionalRecord(images[id]);
    if (!image || image.state !== 'resolved') return false;
  }
  const failed = optionalRecord(images['failed-image']);
  if (!failed || failed.state !== 'failed') return false;
  const hidden = optionalRecord(images['hidden-image']);
  if (!hidden || hidden.active !== false || hidden.renderObjectCount !== 0) return false;
  const descriptor = optionalRecord(images.descriptor);
  if (!descriptor) return false;
  if (descriptor.authoredSource === FIXTURE_ALIAS && descriptor.state !== 'resolved') return false;
  return true;
}

function requireCurrentPendingAttempt(
  probe: Readonly<Record<string, unknown>>,
  targetId: string,
  sourceCacheIdentity: string,
): ControlledAttemptEvidence {
  const target = targetImage(probe, targetId);
  const generation = requirePositiveInteger(target.generation, `${targetId} generation`);
  const matches = attempts(target).filter((attempt) => (
    attempt.generation === generation &&
    attempt.sourceCacheIdentity === sourceCacheIdentity &&
    attempt.state === 'pending' &&
    attempt.attachmentState === 'current'
  ));
  invariant(matches.length === 1, `${targetId} has one exact current pending attempt`);
  return projectAttempt(matches[0]!);
}

function controlledEvidence(
  request: ControlledRequestRecord,
  engine: RenderImagesEngine,
  backend: RenderImagesFixtureBackend,
): Readonly<Record<string, unknown>> & {
  readonly state: 'pending' | 'stale-discarded';
  readonly attached: boolean;
  readonly generation: number;
  readonly bindingKey: string;
  readonly attemptState: string;
  readonly attachmentState: string;
} {
  const target = targetImage(requireImageProbe(engine.sceneImageProbe()), request.targetId);
  const matches = attempts(target).filter((attempt) => (
    attempt.generation === request.generation && attempt.bindingKey === request.bindingKey
  ));
  invariant(matches.length === 1, `${request.requestId} exact product attempt remains observable`);
  const attempt = projectAttempt(matches[0]!);
  const backendRequest = backend.request(request.fixtureRequestToken);
  invariant(
    backendRequest.description.cacheIdentity === attempt.sourceCacheIdentity,
    `${request.requestId} backend/product source identity`,
  );

  const pending = attempt.state === 'pending' &&
    (attempt.attachmentState === 'current' || attempt.attachmentState === 'stale') &&
    (backendRequest.state === 'pending' ||
      backendRequest.state === 'resolved' ||
      backendRequest.state === 'unloaded');
  const stale = (backendRequest.state === 'resolved' || backendRequest.state === 'unloaded') &&
    attempt.state === 'resolved' && attempt.attachmentState === 'stale';
  invariant(pending || stale, `${request.requestId} exact attempt/backend state transition`);

  return deepFreeze({
    requestId: request.requestId,
    targetId: request.targetId,
    completeAtMs: request.completeAtMs,
    generation: request.generation,
    bindingKey: request.bindingKey,
    sourceCacheIdentity: attempt.sourceCacheIdentity,
    backendToken: request.fixtureRequestToken,
    backendKey: backendRequest.key,
    backendState: backendRequest.state,
    attemptState: attempt.state,
    attachmentState: attempt.attachmentState,
    state: pending ? 'pending' : 'stale-discarded',
    attached: attempt.state === 'resolved' && attempt.attachmentState === 'current',
    retainedPendingCount: backendRequest.state === 'pending' ? 1 : 0,
    retainedLeaseCount: backendRequest.state === 'unloaded' ? 0 : 1,
  });
}

function targetImage(
  probe: Readonly<Record<string, unknown>>,
  targetId: string,
): Readonly<Record<string, unknown>> {
  const images = requireRecord(probe.images, 'scene image records');
  const target = optionalRecord(images[targetId]);
  invariant(target !== null, `scene image ${targetId}`);
  return target;
}

function attempts(target: Readonly<Record<string, unknown>>): readonly Readonly<Record<string, unknown>>[] {
  if (!Array.isArray(target.attempts)) return [];
  return target.attempts.map((value, index) => requireRecord(value, `image attempt ${index}`));
}

function projectControlled(
  request: ControlledRequestRecord,
  engine: RenderImagesEngine,
  backend: RenderImagesFixtureBackend,
): Readonly<Record<string, unknown>> {
  return controlledEvidence(request, engine, backend);
}

function projectAttempt(
  value: Readonly<Record<string, unknown>>,
): ControlledAttemptEvidence {
  return Object.freeze({
    generation: requirePositiveInteger(value.generation, 'attempt generation'),
    bindingKey: requireString(value.bindingKey, 'attempt bindingKey'),
    sourceCacheIdentity: requireString(value.sourceCacheIdentity, 'attempt sourceCacheIdentity'),
    state: requireString(value.state, 'attempt state'),
    attachmentState: requireString(value.attachmentState, 'attempt attachmentState'),
  });
}

function projectAssetRuntimeTotals(
  value: unknown,
): Readonly<Record<string, number>> {
  const probe = requireRecord(value, 'asset runtime probe');
  return Object.freeze({
    resourceCount: requireNonNegativeInteger(probe.resourceCount, 'asset resourceCount'),
    pendingCount: requireNonNegativeInteger(probe.pendingCount, 'asset pendingCount'),
    leaseCount: requireNonNegativeInteger(probe.leaseCount, 'asset leaseCount'),
    cleanupPendingCount: requireNonNegativeInteger(
      probe.cleanupPendingCount,
      'asset cleanupPendingCount',
    ),
  });
}

function projectPostDestroyProductProbe(
  assetRuntime: PatchMapAssetRuntime,
  backend: RenderImagesFixtureBackend,
  controlled: ReadonlyMap<string, ControlledRequestRecord>,
): Readonly<Record<string, unknown>> {
  const runtime = projectAssetRuntimeTotals(assetRuntime.probe());
  for (const [field, value] of Object.entries(runtime)) {
    invariant(value === 0, `post-destroy asset runtime ${field} is zero`);
  }

  const backendProbe = backend.probe();
  const requests = requireRecordArray(backendProbe.requests, 'backend requests');
  const journal = requireRecordArray(backendProbe.journal, 'backend journal');
  invariant(backendPendingCount(backendProbe) === 0, 'post-destroy backend pending count');
  invariant(requireNonNegativeInteger(
    backendProbe.resolvedCount,
    'backend resolvedCount',
  ) === 0, 'post-destroy backend live resolved count');
  invariant(requests.length === 5, 'post-destroy backend request inventory');

  const unloadedTokens = requests
    .filter(({ state }) => state === 'unloaded')
    .map(({ token }) => requireString(token, 'unloaded request token'))
    .sort();
  const rejectedTokens = requests
    .filter(({ state }) => state === 'rejected')
    .map(({ token }) => requireString(token, 'rejected request token'))
    .sort();
  const journalUnloadTokens = journal
    .filter(({ event }) => event === 'unload')
    .map(({ requestToken }) => requireString(requestToken, 'journal unload token'))
    .sort();
  const journalRejectedTokens = journal
    .filter(({ event }) => event === 'load-rejected')
    .map(({ requestToken }) => requireString(requestToken, 'journal rejected token'))
    .sort();
  invariant(unloadedTokens.length === 4, 'post-destroy successful request unload count');
  invariant(rejectedTokens.length === 1, 'post-destroy rejected request count');
  invariant(sameStrings(unloadedTokens, journalUnloadTokens), 'post-destroy unload journal');
  invariant(sameStrings(rejectedTokens, journalRejectedTokens), 'post-destroy rejected journal');

  const controlledRequests = [...controlled.values()].map((request) => {
    invariant(request.terminalAttempt !== null, `${request.requestId} terminal attempt captured`);
    const backendRequest = backend.request(request.fixtureRequestToken);
    invariant(
      backendRequest.description.cacheIdentity === request.terminalAttempt.sourceCacheIdentity,
      `${request.requestId} cleanup backend/product source identity`,
    );
    invariant(backendRequest.state === 'unloaded', `${request.requestId} cleanup backend unloaded`);
    invariant(
      request.terminalAttempt.generation === request.generation &&
      request.terminalAttempt.bindingKey === request.bindingKey &&
      request.terminalAttempt.sourceCacheIdentity === backendRequest.description.cacheIdentity &&
      request.terminalAttempt.state === 'resolved' &&
      request.terminalAttempt.attachmentState === 'stale',
      `${request.requestId} cleanup exact stale attempt`,
    );
    return deepFreeze({
      requestId: request.requestId,
      targetId: request.targetId,
      generation: request.generation,
      bindingKey: request.bindingKey,
      sourceCacheIdentity: request.terminalAttempt.sourceCacheIdentity,
      backendToken: request.fixtureRequestToken,
      backendKey: backendRequest.key,
      backendState: backendRequest.state,
      attemptState: request.terminalAttempt.state,
      attachmentState: request.terminalAttempt.attachmentState,
      retainedPendingCount: 0,
      retainedLeaseCount: 0,
    });
  });
  invariant(controlledRequests.length === 1, 'one controlled request cleanup record');

  return deepFreeze({
    revision: 'patch-map-ren-005-product-cleanup/1',
    assetRuntime: runtime,
    backend: {
      requestCount: requests.length,
      pendingCount: 0,
      resolvedLiveResourceCount: 0,
      unloadedCount: unloadedTokens.length,
      rejectedCount: rejectedTokens.length,
      requests,
    },
    controlledRequests,
    journal: {
      unloadRequestTokens: unloadedTokens,
      rejectedRequestTokens: rejectedTokens,
      entries: journal,
    },
  });
}

function backendPendingCount(probe: Readonly<Record<string, unknown>>): number {
  return requireFinite(probe.pendingCount, 'backend pendingCount');
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function requireRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  invariant(isRecord(value), `${label} is an object`);
  return value;
}

function optionalRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return isRecord(value) ? value : null;
}

function requireString(value: unknown, label: string): string {
  invariant(typeof value === 'string' && value.length > 0, `${label} is a string`);
  return value;
}

function requireFinite(value: unknown, label: string): number {
  invariant(typeof value === 'number' && Number.isFinite(value), `${label} is finite`);
  return value;
}

function requirePositiveInteger(value: unknown, label: string): number {
  invariant(Number.isInteger(value) && Number(value) > 0, `${label} is a positive integer`);
  return Number(value);
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  invariant(Number.isInteger(value) && Number(value) >= 0, `${label} is a non-negative integer`);
  return Number(value);
}

function requireRecordArray(
  value: unknown,
  label: string,
): readonly Readonly<Record<string, unknown>>[] {
  invariant(Array.isArray(value), `${label} is an array`);
  return value.map((entry, index) => requireRecord(entry, `${label} ${index}`));
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isObjectLike(value: unknown): value is object {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`PatchMap REN-005 runtime invalid: ${message}`);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (!isObjectLike(value) || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
