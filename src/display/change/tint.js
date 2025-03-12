import { getColor } from '../../utils/get';

export const changeTint = (component, { tint }) => {
  const color = getColor(tint);
  component.tint = color;
};
