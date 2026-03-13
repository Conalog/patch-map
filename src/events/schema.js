import { z } from 'zod';
import { StrictPartialMargin } from '../display/data-schema/primitive-schema';

export const focusFitIdsSchema = z
  .union([z.string(), z.array(z.string())])
  .nullish();

export const fitOptionsSchema = z
  .object({ padding: StrictPartialMargin.optional() })
  .strict()
  .nullish();
