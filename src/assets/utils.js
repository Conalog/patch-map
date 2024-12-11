import { Graphics } from 'pixi.js';
const RESOLUTION = 5;

export const generateTexture = (
  app,
  { target, borderWidth = 0, resolution = RESOLUTION },
) => {
  const texture = app.renderer.generateTexture({ target, resolution });
  if (borderWidth > 0) {
    texture.defaultAnchor = {
      x: (borderWidth / 2 / 40) * 0.9,
      y: (borderWidth / 2 / 40) * 0.9,
    };
  }
  return texture;
};

export const defaultRoundedRect = ({
  fill,
  borderWidth,
  borderColor,
  radius,
}) => {
  const rect = new Graphics();
  rect.roundRect(0, 0, 40, 40, radius);
  rect.fill(fill);
  rect.stroke({ width: borderWidth, color: borderColor });
  return rect;
};
