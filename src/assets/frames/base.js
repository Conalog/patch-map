import { defaultRoundedRect, generateTexture } from '../utils';

export const base = (
  app,
  {
    fill,
    borderWidth = 2,
    borderColor,
    radius = 6,
    defaultWidth = 40,
    defaultHeight = 40,
  },
) => {
  const frame = defaultRoundedRect({ fill, borderWidth, borderColor, radius });
  const texture = generateTexture(app, { target: frame, borderWidth });
  texture.metadata = {
    leftWidth: borderWidth + 6,
    topHeight: borderWidth + 6,
    rightWidth: borderWidth + 6,
    bottomHeight: borderWidth + 6,
    defaultWidth,
    defaultHeight,
    padding: 4,
  };
  return texture;
};
