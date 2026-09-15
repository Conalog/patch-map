import combinerSvg from '../resources/icons/combiner.svg?raw';
import deviceSvg from '../resources/icons/device.svg?raw';
import edgeSvg from '../resources/icons/edge.svg?raw';
import inverterSvg from '../resources/icons/inverter.svg?raw';
import loadingSvg from '../resources/icons/loading.svg?raw';
import objectSvg from '../resources/icons/object.svg?raw';
import warningSvg from '../resources/icons/warning.svg?raw';
import wifiSvg from '../resources/icons/wifi.svg?raw';

/**
 * PatchMap package glyphs. The original 72x72 white artwork keeps
 * Pixi Sprite.tint multiplicative and the transparent canvas preserves the
 * production silhouette without a fallback tile.
 */
export const BUILTIN_IMAGE_SVGS = Object.freeze({
  object: objectSvg,
  inverter: inverterSvg,
  combiner: combinerSvg,
  device: deviceSvg,
  edge: edgeSvg,
  loading: loadingSvg,
  warning: warningSvg,
  wifi: wifiSvg,
});

export type BuiltinImageAlias = keyof typeof BUILTIN_IMAGE_SVGS;

export function builtinImageSvg(alias: BuiltinImageAlias): string {
  return BUILTIN_IMAGE_SVGS[alias];
}
