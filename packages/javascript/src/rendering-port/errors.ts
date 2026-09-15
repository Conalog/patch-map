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
