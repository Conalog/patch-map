import { Color as PixiColor } from 'pixi.js';
import { z } from 'zod';

export const HslColor = z
  .object({
    h: z.number(),
    s: z.number(),
    l: z.number(),
  })
  .strict();

export const HslaColor = HslColor.extend({
  a: z.number(),
});

export const HsvColor = z
  .object({
    h: z.number(),
    s: z.number(),
    v: z.number(),
  })
  .strict();

export const HsvaColor = HsvColor.extend({
  a: z.number(),
});

export const RgbColor = z
  .object({
    r: z.number(),
    g: z.number(),
    b: z.number(),
  })
  .strict();

export const RgbaColor = RgbColor.extend({
  a: z.number(),
});

export const Color = z.instanceof(PixiColor);
