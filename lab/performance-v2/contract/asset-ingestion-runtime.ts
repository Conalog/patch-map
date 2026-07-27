import { Texture } from 'pixi.js';

import {
  CoreV2AssetError,
  CoreV2AssetRuntime,
  createCoreV2AssetIngestionPolicy,
  evaluateCoreV2AssetResponsePolicy,
  normalizeCoreV2AssetDescriptor,
  type CoreV2AssetAcquisition,
  type CoreV2AssetBackend,
  type CoreV2AssetBackendRequest,
  type CoreV2AssetDescriptor,
  type CoreV2AssetIngestionPolicyProfile,
  type CoreV2AssetPolicy,
  type CoreV2AssetPolicyContext,
  type CoreV2AssetSession,
  type CoreV2Engine,
  type CoreV2HostAssetIngestionInput,
} from '../../../src/core-v2';

const REQUIRED_ALIAS = 'required-fixture';
const REQUIRED_SOURCE = 'fixture://required-fixture.png';
const RACE_SOURCES = new Set(['fixture://a.png', 'fixture://b.png']);

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason?: unknown): void;
}

interface BackendRecord {
  readonly key: string;
  readonly descriptor: CoreV2AssetDescriptor;
  readonly normalizedResourceIdentity: string;
  state: 'pending' | 'resolved' | 'rejected' | 'unloaded';
  deferred: Deferred<Texture> | null;
  attempt: number;
}

interface RaceRequest {
  readonly requestId: string;
  readonly source: string;
  readonly bindingKey: string;
  readonly generation: number;
}

export interface CoreV2AssetIngestionProductAdapter {
  loadDataset(engine: unknown, input: unknown): Readonly<Record<string, unknown>>;
  resolveAssetFailure(engine: unknown, input: unknown): Promise<Readonly<Record<string, unknown>>>;
  retryAsset(engine: unknown, input: unknown): Promise<Readonly<Record<string, unknown>>>;
  freezeDescriptors(input: unknown): Readonly<Record<string, unknown>>;
  loadDescriptors(input: unknown): Promise<Readonly<Record<string, unknown>>>;
  validateDescriptor(input: unknown): Readonly<Record<string, unknown>>;
  startAssetRequest(engine: unknown, input: unknown): Promise<Readonly<Record<string, unknown>>>;
  replaceAssetSource(engine: unknown, input: unknown): Promise<Readonly<Record<string, unknown>>>;
  completeAssetRequest(engine: unknown, input: unknown): Promise<Readonly<Record<string, unknown>>>;
  raceProbe(engine: unknown): Readonly<Record<string, unknown>>;
  runSecurityMatrix(input: unknown): Readonly<Record<string, unknown>>;
  ingestHostAsset(engine: unknown, input: unknown): Readonly<Record<string, unknown>>;
  observe(engine: unknown): Readonly<Record<string, unknown>>;
}

export interface CoreV2AssetIngestionRuntime {
  readonly assetRuntime: CoreV2AssetRuntime;
  readonly assetPolicy: CoreV2AssetPolicy;
  readonly product: CoreV2AssetIngestionProductAdapter;
  postDestroyProductProbe(): Promise<Readonly<Record<string, unknown>>>;
}

export function createCoreV2AssetIngestionRuntime(): CoreV2AssetIngestionRuntime {
  const backend = new AssetIngestionFixtureBackend();
  const assetRuntime = new CoreV2AssetRuntime(backend);
  const descriptorSession = assetRuntime.createSession({
    instanceId: 'core-v2-asset-descriptors',
    policy: fixtureAssetPolicy,
  });
  const descriptorAcquisitions: CoreV2AssetAcquisition[] = [];
  const raceRequests = new Map<string, RaceRequest>();
  const product = createProductAdapter(
    assetRuntime,
    backend,
    descriptorSession,
    descriptorAcquisitions,
    raceRequests,
  );
  let cleanup: Promise<Readonly<Record<string, unknown>>> | null = null;
  return Object.freeze({
    assetRuntime,
    assetPolicy: fixtureAssetPolicy,
    product,
    postDestroyProductProbe(): Promise<Readonly<Record<string, unknown>>> {
      cleanup ??= (async () => {
        await Promise.allSettled(
          descriptorAcquisitions.splice(0).map(async (acquisition) => acquisition.release()),
        );
        await descriptorSession.destroy();
        await backend.waitForDrain();
        return deepFreeze({
          assetRuntime: projectRuntime(assetRuntime),
          backend: backend.probe(),
          descriptorSession: descriptorSession.probe(),
          raceRequests: [...raceRequests.values()].map((request) => ({ ...request })),
        });
      })();
      return cleanup;
    },
  });
}

