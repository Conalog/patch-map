import gsap from 'gsap';
import { isValidationError } from 'zod-validation-error';
import { findIndexByPriority } from '../../utils/findIndexByPriority';
import { validate } from '../../utils/validator';

export const tweensOf = (object) => gsap.getTweensOf(object);

export const killTweensOf = (object) => gsap.killTweensOf(object);

const parseCalcExpression = (expression, parentDimension) => {
  const innerExpression = expression.substring(5, expression.length - 1);
  const sanitizedExpression = innerExpression.replace(/\s-\s/g, ' + -');
  const terms = sanitizedExpression.split(/\s\+\s/);

  let totalValue = 0;
  for (const term of terms) {
    const trimmedTerm = term.trim();
    if (trimmedTerm.endsWith('%')) {
      const percentage = Number.parseFloat(trimmedTerm);
      totalValue += parentDimension * (percentage / 100);
    } else {
      const pixels = Number.parseFloat(trimmedTerm);
      totalValue += pixels;
    }
  }
  return totalValue;
};

export const calcSize = (component, { source, size }) => {
  const { width: parentWidth, height: parentHeight } =
    component.parent.props.size;
  const borderWidth =
    typeof source === 'object' ? (source?.borderWidth ?? 0) : 0;

  let finalWidth = null;
  let finalHeight = null;

  if (typeof size.width === 'string' && size.width.startsWith('calc')) {
    finalWidth = parseCalcExpression(size.width, parentWidth);
  } else {
    finalWidth =
      size.width.unit === '%'
        ? parentWidth * (size.width.value / 100)
        : size.width.value;
  }

  if (typeof size.height === 'string' && size.height.startsWith('calc')) {
    finalHeight = parseCalcExpression(size.height, parentHeight);
  } else {
    finalHeight =
      size.height.unit === '%'
        ? parentHeight * (size.height.value / 100)
        : size.height.value;
  }

  return {
    width: finalWidth + borderWidth,
    height: finalHeight + borderWidth,
    borderWidth: borderWidth,
  };
};

export const mixins = (baseClass, ...mixins) => {
  return mixins.reduce((target, mixin) => mixin(target), baseClass);
};

/**
 * Utility function to validate and prepare a new array of changes.
 * This function filters out only the new elements (not present in currentElements),
 * and performs batch validation using a Zod schema.
 *
 * @param {Array<object>} currentElements - Array of current child elements (components) in the DOM
 * @param {Array<object>} changes - Array of change data to apply
 * @param {import('zod').ZodSchema} schema - Zod schema to use for validation
 * @returns {Array<object>} The changes array, with validated and default-filled data
 */
export function validateAndPrepareChanges(currentElements, changes, schema) {
  const used = new Set();
  const newElementDefs = [];
  const newElementIndices = [];

  changes.forEach((change, index) => {
    const foundIndex = findIndexByPriority(currentElements, change, used);
    if (foundIndex === -1) {
      newElementDefs.push(change);
      newElementIndices.push(index);
    } else {
      used.add(foundIndex);
    }
  });

  // Perform batch validation only if there are new elements to be added
  if (newElementDefs.length > 0) {
    const validatedNewDefs = validate(newElementDefs, schema);
    if (isValidationError(validatedNewDefs)) {
      throw validatedNewDefs;
    }

    // Update the original changes array with the validated definitions (including defaults)
    validatedNewDefs.forEach((validatedDef, i) => {
      const originalIndex = newElementIndices[i];
      changes[originalIndex] = validatedDef;
    });
  }

  return changes;
}
