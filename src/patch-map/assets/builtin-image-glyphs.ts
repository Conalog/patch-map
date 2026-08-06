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

/**
 * Square view boxes fitted to each glyph's visible geometry. Keeping these
 * square preserves artwork aspect ratio when public icon width and height are
 * equal, while removing the legacy 72x72 canvas padding from runtime sizing.
 */
export const BUILTIN_IMAGE_RUNTIME_VIEW_BOXES = Object.freeze({
  object: Object.freeze([6, 6, 60, 60] as const),
  inverter: Object.freeze([9, 9, 54, 54] as const),
  combiner: Object.freeze([6, 6, 60, 60] as const),
  device: Object.freeze([6, 6, 60, 60] as const),
  edge: Object.freeze([7.475, 7, 57, 57] as const),
  loading: Object.freeze([6, 5.8722, 60, 60] as const),
  warning: Object.freeze([3, 3.075, 66.375, 66.375] as const),
  wifi: Object.freeze([1.8711, 3.3711, 68.2578, 68.2578] as const),
} satisfies Readonly<Record<BuiltinImageAlias, readonly [number, number, number, number]>>);

export function builtinImageSvg(alias: BuiltinImageAlias): string {
  return BUILTIN_IMAGE_SVGS[alias];
}

export function builtinImageRuntimeSvg(alias: BuiltinImageAlias): string {
  const viewBox = BUILTIN_IMAGE_RUNTIME_VIEW_BOXES[alias].join(' ');
  return builtinImageSvg(alias).replace('viewBox="0 0 72 72"', `viewBox="${viewBox}"`);
}