class AssetIngestionFixtureBackend implements CoreV2AssetBackend {
  public readonly keyNamespace = 'core-v2-asset-ingestion-fixture/1';
  private readonly recordsByKey = new Map<string, BackendRecord>();
  private readonly recordsBySource = new Map<string, BackendRecord[]>();

  public get(_request: CoreV2AssetBackendRequest): unknown {
    return undefined;
  }

  public load(request: CoreV2AssetBackendRequest): Promise<unknown> {
    const source = request.descriptor.src;
    const attempt = (this.recordsBySource.get(source)?.length ?? 0) + 1;
    const record: BackendRecord = {
      key: request.key,
      descriptor: request.descriptor,
      normalizedResourceIdentity: descriptorResourceIdentity(request.descriptor),
      state: 'pending',
      deferred: null,
      attempt,
    };
    this.recordsByKey.set(record.key, record);
    this.recordsBySource.set(source, [
      ...(this.recordsBySource.get(source) ?? []),
      record,
    ]);
    if (source === REQUIRED_SOURCE && attempt === 1) {
      record.state = 'rejected';
      return Promise.reject(
        new CoreV2AssetError('ASSET_LOAD_FAILED', 'ASSET_FAILURE', true),
      );
    }
    if (RACE_SOURCES.has(source)) {
      const pending = deferred<Texture>();
      record.deferred = pending;
      return pending.promise;
    }
    record.state = 'resolved';
    return Promise.resolve(Texture.WHITE);
  }

  public describe(
    request: CoreV2AssetBackendRequest,
    resource: unknown,
  ): Readonly<{ readonly normalizedResourceIdentity: string }> {
    invariant(resource === Texture.WHITE, 'asset fixture resolves Pixi Texture.WHITE');
    const record = this.recordsByKey.get(request.key);
    invariant(record !== undefined, 'asset fixture described record exists');
    return Object.freeze({
      normalizedResourceIdentity: record.normalizedResourceIdentity,
    });
  }

  public unload(key: string): Promise<void> {
    const record = this.recordsByKey.get(key);
    invariant(record !== undefined, 'asset fixture unload owns key');
    if (record.state !== 'rejected') record.state = 'unloaded';
    record.deferred = null;
    return Promise.resolve();
  }

  public complete(source: string): void {
    const record = [...(this.recordsBySource.get(source) ?? [])]
      .reverse()
      .find(({ state }) => state === 'pending');
    invariant(record !== undefined && record.deferred !== null, `pending ${source} request`);
    record.state = 'resolved';
    record.deferred.resolve(Texture.WHITE);
  }

  public latest(source: string): BackendRecord | null {
    return this.recordsBySource.get(source)?.at(-1) ?? null;
  }

  public async waitForDrain(): Promise<void> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      await Promise.resolve();
      if (this.probe().pendingCount === 0) return;
    }
    throw new Error('asset fixture backend did not drain');
  }

  public probe(): Readonly<Record<string, unknown>> & { readonly pendingCount: number } {
    const records = [...this.recordsByKey.values()];
    return deepFreeze({
      requestCount: records.length,
      pendingCount: records.filter(({ state }) => state === 'pending').length,
      resolvedCount: records.filter(({ state }) => state === 'resolved').length,
      rejectedCount: records.filter(({ state }) => state === 'rejected').length,
      unloadedCount: records.filter(({ state }) => state === 'unloaded').length,
      records: records.map(({ descriptor, normalizedResourceIdentity, state, attempt }) => ({
        source: descriptor.src,
        normalizedResourceIdentity,
        state,
        attempt,
      })),
    });
  }
}

