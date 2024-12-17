import { deepMerge } from '../../../utils/merge';
import { BAR_CONFIG } from '../config';
import { createDefaultRect, generateTexture } from '../utils';

export const base = (app, opts = {}) => {
  const options = deepMerge({ ...BAR_CONFIG.options, name: 'bar' }, opts);
  const rect = createDefaultRect({
    borderWidth: options.borderWidth,
    borderColor: options.borderColor,
    radius: options.radius,
  });
  const texture = generateTexture(app, rect);
  texture.label = options.label;
  texture.metadata = {
    name: options.name,
    slice: {
      leftWidth: options.borderWidth + 4,
      topHeight: options.borderWidth + 4,
      rightWidth: options.borderWidth + 4,
      bottomHeight: options.borderWidth + 4,
    },
    defaultWidth: options.defaultWidth,
    defaultHeight: options.defaultHeight,
    borderWidth: options.borderWidth,
  };
  return texture;
};
