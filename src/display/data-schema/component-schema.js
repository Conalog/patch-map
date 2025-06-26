import { z } from 'zod';
import {
  Base,
  Margin,
  Placement,
  PxOrPercentSize,
  TextStyle,
  TextureStyle,
} from './primitive-schema';

/**
 * An Item's background, sourced from a style object or an asset URL.
 * Visually represented by a `NineSliceSprite`.
 * @see {@link https://pixijs.download/release/docs/scene.NineSliceSprite.html}
 */
export const Background = Base.extend({
  type: z.literal('background'),
  source: z.union([TextureStyle, z.string()]),
}).strict();

/**
 * A component for progress bars or bar graphs.
 * Visually represented by a `NineSliceSprite`.
 * @see {@link https://pixijs.download/release/docs/scene.NineSliceSprite.html}
 */
export const Bar = Base.merge(PxOrPercentSize)
  .extend({
    type: z.literal('bar'),
    source: TextureStyle,
    placement: Placement.default('bottom'),
    margin: Margin.default(0),
    animation: z.boolean().default(true),
    animationDuration: z.number().default(200),
  })
  .strict();

/**
 * A component for displaying an icon image.
 * Visually represented by a `Sprite`.
 * @see {@link https://pixijs.download/release/docs/scene.Sprite.html}
 */
export const Icon = Base.merge(PxOrPercentSize)
  .extend({
    type: z.literal('icon'),
    source: z.string(),
    placement: Placement.default('center'),
    margin: Margin.default(0),
  })
  .strict();

/**
 * A text label component.
 * Visually represented by a `BitmapText`.
 * @see {@link https://pixijs.download/release/docs/scene.BitmapText.html}
 */
export const Text = Base.extend({
  type: z.literal('text'),
  placement: Placement.default('center'),
  margin: Margin.default(0),
  text: z.string().default(''),
  style: TextStyle,
  split: z.number().int().default(0),
}).strict();

export const componentSchema = z.discriminatedUnion('type', [
  Background,
  Bar,
  Icon,
  Text,
]);

export const componentArraySchema = componentSchema.array();
