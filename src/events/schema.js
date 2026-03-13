import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { validate } from '../utils/validator';

/**
 * @typedef {object} FitPaddingAxis
 * @property {number} [x]
 * @property {number} [y]
 */

/**
 * @typedef {object} FitOptions
 * @property {number | FitPaddingAxis} [padding]
 */

export const DEFAULT_FIT_PADDING = Object.freeze({
  x: 16,
  y: 16,
});

export const focusFitIdsSchema = z
  .union([z.string(), z.array(z.string())])
  .nullish();

const fitPaddingAxisSchema = z
  .object({
    x: z.number().optional(),
    y: z.number().optional(),
  })
  .strict();

const normalizeFitPadding = (padding) => {
  if (typeof padding === 'number') {
    return {
      x: padding,
      y: padding,
    };
  }

  if (!padding) return padding;
  return padding;
};

export const fitOptionsSchema = z
  .object({
    padding: z
      .union([z.number(), fitPaddingAxisSchema])
      .transform(normalizeFitPadding)
      .optional(),
  })
  .strict()
  .nullish();

/**
 * @param {FitOptions | null | undefined} options
 * @returns {{padding: {x: number, y: number}}}
 */
export const parseFitOptions = (options) => {
  const validatedOptions = validate(options, fitOptionsSchema);
  if (isValidationError(validatedOptions)) {
    throw validatedOptions;
  }

  return {
    padding: {
      ...DEFAULT_FIT_PADDING,
      ...validatedOptions?.padding,
    },
  };
};
