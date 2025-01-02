import { Sprite } from 'pixi.js';
import { getAsset } from '../../assets/utils';
import { deepMerge } from '../../utils/merge';
import { ICON_COMPONENT_CONFIG } from './config';
import { getColor, setCenterPosition } from './utils';

export const iconComponent = (name, theme, opts = {}) => {
  const options = deepMerge(ICON_COMPONENT_CONFIG, opts);

  const texture = getAsset(`icons-${name}`);
  if (!texture) {
    console.warn(`No asset exists for ${name}.`);
    return;
  }

  const icon = new Sprite(texture);
  icon.setSize(options.size);
  setCenterPosition(icon, options.frame);
  icon.type = 'icon';
  icon.label = options.label;
  icon.zIndex = options.zIndex ?? 0;
  icon.renderable = options.show ?? false;
  if (options.color) {
    icon.tint = getColor(options.color, theme);
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
