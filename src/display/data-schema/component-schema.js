import { z } from 'zod';
import {
  Base,
  Margin,
  Placement,
  Position,
  PxOrPercentSize,
  TextStyle,
  TextureStyle,
  pxOrPercentSchema,
} from './primitive-schema';

export const Background = Base.extend({
  type: z.literal('background'),
  source: z.union([TextureStyle, z.string()]),
}).passthrough();

export const Bar = Base.merge(Position)
  .merge(PxOrPercentSize)
  .extend({
    type: z.literal('bar'),
    source: TextureStyle,
    placement: Placement.default('bottom'),
    margin: Margin.default(0),
    animation: z.boolean().default(true),
    animationDuration: z.number().default(200),
  })
  .passthrough();

export const Icon = Base.merge(Position)
  .extend({
    type: z.literal('icon'),
    source: z.string(),
    placement: Placement.default('center'),
    margin: Margin.default(0),
    size: pxOrPercentSchema,
  })
  .passthrough();

export const Text = Base.merge(Position)
  .extend({
    type: z.literal('text'),
    placement: Placement.default('center'),
    margin: Margin.default(0),
    text: z.string().default(''),
    style: TextStyle,
    split: z.number().int().default(0),
  })
  .passthrough();

export const componentSchema = z.discriminatedUnion('type', [
  Background,
  Bar,
  Icon,
  Text,
]);

export const componentArraySchema = componentSchema.array();