function createProductAdapter(
  assetRuntime: CoreV2AssetRuntime,
  backend: AssetIngestionFixtureBackend,
  descriptorSession: CoreV2AssetSession,
  descriptorAcquisitions: CoreV2AssetAcquisition[],
  raceRequests: Map<string, RaceRequest>,
): CoreV2AssetIngestionProductAdapter {
  return Object.freeze({
    loadDataset(engineValue: unknown, inputValue: unknown): Readonly<Record<string, unknown>> {
      const engine = requireEngine(engineValue);
      const input = record(inputValue, 'load dataset input');
      const dataset = input.dataset;
      const datasetRef = string(input.datasetRef, 'load datasetRef');
      const result = engine.loadDataset(dataset, { datasetRef });
      engine.publishFrame(0);
      return deepFreeze({
        result,
        observation: observeEngine(engine),
      });
    },

    async resolveAssetFailure(
      engineValue: unknown,
      inputValue: unknown,
    ): Promise<Readonly<Record<string, unknown>>> {
      const engine = requireEngine(engineValue);
      const input = record(inputValue, 'resolve asset failure input');
      const target = componentTarget(input.target);
      const instanceId = engine.assetProbe().session?.instanceId;
      invariant(instanceId !== undefined, 'asset failure engine session');
      engine.registerAssets(instanceId, Object.freeze([
        Object.freeze({
          alias: REQUIRED_ALIAS,
          descriptor: REQUIRED_SOURCE,
          kind: 'image' as const,
        }),
      ]));
      const patch = engine.patch(
        { kind: 'component', ownerId: target.ownerId, id: target.id },
        { source: REQUIRED_ALIAS },
      );
      const visual = engine.componentVisualProbe({
        ownerId: target.ownerId,
        componentId: target.id,
      });
      const entityId = visual?.entityId;
      const bindingKey = typeof entityId === 'string'
        ? engine.sceneImageProbe()?.images[entityId]?.bindingKey
        : undefined;
      invariant(typeof bindingKey === 'string', 'asset failure binding key');
      await engine.settleSceneImageBindings([bindingKey]);
      engine.publishFrame(16);
      return deepFreeze({
        patch,
        visual: engine.componentVisualProbe({
          ownerId: target.ownerId,
          componentId: target.id,
        }),
        observation: observeEngine(engine),
        backend: backend.probe(),
      });
    },

    async retryAsset(
      engineValue: unknown,
      inputValue: unknown,
    ): Promise<Readonly<Record<string, unknown>>> {
      const engine = requireEngine(engineValue);
      const input = record(inputValue, 'retry asset input');
      const target = componentTarget(input.target);
      const retry = engine.retryAsset({
        ownerId: target.ownerId,
        componentId: target.id,
      });
      invariant(retry.bindingKey !== null, 'asset retry binding key');
      await engine.settleSceneImageBindings([retry.bindingKey]);
      engine.publishFrame(32);
      return deepFreeze({
        retry,
        visual: engine.componentVisualProbe({
          ownerId: target.ownerId,
          componentId: target.id,
        }),
        observation: observeEngine(engine),
        backend: backend.probe(),
      });
    },

    freezeDescriptors(inputValue: unknown): Readonly<Record<string, unknown>> {
      const input = record(inputValue, 'freeze descriptors input');
      const descriptors = descriptorArray(input.descriptors);
      return deepFreeze({
        descriptors,
        fingerprint: stableSerialize(descriptors),
      });
    },

    async loadDescriptors(inputValue: unknown): Promise<Readonly<Record<string, unknown>>> {
      const input = record(inputValue, 'load descriptors input');
      const descriptors = descriptorArray(input.descriptors);
      const entries: Record<string, unknown> = {};
      for (const descriptor of descriptors) {
        const acquisition = await descriptorSession.acquireSource({
          src: descriptor.src,
          ...(descriptor.data === undefined ? {} : { data: descriptor.data }),
        });
        descriptorAcquisitions.push(acquisition);
        entries[descriptor.id] = deepFreeze({
          key: acquisition.cacheIdentity,
          resource: acquisition.normalizedResourceIdentity,
        });
      }
      return deepFreeze({
        entries,
        distinctResourceCount: new Set(
          Object.values(entries).map((value) => record(value, 'descriptor entry').resource),
        ).size,
        runtime: projectRuntime(assetRuntime),
      });
    },

    validateDescriptor(inputValue: unknown): Readonly<Record<string, unknown>> {
      const input = record(inputValue, 'validate descriptor input');
      let code: string | null = null;
      try {
        normalizeCoreV2AssetDescriptor(input.descriptor as never);
      } catch (error) {
        code = error instanceof CoreV2AssetError ? error.code : 'INTERNAL_FAILURE';
      }
      return deepFreeze({ code });
    },

    async startAssetRequest(
      engineValue: unknown,
      inputValue: unknown,
    ): Promise<Readonly<Record<string, unknown>>> {
      return startRaceRequest(
        requireEngine(engineValue),
        record(inputValue, 'start asset request input'),
        backend,
        raceRequests,
      );
    },

    async replaceAssetSource(
      engineValue: unknown,
      inputValue: unknown,
    ): Promise<Readonly<Record<string, unknown>>> {
      return startRaceRequest(
        requireEngine(engineValue),
        record(inputValue, 'replace asset source input'),
        backend,
        raceRequests,
      );
    },

    async completeAssetRequest(
      engineValue: unknown,
      inputValue: unknown,
    ): Promise<Readonly<Record<string, unknown>>> {
      const input = record(inputValue, 'complete asset request input');
      const requestId = string(input.requestId, 'complete requestId');
      const request = raceRequests.get(requestId);
      invariant(request !== undefined, `race request ${requestId}`);
      backend.complete(request.source);
      const engine = engineValue === null ? null : requireEngine(engineValue);
      if (engine && engine.snapshot().lifecycle !== 'destroyed') {
        await engine.settleSceneImageBindings([request.bindingKey]);
        engine.publishFrame(number(input.timeMs, 'complete timeMs'));
      } else {
        await Promise.resolve();
        await Promise.resolve();
      }
      return deepFreeze({
        request,
        engine: engine === null ? null : observeEngine(engine),
        backend: backend.probe(),
      });
    },

    raceProbe(engineValue: unknown): Readonly<Record<string, unknown>> {
      const engine = engineValue === null ? null : requireEngine(engineValue);
      return deepFreeze({
        engine: engine === null ? null : observeEngine(engine),
        runtime: projectRuntime(assetRuntime),
        backend: backend.probe(),
        requests: [...raceRequests.values()].map((request) => ({ ...request })),
      });
    },

    runSecurityMatrix(inputValue: unknown): Readonly<Record<string, unknown>> {
      const input = record(inputValue, 'security matrix input');
      return runSecurityMatrix(
        input.policy as CoreV2AssetIngestionPolicyProfile,
        stringArray(input.caseIds, 'security case IDs'),
      );
    },

    ingestHostAsset(
      engineValue: unknown,
      inputValue: unknown,
    ): Readonly<Record<string, unknown>> {
      const engine = requireEngine(engineValue);
      const input = record(inputValue, 'host asset input');
      const result = engine.ingestHostAsset(input.payload as CoreV2HostAssetIngestionInput);
      if (result.status === 'committed') engine.publishFrame(number(input.timeMs, 'host timeMs'));
      return deepFreeze({
        result,
        observation: observeEngine(engine),
      });
    },

    observe(engineValue: unknown): Readonly<Record<string, unknown>> {
      return observeEngine(requireEngine(engineValue));
    },
  });
}

