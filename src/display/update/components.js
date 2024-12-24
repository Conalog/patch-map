import { getAsset } from '../../assets/utils';
import { getNestedValue } from '../../utils/get';
import { getDifferentValues } from '../utils';

export const updateComponents = (frame, componentOptions, theme) => {
  if (!componentOptions || typeof componentOptions !== 'object') return;

  for (const [type, change] of Object.entries(componentOptions)) {
    const component = frame.components[type];
    if (!component) continue;

    const diffOption = getDifferentValues(component.option, change);
    if (type === 'icon') {
      updateIconComponent(component, theme, diffOption);
    } else if (type === 'bar') {
      updateBarComponent(component, theme, diffOption);
    }
  }
};

const updateBarComponent = (component, theme, options = {}) => {
  changeTexture(component, { assetGroup: 'bars', name: options.name });
  changeShow(component, { show: options.show });
  changeColor(component, { theme, color: options.color });
  changeZIndex(component, { zIndex: options.zIndex });
};

const updateIconComponent = (component, theme, options = {}) => {
  changeTexture(component, { assetGroup: 'icons', name: options.name });
  changeShow(component, { show: options.show });
  changeColor(component, { theme, color: options.color });
  changeZIndex(component, { zIndex: options.zIndex });
};

const changeShow = (component, { show }) => {
  if (show == null) return;
  component.renderable = show;
  component.option.show = show;
};

const changeTexture = (component, { assetGroup, name }) => {
  if (!name) return;
  const texture = getAsset(`${assetGroup}-${name}`);
  component.texture = texture ?? null;
  component.option.name = name;
};

const changeColor = (component, { color, theme }) => {
  if (!color) return;
  const tint = color.startsWith('#') ? color : getNestedValue(theme, color);
  component.tint = tint;
  component.option.color = color;
};

const changeZIndex = (component, { zIndex }) => {
  if (!zIndex) return;
  component.zIndex = zIndex;
  component.option.zIndex = zIndex;
};
