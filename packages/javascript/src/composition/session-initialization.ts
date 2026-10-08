import { PATCH_MAP_BUILTIN_FONT_ASSETS } from '../assets/registration-normalization';
import type { PatchMap } from '../engine';
import type { PatchMapInitializeOptions } from '../engine/contracts/product';
import type { PatchMapApi, PatchMapOptions, PatchMapViewportSnapshot } from '../public/contracts';

/** Shared admission order; each entry retains its surface and frame policy. */
export async function initializePatchMapSession(
  engine: PatchMap,
  api: PatchMapApi,
  options: Pick<PatchMapOptions, 'assets' | 'data' | 'fit'>,
  initialization: PatchMapInitializeOptions,
  initialViewport: PatchMapViewportSnapshot | null,
): Promise<void> {
  engine.registerAssets(initialization.instanceId);
  if (options.assets !== undefined) engine.registerAssets(initialization.instanceId, options.assets);
  await engine.initialize({ ...initialization, requiredAssets: [...PATCH_MAP_BUILTIN_FONT_ASSETS] });
  if (options.data !== undefined) {
    api.data.replace(options.data, {
      fit: initialViewport === null
        ? options.fit === undefined ? { padding: 24 } : options.fit
        : false,
    });
    await engine.settleSceneImages();
  }
  if (initialViewport !== null) engine.setViewportAbsolute(initialViewport);
}
