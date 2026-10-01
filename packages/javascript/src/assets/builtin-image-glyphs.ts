import deviceSvg from '../../../../shared/assets/icons/device.svg?raw';
import loadingSvg from '../../../../shared/assets/icons/loading.svg?raw';
import objectSvg from '../../../../shared/assets/icons/object.svg?raw';
import warningSvg from '../../../../shared/assets/icons/warning.svg?raw';
import wifiSvg from '../../../../shared/assets/icons/wifi.svg?raw';

/**
 * PatchMap package glyphs. The original 72x72 white artwork keeps
 * Pixi Sprite.tint multiplicative and the transparent canvas preserves the
 * production silhouette without a fallback tile.
 */
export const BUILTIN_IMAGE_SVGS = Object.freeze({
  object: objectSvg,
  device: deviceSvg,
  loading: loadingSvg,
  warning: warningSvg,
  wifi: wifiSvg,
});

export type BuiltinImageAlias = keyof typeof BUILTIN_IMAGE_SVGS;

export function builtinImageSvg(alias: BuiltinImageAlias): string {
  return BUILTIN_IMAGE_SVGS[alias];
}
