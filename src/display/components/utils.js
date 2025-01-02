import { getCenterPointObject } from '../../utils/get';

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

export const setFitFontSize = (text, { width, height }) => {
  let minSize = 1;
  let maxSize = 100;

  while (minSize <= maxSize) {
    const fontSize = Math.floor((minSize + maxSize) / 2);
    text.style.fontSize = fontSize;

    const metrics = text.getLocalBounds();
    if (metrics.width <= width && metrics.height <= height) {
      minSize = fontSize + 1;
    } else {
      maxSize = fontSize - 1;
    }
  }
};
