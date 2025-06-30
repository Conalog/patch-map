import { z } from 'zod';
import {
  Base,
  Margin,
  Placement,
  PxOrPercentSize,
  TextStyle,
  TextureStyle,
  Tint,
} from './primitive-schema';

/**
 * An Item's background, sourced from a style object or an asset URL.
 * Visually represented by a `NineSliceSprite`.
 * @see {@link https://pixijs.download/release/docs/scene.NineSliceSprite.html}
 */
export const backgroundSchema = Base.extend({
  type: z.literal('background'),
  source: z.union([TextureStyle, z.string()]),
  tint: Tint.optional(),
}).strict();

/**
 * A component for progress bars or bar graphs.
 * Visually represented by a `NineSliceSprite`.
 * @see {@link https://pixijs.download/release/docs/scene.NineSliceSprite.html}
 */
export const barSchema = Base.merge(PxOrPercentSize)
  .extend({
    type: z.literal('bar'),
    source: TextureStyle,
    placement: Placement.default('bottom'),
    margin: Margin.default(0),
    tint: Tint.optional(),
    animation: z.boolean().default(true),
    animationDuration: z.number().default(200),
  })
  .strict();

/**
 * A component for displaying an icon image.
 * Visually represented by a `Sprite`.
 * @see {@link https://pixijs.download/release/docs/scene.Sprite.html}
 */
export const iconSchema = Base.merge(PxOrPercentSize)
  .extend({
    type: z.literal('icon'),
    source: z.string(),
    placement: Placement.default('center'),
    margin: Margin.default(0),
    tint: Tint.optional(),
  })
  .strict();

/**
 * A text label component.
 * Visually represented by a `BitmapText`.
 * @see {@link https://pixijs.download/release/docs/scene.BitmapText.html}
 */
export const textSchema = Base.extend({
  type: z.literal('text'),
  placement: Placement.default('center'),
  margin: Margin.default(0),
  tint: Tint.optional(),
  text: z.string().default(''),
  style: TextStyle,
  split: z.number().int().default(0),
}).strict();

export const componentSchema = z.discriminatedUnion('type', [
  backgroundSchema,
  barSchema,
  iconSchema,
  textSchema,
]);

export const componentArraySchema = componentSchema.array();
