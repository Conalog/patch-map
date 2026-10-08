import { initializePatchMapSession } from './session-initialization';
import { PatchMap } from '../engine';
import type { PatchMapEngineSurfaceFactory } from '../engine/contracts';
import { createPatchMapApi } from '../public';
import { createPatchMapImageApi } from '../public/image';
import type { PatchMapImageInstance, PatchMapImageOptions } from '../public/image-contracts';
import { normalizeViewportOptions } from './viewport-options';

let imageSequence = 0;

/** Creates a private, detached canvas without installing a managed frame loop. */
export async function createImagePatchMap(
  options: PatchMapImageOptions,
  surfaceFactory: PatchMapEngineSurfaceFactory,
): Promise<PatchMapImageInstance> {
  validateOptions(options);
  const viewport = normalizeViewportOptions(options.viewport);
  const instanceId = options.instanceId ?? `patch-map-image-${++imageSequence}`;
  const engine = new PatchMap({
    interactive: false,
    ...(options.assetRuntime === undefined ? {} : { assetRuntime: options.assetRuntime }),
    ...(options.assetPolicy === undefined ? {} : { assetPolicy: options.assetPolicy }),
    surfaceFactory,
  });
  const api = createPatchMapApi(engine);
  try {
    await initializePatchMapSession(engine, api, { ...options, fit: options.fit ?? { padding: 24 } }, {
      instanceId,
      width: options.width,
      height: options.height,
      pixelRatio: 1,
      strategy: 'mesh',
      preference: 'webgl',
      backend: 'webgl2',
      ...(options.theme === undefined ? {} : { theme: options.theme }),
      antialias: true,
      ...(options.background === undefined ? {} : { background: options.background }),
      ...(options.zoomLimits === undefined ? {} : { zoomLimits: options.zoomLimits }),
      ...(options.powerPreference === undefined ? {} : { powerPreference: options.powerPreference }),
    }, viewport.initial);
    return createPatchMapImageApi(engine, api);
  } catch (error) {
    await engine.destroy().catch(() => undefined);
    throw error;
  }
}

function validateOptions(options: PatchMapImageOptions): void {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('PatchMap.create requires an options object');
  }
  const allowed = new Set([
    'data', 'width', 'height', 'theme', 'instanceId', 'antialias', 'background',
    'zoomLimits', 'assets', 'assetRuntime', 'assetPolicy', 'fit', 'powerPreference', 'viewport',
  ]);
  for (const key of Object.keys(options)) {
    if (!allowed.has(key)) throw new TypeError(`PatchMap.create does not support ${key}`);
  }
  if (options.antialias !== undefined && options.antialias !== true) {
    throw new TypeError('Image sessions require antialias: true');
  }
  if (options.data === undefined) throw new TypeError('PatchMap.create requires data; use [] for an empty map');
  // Canvas dimensions are WebIDL unsigned longs; larger values silently wrap.
  if (!Number.isSafeInteger(options.width) || options.width <= 0 || options.width > 0xffff_ffff ||
      !Number.isSafeInteger(options.height) || options.height <= 0 || options.height > 0xffff_ffff) {
    throw new RangeError('width and height must be positive integers in output pixels within the canvas dimension range');
  }
  if (options.viewport !== undefined) {
    if (options.viewport === null || typeof options.viewport !== 'object' || Array.isArray(options.viewport)) {
      throw new TypeError('viewport options must be an object');
    }
    for (const key of Object.keys(options.viewport)) {
      if (key !== 'initial') throw new TypeError(`Image sessions do not support viewport.${key}`);
    }
  }
}
