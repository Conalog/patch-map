/**
 * color.d.ts
 *
 * This file contains TypeScript definitions for various color formats
 * based on the Zod schemas. It is intended for developers to understand
 * the valid data structures for color-related properties.
 */

import type { Color as PixiColor } from 'pixi.js';

/**
 * An object representing a color in the RGB (Red, Green, Blue) model.
 * Each channel is a number, typically from 0 to 255.
 */
export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

/**
 * An object representing a color in the RGBA (Red, Green, Blue, Alpha) model.
 * The alpha channel represents transparency.
 */
export interface RgbaColor extends RgbColor {
  a: number;
}

/**
 * An object representing a color in the HSL (Hue, Saturation, Lightness) model.
 */
export interface HslColor {
  h: number;
  s: number;
  l: number;
}

/**
 * An object representing a color in the HSLA (Hue, Saturation, Lightness, Alpha) model.
 */
export interface HslaColor extends HslColor {
  a: number;
}

/**
 * An object representing a color in the HSV (Hue, Saturation, Value) model.
 */
export interface HsvColor {
  h: number;
  s: number;
  v: number;
}

/**
 * An object representing a color in the HSVA (Hue, Saturation, Value, Alpha) model.
 */
export interface HsvaColor extends HsvColor {
  a: number;
}

/**
 * Represents an instance of the PixiJS Color class.
 * @see {@link https://pixijs.download/release/docs/color.Color.html}
 */
export type Color = PixiColor;
