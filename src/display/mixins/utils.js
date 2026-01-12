import gsap from 'gsap';
import { isValidationError } from 'zod-validation-error';
import { findIndexByPriority } from '../../utils/findIndexByPriority';
import { validate } from '../../utils/validator';
import { ZERO_MARGIN } from './constants';

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
 * Calculates the layout context of a component (content area size, padding, etc).
 * @param {PIXI.DisplayObject} component - The component for which to calculate the layout context
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

  let parentWidth = parent.props.size.width;
  let parentHeight = parent.props.size.height;
  let effectivePadding = parentPadding;

  const useViewLayout =
    component.constructor.useViewLayout === true ||
    component.useViewLayout === true;
  const view = component?.context?.view;
  if (useViewLayout && view) {
    const mapped = {
      left: mapViewDirection(view, 'left'),
      right: mapViewDirection(view, 'right'),
      top: mapViewDirection(view, 'top'),
      bottom: mapViewDirection(view, 'bottom'),
    };

    effectivePadding = {
      left: parentPadding[mapped.left],
      right: parentPadding[mapped.right],
      top: parentPadding[mapped.top],
      bottom: parentPadding[mapped.bottom],
    };

    const screenRightAxis = mapViewDirection(view, 'right', {
      ignoreFlip: true,
    });
    const screenBottomAxis = mapViewDirection(view, 'bottom', {
      ignoreFlip: true,
    });
    parentWidth =
      screenRightAxis === 'left' || screenRightAxis === 'right'
        ? parent.props.size.width
        : parent.props.size.height;
    parentHeight =
      screenBottomAxis === 'top' || screenBottomAxis === 'bottom'
        ? parent.props.size.height
        : parent.props.size.width;
  }

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
  const angle = ((view.angle ?? 0) * Math.PI) / 180;
  const ignoreFlip = options.ignoreFlip === true;
  const flipX = ignoreFlip ? 1 : view.flipX ? -1 : 1;
  const flipY = ignoreFlip ? 1 : view.flipY ? -1 : 1;
  const vectors = {
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
    top: { x: 0, y: -1 },
    bottom: { x: 0, y: 1 },
  };
  const base = vectors[direction] ?? vectors.right;
  const scaled = { x: base.x * flipX, y: base.y * flipY };
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const x = cos * scaled.x - sin * scaled.y;
  const y = sin * scaled.x + cos * scaled.y;
  if (Math.abs(x) >= Math.abs(y)) {
    return x >= 0 ? 'right' : 'left';
  }
  return y >= 0 ? 'bottom' : 'top';
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
