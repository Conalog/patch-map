import { getMaxSize, mergeProps } from './utils';

export const changeSize = (
  object,
  { size = object.size, margin = object.margin },
) => {
  const { width: maxWidth, height: maxHeight } = getMaxSize(
    object.parent.size,
    margin,
  );

  object.setSize(
    size.width.unit === '%'
      ? maxWidth * (size.width.value / 100)
      : size.width.value,
    size.height.unit === '%'
      ? maxHeight * (size.height.value / 100)
      : size.height.value,
  );
  mergeProps(object, { size });
};
