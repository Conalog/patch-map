import { describe, expect, it } from 'vitest';

import {
  CoreV2AssetError,
  CoreV2AssetRuntime,
  createCoreV2AssetIngestionPolicy,
  evaluateCoreV2AssetResponsePolicy,
  type CoreV2AssetBackend,
  type CoreV2AssetBackendRequest,
  type CoreV2AssetIngestionPolicyProfile,
} from '../../src/core-v2';

const PROFILE: CoreV2AssetIngestionPolicyProfile = Object.freeze({
  protocols: Object.freeze(['https']),
  origins: Object.freeze(['https://assets.example.test']),
  redirects: 'revalidate',
  credentials: 'omit',
  mediaTypes: Object.freeze(['image/png']),
  maxEncodedBytes: 1_048_576,
  maxDecodedWidth: 4_096,
  maxDecodedHeight: 4_096,
});

class CountingBackend implements CoreV2AssetBackend {
  public readonly keyNamespace = 'asset-ingestion-policy-test/1';
  public getCount = 0;
  public loadCount = 0;
  public unloadCount = 0;

  public get(_request: CoreV2AssetBackendRequest): unknown {
    this.getCount += 1;
    return undefined;
  }

  public load(_request: CoreV2AssetBackendRequest): Promise<unknown> {
    this.loadCount += 1;
    return Promise.resolve(Object.freeze({ decoded: true }));
  }

  public unload(_key: string): Promise<void> {
    this.unloadCount += 1;
    return Promise.resolve();
  }
}

describe('Core v2 asset ingestion policy', () => {
  it('rejects disallowed descriptors before cache lookup or fetch', async () => {
    const backend = new CountingBackend();
    const runtime = new CoreV2AssetRuntime(backend);
    const session = runtime.createSession({
      instanceId: 'blocked-origin',
      policy: createCoreV2AssetIngestionPolicy(PROFILE),
    });

    await expect(
      session.acquireSource('https://blocked.example.test/image.png'),
    ).rejects.toMatchObject({
      code: 'ASSET_POLICY_REJECTED',
      category: 'ASSET_FAILURE',
      retryable: false,
    });
    expect(backend).toMatchObject({ getCount: 0, loadCount: 0, unloadCount: 0 });
    expect(session.probe()).toMatchObject({ pendingCount: 0, leaseCount: 0 });
    await session.destroy();
  });

  it('leases one allowed resource and releases the owned backend entry', async () => {
    const backend = new CountingBackend();
    const runtime = new CoreV2AssetRuntime(backend);
    const session = runtime.createSession({
      instanceId: 'allowed',
      policy: createCoreV2AssetIngestionPolicy(PROFILE),
    });
    const descriptor = {
      src: 'https://assets.example.test/image.png#visible-fragment',
      data: { resolution: 1 },
    };
    const before = structuredClone(descriptor);

    const acquisition = await session.acquireSource(descriptor);
    expect(descriptor).toEqual(before);
    expect(backend).toMatchObject({ getCount: 1, loadCount: 1, unloadCount: 0 });
    await acquisition.release();
    expect(backend.unloadCount).toBe(1);
    await session.destroy();
    expect(runtime.probe()).toMatchObject({
      resourceCount: 0,
      pendingCount: 0,
      leaseCount: 0,
    });
  });

  it('revalidates redirects, media, encoded bytes, decoded size, and SVG content', () => {
    expect(evaluateCoreV2AssetResponsePolicy(PROFILE, {
      requestUrl: 'https://assets.example.test/image.png',
      finalUrl: 'https://assets.example.test/image.png',
      mediaType: 'image/png',
      encodedBytes: 1_024,
      decodedWidth: 32,
      decodedHeight: 16,
    })).toEqual({ accepted: true, code: null, stage: 'accepted' });

    expect(evaluateCoreV2AssetResponsePolicy(PROFILE, {
      requestUrl: 'https://assets.example.test/image.png',
      finalUrl: 'https://blocked.example.test/image.png',
      redirectUrls: ['https://blocked.example.test/image.png'],
      mediaType: 'image/png',
      encodedBytes: 1_024,
    })).toMatchObject({ accepted: false, stage: 'redirect' });

    expect(evaluateCoreV2AssetResponsePolicy(PROFILE, {
      requestUrl: 'https://assets.example.test/image.png',
      finalUrl: 'https://assets.example.test/image.png',
      mediaType: 'image/svg+xml',
      encodedBytes: 1_024,
    })).toMatchObject({ accepted: false, stage: 'media-type' });

    expect(evaluateCoreV2AssetResponsePolicy(PROFILE, {
      requestUrl: 'https://assets.example.test/image.png',
      finalUrl: 'https://assets.example.test/image.png',
      mediaType: 'image/png',
      encodedBytes: 1_048_577,
    })).toMatchObject({ accepted: false, stage: 'encoded-bytes' });

    expect(evaluateCoreV2AssetResponsePolicy(PROFILE, {
      requestUrl: 'https://assets.example.test/image.png',
      finalUrl: 'https://assets.example.test/image.png',
      mediaType: 'image/png',
      encodedBytes: 1_024,
      decodedWidth: 4_097,
      decodedHeight: 16,
    })).toMatchObject({ accepted: false, stage: 'decoded-size' });

    const svgProfile = Object.freeze({
      ...PROFILE,
      mediaTypes: Object.freeze(['image/svg+xml']),
    });
    expect(evaluateCoreV2AssetResponsePolicy(svgProfile, {
      requestUrl: 'https://assets.example.test/image.svg',
      finalUrl: 'https://assets.example.test/image.svg',
      mediaType: 'image/svg+xml',
      encodedBytes: 128,
      svgText: '<svg><script>alert(1)</script></svg>',
    })).toMatchObject({ accepted: false, stage: 'svg-content' });
    expect(evaluateCoreV2AssetResponsePolicy(svgProfile, {
      requestUrl: 'https://assets.example.test/image.svg',
      finalUrl: 'https://assets.example.test/image.svg',
      mediaType: 'image/svg+xml',
      encodedBytes: 128,
      svgText: '<svg><image href="https://evil.test/a.png"/></svg>',
    })).toMatchObject({ accepted: false, stage: 'svg-content' });
  });

  it('uses the closed INVALID_VALUE diagnostic for cyclic descriptors', () => {
    const descriptor: {
      src: string;
      data: { self?: unknown };
    } = {
      src: 'https://assets.example.test/cyclic.png',
      data: {},
    };
    descriptor.data.self = descriptor.data;
    const runtime = new CoreV2AssetRuntime(new CountingBackend());
    expect(() => runtime.sourceEntry(descriptor)).toThrowError(CoreV2AssetError);
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
