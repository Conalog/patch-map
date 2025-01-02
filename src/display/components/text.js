import { BitmapText } from 'pixi.js';
import { deepMerge } from '../../utils/merge';
import { FONT_WEIGHT, TEXT_COMPONENT_CONFIG } from './config';
import { formatText, getColor, setCenterPosition } from './utils';

export const textComponent = (content, theme, opts = {}) => {
  const options = deepMerge(TEXT_COMPONENT_CONFIG, opts);

  const bitmapText = new BitmapText({
    text: formatText(content, options.split),
    ...options,
    style: {
      ...options.style,
      fill: getColor(options.style.fill, theme),
      fontFamily: `${options.style.fontFamily} ${FONT_WEIGHT[options.style.fontWeight]}`,
    },
  });
  setCenterPosition(bitmapText, options.frame);
  bitmapText.type = 'text';
  bitmapText.label = options.label;
  bitmapText.zIndex = options.zIndex ?? 0;
  bitmapText.eventMode = 'none';
  if (options.parent) {
    options.parent.addChild(bitmapText);
  }
  bitmapText.frame = options.frame;
  bitmapText.option = {
    show: bitmapText.renderable,
    zIndex: bitmapText.zIndex,
    content,
    style: options.style,
    split: options.split,
  };
  options.frame.components[bitmapText.type] = bitmapText;
  return bitmapText;
};
