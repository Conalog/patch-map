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
    console.warn(`${name}에 해당하는 aaset이 존재하지 않습니다.`);
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
  icon.zIndex = options.zIndex;
  if (options?.tint || options.color) {
    const tint = options.tint ?? getNestedValue(theme, options.color);
    if (tint) icon.tint = tint;
  }
  icon.eventMode = 'none';
  if (options.parent) {
    options.parent.addChild(icon);
  }
  icon.option = {
    name,
    color: options.color,
    zIndex: options.zIndex,
  };
  return icon;
};
