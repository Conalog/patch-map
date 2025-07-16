import { getColor } from '../../utils/get';
import { FONT_WEIGHT, UPDATE_STAGES } from './constants';

const KEYS = ['text', 'split', 'style', 'margin'];

export const Textstyleable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyTextstyle(relevantChanges) {
      const { style, margin } = relevantChanges;
      const { theme } = this.context.theme;

      for (const key in style) {
        if (key === 'fontFamily' || key === 'fontWeight') {
          this.style.fontFamily = `${style.fontFamily ?? this.style.fontFamily.split(' ')[0]} ${FONT_WEIGHT[style.fontWeight ?? this.style.fontWeight]}`;
        } else if (key === 'fill') {
          this.style[key] = getColor(theme, style.fill);
        } else if (key === 'fontSize' && style[key] === 'auto') {
          const range = style.autoFont ?? { min: 1, max: 100 };
          setAutoFontSize(this, margin, range);
        } else {
          this.style[key] = style[key];
        }
      }
    }
  };
  MixedClass.registerHandler(
    KEYS,
    MixedClass.prototype._applyTextstyle,
    UPDATE_STAGES.VISUAL,
  );
  return MixedClass;
};

const setAutoFontSize = (object, margin, range) => {
  object.visible = false;
  const { width, height } = object.parent.props.size;
  const parentSize = {
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };
  object.visible = true;

  let { min: minSize, max: maxSize } = range;
  while (minSize <= maxSize) {
    const fontSize = Math.floor((minSize + maxSize) / 2);
    object.style.fontSize = fontSize;

    const metrics = object.getLocalBounds();
    if (
      metrics.width <= parentSize.width &&
      metrics.height <= parentSize.height
    ) {
      minSize = fontSize + 1;
    } else {
      maxSize = fontSize - 1;
    }
  }
};
