import { getCenterPointObject, getNestedValue } from '../../utils/get';

export const setPosition = (component, position = {}) => {
  component.position.set(position.x, position.y);
};

export const setCenterPosition = (component, frame) => {
  const centerPoint = getCenterPointObject(frame);
  component.position.set(
    centerPoint.x - component.width / 2,
    centerPoint.y - component.height / 2,
  );
};

export const getColor = (color, theme) => {
  return (
    (color.startsWith('#') ? color : getNestedValue(theme, color)) ?? '#000'
  );
};

export const formatText = (text, chunkSize) => {
  if (chunkSize === 0 || chunkSize == null) {
    return text;
  }
  let result = '';
  for (let i = 0; i < text.length; i += chunkSize) {
    result += `${text.slice(i, i + chunkSize)}\n`;
  }
  return result.trim();
};
