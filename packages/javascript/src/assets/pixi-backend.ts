import { Assets } from 'pixi.js';

import type { PatchMapAssetDescriptor } from '../semantic/dataset';
import { PATCH_MAP_FIRA_CODE_FAMILY } from '../semantic/text-font-family';
import { stableHash64Hex as stableHash } from '../shared/stable-hash';
import {
  PatchMapAssetError,
  type PatchMapAssetBackend,
  type PatchMapAssetBackendRequest,
  type PatchMapResolvedAssetPolicy,
} from './contracts';
import {
  assertPatchMapAssetResponseAllowed,
  normalizePatchMapAssetPolicy,
  normalizeMediaType,
} from './ingestion-policy';
import {
  BUILTIN_FIRA_CODE_ASSET,
  BUILTIN_FIRA_CODE_WEIGHT_STRINGS,
  BUILTIN_IMAGE_ALIASES,
  builtinImageDataUri,
  deepFreeze,
} from './registration-normalization';

let pixiBackendSequence = 0;

export function createPatchMapPixiAssetBackend(): PatchMapAssetBackend {
  const keyNamespace = `pixi-assets-${++pixiBackendSequence}`;
  const ownedObjectUrls = new Map<string, string>();
  const ownedPixiKeys = new Map<string, string>();
  return Object.freeze({
    keyNamespace,
    get(_request: PatchMapAssetBackendRequest): unknown {
      // Host resources always pass through the package-owned fetch, MIME, byte,
      // and decoded-size boundary. A global Pixi cache hit has no admission evidence.
      return undefined;
    },
    async load(request: PatchMapAssetBackendRequest): Promise<unknown> {
      const logicalDescriptor = await pixiDescriptor(request);
      const pixiKey = physicalPixiKey(request, logicalDescriptor);
      let objectUrl: string | null = null;
      try {
        const descriptor = await isolatedPixiDescriptor(
          logicalDescriptor,
          request.packageOwned ? undefined : normalizePatchMapAssetPolicy(request.policy),
        );
        if (descriptor.src !== logicalDescriptor.src) {
          objectUrl = descriptor.src;
          ownedObjectUrls.set(request.key, objectUrl);
        }
        const resource = await (Assets.load({
          ...descriptor,
          alias: pixiKey,
        }) as Promise<unknown>);
        ownedPixiKeys.set(request.key, pixiKey);
        return resource;
      } catch (error) {
        if (objectUrl !== null) {
          ownedObjectUrls.delete(request.key);
          URL.revokeObjectURL(objectUrl);
        }
        throw error;
      }
    },
    async unload(key: string): Promise<void> {
      const objectUrl = ownedObjectUrls.get(key);
      await Assets.unload(ownedPixiKeys.get(key) ?? key);
      ownedPixiKeys.delete(key);
      if (objectUrl !== undefined) {
        ownedObjectUrls.delete(key);
        URL.revokeObjectURL(objectUrl);
      }
    },
  });
}

function physicalPixiKey(
  request: PatchMapAssetBackendRequest,
  descriptor: PatchMapAssetDescriptor,
): string {
  if (!request.packageOwned || !descriptor.src.startsWith('data:image/svg+xml')) {
    return request.key;
  }
  return `${request.key}:content:${stableHash(descriptor.src)}`;
}

async function pixiDescriptor(
  request: PatchMapAssetBackendRequest,
): Promise<PatchMapAssetDescriptor> {
  if (!request.packageOwned) return request.descriptor;

  const imageMatch = /^patch-map-builtin:\/\/images\/([a-z]+)\.svg$/.exec(
    request.descriptor.src,
  );
  const imageAlias = imageMatch?.[1];
  if (imageAlias && BUILTIN_IMAGE_ALIASES.some((alias) => alias === imageAlias)) {
    return Object.freeze({
      src: builtinImageDataUri(imageAlias),
      parser: 'svg',
    });
  }

  if (request.descriptor.src === BUILTIN_FIRA_CODE_ASSET.descriptorSource) {
    const { builtinFiraCodeUrl } = await import('./builtin-font-payload');
    return deepFreeze({
      src: await builtinFiraCodeUrl(),
      parser: 'web-font',
      data: {
        family: PATCH_MAP_FIRA_CODE_FAMILY,
        weights: BUILTIN_FIRA_CODE_WEIGHT_STRINGS,
      },
    });
  }

  throw new PatchMapAssetError('ASSET_LOAD_FAILED', 'ASSET_FAILURE', false);
}

