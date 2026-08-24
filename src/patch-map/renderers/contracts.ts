import type {
  PatchMapAssetPolicy,
  PatchMapAssetSession,
} from '../assets';
import type { PatchMapTextProjection } from '../contracts';
import type {
  PatchMapBitmapTextCapabilityProof,
  PatchMapTextRenderStyle,
} from '../semantic/text-render-route';
import type {
  PatchMapBackendPreference,
  PatchMapRendererStrategy,
} from './types';

export type PatchMapRendererRuntimeErrorCode =
  | 'UNSUPPORTED_RUNTIME'
  | 'RENDERER_LOST';

/** Neutral renderer failure consumed by runtime orchestration. */
export class PatchMapRendererRuntimeError extends Error {
  public readonly code: PatchMapRendererRuntimeErrorCode;

  public constructor(code: PatchMapRendererRuntimeErrorCode, message: string) {
    super(message);
    this.name = 'PatchMapRendererRuntimeError';
    this.code = code;
  }
}

export interface PatchMapBitmapTextCapabilityRequest {
  readonly entityId: string;
  readonly text: string;
  readonly style: PatchMapTextRenderStyle;
  readonly projection: PatchMapTextProjection | null;
}

/** Construction contract shared by the runtime and the PixiJS adapter. */
export interface PatchMapPixiRendererOptions {
  readonly target?: HTMLElement;
  readonly canvas?: HTMLCanvasElement;
  readonly width?: number;
  readonly height?: number;
  readonly pixelRatio?: number;
  readonly strategy?: PatchMapRendererStrategy;
  readonly preference?: PatchMapBackendPreference;
  readonly antialias?: boolean;
  readonly background?: number;
  readonly powerPreference?: 'high-performance' | 'low-power';
  /** Reject a WebGL renderer unless Pixi reports a live WebGL2 context. */
  readonly requireWebGL2?: boolean;
  /** Register this Application with the official PixiJS DevTools hook. */
  readonly devtools?: boolean;
  readonly assetSession?: PatchMapAssetSession;
  readonly assetPolicy?: PatchMapAssetPolicy;
  readonly resolveBitmapTextCapability?: (
    request: PatchMapBitmapTextCapabilityRequest,
  ) => PatchMapBitmapTextCapabilityProof | null;
}
