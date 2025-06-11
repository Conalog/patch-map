import { getColor } from '../../utils/get';
import { FONT_WEIGHT } from '../components/config';
import { parseMargin } from '../utils';
import { isConfigMatch, updateConfig } from './utils';

export const changeTextStyle = (
  object,
  { style = object.config.style, margin = object.config.margin },
  { theme },
) => {
  if (
    isConfigMatch(object, 'style', style) &&
    isConfigMatch(object, 'margin', margin)
  ) {
    return;
  }

  for (const key in style) {
    if (key === 'fontFamily' || key === 'fontWeight') {
      object.style.fontFamily = `${style.fontFamily ?? object.style.fontFamily.split(' ')[0]} ${FONT_WEIGHT[style.fontWeight ?? object.style.fontWeight]}`;
    } else if (key === 'fill') {
      object.style[key] = getColor(theme, style.fill);
    } else if (key === 'fontSize' && style[key] === 'auto') {
      const marginObj = parseMargin(margin);
      setAutoFontSize(object, marginObj);
    } else {
      object.style[key] = style[key];
    }
  }
  updateConfig(object, { style, margin });

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
