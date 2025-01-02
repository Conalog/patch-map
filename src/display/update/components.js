import { getAsset } from '../../assets/utils';
import {
  getDiffObjects,
  getFrameInnerSize,
  getNestedValue,
} from '../../utils/get';
import { getColor } from '../../utils/get';
import { deepMerge } from '../../utils/merge';
import { FONT_WEIGHT } from '../components/config';
import {
  formatText,
  setCenterPosition,
  setFitFontSize,
} from '../components/utils';

export const updateComponents = (frame, componentOptions, theme) => {
  if (!componentOptions || typeof componentOptions !== 'object') return;

  for (const [type, change] of Object.entries(componentOptions)) {
    const component = frame.components[type];
    if (!component) continue;

    const diffOption = getDiffObjects(component.option, change);
    if (type === 'bar') {
      updateBarComponent(component, theme, diffOption);
    } else if (type === 'icon') {
      updateIconComponent(component, theme, diffOption);
    } else if (type === 'text') {
      updateTextComponent(component, theme, diffOption);
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
  changeSize(component, { size: options.size });
  changeShow(component, { show: options.show });
  changeColor(component, { theme, color: options.color });
  changeZIndex(component, { zIndex: options.zIndex });
};

const updateTextComponent = (component, theme, options = {}) => {
  changeShow(component, { show: options.show });
  changeZIndex(component, { zIndex: options.zIndex });
  changeFontStyle(component, { theme, style: options.style });
  changeText(component, { content: options.content, split: options.split });
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

const changeSize = (component, { size }) => {
  if (!size) return;
  component.setSize(size, size);
  if (component.frame) setCenterPosition(component, component.frame);
  component.option.size = size;
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

const changeText = (component, { content, split }) => {
  if (!content && !split) return;
  content ??= component.option.content;
  split ??= component.option.split;
  component.text = formatText(content, split);
  fitText(component, component.option.style.fontSize);
  component.option.content = content;
  component.option.split = split;
};

const changeFontStyle = (component, { theme, style }) => {
  if (!style) return;
  component.option.style = deepMerge(component.option.style, style);

  if ('fill' in style) {
    style.fill = getColor(style.fill, theme);
  }

  if ('fontFamily' in style || 'fontWeight' in style) {
    const fontFamily = style.fontFamily ?? component.option.style.fontFamily;
    const fontWeight = style.fontWeight ?? component.option.style.fontWeight;
    style.fontFamily = `${fontFamily} ${FONT_WEIGHT[fontWeight]}`;
  }

  const { fontWeight, ...filteredStyle } = style;
  for (const [key, value] of Object.entries(filteredStyle)) {
    if (value) {
      component.style[key] = value;
    }
  }
  fitText(component, style.fontSize);
};

const fitText = (text, fontSize) => {
  if (fontSize === 'auto') {
    setFitFontSize(text, getFrameInnerSize(text.frame, text.option.margin));
  }
  if (text.frame) setCenterPosition(text, text.frame);
};
