import { defaultRoundedRect, generateTexture } from '../utils';

export const rounded = (
  app,
  { fill, radius = 4, defaultWidth = 40, defaultHeight = 40 },
) => {
  const frame = defaultRoundedRect({ fill, radius });
  const texture = generateTexture(app, { target: frame });
  texture.metadata = {
    leftWidth: 4,
    topHeight: 4,
    rightWidth: 4,
    bottomHeight: 4,
    defaultWidth,
    defaultHeight,
  };
  return texture;
};
