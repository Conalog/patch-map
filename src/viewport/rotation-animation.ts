/** Optional smooth whole-map rotation; angles preserve complete turns. */
export interface PatchMapRotationAnimationOptions {
  readonly durationMs?: number;
}

export interface PatchMapRotationAnimationResult {
  readonly status: 'completed' | 'cancelled' | 'failed';
  readonly angle: number;
}

export interface PatchMapRotationAnimation {
  readonly finished: Promise<PatchMapRotationAnimationResult>;
  /** Stop at the current angle. Returns false once this request has ended. */
  cancel(): boolean;
}
