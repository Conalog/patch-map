import { getAsset } from '../assets/utils';
import { getColor, getTheme } from '../utils/get';
import {
  backgroundComponent,
  updateBackgroundComponent,
} from './components/background';
import { barComponent, updateBarComponent } from './components/bar';
import { FONT_WEIGHT } from './components/config';
import { iconComponent, updateIconComponent } from './components/icon';
import { textComponent, updateTextComponent } from './components/text';
import { parseMargin } from './utils';

export const changeShow = (object, { show }) => {
  if (show == null) return;
  object.renderable = show;
};

export const changeZIndex = (object, { zIndex }) => {
  if (zIndex == null) return;
  object.zIndex = zIndex;
};

export const changeTexture = (object, { texture: textureName }) => {
  if (textureName == null) return;
  const texture = getAsset(textureName);
  object.texture = texture ?? null;
};

export const changeColor = (object, { theme, color }) => {
  if (!color || !theme) return;
  const tint = getColor(color, theme);
  object.tint = tint;
};

export const changePlacement = (component, { placement, margin = '0' }) => {
  if (!placement) return;

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
    const positions = {
      left: margin.left,
      right: component.parent.width - component.width - margin.right,
      center: (component.parent.width - component.width) / 2,
    };
    return positions[alignment] ?? positions.center;
  }

  function getVerticalPosition(component, alignment, margin) {
    const positions = {
      top: margin.top,
      bottom: component.parent.height - component.height - margin.bottom,
      center: (component.parent.height - component.height) / 2,
    };
    return positions[alignment] ?? positions.center;
  }
};

export const changePercentSize = (
  component,
  { percentWidth, percentHeight, margin = '0' },
) => {
  if (!percentWidth && !percentHeight) return;

  const marginObj = parseMargin(margin);
  if (percentWidth) changeWidth(component, percentWidth, marginObj);
  if (percentHeight) changeHeight(component, percentHeight, marginObj);

  function changeWidth(component, percentWidth, marginObj) {
    const maxWidth =
      component.parent.width - (marginObj.left + marginObj.right);
    component.width = Math.min(maxWidth, component.parent.width * percentWidth);
  }

  function changeHeight(component, percentHeight) {
    const maxHeight =
      component.parent.height - (marginObj.top + marginObj.bottom);
    component.height = Math.min(
      maxHeight,
      component.parent.height * percentHeight,
    );
  }
};

export const changeContent = (component, { content, split }) => {
  if (!content) return;

  if (split) component.split = split;
  component.text = splitText(content, component.split);

  if (component.fontSize === 'auto') {
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

export const chnageTextStyle = (component, { style, theme, margin }) => {
  if (!style) return;
  if (margin) component.margin = margin;

  for (const key in style) {
    if (key === 'fontFamily') {
      component.style[key] =
        `${style.fontFamily} ${FONT_WEIGHT[style.fontWeight ?? component.style.fontWeight]}`;
    } else if (key === 'fill') {
      component.style[key] = getColor(style.fill, theme);
    } else if (key === 'fontSize' && style[key] === 'auto') {
      component.fontSize = style[key];
      const marginObj = parseMargin(component.margin);
      setAutoFontSize(component, marginObj);
      component.style.fontSize++;
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

export const changeLayout = (item, { layout }) => {
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
  let children = [...item.children];

  for (const config of layout) {
    if (!(config.type in componentFn)) continue;

    const index = children.findIndex(
      (child) =>
        matchValue('type', child, config) && matchValue('label', child, config),
    );

    let component = null;
    if (index === -1) {
      component = componentFn[config.type].create({
        ...config,
        ...item.size,
        theme: getTheme(item),
      });
      if (component) {
        item.addChild(component);
      }
    } else {
      component = children[index];
      children = children.slice(index, 1)[0];
    }

    if (component) {
      componentFn[component.type].update(component, {
        ...config,
        theme: getTheme(item),
      });
    }
  }

  function matchValue(key, child, config) {
    return config[key] ? child[key] === config[key] : true;
  }
};
