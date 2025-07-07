import gsap from 'gsap';

export const tweensOf = (object) => gsap.getTweensOf(object);

export const killTweensOf = (object) => gsap.killTweensOf(object);

export const getMaxSize = (
  size,
  margin = { top: 0, right: 0, bottom: 0, left: 0 },
) => {
  const { top = 0, right = 0, bottom = 0, left = 0 } = margin || {};
  return {
    width: size.width - (left + right),
    height: size.height - (top + bottom),
  };
};

export const calcSize = (component, { source, size, margin }) => {
  const { width: maxWidth, height: maxHeight } = getMaxSize(
    component.parent.props.size,
    margin,
  );

  const borderWidth =
    typeof source === 'object' ? (source?.borderWidth ?? 0) : 0;

  return {
    width:
      (size.width.unit === '%'
        ? maxWidth * (size.width.value / 100)
        : size.width.value) + borderWidth,
    height:
      (size.height.unit === '%'
        ? maxHeight * (size.height.value / 100)
        : size.height.value) + borderWidth,
    borderWidth: borderWidth,
  };
};

export const mixins = (baseClass, ...mixins) => {
  return mixins.reduce((target, mixin) => mixin(target), baseClass);
};
