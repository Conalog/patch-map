import { z } from 'zod';

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

export const Margin = z.string().regex(/^(\d+(\.\d+)?(\s+\d+(\.\d+)?){0,3})$/);

const TextureType = z.enum(['rect']);
export const TextureStyle = z
  .object({
    type: TextureType,
    fill: z.nullable(z.string()),
    borderWidth: z.nullable(z.number()),
    borderColor: z.nullable(z.string()),
    radius: z.nullable(z.number()),
  })
  .partial();

const defaultConfig = z
  .object({
    show: z.boolean().default(true),
  })
  .passthrough();

const background = defaultConfig.extend({
  type: z.literal('background'),
  texture: z.union([z.string(), TextureStyle]),
  tint: z.string().default('#FFFFFF'),
});

const bar = defaultConfig.extend({
  type: z.literal('bar'),
  texture: z.union([z.string(), TextureStyle]),
  tint: z.string().default('primary.default'),
  placement: Placement.default('bottom'),
  margin: Margin.default('0'),
  percentWidth: z.number().min(0).max(1).default(1),
  percentHeight: z.number().min(0).max(1).default(1),
  animation: z.boolean().default(true),
  animationDuration: z.number().default(200),
});

const icon = defaultConfig.extend({
  type: z.literal('icon'),
  asset: z.string(),
  tint: z.string().default('black'),
  placement: Placement.default('center'),
  margin: Margin.default('0'),
  size: z.number().nonnegative(),
});

const text = defaultConfig.extend({
  type: z.literal('text'),
  placement: Placement.default('center'),
  margin: Margin.default('0'),
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
});

export const componentSchema = z.discriminatedUnion('type', [
  background,
  bar,
  icon,
  text,
]);

export const componentArraySchema = z
  .discriminatedUnion('type', [background, bar, icon, text])
  .array();
