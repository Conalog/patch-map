import { isValidationError } from 'zod-validation-error';
import { getAsset } from '../assets/utils';
import { getColor, getTheme } from '../utils/get';
import { validate } from '../utils/vaildator';
import {
  backgroundComponent,
  updateBackgroundComponent,
} from './components/background';
import { barComponent, updateBarComponent } from './components/bar';
import { FONT_WEIGHT } from './components/config';
import { iconComponent, updateIconComponent } from './components/icon';
import { textComponent, updateTextComponent } from './components/text';
import { componentSchema } from './data-schema/component-schema';
import { parseMargin } from './utils';

export const isMatch = (object, key, value) => {
  return value == null || object.config[key] === value;
};

export const changeShow = (object, { show }) => {
  if (isMatch(object, 'show', show)) return;
  object.renderable = show;
};

export const changeZIndex = (object, { zIndex }) => {
  if (isMatch(object, 'zIndex', zIndex)) return;
  object.zIndex = zIndex;
};

export const changeTexture = (component, { texture: textureName }) => {
  if (isMatch(component, 'texture', textureName)) return;
  const texture = getAsset(textureName);
  component.texture = texture ?? null;
};

export const changeColor = (component, { color }) => {
  if (isMatch(component, 'color', color)) return;
  const tint = getColor(color, component.config.theme);
  component.tint = tint;
};

export const changeSize = (component, { size }) => {
  if (isMatch(component, 'size', size)) return;
  component.setSize(size);
  changePlacement(component, {});
};

export const changePlacement = (
  component,
  { placement = component.config.placement, margin = component.config.margin },
) => {
  if (!placement || !margin) return;

  const directionMap = {
    left: { h: 'left', v: 'center' },
    right: { h: 'right', v: 'center' },
    top: { h: 'center', v: 'top' },
    bottom: { h: 'center', v: 'bottom' },
    center: { h: 'center', v: 'center' },
  };
  const marginObj = parseMargin(margin);

  const [first, second] = placement.split('-');
  const directions = second ? { h: first, v: second } : directionMap[first];

  component.visible = false;
  const x = getHorizontalPosition(component, directions.h, marginObj);
  const y = getVerticalPosition(component, directions.v, marginObj);
  component.position.set(x, y);
  component.visible = true;

  function getHorizontalPosition(component, alignment, margin) {
    const parentWidth = component.parent.config.size.width;
    const positions = {
      left: margin.left,
      right: parentWidth - component.width - margin.right,
      center: (parentWidth - component.width) / 2,
    };
    return positions[alignment] ?? positions.center;
  }

  function getVerticalPosition(component, alignment, margin) {
    const parentHeight = component.parent.config.size.height;
    const positions = {
      top: margin.top,
      bottom: parentHeight - component.height - margin.bottom,
      center: (parentHeight - component.height) / 2,
    };
    return positions[alignment] ?? positions.center;
  }
};

export const changePercentSize = (
  component,
  {
    percentWidth = component.config.percentWidth,
    percentHeight = component.config.percentHeight,
    margin = component.config.margin,
  },
) => {
  if (
    isMatch(component, 'percentWidth', percentWidth) &&
    isMatch(component, 'percentHeight', percentHeight) &&
    isMatch(component, 'margin', margin)
  ) {
    return;
  }

  const marginObj = parseMargin(margin);
  if (percentWidth) changeWidth(component, percentWidth, marginObj);
  if (percentHeight) changeHeight(component, percentHeight, marginObj);

  changePlacement(component, {});

  function changeWidth(component, percentWidth, marginObj) {
    const maxWidth =
      component.parent.config.size.width - (marginObj.left + marginObj.right);

    component.width = maxWidth * percentWidth;
  }

  function changeHeight(component, percentHeight) {
    const maxHeight =
      component.parent.config.size.height - (marginObj.top + marginObj.bottom);
    component.height = maxHeight * percentHeight;
  }
};

export const changeContent = (
  component,
  { content = component.config.content, split = component.config.split },
) => {
  if (
    isMatch(component, 'content', content) &&
    isMatch(component, 'split', split)
  ) {
    return;
  }

  component.text = splitText(content, split);

  if (component.config?.style?.fontSize === 'auto') {
    chnageTextStyle(component, { style: { fontSize: 'auto' } });
  }

  function splitText(text, chunkSize) {
    if (chunkSize === 0 || chunkSize == null) {
      return text;
    }
    let result = '';
    for (let i = 0; i < text.length; i += chunkSize) {
      result += `${text.slice(i, i + chunkSize)}\n`;
    }
    return result.trim();
  }
};

export const chnageTextStyle = (
  component,
  { style = component.config.style, margin = component.config.margin },
) => {
  if (
    isMatch(component, 'style', style) &&
    isMatch(component, 'margin', margin)
  ) {
    return;
  }

  for (const key in style) {
    if (key === 'fontFamily') {
      component.style[key] =
        `${style.fontFamily} ${FONT_WEIGHT[style.fontWeight ?? component.style.fontWeight]}`;
    } else if (key === 'fill') {
      component.style[key] = getColor(style.fill, component.config.theme);
    } else if (key === 'fontSize' && style[key] === 'auto') {
      const marginObj = parseMargin(margin);
      setAutoFontSize(component, marginObj);
    } else {
      component.style[key] = style[key];
    }
  }

  function setAutoFontSize(component, margin) {
    component.visible = false;
    const { width, height } = component.parent.getSize();
    const parentSize = {
      width: width - margin.left - margin.right,
      height: height - margin.top - margin.bottom,
    };
    component.visible = true;

    let minSize = 1;
    let maxSize = 100;

    while (minSize <= maxSize) {
      const fontSize = Math.floor((minSize + maxSize) / 2);
      component.style.fontSize = fontSize;

      const metrics = component.getLocalBounds();
      if (
        metrics.width <= parentSize.width &&
        metrics.height <= parentSize.height
      ) {
        minSize = fontSize + 1;
      } else {
        maxSize = fontSize - 1;
      }
    }
  }
};

export const changeComponents = (item, { components }) => {
  if (!components) return;

  const componentFn = {
    background: {
      create: backgroundComponent,
      update: updateBackgroundComponent,
    },
    icon: {
      create: iconComponent,
      update: updateIconComponent,
    },
    bar: {
      create: barComponent,
      update: updateBarComponent,
    },
    text: {
      create: textComponent,
      update: updateTextComponent,
    },
  };
  const children = [...item.children];

  for (let config of components) {
    const index = children.findIndex((child) =>
      matchValue('type', child, config),
    );

    let component = null;
    if (index === -1) {
      config = validate(config, componentSchema);
      if (isValidationError(config)) break;
      component = componentFn[config.type].create({
        ...config,
        ...item.size,
        theme: getTheme(item),
      });
      component.config = { ...component.config, theme: getTheme(item) };
      if (component) {
        item.addChild(component);
      }
    } else {
      component = children[index];
      if (component) children.splice(index, 1);
    }

    if (component) {
      componentFn[component.type].update(component, {
        ...config,
      });
    }
  }

  function matchValue(key, child, config) {
    return config[key] ? child[key] === config[key] : true;
  }
};
