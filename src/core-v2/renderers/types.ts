import type { Container } from 'pixi.js';

import type { CoreView, SlotRange } from '../../core-v1/contracts';
import type { RenderStoreView } from '../../core-v1/renderer/types';

export type CoreV2RendererStrategy = 'mesh' | 'particle';
export type CoreV2BackendPreference = 'webgl' | 'webgpu';

export interface AggregateLayerSyncOptions {
  readonly changedRanges?: readonly SlotRange[];
  readonly fullRebuildEpoch?: number;
}

export interface AggregateLayerDebug {
  readonly strategy: CoreV2RendererStrategy;
  readonly renderObjects: number;
  readonly visiblePrimitives: number;
  readonly uploadedChunks: number;
  readonly uploadedBytes: number;
}

export interface AggregateLayerSyncResult {
  readonly renderObjects: number;
  readonly visiblePrimitives: number;
  readonly uploadedChunks: number;
  readonly uploadedBytes: number;
}

export interface AggregateLayer {
  readonly container: Container;
  sync(store: RenderStoreView, options?: AggregateLayerSyncOptions): AggregateLayerSyncResult;
  destroy(): void;
}

export interface RootInteractionHandlers {
  readonly pointerDown: (screenX: number, screenY: number, pointerId: number, button: number) => void;
  readonly pointerMove: (screenX: number, screenY: number, pointerId: number, buttons: number) => void;
  readonly pointerUp: (screenX: number, screenY: number, pointerId: number) => void;
  readonly pointerCancel: (pointerId: number) => void;
  readonly wheel: (screenX: number, screenY: number, deltaY: number) => void;
}

export interface PixiCoreV2RendererDebug {
  readonly strategy: CoreV2RendererStrategy;
  readonly backend: string;
  readonly frame: number;
  readonly storeEpoch: number;
  readonly entityCount: number;
  readonly aggregateRenderObjects: number;
  readonly visiblePrimitives: number;
  readonly uploadedChunks: number;
  readonly uploadedBytes: number;
  readonly dynamicFullUploadCount: number;
  readonly staticInvalidatedUploadCount: number;
  readonly particleFullUploadCount: number;
  readonly uploadObservation: 'dirty-chunk-bytes' | 'particle-full-upload-count';
  readonly bitmapTextCount: number;
  readonly fallbackTextCount: number;
  readonly imageCount: number;
  readonly loadedAssetCount: number;
  readonly unresolvedAssetCount: number;
  readonly view: CoreView;
  readonly lastInvalidation: string;
  readonly destroyed: boolean;
}