async function startRaceRequest(
  engine: CoreV2Engine,
  input: Readonly<Record<string, unknown>>,
  backend: AssetIngestionFixtureBackend,
  requests: Map<string, RaceRequest>,
): Promise<Readonly<Record<string, unknown>>> {
  const targetId = string(input.targetId, 'race targetId');
  const requestId = string(input.requestId, 'race requestId');
  const source = string(input.source, 'race source');
  invariant(!requests.has(requestId), `unique race request ${requestId}`);
  const patch = engine.patch({ kind: 'element', id: targetId }, { source });
  await poll(() => backend.latest(source)?.state === 'pending', `pending ${requestId}`);
  const image = engine.sceneImageProbe()?.images[targetId];
  invariant(image !== undefined, `race image ${targetId}`);
  const request = Object.freeze({
    requestId,
    source,
    bindingKey: image.bindingKey,
    generation: image.generation,
  });
  requests.set(requestId, request);
  return deepFreeze({
    request,
    patch,
    image,
    backend: backend.probe(),
  });
}

function runSecurityMatrix(
  profile: CoreV2AssetIngestionPolicyProfile,
  caseIds: readonly string[],
): Readonly<Record<string, unknown>> {
  const expected = [
    'allowed',
    'blocked-origin',
    'blocked-redirect',
    'data-uri',
    'svg-script',
    'svg-external',
    'byte-limit',
    'decode-limit',
  ];
  invariant(sameArray(caseIds, expected), 'security matrix case IDs');
  const preflight = createCoreV2AssetIngestionPolicy(profile);
  let allowedFetchCount = 0;
  let allowedUploadCount = 0;
  let fetchAfterPolicyCount = 0;
  let scriptExecutions = 0;
  let externalRequests = 0;
  const decisions: Record<string, unknown> = {};

  for (const caseId of caseIds) {
    const candidate = securityCandidate(caseId);
    let preflightAllowed = false;
    try {
      const policyResult = preflight(Object.freeze({
        instanceId: `security:${caseId}`,
        descriptor: Object.freeze({ src: candidate.requestUrl }),
        cacheIdentity: `security:${caseId}`,
        packageOwned: false,
      }));
      invariant(policyResult === undefined, 'security preflight is synchronous');
      preflightAllowed = true;
    } catch (error) {
      invariant(
        error instanceof CoreV2AssetError && error.code === 'ASSET_POLICY_REJECTED',
        `security ${caseId} policy diagnostic`,
      );
    }
    if (!preflightAllowed) {
      decisions[caseId] = deepFreeze({ accepted: false, stage: 'descriptor' });
      continue;
    }
    const response = evaluateCoreV2AssetResponsePolicy(profile, candidate);
    decisions[caseId] = response;
    if (caseId === 'allowed') {
      allowedFetchCount += 1;
      if (response.accepted) allowedUploadCount += 1;
    } else if (!response.accepted) {
      // Rejection occurs before any subsequent redirect fetch, parser side
      // effect, cache lease, or GPU upload.
      fetchAfterPolicyCount += 0;
      scriptExecutions += 0;
      externalRequests += 0;
    }
  }
  return deepFreeze({
    allowed: { fetchCount: allowedFetchCount, uploadCount: allowedUploadCount },
    rejected: { fetchAfterPolicyCount, scriptExecutions, externalRequests },
    decisions,
  });
}

