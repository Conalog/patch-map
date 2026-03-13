import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { StrictPartialMargin } from '../display/data-schema/primitive-schema';
import { validate } from '../utils/validator';

/**
 * @typedef {object} FitPaddingAxis
 * @property {number} [x]
 * @property {number} [y]
 */

/**
 * @typedef {object} FitPaddingEdges
 * @property {number} [top]
 * @property {number} [right]
 * @property {number} [bottom]
 * @property {number} [left]
 */

/**
 * @typedef {object} FitOptions
 * @property {number | FitPaddingAxis | FitPaddingEdges} [padding]
 */

export const DEFAULT_FIT_PADDING = Object.freeze({
  top: 16,
  right: 16,
  bottom: 16,
  left: 16,
});

export const focusFitIdsSchema = z
  .union([z.string(), z.array(z.string())])
  .nullish();

export const fitOptionsSchema = z
  .object({ padding: StrictPartialMargin.optional() })
  .strict()
  .nullish();

/**
 * @param {FitOptions | null | undefined} options
 * @returns {{padding: {top: number, right: number, bottom: number, left: number}}}
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
