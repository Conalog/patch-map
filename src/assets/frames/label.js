import { Graphics, Container } from 'pixi.js';
import { defaultRoundedRect, generateTexture } from '../utils';

export const label = (
  app,
  {
    fill,
    borderWidth = 2,
    borderColor,
    radius = 6,
    textHeight = 20,
    defaultWidth = 40,
    defaultHeight = 40,
  },
) => {
  const frame = defaultRoundedRect({ fill, borderWidth, borderColor, radius });

  const dividerGraphics = new Graphics();
  dividerGraphics.rect(0, textHeight, 40, 2);
  dividerGraphics.fill(borderColor);

  const container = new Container();
  container.addChild(frame);
  container.addChild(dividerGraphics);

  const texture = generateTexture(app, { target: container, borderWidth });
  texture.metadata = {
    leftWidth: borderWidth + 4,
    topHeight: textHeight + 4,
    rightWidth: borderWidth + 4,
    bottomHeight: borderWidth + 4,
    defaultWidth,
    defaultHeight,
    padding: {
      left: 4,
      top: 4 + textHeight + 1,
      right: 4,
      bottom: 4,
    },
  };
  return texture;
};