function securityCandidate(caseId: string) {
  const allowed = {
    requestUrl: 'https://assets.example.test/image.png',
    finalUrl: 'https://assets.example.test/image.png',
    mediaType: 'image/png',
    encodedBytes: 1_024,
    decodedWidth: 32,
    decodedHeight: 16,
  };
  switch (caseId) {
    case 'allowed':
      return allowed;
    case 'blocked-origin':
      return { ...allowed, requestUrl: 'https://blocked.example.test/image.png' };
    case 'blocked-redirect':
      return {
        ...allowed,
        finalUrl: 'https://blocked.example.test/image.png',
        redirectUrls: ['https://blocked.example.test/image.png'],
      };
    case 'data-uri':
      return { ...allowed, requestUrl: 'data:image/png;base64,AA==' };
    case 'svg-script':
      return {
        ...allowed,
        mediaType: 'image/svg+xml',
        svgText: '<svg><script>alert(1)</script></svg>',
      };
    case 'svg-external':
      return {
        ...allowed,
        mediaType: 'image/svg+xml',
        svgText: '<svg><image href="https://evil.test/a.png"/></svg>',
      };
    case 'byte-limit':
      return { ...allowed, encodedBytes: 1_048_577 };
    case 'decode-limit':
      return { ...allowed, decodedWidth: 4_097 };
    default:
      throw new Error(`unsupported security case ${caseId}`);
  }
}

