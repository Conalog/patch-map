import { z } from 'zod';
import { uid } from '../../utils/uuid';
import {
  Color,
  HslColor,
  HslaColor,
  HsvColor,
  HsvaColor,
  RgbColor,
  RgbaColor,
} from './color-schema';

export const Base = z
  .object({
    show: z.boolean().default(true),
    id: z.string().default(() => uid()),
    label: z.string().optional(),
    attrs: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const Size = z.union([
  z
    .number()
    .nonnegative()
    .transform((val) => ({ width: val, height: val })),
  z.object({
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
  }),
]);

export const pxOrPercentSchema = z
  .union([
    z.number().nonnegative(),
    z.string().regex(/^\d+(\.\d+)?%$/),
    z.string(),
    z
      .object({ value: z.number().nonnegative(), unit: z.enum(['px', '%']) })
      .strict(),
  ])
  .transform((val) => {
    if (typeof val === 'number') {
      return { value: val, unit: 'px' };
    }
    if (typeof val === 'string' && val.endsWith('%')) {
      return { value: Number.parseFloat(val.slice(0, -1)), unit: '%' };
    }
    return val;
  })
  .refine(
    (val) => {
      if (typeof val !== 'string') return true;
      if (!val.startsWith('calc(') || !val.endsWith(')')) return false;

      // Extract the expression inside "calc(...)".
      const expression = val.substring(5, val.length - 1).trim();
      if (!expression) return false;

      // Use a regular expression to tokenize the expression.
      // This will capture numbers (positive or negative) with "px" or "%" units, and "+" or "-" operators.
      // e.g., "10% + -20px" -> ["10%", "+", "-20px"]
      const tokens = expression.match(/-?\d+(\.\d+)?(px|%)|[+-]/g);
      if (!tokens) return false;

      // This flag tracks whether we expect a term (like "10px") or an operator (like "+").
      // An expression must start with a term.
      let expectTerm = true;
      for (const token of tokens) {
        const isOperator = token === '+' || token === '-';
        const isTerm = !isOperator;

        // If we expect a term but find an operator, it's invalid.
        if (expectTerm && !isTerm) return false;
        // If we expect an operator but find a term, it's invalid.
        if (!expectTerm && !isOperator) return false;

        // Flip the expectation for the next token.
        expectTerm = !expectTerm;
      }
      // If the loop finishes and we are still expecting a term, it means the expression
      // ended with an operator, which is invalid (e.g., "calc(5px +)").
      if (expectTerm) return false;

      // --- CSS Spec Rule: Operators must be surrounded by spaces. ---
      // We check this rule against the original expression string, as the token array loses whitespace info.
      let tempExpr = expression;
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const nextToken = tokens[i + 1];

        // Check only for operators that are not the last token.
        if ((token === '+' || token === '-') && nextToken) {
          const operatorIndex = tempExpr.indexOf(token);
          const nextTokenIndex = tempExpr.indexOf(nextToken, operatorIndex);

          // Get the substring between the current operator and the next token.
          const between = tempExpr.substring(
            operatorIndex + token.length,
            nextTokenIndex,
          );

          // If this substring contains anything other than whitespace, it's invalid.
          if (between.trim() !== '') return false;
          // If the substring is empty, it means there was no space, which is invalid.
          if (between.length === 0) return false;
        }

        // Remove the processed part of the string to avoid finding the same token again.
        tempExpr = tempExpr.substring(tempExpr.indexOf(token) + token.length);
      }

      // If all checks pass, the calc() string is valid.
      return true;
    },
    {
      message:
        "Invalid calc format. Operators must be surrounded by spaces. Example: 'calc(100% - 20px)'",
    },
  );

export const PxOrPercentSize = z.union([
  pxOrPercentSchema.transform((val) => ({ width: val, height: val })),
  z.object({
    width: pxOrPercentSchema,
    height: pxOrPercentSchema,
  }),
]);

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
  'none',
]);

export const Gap = z.preprocess(
  (val) => (typeof val === 'number' ? { x: val, y: val } : val),
  z
    .object({
      x: z.number().nonnegative().default(0),
      y: z.number().nonnegative().default(0),
    })
    .default({}),
);

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
    .default({}),
);

export const TextureStyle = z
  .object({
    type: z.enum(['rect']),
    fill: z.string(),
    borderWidth: z.number(),
    borderColor: z.string(),
    radius: z.number(),
  })
  .partial();

/**
 * @see {@link https://pixijs.download/release/docs/scene.ConvertedStrokeStyle.html}
 */
export const RelationsStyle = z.record(z.string(), z.unknown());

/**
 * @see {@link https://pixijs.download/release/docs/text.TextStyleOptions.html}
 */
export const TextStyle = z
  .object({
    fontSize: z.union([z.number(), z.literal('auto'), z.string()]).optional(),
    autoFont: z
      .object({
        min: z.number().positive().default(1),
        max: z.number().positive().default(100),
      })
      .optional(),
  })
  .passthrough();

/**
 * @see {@link https://pixijs.download/release/docs/color.ColorSource.html}
 */
export const Tint = z.union([
  z.string(),
  z.number(),
  z.array(z.number()),
  z.instanceof(Float32Array),
  z.instanceof(Uint8Array),
  z.instanceof(Uint8ClampedArray),
  HslColor,
  HslaColor,
  HsvColor,
  HsvaColor,
  RgbColor,
  RgbaColor,
  Color,
]);
