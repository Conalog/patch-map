import { Texture } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

import {
  createPatchMapRenderImagesRuntime,
} from '../../lab/patch-map/contract/render-images-runtime';
import type {
  PatchMapAssetRegistration,
  PatchMapAssetRegistrationResult,
  PatchMapAssetSession,
} from '../../src/patch-map';

const DIRECT_URL = 'https://assets.example.test/image.png';
const DESCRIPTOR_URL = 'https://assets.example.test/image.svg';
const DATA_URI =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%228%22/%3E';
const FAILED_URL = 'fixture://failed-image.png';
const DESCRIPTOR_BINDING_KEY =
  'descriptor:{"data":{"resolution":2},"src":"https://assets.example.test/image.svg"}';
const DESCRIPTOR_CACHE_IDENTITY = `descriptor:${DESCRIPTOR_URL}?resolution=2`;

type JsonRecord = Record<string, unknown>;

describe('PatchMap REN-005 deterministic Pixi asset runtime', () => {
  it('creates a private runtime and closes policy to the declared fixture sources', async () => {
    const first = createPatchMapRenderImagesRuntime();
    const second = createPatchMapRenderImagesRuntime();
    const session = first.assetRuntime.createSession({
      instanceId: 'fixture-policy',
      policy: first.assetPolicy,
    });

    expect(first.assetRuntime).not.toBe(second.assetRuntime);
    expect(first.product).not.toBe(second.product);
    await expect(
      session.acquireSource('https://unapproved.example.test/image.png'),
    ).rejects.toMatchObject({
      code: 'ASSET_POLICY_REJECTED',
      category: 'ASSET_FAILURE',
      retryable: false,
    });
    expect(probeAt(first.product.requestProbe(), 'backend.requestCount')).toBe(0);
    await session.destroy();
  });

  it('decodes with Texture.WHITE, controls the stale descriptor, and journals zero pending work', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const runtime = createPatchMapRenderImagesRuntime();
    const session = runtime.assetRuntime.createSession({
      instanceId: 'ren-005-images-engine',
      policy: runtime.assetPolicy,
    });
    const engine = new FixtureImageEngine(session);

    try {
      expect(runtime.product.registerFixtureAssets(engine)).toEqual({
        registeredAliases: ['fixture-image'],
        duplicateAliases: [],
        fixtureDescriptor: 'fixture://fixture-image-80x40.svg',
      });
      expect(engine.registrations).toEqual([{
        alias: 'fixture-image',
        descriptor: 'fixture://fixture-image-80x40.svg',
        kind: 'image',
      }]);

      const mutableDescriptor = {
        src: DESCRIPTOR_URL,
        data: { resolution: 2 },
      };
      const aliasPromise = session.acquire('fixture-image');
      const urlPromise = session.acquireSource(DIRECT_URL);
      const dataUriPromise = session.acquireSource(DATA_URI);
      const failedPromise = session.acquireSource(FAILED_URL).catch((error: unknown) => error);
      const descriptorPromise = session.acquireSource(mutableDescriptor);
      mutableDescriptor.data.resolution = 9;

      const [alias, url, dataUri, failed] = await Promise.all([
        aliasPromise,
        urlPromise,
        dataUriPromise,
        failedPromise,
      ]);
      expect(alias.resource).toBe(Texture.WHITE);
      expect(url.resource).toBe(Texture.WHITE);
      expect(dataUri.resource).toBe(Texture.WHITE);
      expect(failed).toMatchObject({ code: 'ASSET_LOAD_FAILED', category: 'ASSET_FAILURE' });
      expect(alias).toMatchObject({
        normalizedResourceIdentity: 'fixture-image@1',
        describedCacheIdentity: 'alias:fixture-image',
      });
      expect(url).toMatchObject({
        normalizedResourceIdentity: 'fixture-url-image-64x32@1',
        describedCacheIdentity: `url:${DIRECT_URL}`,
      });
      expect(dataUri).toMatchObject({
        normalizedResourceIdentity: 'fixture-data-uri-svg-16x8@1',
        describedCacheIdentity: 'data-uri:fixture-data-uri-svg-16x8',
      });

      engine.imageProbe = pendingSceneProbe();
      await expect(runtime.product.settleImmediateAssets()).resolves.toMatchObject({
        settled: true,
      });
      const bound = runtime.product.bindControlledRequest({
        targetId: 'descriptor',
        requestId: 'old',
        completeAtMs: 100,
      });
      expect(bound).toMatchObject({
        requestId: 'old',
        targetId: 'descriptor',
        generation: 1,
        bindingKey: DESCRIPTOR_BINDING_KEY,
        sourceCacheIdentity: DESCRIPTOR_CACHE_IDENTITY,
        backendToken: 'image-request-5',
        backendState: 'pending',
        attemptState: 'pending',
        attachmentState: 'current',
        state: 'pending',
        attached: false,
        retainedPendingCount: 1,
        retainedLeaseCount: 1,
      });
      const pendingProbe = structuredClone(runtime.product.requestProbe());
      expect(pendingProbe).toMatchObject({
        pendingCount: 1,
        completedCount: 0,
        retainedPendingCount: 1,
        controlledRequests: [{
          generation: 1,
          bindingKey: DESCRIPTOR_BINDING_KEY,
          backendToken: 'image-request-5',
          backendState: 'pending',
        }],
        backend: { requestCount: 5, pendingCount: 1, rejectedCount: 1 },
      });

      engine.imageProbe = replacedSceneProbe(false);
      const fallbackOnly = replacedSceneProbe(false);
      const fallbackDescriptor = recordAt(recordAt(fallbackOnly, 'images'), 'descriptor');
      fallbackDescriptor.initial = {
        generation: 1,
        bindingKey: DESCRIPTOR_BINDING_KEY,
        sourceCacheIdentity: DESCRIPTOR_CACHE_IDENTITY,
        state: 'resolved',
        attachmentState: 'stale',
      };
      fallbackDescriptor.attempts = [
        {
          generation: 2,
          bindingKey: 'alias:fixture-image',
          sourceCacheIdentity: 'alias:fixture-image',
          state: 'resolved',
          attachmentState: 'current',
        },
      ];
      engine.imageProbe = fallbackOnly;
      expect(() => runtime.product.requestProbe()).toThrow(/exact product attempt remains observable/u);
      engine.imageProbe = replacedSceneProbe(false);
      await runtime.product.settleImmediateAssets();
      const completing = runtime.product.completeControlledRequest({ requestId: 'old', timeMs: 100 });
      engine.imageProbe = replacedSceneProbe(true);
      await expect(completing).resolves.toMatchObject({
        requestId: 'old',
        targetId: 'descriptor',
        generation: 1,
        bindingKey: DESCRIPTOR_BINDING_KEY,
        sourceCacheIdentity: DESCRIPTOR_CACHE_IDENTITY,
        backendToken: 'image-request-5',
        backendState: 'resolved',
        attemptState: 'resolved',
        attachmentState: 'stale',
        state: 'stale-discarded',
        attached: false,
      });
      const descriptor = await descriptorPromise;
      expect(descriptor.resource).toBe(Texture.WHITE);
      expect(descriptor).toMatchObject({
        normalizedResourceIdentity: 'fixture-svg-image@resolution-2',
        describedCacheIdentity: `descriptor:${DESCRIPTOR_URL}?resolution=2`,
      });

      const terminalProbe = runtime.product.requestProbe();
      expect(terminalProbe).toMatchObject({
        pendingCount: 0,
        completedCount: 1,
        staleCompletionCount: 1,
        attachedCount: 0,
        retainedPendingCount: 0,
        controlledRequests: [{
          generation: 1,
          bindingKey: DESCRIPTOR_BINDING_KEY,
          backendToken: 'image-request-5',
          attemptState: 'resolved',
          attachmentState: 'stale',
          state: 'stale-discarded',
        }],
        backend: { requestCount: 5, pendingCount: 0, resolvedCount: 4, rejectedCount: 1 },
      });
      expect(JSON.parse(JSON.stringify(terminalProbe))).toEqual(terminalProbe);
      expect(Object.isFrozen(terminalProbe)).toBe(true);
      expect(journal(terminalProbe).slice(0, journal(pendingProbe).length)).toEqual(
        journal(pendingProbe),
      );
      expect(fetchSpy).not.toHaveBeenCalled();

      await session.destroy();
      const releasedProbe = runtime.product.requestProbe();
      expect(releasedProbe).toMatchObject({
        retainedPendingCount: 0,
        controlledRequests: [{
          backendState: 'unloaded',
          retainedPendingCount: 0,
          retainedLeaseCount: 0,
        }],
        backend: { pendingCount: 0, unloadedCount: 4 },
      });
      expect(runtime.postDestroyProductProbe()).toMatchObject({
        revision: 'core-v2-ren-005-product-cleanup/1',
        assetRuntime: {
          resourceCount: 0,
          pendingCount: 0,
          leaseCount: 0,
          cleanupPendingCount: 0,
        },
        backend: {
          requestCount: 5,
          pendingCount: 0,
          resolvedLiveResourceCount: 0,
          unloadedCount: 4,
          rejectedCount: 1,
        },
        controlledRequests: [{
          requestId: 'old',
          generation: 1,
          bindingKey: DESCRIPTOR_BINDING_KEY,
          backendToken: 'image-request-5',
          backendState: 'unloaded',
          attemptState: 'resolved',
          attachmentState: 'stale',
          retainedPendingCount: 0,
          retainedLeaseCount: 0,
        }],
      });
      expect(journal(releasedProbe).slice(0, journal(terminalProbe).length)).toEqual(
        journal(terminalProbe),
      );
      expect(journal(releasedProbe).map((entry) => entry.sequence)).toEqual(
        journal(releasedProbe).map((_, index) => index + 1),
      );
    } finally {
      await session.destroy();
      vi.unstubAllGlobals();
    }
  });
});

