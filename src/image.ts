/** Intentional public entry for `@conalog/patch-map/image`. */
import { createImagePatchMap } from './composition/image';
import { createPixiSurface } from './composition/pixi-engine-surface';
import type { PatchMapImageOptions, PatchMapImageStatic, PatchMapImageInstance } from './public/image-contracts';

const ImagePatchMap = class PatchMap {
  private constructor() {
    throw new TypeError('PatchMap cannot be constructed directly; use PatchMap.create(...)');
  }

  public static create(options: PatchMapImageOptions): Promise<PatchMapImageInstance> {
    if (globalThis.document === undefined) {
      return Promise.reject(new TypeError('PatchMap.create requires a browser with WebGL2'));
    }
    return createImagePatchMap(options, createPixiSurface);
  }
};

export const PatchMap: PatchMapImageStatic = Object.freeze(ImagePatchMap);
export type PatchMap = PatchMapImageInstance;
export { PatchMapError } from './engine/operation-outcomes';
export type {
  PatchMapImageOptions as PatchMapOptions,
  PatchMapImageInstance as PatchMapInstance,
  PatchMapImageRenderOptions as PatchMapRenderOptions,
  PatchMapImageResult as PatchMapRenderResult,
  PatchMapImageMutationOptions as PatchMapMutationOptions,
  PatchMapImageTransactionOptions as PatchMapTransactionOptions,
} from './public/image-contracts';
export type {
  PatchMapUpdate,
  PatchMapUpdateBatch,
  PatchMapUpdateColumn,
  PatchMapUpdateResult,
  PatchMapTransactionOperation,
  PatchMapFitOptions,
  PatchMapViewportSnapshot,
  PatchMapDiagnostic,
} from './public/contracts';
export type * from './public/input';
