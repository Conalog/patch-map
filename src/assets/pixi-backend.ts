import { Assets } from 'pixi.js';

import type { PatchMapAssetDescriptor } from '../semantic/dataset';
import { PATCH_MAP_FIRA_CODE_FAMILY } from '../semantic/text-font-family';
import { stableHash64Hex as stableHash } from '../shared/stable-hash';
import {
  PatchMapAssetError,
  type PatchMapAssetBackend,
  type PatchMapAssetBackendRequest,
  type PatchMapResolvedAssetPolicy,
  type PatchMapPixiAssetBackendOptions,
} from './contracts';
import {
  assertPatchMapAssetResponseAllowed,
  normalizePatchMapAssetPolicy,
  normalizeMediaType,
} from './ingestion-policy';
import {
  BUILTIN_FIRA_CODE_FACES,
  BUILTIN_IMAGE_ALIASES,
  builtinImageDataUri,
  deepFreeze,
} from './registration-normalization';

let pixiBackendSequence = 0;

export function createPatchMapPixiAssetBackend(
  options: PatchMapPixiAssetBackendOptions = {},
): PatchMapAssetBackend {
  const keyNamespace = `pixi-assets-${++pixiBackendSequence}`;
  const fetchAsset = options.fetchAsset ?? defaultFetchAsset;
  const createObjectURL = options.createObjectURL ?? ((blob: Blob) => URL.createObjectURL(blob));
  const revokeObjectURL = options.revokeObjectURL ?? ((url: string) => URL.revokeObjectURL(url));
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
          fetchAsset,
          createObjectURL,
          revokeObjectURL,
          request.packageOwned ? undefined : normalizePatchMapAssetPolicy(request.policy),
          options.inspectDecodedSize,
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
          revokeObjectURL(objectUrl);
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
        revokeObjectURL(objectUrl);
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

  const fontFace = BUILTIN_FIRA_CODE_FACES.find(
    ({ descriptorSource }) => descriptorSource === request.descriptor.src,
  );
  if (fontFace !== undefined) {
    const { builtinFiraCodeUrl } = await import('./builtin-font-payload');
    return deepFreeze({
      src: builtinFiraCodeUrl(fontFace.fontWeight),
      parser: 'web-font',
      data: {
        family: PATCH_MAP_FIRA_CODE_FAMILY,
        weights: [String(fontFace.fontWeight)],
      },
    });
  }

  throw new PatchMapAssetError('ASSET_LOAD_FAILED', 'ASSET_FAILURE', false);
}

async function isolatedPixiDescriptor(
  descriptor: PatchMapAssetDescriptor,
  fetchAsset: (src: string) => Promise<Blob>,
  createObjectURL: (blob: Blob) => string,
  revokeObjectURL: (url: string) => void,
  policy?: PatchMapResolvedAssetPolicy,
  inspectDecodedSize?: (
    blob: Blob,
  ) => Promise<Readonly<{ readonly width: number; readonly height: number }>>,
): Promise<PatchMapAssetDescriptor> {
  const blob = await fetchAsset(descriptor.src);
  const parser = descriptor.parser ?? inferAssetParser(descriptor, blob.type);
  if (policy) {
    const mediaType = normalizeMediaType(blob.type);
    if ((parser === 'svg') !== (mediaType === 'image/svg+xml')) {
      throw new PatchMapAssetError('ASSET_POLICY_REJECTED', 'ASSET_FAILURE', false);
    }
    const svgText = mediaType === 'image/svg+xml' ? await blob.text() : undefined;
    if (svgText !== undefined) {
      assertPatchMapAssetResponseAllowed(policy, {
        mediaType,
        encodedBytes: blob.size,
        svgText,
      });
    }
    const inspect = inspectDecodedSize ?? defaultDecodedSizeInspector(
      createObjectURL,
      revokeObjectURL,
    );
    if (mediaType.startsWith('image/') && inspect === null) {
      throw new PatchMapAssetError('ASSET_POLICY_REJECTED', 'ASSET_FAILURE', false);
    }
    const decoded = inspect === null
      ? undefined
      : decodedSizeForPolicy(descriptor, mediaType, await inspect(blob));
    assertPatchMapAssetResponseAllowed(policy, {
      mediaType,
      encodedBytes: blob.size,
      ...(decoded === undefined
        ? {}
        : {
            decodedWidth: decoded.width,
            decodedHeight: decoded.height,
          }),
      ...(svgText === undefined ? {} : { svgText }),
    });
  }
  const objectUrl = createObjectURL(blob);
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

function defaultDecodedSizeInspector(
  createObjectURL: (blob: Blob) => string,
  revokeObjectURL: (url: string) => void,
): ((
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
      const objectUrl = createObjectURL(blob);
      try {
        const image = new globalThis.Image();
        image.src = objectUrl;
        await image.decode();
        return Object.freeze({
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
      } finally {
        revokeObjectURL(objectUrl);
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
    mediaType.startsWith('font/')
  ) {
    return 'web-font';
  }
  return null;
}
