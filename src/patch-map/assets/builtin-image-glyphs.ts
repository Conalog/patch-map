import combinerSvg from '../../assets/icons/combiner.svg?raw';
import deviceSvg from '../../assets/icons/device.svg?raw';
import edgeSvg from '../../assets/icons/edge.svg?raw';
import inverterSvg from '../../assets/icons/inverter.svg?raw';
import loadingSvg from '../../assets/icons/loading.svg?raw';
import objectSvg from '../../assets/icons/object.svg?raw';
import warningSvg from '../../assets/icons/warning.svg?raw';
import wifiSvg from '../../assets/icons/wifi.svg?raw';

/**
 * PATCH MAP v0.10 package glyphs. The original 72x72 white artwork keeps
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
