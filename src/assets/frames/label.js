import { Graphics, Container } from 'pixi.js';
import { defaultRoundedRect, generateTexture } from '../utils';

export const label = (app, { fill, borderWidth = 2, borderColor, radius }) => {
  const frame = defaultRoundedRect({ fill, borderWidth, borderColor, radius });

  const dividerGraphics = new Graphics();
  dividerGraphics.rect(0, 20, 40, 2);
  dividerGraphics.fill(borderColor);

  const container = new Container();
  container.addChild(frame);
  container.addChild(dividerGraphics);
  return generateTexture(app, { target: container, borderWidth });
};
