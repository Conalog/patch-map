import { Assets } from 'pixi.js';

import type { PatchMapAssetDescriptor } from '../semantic/dataset';
import {
  PatchMapAssetError,
  type PatchMapAssetBackend,
  type PatchMapAssetBackendRequest,
  type PatchMapAssetIngestionPolicyProfile,
  type PatchMapPixiAssetBackendOptions,
} from './contracts';
import {
  assertPatchMapAssetResponseAllowed,
  createPatchMapAssetIngestionPolicy,
  normalizeMediaType,
} from './ingestion-policy';
import {
  BUILTIN_FIRA_CODE_URL,
  BUILTIN_FONT_WEIGHTS,
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
  return Object.freeze({
    keyNamespace,
    get(request: PatchMapAssetBackendRequest): unknown {
      if (options.ingestionPolicy !== undefined && !request.packageOwned) return undefined;
      const externalKey = externalBorrowKey(request);
      return externalKey === null ? undefined : Assets.get<unknown>(externalKey);
    },
    async load(request: PatchMapAssetBackendRequest): Promise<unknown> {
      if (options.ingestionPolicy && !request.packageOwned) {
        await createPatchMapAssetIngestionPolicy(options.ingestionPolicy)(Object.freeze({
          instanceId: 'patch-map-pixi-backend',
          descriptor: request.descriptor,
          cacheIdentity: request.cacheIdentity,
          packageOwned: false,
        }));
      }
      const logicalDescriptor = pixiDescriptor(request);
      let objectUrl: string | null = null;
      try {
        const descriptor = await isolatedPixiDescriptor(
          logicalDescriptor,
          fetchAsset,
          createObjectURL,
          request.packageOwned ? undefined : options.ingestionPolicy,
          options.inspectDecodedSize,
        );
        if (descriptor.src !== logicalDescriptor.src) {
          objectUrl = descriptor.src;
          ownedObjectUrls.set(request.key, objectUrl);
        }
        return await Assets.load({
          ...descriptor,
          alias: request.key,
        });
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
      await Assets.unload(key);
      if (objectUrl !== undefined) {
        ownedObjectUrls.delete(key);
        revokeObjectURL(objectUrl);
      }
    },
  });
}

function externalBorrowKey(request: PatchMapAssetBackendRequest): string | null {
  if (request.packageOwned || Object.keys(request.descriptor).length !== 1) return null;
  return request.descriptor.src;
}

function pixiDescriptor(request: PatchMapAssetBackendRequest): PatchMapAssetDescriptor {
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

  if (request.descriptor.src === 'patch-map-builtin://fonts/FiraCode.woff2') {
    return deepFreeze({
      src: BUILTIN_FIRA_CODE_URL,
      parser: 'web-font',
      data: {
        family: 'Fira Code',
        weights: BUILTIN_FONT_WEIGHTS.map(String),
      },
    });
  }

  throw new PatchMapAssetError('ASSET_LOAD_FAILED', 'ASSET_FAILURE', false);
}

async function isolatedPixiDescriptor(
  descriptor: PatchMapAssetDescriptor,
  fetchAsset: (src: string) => Promise<Blob>,
  createObjectURL: (blob: Blob) => string,
  ingestionPolicy?: PatchMapAssetIngestionPolicyProfile,
  inspectDecodedSize?: (
    blob: Blob,
  ) => Promise<Readonly<{ readonly width: number; readonly height: number }>>,
): Promise<PatchMapAssetDescriptor> {
  const blob = await fetchAsset(descriptor.src);
  if (ingestionPolicy) {
    const mediaType = normalizeMediaType(blob.type);
    const svgText = mediaType === 'image/svg+xml' ? await blob.text() : undefined;
    if (svgText !== undefined) {
      assertPatchMapAssetResponseAllowed(ingestionPolicy, {
        requestUrl: descriptor.src,
        finalUrl: descriptor.src,
        mediaType,
        encodedBytes: blob.size,
        svgText,
      });
    }
    const inspect = inspectDecodedSize ?? defaultInspectDecodedSize;
    if (mediaType.startsWith('image/') && inspect === null) {
      throw new PatchMapAssetError('ASSET_POLICY_REJECTED', 'ASSET_FAILURE', false);
    }
    const decoded = inspect === null ? undefined : await inspect(blob);
    assertPatchMapAssetResponseAllowed(ingestionPolicy, {
      requestUrl: descriptor.src,
      finalUrl: descriptor.src,
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
  const parser = descriptor.parser ?? inferAssetParser(descriptor, blob.type);
  return deepFreeze({
    ...descriptor,
    src: objectUrl,
    ...(parser === null ? {} : { parser }),
  });
}

const defaultInspectDecodedSize = typeof globalThis.createImageBitmap === 'function'
  ? async (blob: Blob): Promise<Readonly<{ readonly width: number; readonly height: number }>> => {
      const bitmap = await globalThis.createImageBitmap(blob);
      try {
        return Object.freeze({ width: bitmap.width, height: bitmap.height });
      } finally {
        bitmap.close();
      }
    }
  : null;

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
