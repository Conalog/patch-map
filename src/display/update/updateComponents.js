import { getAsset } from '../../assets/utils';
import { getNestedValue } from '../../utils/get';

export const updateBarComponent = (component, theme, opts = {}) => {
  if (opts.name) {
    const texture = getAsset(`bars-${opts.name}`);
    if (texture) component.texture = texture;
    component.option.name = opts.name;
  }
  if (opts.color) {
    const tint = getNestedValue(theme, opts.color);
    if (tint) {
      component.tint = tint;
      component.option.color = opts.color;
    }
  }
  if (opts.zIndex) {
    component.zIndex = opts.zIndex;
    component.option.zIndex = opts.zIndex;
  }
};

export const updateIconComponent = (component, theme, opts = {}) => {
  if (opts.name) {
    const texture = getAsset(`icons-${opts.name}`);
    if (texture) component.texture = texture;
    component.option.name = opts.name;
  }
  if (opts.tint || opts.color) {
    const tint = opts.tint ?? getNestedValue(theme, opts.color);
    if (tint) component.tint = tint;
  }
  if (opts.zIndex) {
    component.zIndex = opts.zIndex;
    component.option.zIndex = opts.zIndex;
  }
};
