import { TextStyle } from 'pixi.js';
import { getColor } from '../../utils/get';
import { FONT_WEIGHT, UPDATE_STAGES } from './constants';

const KEYS = ['style'];

export const Textstyleable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyTextstyle(relevantChanges, options) {
      const { style } = relevantChanges;
      if (!style) return;

      const { theme } = this.context;
      const visual = this.bitmapText || this;

      if (options.mergeStrategy === 'replace') {
        visual.style = new TextStyle();
      }

      // 1. Optimized Font Styling
      if ('fontFamily' in style || 'fontWeight' in style) {
        visual.style.fontWeight = this._getFontWeight(style.fontWeight, visual);
        visual.style.fontFamily = this._getFontFamily(style.fontFamily, visual);
      }

      // 2. Apply Other Style Properties
      const bypassKeys = ['fontFamily', 'fontWeight'];
      for (const key in style) {
        if (bypassKeys.includes(key)) continue;

        if (key === 'fill') {
          visual.style[key] = getColor(theme, style.fill);
        } else {
          visual.style[key] = style[key];
        }
      }
    }

    _getFontFamily(value, visual) {
      const current = visual.style.fontFamily || '';
      const baseFamily = current.split(' ')[0] || 'Arial';
      const family = value ?? baseFamily;
      const weightStr =
        FONT_WEIGHT.STRING[visual.style.fontWeight] || 'regular';
      return `${family} ${weightStr}`.trim();
    }

    _getFontWeight(value, visual) {
      return FONT_WEIGHT.NUMBER[value ?? visual.style.fontWeight];
    }
  };

  MixedClass.registerHandler(
    KEYS,
    MixedClass.prototype._applyTextstyle,
    UPDATE_STAGES.VISUAL,
  );
  return MixedClass;
};
