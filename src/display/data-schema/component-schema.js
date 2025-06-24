import { z } from 'zod';
import { Base } from './element-schema';

export const Placement = z.enum([
  'left',
  'left-top',
  'left-bottom',
  'top',
  'right',
  'right-top',
  'right-bottom',
  'bottom',
  'center',
]);

export const Margin = z.preprocess(
  (val) => {
    if (typeof val === 'number') {
      return { top: val, right: val, bottom: val, left: val };
    }
    if (val && typeof val === 'object' && ('x' in val || 'y' in val)) {
      const { x = 0, y = 0 } = val;
      return { top: y, right: x, bottom: y, left: x };
    }
    return val;
  },
  z
    .object({
      top: z.number().default(0),
      right: z.number().default(0),
      bottom: z.number().default(0),
      left: z.number().default(0),
    })
    .default({ top: 0, right: 0, bottom: 0, left: 0 }),
);

export const TextureStyle = z
  .object({
    type: z.enum(['rect']),
    fill: z.nullable(z.string()),
    borderWidth: z.nullable(z.number()),
    borderColor: z.nullable(z.string()),
    radius: z.nullable(z.number()),
  })
  .partial();

const sizeValueSchema = z
  .union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d+)?%$/)])
  .transform((val) => {
    return typeof val === 'number'
      ? { value: val, unit: 'px' }
      : { value: Number.parseFloat(val.slice(0, -1)), unit: '%' };
  });

const layout = {
  x: z.number().default(0),
  y: z.number().default(0),
  margin: Margin.default(0),
  placement: Placement.default('left-top'),
};

const size = {
  width: sizeValueSchema,
  height: sizeValueSchema,
};

const Background = Base.extend({
  type: z.literal('background'),
  source: z.union([TextureStyle, z.string()]),
});

const Bar = Base.extend({
  type: z.literal('bar'),
  source: TextureStyle,
  animation: z.boolean().default(true),
  animationDuration: z.number().default(200),
  ...layout,
  ...size,
  placement: Placement.default('bottom'),
});

const Icon = Base.extend({
  type: z.literal('icon'),
  source: z.string(),
  ...layout,
  ...size,
});

const Text = Base.extend({
  type: z.literal('text'),
  text: z.string().default(''),
  style: z
    .preprocess(
      (val) => ({
        fontFamily: 'FiraCode',
        fontWeight: 400,
        fill: 'black',
        ...val,
      }),
      z.record(z.unknown()),
    )
    .default({}),
  split: z.number().int().default(0),
  ...layout,
});

export const componentSchema = z.discriminatedUnion('type', [
  Background,
  Bar,
  Icon,
  Text,
]);

export const componentArraySchema = componentSchema.array();
