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
  PatchMapAssetError,
  PatchMapAssetRuntime,
  createPatchMapAssetIngestionPolicy,
  createPatchMapPixiAssetBackend,
} from './assets';
export type {
  PatchMapAssetPolicy,
  PatchMapAssetPolicyContext,
  PatchMapAssetBackend,
  PatchMapAssetBackendRequest,
  PatchMapAssetIngestionPolicyProfile,
  PatchMapAssetRegistration,
  PatchMapAssetRegistrationResult,
  PatchMapAssetResourceProbe,
  PatchMapAssetRuntimeProbe,
  PatchMapAssetSessionProbe,
  PatchMapPixiAssetBackendOptions,
} from './assets';
export type { PatchMapHistoryState } from './history';
export type * from './public/contracts';
export type * from './public/input';
