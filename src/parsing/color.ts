import type { Rgba } from '../dense/contracts';

/**
 * Parse the CSS color subset accepted by PatchMap.
 *
 * The product intentionally keeps this parser independent from PixiJS color
 * conversion so canonical dataset interpretation stays deterministic in
 * browser, package-consumer, and headless environments.
 */
export function parsePatchMapCssColor(input: string): Rgba | undefined {
  const value = input.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/u.exec(value)?.[1];
  if (hex) {
    if (hex.length === 3) {
      return packPatchMapRgba(
        parseInt(hex[0]! + hex[0]!, 16),
        parseInt(hex[1]! + hex[1]!, 16),
        parseInt(hex[2]! + hex[2]!, 16),
        255,
      );
    }
    if (hex.length === 4) {
      return packPatchMapRgba(
        parseInt(hex[0]! + hex[0]!, 16),
        parseInt(hex[1]! + hex[1]!, 16),
        parseInt(hex[2]! + hex[2]!, 16),
        parseInt(hex[3]! + hex[3]!, 16),
      );
    }
    if (hex.length === 6) return (parseInt(hex, 16) * 0x100 + 0xff) >>> 0;
    if (hex.length === 8) return parseInt(hex, 16) >>> 0;
  }

  const rgb = /^rgba?\(\s*([^,]+),\s*([^,]+),\s*([^,)]+)(?:,\s*([^)]*))?\s*\)$/u.exec(
    value,
  );
  if (rgb) {
    const channels = rgb.slice(1, 4).map(cssChannel);
    const alpha = rgb[4] === undefined ? 255 : cssAlpha(rgb[4]);
    if (channels.every((channel) => channel !== undefined) && alpha !== undefined) {
      return packPatchMapRgba(channels[0]!, channels[1]!, channels[2]!, alpha);
    }
  }

  const hsl = /^hsla?\(\s*([^,]+),\s*([^,]+)%,\s*([^,)]+)%(?:,\s*([^)]*))?\s*\)$/u.exec(
    value,
  );
  if (hsl) {
    const hue = Number(hsl[1]);
    const saturation = Number(hsl[2]);
    const lightness = Number(hsl[3]);
    const alpha = hsl[4] === undefined ? 255 : cssAlpha(hsl[4]);
    if ([hue, saturation, lightness].every(Number.isFinite) && alpha !== undefined) {
      const [red, green, blue] = hslToRgb(
        hue,
        clamp01(saturation / 100),
        clamp01(lightness / 100),
      );
      return packPatchMapRgba(red, green, blue, alpha);
    }
  }

  return undefined;
}

export function multiplyPatchMapRgba(left: Rgba, right: Rgba): Rgba {
  return packPatchMapRgba(
    Math.round(((left >>> 24) & 0xff) * ((right >>> 24) & 0xff) / 255),
    Math.round(((left >>> 16) & 0xff) * ((right >>> 16) & 0xff) / 255),
    Math.round(((left >>> 8) & 0xff) * ((right >>> 8) & 0xff) / 255),
    Math.round((left & 0xff) * (right & 0xff) / 255),
  );
}

export function deterministicPatchMapTokenColor(value: string): Rgba {
  return ((fnv1a(value) & 0xffffff) * 0x100 + 0xff) >>> 0;
}

function cssChannel(value: string): number | undefined {
  const percentage = /^(-?(?:\d+\.?\d*|\.\d+))%$/u.exec(value.trim());
  const amount = percentage ? Number(percentage[1]) * 2.55 : Number(value);
  return Number.isFinite(amount)
    ? Math.round(Math.min(255, Math.max(0, amount)))
    : undefined;
}

function cssAlpha(value: string): number | undefined {
  const text = value.trim();
  const percentage = /^(-?(?:\d+\.?\d*|\.\d+))%$/u.exec(text);
  const amount = percentage ? Number(percentage[1]) / 100 : Number(text);
  return Number.isFinite(amount) ? Math.round(clamp01(amount) * 255) : undefined;
}

function hslToRgb(
  hue: number,
  saturation: number,
  lightness: number,
): [number, number, number] {
  const h = ((hue % 360) + 360) % 360 / 360;
  if (saturation === 0) {
    const gray = Math.round(lightness * 255);
    return [gray, gray, gray];
  }
  const q = lightness < 0.5
    ? lightness * (1 + saturation)
    : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const channel = (offset: number): number => {
    let value = h + offset;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  };
  return [
    Math.round(channel(1 / 3) * 255 + 1e-8),
    Math.round(channel(0) * 255 + 1e-8),
    Math.round(channel(-1 / 3) * 255 + 1e-8),
  ];
}

function packPatchMapRgba(red: number, green: number, blue: number, alpha: number): Rgba {
  return (
    ((red & 0xff) * 0x1000000) +
    ((green & 0xff) << 16) +
    ((blue & 0xff) << 8) +
    (alpha & 0xff)
  ) >>> 0;
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
