import type { CoreView } from '../../dense/contracts';
import type {
  PatchMapWorldOrientation,
} from '../../geometry/render-quads';

export function sameStringSet(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): boolean {
  if (left === right) return true;
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

export function sameView(left: CoreView, right: CoreView): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.scale === right.scale &&
    (left.rotation ?? 0) === (right.rotation ?? 0)
  );
}

export function sameWorldOrientation(
  left: PatchMapWorldOrientation,
  right: PatchMapWorldOrientation,
): boolean {
  return left.rotationDegrees === right.rotationDegrees &&
    left.flipX === right.flipX &&
    left.flipY === right.flipY;
}

export function packedRgb(value: number): number {
  return (value >>> 8) & 0xffffff;
}

export function packedAlpha(value: number): number {
  return (value & 0xff) / 255;
}

export function positive(value: number, name: string): number {
  if (!(value > 0) || !Number.isFinite(value)) {
    throw new RangeError(`${name} must be positive and finite`);
  }
  return value;
}
