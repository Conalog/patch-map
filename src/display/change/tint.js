import { getColor } from '../../utils/get';
import { updateConfig } from './utils';

export const changeTint = (object, { color, tint }, { theme }) => {
  const hexColor = getColor(theme, tint ?? color);
  object.tint = hexColor;
  updateConfig(object, { tint });
};