class FixtureImageEngine {
  public registrations: readonly PatchMapAssetRegistration[] = [];
  public imageProbe: JsonRecord = pendingSceneProbe();

  public constructor(private readonly session: PatchMapAssetSession) {}

  public registerAssets(
    instanceId: string,
    registrations: readonly PatchMapAssetRegistration[],
  ): PatchMapAssetRegistrationResult {
    expect(instanceId).toBe('ren-005-images-engine');
    this.registrations = structuredClone(registrations);
    return this.session.registerAssets(registrations);
  }

  public snapshot(): JsonRecord {
    return { lifecycle: 'scene-ready' };
  }

  public sceneImageProbe(): JsonRecord {
    return structuredClone(this.imageProbe);
  }
}

function pendingSceneProbe(): JsonRecord {
  return baseSceneProbe({
    descriptor: {
      generation: 1,
      authoredSource: { src: DESCRIPTOR_URL, data: { resolution: 2 } },
      state: 'pending',
      attempts: [{
        generation: 1,
        bindingKey: DESCRIPTOR_BINDING_KEY,
        sourceCacheIdentity: DESCRIPTOR_CACHE_IDENTITY,
        state: 'pending',
        attachmentState: 'current',
      }],
    },
  });
}

function replacedSceneProbe(initialResolved: boolean): JsonRecord {
  return baseSceneProbe({
    descriptor: {
      generation: 2,
      authoredSource: 'fixture-image',
      state: 'resolved',
      attempts: [
        {
          generation: 1,
          bindingKey: DESCRIPTOR_BINDING_KEY,
          sourceCacheIdentity: DESCRIPTOR_CACHE_IDENTITY,
          state: initialResolved ? 'resolved' : 'pending',
          attachmentState: 'stale',
        },
        {
          generation: 2,
          bindingKey: 'alias:fixture-image',
          sourceCacheIdentity: 'alias:fixture-image',
          state: 'resolved',
          attachmentState: 'current',
        },
      ],
    },
  });
}

function baseSceneProbe(overrides: Readonly<{ readonly descriptor: JsonRecord }>): JsonRecord {
  return {
    images: {
      alias: { state: 'resolved' },
      url: { state: 'resolved' },
      descriptor: overrides.descriptor,
      'data-uri': { state: 'resolved' },
      transformed: { state: 'resolved' },
      'hidden-image': { active: false, renderObjectCount: 0, state: 'absent' },
      'failed-image': { state: 'failed' },
    },
  };
}

function journal(probe: Readonly<JsonRecord>): readonly JsonRecord[] {
  const backend = recordAt(probe, 'backend');
  if (!Array.isArray(backend.journal)) throw new Error('Missing backend journal');
  return backend.journal.map((entry) => record(entry, 'journal entry'));
}

function probeAt(value: Readonly<JsonRecord>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => (
    record(current, segment)[segment]
  ), value);
}

function recordAt(value: Readonly<JsonRecord>, key: string): JsonRecord {
  return record(value[key], key);
}

function record(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonRecord;
}
