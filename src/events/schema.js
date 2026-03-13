import { z } from 'zod';

export const focusFitIdsSchema = z
  .union([z.string(), z.array(z.string())])
  .nullish();

export const focusFitOptionsSchema = z
  .object({
    filter: z.function().args(z.any()).returns(z.boolean()),
  })
  .strict()
  .nullish();
