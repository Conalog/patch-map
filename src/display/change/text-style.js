import { parseMargin } from '../utils';
import { isConfigMatch } from './utils';

export const changeTextStyle = (
  component,
  { style = component.config.style, margin = component.config.margin },
) => {
  if (
    isConfigMatch(component, 'style', style) &&
    isConfigMatch(component, 'margin', margin)
  ) {
    return;
  }

  for (const key in style) {
    if (key === 'fontFamily' || key === 'fontWeight') {
      component.style.fontFamily = `${style.fontFamily ?? component.style.fontFamily.split(' ')[0]} ${FONT_WEIGHT[style.fontWeight ?? component.style.fontWeight]}`;
    } else if (key === 'fill') {
      component.style[key] = getColor(style.fill);
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
