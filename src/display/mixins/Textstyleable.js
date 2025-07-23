import { TextStyle } from 'pixi.js';
import { getColor } from '../../utils/get';
import {
  DEFAULT_AUTO_FONT_RANGE,
  FONT_WEIGHT,
  UPDATE_STAGES,
} from './constants';

const KEYS = ['text', 'split', 'style', 'margin'];

export const Textstyleable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyTextstyle(relevantChanges, options) {
      const { style, margin } = relevantChanges;
      const { theme } = this.context;

      if (options.mergeStrategy === 'replace') {
        this.style = new TextStyle();
      }

      for (const key in style) {
        if (key === 'fontFamily' || key === 'fontWeight') {
          this.style.fontWeight = this._getFontWeight(style.fontWeight);
          this.style.fontFamily = this._getFontFamily(style.fontFamily);
        } else if (key === 'fill') {
          this.style[key] = getColor(theme, style.fill);
        } else if (key === 'fontSize' && style[key] === 'auto') {
          const range = style.autoFont ?? DEFAULT_AUTO_FONT_RANGE;
          setAutoFontSize(this, margin, range);
        } else {
          this.style[key] = style[key];
        }
      }
    }

    _getFontFamily(value) {
      return `${value ?? this.style.fontFamily.split(' ')[0]} ${FONT_WEIGHT.STRING[this.style.fontWeight]}`;
    }

    _getFontWeight(value) {
      return FONT_WEIGHT.NUMBER[value ?? this.style.fontWeight];
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
