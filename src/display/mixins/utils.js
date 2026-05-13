import gsap from 'gsap';
import { isValidationError } from 'zod-validation-error';
import { findIndexByPriority } from '../../utils/findIndexByPriority';
import { validate } from '../../utils/validator';
import { normalizeChanges } from '../normalize';
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

export const assertFiniteNumber = (value, label) => {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Non-finite number detected: ${label}=${value}`);
  }
  return value;
};

const roundToPrecision = (value, precision = 6) => {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const DEFAULT_COMPONENT_SIZE = {
  width: { value: 100, unit: '%' },
  height: { value: 100, unit: '%' },
};

const isPxOrPercentValue = (value) =>
  value &&
  typeof value === 'object' &&
  Object.hasOwn(value, 'value') &&
  Object.hasOwn(value, 'unit');

const normalizePxOrPercentValue = (value) => {
  if (typeof value === 'number') {
    return { value, unit: 'px' };
  }
  if (typeof value === 'string') {
    const trimmedValue = value.trim();
    if (trimmedValue.endsWith('%')) {
      return { value: Number.parseFloat(trimmedValue), unit: '%' };
    }
    if (trimmedValue.endsWith('px')) {
      return { value: Number.parseFloat(trimmedValue), unit: 'px' };
    }
    if (!trimmedValue.startsWith('calc')) {
      const numericValue = Number(trimmedValue);
      if (!Number.isNaN(numericValue) && trimmedValue !== '') {
        return { value: numericValue, unit: 'px' };
      }
    }
  }
  return value;
};

export const DEFAULT_PLACEMENT_BY_TYPE = {
  bar: 'bottom',
  background: 'center',
  icon: 'center',
  text: 'center',
};

export const resolveComponentPlacement = (component, placement) =>
  placement ??
  component.props?.placement ??
  DEFAULT_PLACEMENT_BY_TYPE[component.type] ??
  'center';

const normalizeComponentSize = (size) => {
  if (
    typeof size === 'number' ||
    typeof size === 'string' ||
    isPxOrPercentValue(size)
  ) {
    const normalized = normalizePxOrPercentValue(size);
    return { width: normalized, height: normalized };
  }
  if (!size || typeof size !== 'object') return null;

  if (isPxOrPercentValue(size.width) && isPxOrPercentValue(size.height)) {
    return size;
  }

  return {
    width: normalizePxOrPercentValue(size.width),
    height: normalizePxOrPercentValue(size.height),
  };
};

export const calcSize = (component, { source, size }) => {
  const { contentWidth, contentHeight } = getLayoutContext(component);
  const currentPropsSize = component.props?.size;
  const hasNormalizedRequestedSize =
    isPxOrPercentValue(size?.width) && isPxOrPercentValue(size?.height);
  const hasNormalizedCurrentSize =
    isPxOrPercentValue(currentPropsSize?.width) &&
    isPxOrPercentValue(currentPropsSize?.height);
  const resolvedSize =
    hasNormalizedRequestedSize || (size == null && hasNormalizedCurrentSize)
      ? (size ?? currentPropsSize)
      : resolveComponentSize(size, currentPropsSize);

  const borderWidth =
    typeof source === 'object' ? (source?.borderWidth ?? 0) : 0;

  let finalWidth = null;
  let finalHeight = null;

  if (
    typeof resolvedSize.width === 'string' &&
    resolvedSize.width.startsWith('calc')
  ) {
    finalWidth = parseCalcExpression(resolvedSize.width, contentWidth);
  } else {
    finalWidth =
      resolvedSize.width.unit === '%'
        ? contentWidth * (resolvedSize.width.value / 100)
        : resolvedSize.width.value;
  }

  if (
    typeof resolvedSize.height === 'string' &&
    resolvedSize.height.startsWith('calc')
  ) {
    finalHeight = parseCalcExpression(resolvedSize.height, contentHeight);
  } else {
    finalHeight =
      resolvedSize.height.unit === '%'
        ? contentHeight * (resolvedSize.height.value / 100)
        : resolvedSize.height.value;
  }

  return {
    width: roundToPrecision(finalWidth + borderWidth),
    height: roundToPrecision(finalHeight + borderWidth),
    borderWidth: borderWidth,
  };
};

const resolveComponentSize = (size, currentPropsSize) => {
  const requestedSize = size == null ? null : normalizeComponentSize(size);
  const currentSize =
    requestedSize?.width && requestedSize?.height
      ? null
      : normalizeComponentSize(currentPropsSize);

  return {
    width:
      requestedSize?.width ??
      currentSize?.width ??
      DEFAULT_COMPONENT_SIZE.width,
    height:
      requestedSize?.height ??
      currentSize?.height ??
      DEFAULT_COMPONENT_SIZE.height,
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
 * @param {{ validateSchema?: boolean, defaultMaterializer?: (value: object) => object }} options - Validation controls
 * @returns {Array<object>} The changes array, with validated and default-filled data
 */
export const validateAndPrepareChanges = (
  currentElements,
  changes,
  schema,
  options = {},
) => {
  const shouldNormalize =
    options.validateSchema === false && options.normalize !== false;
  const preparedChanges = shouldNormalize
    ? changes.map((change) => normalizeChanges(change, change?.type))
    : [...changes];
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

  if (options.validateSchema === false) {
    if (typeof options.defaultMaterializer === 'function') {
      newElementIndices.forEach((originalIndex) => {
        preparedChanges[originalIndex] = options.defaultMaterializer(
          preparedChanges[originalIndex],
        );
      });
    }
    return preparedChanges;
  }

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

  const contentWidth = Math.max(
    0,
    parentWidth - parentPadding.left - parentPadding.right,
  );
  const contentHeight = Math.max(
    0,
    parentHeight - parentPadding.top - parentPadding.bottom,
  );

  return {
    parentWidth,
    parentHeight,
    contentWidth,
    contentHeight,
    parentPadding,
  };
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
