import { Sprite } from 'pixi.js';
import { getAsset } from '../../assets/utils';
import { getNestedValue } from '../../utils/get';
import { deepMerge } from '../../utils/merge';
import { setPosiionCenter } from '../utils';
import { ICON_COMPONENT_CONFIG } from './config';

export const iconComponent = (name, theme, opts = {}) => {
  const options = deepMerge(ICON_COMPONENT_CONFIG, opts);

  const texture = getAsset(`icons-${name}`);
  if (!texture) {
    console.warn(`No asset exists for ${name}.`);
    return;
  }

  const icon = new Sprite(texture);
  icon.setSize(options.size);
  if (options.frame) {
    setPosiionCenter(options.frame, icon);
  } else {
    icon.position.set(options.x, options.y);
  }
  icon.type = 'icon';
  icon.label = options.label;
  icon.zIndex = options.zIndex ?? 0;
  icon.renderable = options.show ?? false;
  if (options.color) {
    icon.tint = options.color.startsWith('#')
      ? options.color
      : getNestedValue(theme, options.color);
  }
  icon.eventMode = 'none';
  if (options.parent) {
    options.parent.addChild(icon);
  }
  icon.frame = options.frame;
  icon.option = {
    name,
    show: icon.renderable,
    color: options.color,
    zIndex: icon.zIndex,
    size: icon.getSize().width,
  };
  options.frame.components[icon.type] = icon;
  return icon;
};
