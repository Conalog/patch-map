import { BitmapText } from 'pixi.js';
import { deepMerge } from '../../utils/merge';
import { TEXT_COMPONENT_CONFIG } from './config';

export const textComponent = (text, opts = {}) => {
  const { label, zIndex, ...options } = deepMerge(TEXT_COMPONENT_CONFIG, opts);

  const bitmapText = new BitmapText({ text, ...options });
  bitmapText.type = 'text';
  bitmapText.label = label;
  bitmapText.zIndex = zIndex;
  bitmapText.eventMode = 'none';
  if (options.parent) {
    options.parent.addChild(bitmapText);
  }
  return bitmapText;
};
