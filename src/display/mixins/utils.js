import gsap from 'gsap';

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