async function isolatedPixiDescriptor(
  descriptor: PatchMapAssetDescriptor,
  policy?: PatchMapResolvedAssetPolicy,
): Promise<PatchMapAssetDescriptor> {
  const blob = await defaultFetchAsset(descriptor.src);
  const parser = descriptor.parser ?? inferAssetParser(descriptor, blob.type);
  if (policy) {
    const mediaType = normalizeMediaType(blob.type);
    const responseMetadata = Object.freeze({
      mediaType,
      encodedBytes: blob.size,
    });
    assertPatchMapAssetResponseAllowed(policy, responseMetadata);
    if ((parser === 'svg') !== (mediaType === 'image/svg+xml')) {
      throw new PatchMapAssetError('ASSET_POLICY_REJECTED', 'ASSET_FAILURE', false);
    }
    const svgText = mediaType === 'image/svg+xml' ? await blob.text() : undefined;
    if (svgText !== undefined) {
      assertPatchMapAssetResponseAllowed(policy, {
        ...responseMetadata,
        svgText,
      });
    }
    let decoded: Readonly<{ readonly width: number; readonly height: number }> | undefined;
    if (mediaType.startsWith('image/')) {
      const inspect = defaultDecodedSizeInspector();
      if (inspect === null) {
        throw new PatchMapAssetError('ASSET_POLICY_REJECTED', 'ASSET_FAILURE', false);
      }
      decoded = decodedSizeForPolicy(descriptor, mediaType, await inspect(blob));
    }
    assertPatchMapAssetResponseAllowed(policy, {
      ...responseMetadata,
      ...(decoded === undefined
        ? {}
        : {
            decodedWidth: decoded.width,
            decodedHeight: decoded.height,
          }),
      ...(svgText === undefined ? {} : { svgText }),
    });
  }
  const objectUrl = URL.createObjectURL(blob);
  return deepFreeze({
    ...descriptor,
    src: objectUrl,
    ...(parser === null ? {} : { parser }),
  });
}

function decodedSizeForPolicy(
  descriptor: PatchMapAssetDescriptor,
  mediaType: string,
  decoded: Readonly<{ readonly width: number; readonly height: number }>,
): Readonly<{ readonly width: number; readonly height: number }> {
  if (mediaType !== 'image/svg+xml') return decoded;
  const width = descriptor.data?.width ?? decoded.width;
  const height = descriptor.data?.height ?? decoded.height;
  const resolution = descriptor.data?.resolution ?? 1;
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    typeof resolution !== 'number'
  ) {
    return Object.freeze({ width: Number.NaN, height: Number.NaN });
  }
  return Object.freeze({
    width: Math.ceil(width * resolution),
    height: Math.ceil(height * resolution),
  });
}

function defaultDecodedSizeInspector(): ((
  blob: Blob,
) => Promise<Readonly<{ readonly width: number; readonly height: number }>>) | null {
  if (
    typeof globalThis.createImageBitmap !== 'function' &&
    typeof globalThis.Image !== 'function'
  ) {
    return null;
  }
  return async (blob: Blob) => {
    if (normalizeMediaType(blob.type) === 'image/svg+xml') {
      if (typeof globalThis.Image !== 'function') {
        throw new PatchMapAssetError('ASSET_POLICY_REJECTED', 'ASSET_FAILURE', false);
      }
      const objectUrl = URL.createObjectURL(blob);
      try {
        const image = new globalThis.Image();
        image.src = objectUrl;
        await image.decode();
        return Object.freeze({
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }
    if (typeof globalThis.createImageBitmap !== 'function') {
      throw new PatchMapAssetError('ASSET_POLICY_REJECTED', 'ASSET_FAILURE', false);
    }
    const bitmap = await globalThis.createImageBitmap(blob);
    try {
      return Object.freeze({ width: bitmap.width, height: bitmap.height });
    } finally {
      bitmap.close();
    }
  };
}

async function defaultFetchAsset(src: string): Promise<Blob> {
  const response = await fetch(src, {
    credentials: 'omit',
    redirect: 'error',
  });
  if (!response.ok) throw new PatchMapAssetError('ASSET_LOAD_FAILED', 'ASSET_FAILURE', true);
  return response.blob();
}

function inferAssetParser(
  descriptor: PatchMapAssetDescriptor,
  mimeType: string,
): string | null {
  const format = descriptor.format?.toLowerCase();
  const sourcePath = descriptor.src.split(/[?#]/u, 1)[0]?.toLowerCase() ?? '';
  const mediaType = mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (format === 'svg' || sourcePath.endsWith('.svg') || mediaType === 'image/svg+xml') {
    return 'svg';
  }
  if (
    ['png', 'jpg', 'jpeg', 'webp', 'avif'].includes(format ?? '') ||
    /\.(?:png|jpe?g|webp|avif)$/u.test(sourcePath) ||
    mediaType.startsWith('image/')
  ) {
    return 'texture';
  }
  if (
    ['woff', 'woff2', 'ttf', 'otf'].includes(format ?? '') ||
    /\.(?:woff2?|ttf|otf)$/u.test(sourcePath) ||
    mediaType.startsWith('font/') ||
    mediaType === 'application/font-woff'
  ) {
    return 'web-font';
  }
  return null;
}
