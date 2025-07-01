import { getColor } from '../../utils/get';

export const changeTint = (object, { color, tint }, { theme }) => {
  const hexColor = getColor(theme, tint ?? color);
  object.tint = hexColor;
};
