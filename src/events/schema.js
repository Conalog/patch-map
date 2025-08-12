import { z } from 'zod';

export const focusFitIdsSchema = z
  .union([z.string(), z.array(z.string())])
  .nullish();
