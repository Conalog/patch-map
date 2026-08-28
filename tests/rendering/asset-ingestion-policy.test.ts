import { describe, expect, it } from 'vitest';

import {
  PatchMapAssetError,
  type PatchMapAssetBackend,
  type PatchMapAssetBackendRequest,
} from '../../src/assets/contracts';
import { PatchMapAssetRuntime } from '../../src/assets';
import {
  evaluatePatchMapAssetResponsePolicy,
  normalizePatchMapAssetPolicy,
  PATCH_MAP_DEFAULT_ASSET_POLICY,
} from '../../src/assets/ingestion-policy';

class CountingBackend implements PatchMapAssetBackend {
  public readonly keyNamespace = 'asset-ingestion-policy-test/1';
  public readonly requests: PatchMapAssetBackendRequest[] = [];
  public unloadCount = 0;

  public get(_request: PatchMapAssetBackendRequest): unknown {
    return undefined;
  }

  public load(request: PatchMapAssetBackendRequest): Promise<unknown> {
    this.requests.push(request);
    return Promise.resolve(Object.freeze({ decoded: true }));
  }

  public unload(_key: string): Promise<void> {
    this.unloadCount += 1;
    return Promise.resolve();
  }
}

describe('PatchMap asset ingestion policy', () => {
  it('uses package defaults and currently accepts three positive policy fields', () => {
    expect(normalizePatchMapAssetPolicy(undefined)).toEqual(PATCH_MAP_DEFAULT_ASSET_POLICY);
    expect(normalizePatchMapAssetPolicy({ maxDecodedWidth: 2048 })).toEqual({
      ...PATCH_MAP_DEFAULT_ASSET_POLICY,
      maxDecodedWidth: 2048,
    });
    expect(() => normalizePatchMapAssetPolicy({ maxEncodedBytes: 0 })).toThrowError(
      PatchMapAssetError,
    );
    expect(() => normalizePatchMapAssetPolicy({ origins: [] } as never)).toThrowError(
      PatchMapAssetError,
    );
  });

  it('admits direct URLs without an origin allowlist and passes normalized policy to the backend', async () => {
    const backend = new CountingBackend();
    const runtime = new PatchMapAssetRuntime(backend);
    const session = runtime.createSession({
      instanceId: 'direct-url',
      policy: { maxEncodedBytes: 1024 },
    });
    const descriptor = {
      src: 'https://any-origin.example.test/image.png#visible-fragment',
      data: { resolution: 1 },
    };
    const before = structuredClone(descriptor);

    const acquisition = await session.acquireSource(descriptor);
    expect(descriptor).toEqual(before);
    expect(backend.requests).toHaveLength(1);
    expect(backend.requests[0]).toMatchObject({
      descriptor,
      packageOwned: false,
      policy: {
        ...PATCH_MAP_DEFAULT_ASSET_POLICY,
        maxEncodedBytes: 1024,
      },
    });
    await acquisition.release();
    expect(backend.unloadCount).toBe(1);
  });

  it('fixes MIME and SVG safety while applying configurable byte and decoded-size limits', () => {
    const policy = normalizePatchMapAssetPolicy({
      maxEncodedBytes: 1_048_576,
      maxDecodedWidth: 4096,
      maxDecodedHeight: 4096,
    });
    expect(evaluatePatchMapAssetResponsePolicy(policy, {
      mediaType: 'image/png',
      encodedBytes: 1024,
      decodedWidth: 32,
      decodedHeight: 16,
    })).toEqual({ accepted: true, code: null, stage: 'accepted' });
    expect(evaluatePatchMapAssetResponsePolicy(policy, {
      mediaType: 'text/html',
      encodedBytes: 1024,
    })).toMatchObject({ accepted: false, stage: 'media-type' });
    expect(evaluatePatchMapAssetResponsePolicy(policy, {
      mediaType: 'image/png',
      encodedBytes: 1_048_577,
    })).toMatchObject({ accepted: false, stage: 'encoded-bytes' });
    expect(evaluatePatchMapAssetResponsePolicy(policy, {
      mediaType: 'image/png',
      encodedBytes: 1024,
      decodedWidth: 4097,
      decodedHeight: 16,
    })).toMatchObject({ accepted: false, stage: 'decoded-size' });
    expect(evaluatePatchMapAssetResponsePolicy(policy, {
      mediaType: 'image/svg+xml',
      encodedBytes: 128,
      svgText: '<svg><script>alert(1)</script></svg>',
    })).toMatchObject({ accepted: false, stage: 'svg-content' });
    expect(evaluatePatchMapAssetResponsePolicy(policy, {
      mediaType: 'image/svg+xml',
      encodedBytes: 128,
      svgText: '<svg><image href="https://evil.test/a.png"/></svg>',
    })).toMatchObject({ accepted: false, stage: 'svg-content' });
  });

  it('uses the closed INVALID_VALUE diagnostic for cyclic descriptors', () => {
    const descriptor: { src: string; data: { self?: unknown } } = {
      src: 'https://assets.example.test/cyclic.png',
      data: {},
    };
    descriptor.data.self = descriptor.data;
    const runtime = new PatchMapAssetRuntime(new CountingBackend());
    expect(() => runtime.sourceEntry(descriptor)).toThrowError(PatchMapAssetError);
    try {
      runtime.sourceEntry(descriptor);
    } catch (error) {
      expect(error).toMatchObject({
        code: 'INVALID_VALUE',
        category: 'INVALID_INPUT',
      });
    }
  });
});
