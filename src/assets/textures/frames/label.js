import { Container, Graphics } from 'pixi.js';
import { deepMerge } from '../../../utils/merge';
import { FRAME_CONFIG } from '../config';
import { createDefaultRect, generateTexture } from '../utils';

export const label = (app, opts = {}) => {
  const options = deepMerge(
    {
      ...FRAME_CONFIG.options,
      name: 'label',
      textHeight: 20,
    },
    opts,
  );

  const frame = createDefaultRect({
    borderWidth: options.borderWidth,
    borderColor: options.borderColor,
    radius: options.radius,
  });

  const dividerGraphics = new Graphics();
  dividerGraphics.rect(0, options.textHeight, 40, 2);
  dividerGraphics.fill(options.borderColor);

  const container = new Container();
  container.addChild(frame);
  container.addChild(dividerGraphics);

  const texture = generateTexture(app, container);
  texture.label = options.label;
  texture.metadata = {
    name: 'label',
    slic: {
      leftWidth: options.borderWidth + 6,
      topHeight: options.textHeight + 6,
      rightWidth: options.borderWidth + 6,
      bottomHeight: options.borderWidth + 6,
    },
    defaultWidth: options.defaultWidth,
    defaultHeight: options.defaultHeight,
    padding: {
      left: options.borderWidth + 2,
      top: options.borderWidth + 2 + options.textHeight + 1,
      right: options.borderWidth + 2,
      bottom: options.borderWidth + 2,
    },
    borderWidth: options.borderWidth,
  };
  return texture;
};
