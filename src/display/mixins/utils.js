import gsap from 'gsap';
import { isValidationError } from 'zod-validation-error';
import { findIndexByPriority } from '../../utils/findIndexByPriority';
import { validate } from '../../utils/validator';
import { ROTATION_THRESHOLD, ZERO_MARGIN } from './constants';

export const tweensOf = (object) => gsap.getTweensOf(object);

export const killTweensOf = (object) => gsap.killTweensOf(object);

export const parseCalcExpression = (expression, parentDimension) => {
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
  const { contentWidth, contentHeight } = getLayoutContext(component);

  const borderWidth =
    typeof source === 'object' ? (source?.borderWidth ?? 0) : 0;

  let finalWidth = null;
  let finalHeight = null;

  if (typeof size.width === 'string' && size.width.startsWith('calc')) {
    finalWidth = parseCalcExpression(size.width, contentWidth);
  } else {
    finalWidth =
      size.width.unit === '%'
        ? contentWidth * (size.width.value / 100)
        : size.width.value;
  }

  if (typeof size.height === 'string' && size.height.startsWith('calc')) {
    finalHeight = parseCalcExpression(size.height, contentHeight);
  } else {
    finalHeight =
      size.height.unit === '%'
        ? contentHeight * (size.height.value / 100)
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
export const validateAndPrepareChanges = (currentElements, changes, schema) => {
  const preparedChanges = [...changes];
  const used = new Set();
  const newElementDefs = [];
  const newElementIndices = [];

  preparedChanges.forEach((change, index) => {
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
      preparedChanges[originalIndex] = validatedDef;
    });
  }

  return preparedChanges;
};

/**
 * Calculates the layout store of a component (content area size, padding, etc).
 * @param {PIXI.DisplayObject} component - The component for which to calculate the layout store
 * @returns {{parentWidth: number, parentHeight: number, contentWidth: number, contentHeight: number, parentPadding: object}}
 */
export const getLayoutContext = (component) => {
  const parent = component?.parent;
  if (!parent) {
    return {
      parentWidth: 0,
      parentHeight: 0,
      contentWidth: 0,
      contentHeight: 0,
      parentPadding: ZERO_MARGIN,
    };
  }

  const usePadding = component.constructor.respectsPadding !== false;
  const parentPadding =
    usePadding && parent.props.padding ? parent.props.padding : ZERO_MARGIN;

  const parentWidth = parent.props.size.width;
  const parentHeight = parent.props.size.height;
  const effectivePadding = parentPadding;

  const contentWidth = Math.max(
    0,
    parentWidth - effectivePadding.left - effectivePadding.right,
  );
  const contentHeight = Math.max(
    0,
    parentHeight - effectivePadding.top - effectivePadding.bottom,
  );

  return {
    parentWidth,
    parentHeight,
    contentWidth,
    contentHeight,
    parentPadding: effectivePadding,
  };
};

export const mapViewDirection = (view, direction, options = {}) => {
  if (!view) return direction;
  const viewAngle = (((view.angle ?? 0) % 360) + 360) % 360;

  let hFlipped = false;
  let vFlipped = false;

  // 90도~270도 구간 (Readable 모드) 보정
  if (
    viewAngle >= ROTATION_THRESHOLD.MIN &&
    viewAngle < ROTATION_THRESHOLD.MAX
  ) {
    hFlipped = !hFlipped;
    vFlipped = !vFlipped;
  }

  // 뷰 자체의 플립 상태 반영
  if (view.flipX) hFlipped = !hFlipped;
  if (view.flipY) vFlipped = !vFlipped;

  if (direction === 'left' || direction === 'right') {
    if (hFlipped) return direction === 'left' ? 'right' : 'left';
    return direction;
  }

  if (direction === 'top' || direction === 'bottom') {
    if (vFlipped) return direction === 'top' ? 'bottom' : 'top';
    return direction;
  }

  return direction;
};

export const splitText = (text, split) => {
  if (!split || split === 0) {
    return text;
  }
  let result = '';
  for (let i = 0; i < text.length; i += split) {
    result += `${text.slice(i, i + split)}\n`;
  }
  return result.trim();
};
