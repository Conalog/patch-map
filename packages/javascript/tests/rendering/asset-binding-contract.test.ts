import { describe, expect, it } from 'vitest';
import {
  PatchMapAssetRuntime,
  PATCH_MAP_DEFAULT_ASSET_POLICY,
  PATCH_MAP_BUILTIN_ASSETS,
  type PatchMapAssetBackend,
  type PatchMapAssetBackendRequest,
} from '../../src';
import { PatchMapAssetError, evaluatePatchMapAssetResponsePolicy } from '../../src/assets';
import { createPatchMapApi } from '../../src/public';
import { createHost } from '../integration/developer-api-host';
import { stableHash64Hex } from '../../src/shared/stable-hash';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

class ContractBackend implements PatchMapAssetBackend {
  readonly keyNamespace = ' contract ';
  readonly requests: PatchMapAssetBackendRequest[] = [];
  readonly completion = deferred<unknown>();
  unloading: ReturnType<typeof deferred<void>> | undefined;
  failUnload = false;
  get(): unknown { return undefined; }
  load(request: PatchMapAssetBackendRequest): Promise<unknown> {
    this.requests.push(request);
    return this.completion.promise;
  }
  async unload(): Promise<void> {
    await this.unloading?.promise;
    if (this.failUnload) throw new Error('cleanup');
  }
}
const error = (code: string, category: string, retryable: boolean) =>
  ({ code, category, retryable });
const settle = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };

