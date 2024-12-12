import { defaultRoundedRect, generateTexture } from '../utils';

export const rounded = (
  app,
  { fill, radius = 4, defaultWidth = 40, defaultHeight = 40 },
) => {
  const frame = defaultRoundedRect({ fill, radius });
  const texture = generateTexture(app, { target: frame });
  texture.metadata = {
    leftWidth: 6,
    topHeight: 6,
    rightWidth: 6,
    bottomHeight: 6,
    defaultWidth,
    defaultHeight,
  };
  return texture;
};
