import { deepMerge } from '../../../utils/deepmerge/deepmerge';
import { BACKGROUND_CONFIG } from '../config';
import { createDefaultRect, generateTexture } from '../utils';

export const base = (app, opts = {}) => {
  const options = deepMerge(
    { ...BACKGROUND_CONFIG.options, name: 'base' },
    opts,
  );

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
      leftWidth: options.borderWidth + 6,
      topHeight: options.borderWidth + 6,
      rightWidth: options.borderWidth + 6,
      bottomHeight: options.borderWidth + 6,
    },
    defaultWidth: options.defaultWidth,
    defaultHeight: options.defaultHeight,
    padding: options.borderWidth + 2,
    borderWidth: options.borderWidth,
  };
  return texture;
};
