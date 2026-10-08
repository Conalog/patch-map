import type { PatchMapViewportOptions, PatchMapViewportSnapshot } from '../public/contracts';

export function normalizeViewportOptions(
  value: PatchMapViewportOptions | undefined,
): Readonly<{
  readonly wheel: Readonly<{ readonly activationModifier: 'none' | 'control' }>;
  readonly initial: PatchMapViewportSnapshot | null;
}> {
  if (value === undefined) {
    return Object.freeze({
      wheel: Object.freeze({ activationModifier: 'none' as const }),
      initial: null,
    });
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('viewport options must be an object');
  }
  const wheel = value.wheel;
  if (wheel !== undefined && (
    wheel === null || typeof wheel !== 'object' || Array.isArray(wheel)
  )) {
    throw new TypeError('viewport.wheel must be an object');
  }
  const activationModifier = wheel?.activationModifier ?? 'none';
  if (activationModifier !== 'none' && activationModifier !== 'control') {
    throw new TypeError('viewport.wheel.activationModifier must be none or control');
  }
  const initial = value.initial;
  if (initial !== undefined && (
    initial === null
    || typeof initial !== 'object'
    || Array.isArray(initial)
    || !Array.isArray(initial.centerWorld)
    || initial.centerWorld.length !== 2
    || !Number.isFinite(initial.centerWorld[0])
    || !Number.isFinite(initial.centerWorld[1])
    || !(initial.scale > 0)
    || !Number.isFinite(initial.scale)
  )) {
    throw new TypeError('viewport.initial requires finite centerWorld and positive scale');
  }
  return Object.freeze({
    wheel: Object.freeze({ activationModifier }),
    initial: initial === undefined
      ? null
      : Object.freeze({
          centerWorld: Object.freeze([...initial.centerWorld] as [number, number]),
          scale: initial.scale,
        }),
  });
}
