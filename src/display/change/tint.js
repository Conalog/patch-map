import { getColor } from '../../utils/get';
import { updateConfig } from './utils';

export const changeTint = (object, { color, tint }) => {
  const hexColor = getColor(tint ?? color);
  object.tint = hexColor;
  updateConfig(object, { tint });
};
