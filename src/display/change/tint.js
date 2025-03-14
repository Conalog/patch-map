import { getColor } from '../../utils/get';
import { updateConfig } from './utils';

export const changeTint = (object, { tint }) => {
  const color = getColor(tint);
  object.tint = color;
  updateConfig(object, { tint });
};
