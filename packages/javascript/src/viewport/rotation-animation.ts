/** Raw angles retain turns; directed paths interpret the target as a bearing. */
export type PatchMapRotationPath = 'raw' | 'clockwise' | 'counterclockwise' | 'shortest';

export interface PatchMapRotationAnimationOptions {
  readonly durationMs?: number;
  /** Defaults to raw. A shortest-path 180-degree tie rotates clockwise. */
  readonly path?: PatchMapRotationPath;
  /** Defaults to false. Normalize to [0, 360) only on successful completion. */
  readonly normalizeOnComplete?: boolean;
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

const BEARING_TOLERANCE = 1e-9;

/** Request-time planning; frame sampling does not repeat path or modulo work. */
export function planPatchMapRotationAnimation(
  from: number,
  target: number,
  options: PatchMapRotationAnimationOptions,
): Readonly<{ from: number; to: number; completedAngle: number; durationMs: number }> {
  if (!Number.isFinite(target)) throw new RangeError('rotation angle must be finite');
  const durationMs = options.durationMs === undefined ? 250 : options.durationMs;
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new RangeError('rotation durationMs must be nonnegative and finite');
  }
  const path = options.path === undefined ? 'raw' : options.path;
  if (path !== 'raw' && path !== 'clockwise' && path !== 'counterclockwise' && path !== 'shortest') {
    throw new TypeError('rotation path must be raw, clockwise, counterclockwise, or shortest');
  }
  const normalize = options.normalizeOnComplete === undefined ? false : options.normalizeOnComplete;
  if (typeof normalize !== 'boolean') {
    throw new TypeError('rotation normalizeOnComplete must be a boolean');
  }
  let to = target;
  if (path !== 'raw') {
    const distance = normalizeAngle(normalizeAngle(target) - normalizeAngle(from));
    // Fractional angles can acquire a few ulps when a full turn is added.
    const clockwise = Math.min(distance, 360 - distance) <= BEARING_TOLERANCE
      ? 0
      : Math.abs(distance - 180) <= BEARING_TOLERANCE ? 180 : distance;
    const delta = clockwise === 0 || path === 'clockwise' || (path === 'shortest' && clockwise <= 180)
      ? clockwise
      : clockwise - 360;
    to = from + delta;
    const bearingError = Math.abs(normalizeAngle(to) - normalizeAngle(target));
    // Outside this range even whole-degree path increments can disappear.
    if (
      Math.abs(from) > Number.MAX_SAFE_INTEGER || Math.abs(to) > Number.MAX_SAFE_INTEGER ||
      Math.min(bearingError, 360 - bearingError) > BEARING_TOLERANCE
    ) {
      throw new RangeError('directed rotation cannot represent the target bearing at the current angle');
    }
  }
  return { from, to, completedAngle: normalize ? normalizeAngle(target) : to, durationMs };
}

function normalizeAngle(angle: number): number {
  const remainder = angle % 360;
  if (remainder === 0) return 0;
  // Tiny negative values can round up to 360 when adding a full turn.
  return remainder < 0 ? (remainder + 360) % 360 : remainder;
}
