/** Intentional public entry for `@conalog/patch-map`. */
import { createPixiSurface } from './composition/pixi-engine-surface';
import { mountPatchMap } from './composition/mount';
import type {
  PatchMapInstance,
  PatchMapOptions,
  PatchMapStatic,
} from './public';

const PublicPatchMap = class PatchMap {
  private constructor() {
    throw new TypeError('PatchMap cannot be constructed directly; use PatchMap.mount(...)');
  }

  public static mount(options: PatchMapOptions): Promise<PatchMapInstance> {
    return mountPatchMap(options, createPixiSurface);
  }
};

/** Mounts the aggregate PixiJS PatchMap product. */
export const PatchMap: PatchMapStatic = Object.freeze(PublicPatchMap);
export type PatchMap = PatchMapInstance;

export { PatchMapError } from './engine/operation-outcomes';
export {
  PATCH_MAP_BUILTIN_ASSETS,
  PATCH_MAP_DEFAULT_ASSET_POLICY,
  PatchMapAssetError,
  PatchMapAssetRuntime,
  createPatchMapPixiAssetBackend,
} from './assets';
export type {
  PatchMapAssetPolicy,
  PatchMapResolvedAssetPolicy,
  PatchMapAssetBackend,
  PatchMapAssetBackendRequest,
  PatchMapAssetRegistration,
  PatchMapAssetRegistrationResult,
  PatchMapAssetResourceProbe,
  PatchMapAssetRuntimeProbe,
  PatchMapAssetSessionProbe,
} from './assets';
export type { PatchMapHistoryState } from './history';
export type * from './public/contracts';
export type * from './public/input';