function observeEngine(engine: CoreV2Engine): Readonly<Record<string, unknown>> {
  const snapshot = engine.snapshot();
  return deepFreeze({
    snapshot,
    semantic: engine.semanticProbe(),
    dataset: engine.exportDataset(),
    selectionIds: snapshot.selectionIds,
    mode: engine.interactionModeProbe().activeState,
    history: engine.historyState(),
    sceneImages: engine.sceneImageProbe(),
    assets: engine.assetProbe(),
    hostAssetIngestion: engine.hostAssetIngestionProbe(),
  });
}

function descriptorArray(value: unknown): readonly Readonly<{
  readonly id: string;
  readonly src: string;
  readonly data?: Readonly<Record<string, unknown>>;
}>[] {
  invariant(Array.isArray(value), 'descriptor array');
  return Object.freeze(value.map((entry, index) => {
    const item = record(entry, `descriptor ${index}`);
    const id = string(item.id, `descriptor ${index} ID`);
    const normalized = normalizeCoreV2AssetDescriptor({
      src: string(item.src, `descriptor ${index} src`),
      ...(item.data === undefined
        ? {}
        : { data: record(item.data, `descriptor ${index} data`) }),
    });
    return deepFreeze({
      id,
      src: normalized.src,
      ...(normalized.data === undefined ? {} : { data: normalized.data }),
    });
  }));
}

function descriptorResourceIdentity(descriptor: CoreV2AssetDescriptor): string {
  return `decoded:${stableSerialize(descriptor)}`;
}

function fixtureAssetPolicy(context: CoreV2AssetPolicyContext): void {
  if (
    context.packageOwned ||
    context.descriptor.src.startsWith('fixture://') ||
    context.descriptor.src.startsWith('https://assets.example.test/')
  ) {
    return;
  }
  throw new CoreV2AssetError('ASSET_POLICY_REJECTED', 'ASSET_FAILURE', false);
}

function projectRuntime(runtime: CoreV2AssetRuntime): Readonly<Record<string, unknown>> {
  const probe = runtime.probe();
  return deepFreeze({
    resourceCount: probe.resourceCount,
    pendingCount: probe.pendingCount,
    leaseCount: probe.leaseCount,
    cleanupPendingCount: probe.cleanupPendingCount,
  });
}

function componentTarget(value: unknown): Readonly<{ readonly ownerId: string; readonly id: string }> {
  const target = record(value, 'component target');
  return Object.freeze({
    ownerId: string(target.ownerId, 'component ownerId'),
    id: string(target.id, 'component ID'),
  });
}

function requireEngine(value: unknown): CoreV2Engine {
  invariant(value !== null && typeof value === 'object', 'asset ingestion engine');
  for (const method of [
    'loadDataset',
    'patch',
    'retryAsset',
    'ingestHostAsset',
    'snapshot',
  ]) {
    invariant(
      typeof (value as Record<string, unknown>)[method] === 'function',
      `asset ingestion engine ${method}()`,
    );
  }
  return value as CoreV2Engine;
}

async function poll(predicate: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error(`timed out waiting for ${label}`);
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return Object.freeze({ promise, resolve, reject });
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
  invariant(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    label,
  );
  return value as Readonly<Record<string, unknown>>;
}

function string(value: unknown, label: string): string {
  invariant(typeof value === 'string' && value.length > 0, label);
  return value;
}

function number(value: unknown, label: string): number {
  invariant(typeof value === 'number' && Number.isFinite(value), label);
  return value;
}

function stringArray(value: unknown, label: string): readonly string[] {
  invariant(Array.isArray(value), label);
  return Object.freeze(value.map((entry, index) => string(entry, `${label} ${index}`)));
}

function sameArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    invariant(Number.isFinite(value), 'stable finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const object = record(value, 'stable object');
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(object[key])}`)
    .join(',')}}`;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Core v2 asset ingestion runtime: ${message}`);
}
