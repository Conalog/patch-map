import { deepMerge } from '../../../utils/merge';
import { createDefaultRect, generateTexture } from '../utils';
import { FRAME_CONFIG } from '../config';

export const base = (app, opts = {}) => {
  const options = deepMerge({ ...FRAME_CONFIG.options, name: 'base' }, opts);

  const frame = createDefaultRect({
    borderWidth: options.borderWidth,
    borderColor: options.borderColor,
    radius: options.radius,
  });
  const texture = generateTexture(app, frame);
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