describe('asset public binding witnesses', () => {
  it('asset descriptor registration and policy fields preserve exact public values', async () => {
    expect(PATCH_MAP_DEFAULT_ASSET_POLICY).toEqual({ maxEncodedBytes: 20971520, maxDecodedWidth: 8192, maxDecodedHeight: 8192 });
    expect(PATCH_MAP_BUILTIN_ASSETS.map((value) => value.alias)).toEqual([
      'object', 'inverter', 'combiner', 'device', 'edge', 'loading', 'warning', 'wifi',
      'FiraCode-300', 'FiraCode-400', 'FiraCode-500', 'FiraCode-600', 'FiraCode-700',
    ]);
    const backend = new ContractBackend();
    const runtime = new PatchMapAssetRuntime(backend);
    const input = { src: ' source ', format: ' svg ', parser: ' svg ', loadParser: ' svg ', data: { resolution: 2 } };
    const descriptor = runtime.sourceEntry(input).descriptor;
    expect(descriptor).toEqual({ src: 'source', format: 'svg', parser: 'svg', loadParser: 'svg', data: { resolution: 2 } });
    expect(runtime.sourceEntry(' source ').descriptor).toEqual({ src: 'source' });
    for (const field of ['src', 'format', 'parser', 'loadParser']) {
      for (const invalid of ['', ' ', 4, null]) {
        expect(() => runtime.sourceEntry({ ...descriptor, [field]: invalid } as never))
          .toThrow(expect.objectContaining(error('INVALID_VALUE', 'INVALID_INPUT', false)));
      }
    }
    expect(runtime.registerAssets([
      { alias: ' font ', descriptor, kind: 'font', fontWeight: 500 },
      { alias: 'font', descriptor, kind: 'font', fontWeight: 500 },
      { alias: 'image', descriptor: 'image' },
    ])).toEqual({ registeredAliases: ['font', 'image'], duplicateAliases: ['font'] });
    const font = runtime.resolve('font');
    expect([font.alias, font.descriptor, font.kind, font.fontWeight, font.packageOwned])
      .toEqual(['font', descriptor, 'font', 500, false]);
    expect(runtime.resolve('image').kind).toBe('image');
    for (const invalid of [{ kind: 'other' }, { fontWeight: 0 }, { fontWeight: 2.5 }, { fontWeight: '500' }]) {
      expect(() => runtime.registerAlias({ alias: 'bad', descriptor: 'bad', ...invalid } as never))
        .toThrow(expect.objectContaining(error('INVALID_VALUE', 'INVALID_INPUT', false)));
    }
    expect(() => runtime.registerAlias({ alias: 'font', descriptor: 'conflict' }))
      .toThrow(expect.objectContaining(error('CONFLICT', 'CONFLICT', false)));
    const policy = { maxEncodedBytes: 10, maxDecodedWidth: 20, maxDecodedHeight: 30 };
    for (const field of Object.keys(policy)) {
      for (const invalid of [0, -1, 1.5, Infinity, '1']) {
        expect(() => runtime.createSession({ instanceId: field, policy: { [field]: invalid } as never }))
          .toThrow(expect.objectContaining(error('INVALID_VALUE', 'INVALID_INPUT', false)));
      }
    }
    for (const [field, limit] of [['encodedBytes', 10], ['decodedWidth', 20], ['decodedHeight', 30]] as const) {
      const metadata = { mediaType: 'image/png', encodedBytes: 10, decodedWidth: 20, decodedHeight: 30 };
      expect(evaluatePatchMapAssetResponsePolicy(policy, metadata).accepted).toBe(true);
      expect(evaluatePatchMapAssetResponsePolicy(policy, { ...metadata, [field]: limit + 1 })).toEqual({
        accepted: false, code: 'ASSET_POLICY_REJECTED', stage: field === 'encodedBytes' ? 'encoded-bytes' : 'decoded-size',
      });
    }
    for (const code of ['ASSET_LOAD_FAILED', 'ASSET_DECODE_FAILED', 'ASSET_UPLOAD_FAILED'] as const) {
      const value = new PatchMapAssetError(code, 'ASSET_FAILURE', true);
      expect([value.code, value.category, value.retryable]).toEqual([code, 'ASSET_FAILURE', true]);
    }
    const session = runtime.createSession({ instanceId: 'policy', policy });
    const acquiring = session.acquireSource('source');
    backend.completion.resolve({});
    await acquiring;
    expect(backend.requests[0]?.policy).toEqual(policy);
    await session.destroy();
  });

  it('asset backend requests and runtime session status enumerate lifecycle fields', async () => {
    const backend = new ContractBackend(), runtime = new PatchMapAssetRuntime(backend);
    runtime.registerAlias({ alias: 'image', descriptor: 'source' });
    const identity = runtime.resolve('image').cacheIdentity;
    const policy = { maxEncodedBytes: 10, maxDecodedWidth: 20, maxDecodedHeight: 30 };
    const session = runtime.createSession({ instanceId: ' instance ', policy });
    const resource = (state: string, resources = 1, pending = 0, leases = 0, ownership: string | null = 'patch-map', cleanup = false) => ({
      cacheIdentity: identity, resourceCount: resources, pendingCount: pending, leaseCount: leases,
      ownership, state, cleanupPending: cleanup, cleanupRetryOwner: cleanup ? 'runtime' : null,
    });
    expect(runtime.probe('image').resource).toEqual(resource('absent', 0, 0, 0, null));
    expect(runtime.probe().resource).toBeNull();
    const pending = session.acquire('image');
    await settle();
    expect(runtime.probe('image')).toEqual({
      builtins: { aliases: ['object', 'inverter', 'combiner', 'device', 'edge', 'loading', 'warning', 'wifi'] },
      fonts: { weights: [300, 400, 500, 600, 700] }, aliasCount: 1, resourceCount: 1,
      pendingCount: 1, leaseCount: 0, cleanupPendingCount: 0, resource: resource('pending', 1, 1),
    });
    expect(session.probe()).toEqual({ instanceId: 'instance', destroyed: false, pendingCount: 1,
      leaseCount: 0, acquisitionCount: 1, cleanupPendingCount: 0 });
    const request = backend.requests[0];
    expect(request?.key).toMatch(/^patch-map-asset:/u);
    expect(request?.key.startsWith(`patch-map-asset:${stableHash64Hex('contract')}:`)).toBe(true);
    expect(request?.cacheIdentity).toBe(identity);
    expect(request?.descriptor).toEqual({ src: 'source' });
    expect(request?.packageOwned).toBe(false);
    expect(request?.policy).toEqual(policy);
    backend.completion.resolve({});
    const handle = await pending;
    expect(runtime.probe('image').resource).toEqual(resource('resolved', 1, 0, 1));
    backend.unloading = deferred<void>();
    backend.failUnload = true;
    const release = handle.release();
    const failed = expect(release).rejects.toThrow(expect.objectContaining(error('INTERNAL_FAILURE', 'INTERNAL_FAILURE', false)));
    await settle();
    expect(runtime.probe('image').resource).toEqual(resource('releasing'));
    backend.unloading.resolve();
    await failed;
    expect(runtime.probe('image').resource).toEqual(resource('cleanup-failed', 1, 0, 0, 'patch-map', true));
    expect(session.probe().cleanupPendingCount).toBe(1);
    backend.failUnload = false;
    await runtime.retryCleanup();
    expect(runtime.probe('image').resource).toEqual(resource('absent', 0, 0, 0, null));
    await session.destroy();
    expect(session.probe()).toEqual({ instanceId: 'instance', destroyed: true, pendingCount: 0,
      leaseCount: 0, acquisitionCount: 0, cleanupPendingCount: 0 });
    expect(() => session.acquire('image')).toThrow(expect.objectContaining(error('CANCELLED', 'CANCELLED', false)));
    const facadeSession = runtime.createSession({ instanceId: 'public' });
    let present = true;
    const api = createPatchMapApi({
      ...createHost().host,
      registerAssets: (_instanceId, registrations) => runtime.registerAssets(registrations),
      assetProbe: (alias) => ({ runtime: runtime.probe(alias), session: present ? facadeSession.probe() : null }),
    });
    expect(api.assets.register({ alias: 'public', descriptor: 'public' }))
      .toEqual({ registeredAliases: ['public'], duplicateAliases: [] });
    expect(api.assets.register([{ alias: 'public', descriptor: 'public' }]))
      .toEqual({ registeredAliases: [], duplicateAliases: ['public'] });
    expect(api.assets.status('public')).toEqual({ runtime: runtime.probe('public'), session: facadeSession.probe() });
    present = false;
    expect(api.assets.status().session).toBeNull();
    await facadeSession.destroy();
  });
});
