import type { SlotRange } from './dense/contracts';

/** Renderer-facing projection of the keyed presentation authority. */
export interface PatchMapPresentationLayerRenderUpdate {
  readonly revision: number;
  readonly layerCount: number;
  readonly full: boolean;
  /** Stable dense column owned by the presentation authority. */
  readonly alphaMultipliers: Float32Array<ArrayBufferLike>;
  readonly dirtyRanges: readonly SlotRange[] | undefined;
}

