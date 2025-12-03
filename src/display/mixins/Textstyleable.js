import { TextStyle } from 'pixi.js';
import { getColor } from '../../utils/get';
import {
  DEFAULT_AUTO_FONT_RANGE,
  FONT_WEIGHT,
  UPDATE_STAGES,
} from './constants';
import { getLayoutContext, splitText } from './utils';

const KEYS = ['text', 'split', 'style', 'margin'];

export const Textstyleable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyTextstyle(relevantChanges, options) {
      const { style, margin } = relevantChanges;
      const { theme } = this.context;

      if (options.mergeStrategy === 'replace') {
        this.style = new TextStyle();
      }

      if (this._isTruncated) {
        this.text =
          this._fullText ??
          splitText(this.props.text || '', this.props.split || 0);
        this._isTruncated = false;
      }

      for (const key in style) {
        if (
          (key === 'fontSize' || key === 'wordWrapWidth') &&
          style[key] === 'auto'
        ) {
          continue;
        }

        if (key === 'fontFamily' || key === 'fontWeight') {
          this.style.fontWeight = this._getFontWeight(style.fontWeight);
          this.style.fontFamily = this._getFontFamily(style.fontFamily);
        } else if (key === 'fill') {
          this.style[key] = getColor(theme, style.fill);
        } else {
          this.style[key] = style[key];
        }
      }

      if (style.wordWrapWidth === 'auto') {
        setAutoWordWrapWidth(this, margin);
      }

      if (style.fontSize === 'auto') {
        const range = style.autoFont ?? DEFAULT_AUTO_FONT_RANGE;
        setAutoFontSize(this, margin, range);
      }

      if (style.overflow && style.overflow !== 'visible') {
        const fullText =
          this._fullText ??
          splitText(this.props.text || '', this.props.split || 0);
        applyOverflow(this, margin, style.overflow, fullText);
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
  const { contentWidth, contentHeight } = getContentSize(object, margin);

  let { min: minSize, max: maxSize } = range;
  let bestFitSize = range.min;
  while (minSize <= maxSize) {
    const fontSize = Math.floor((minSize + maxSize) / 2);
    object.style.fontSize = fontSize;

    const metrics = object.getLocalBounds();
    if (metrics.width <= contentWidth && metrics.height <= contentHeight) {
      bestFitSize = fontSize;
      minSize = fontSize + 1;
    } else {
      maxSize = fontSize - 1;
    }
  }
  object.style.fontSize = bestFitSize;
};

const setAutoWordWrapWidth = (object, margin) => {
  const { contentWidth } = getContentSize(object, margin);
  object.style.wordWrapWidth = contentWidth;
};

const applyOverflow = (object, margin, overflowType, fullText) => {
  const { contentWidth, contentHeight } = getContentSize(object, margin);
  const bounds = object.getLocalBounds();

  if (bounds.width <= contentWidth && bounds.height <= contentHeight) {
    return;
  }

  const suffix = overflowType === 'ellipsis' ? '…' : '';
  let low = 0;
  let high = fullText.length;
  let bestFitText = '';

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const sliced = fullText.slice(0, mid);
    const candidate = mid === fullText.length ? sliced : sliced + suffix;

    if (doesFit(candidate)) {
      bestFitText = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  object.text = bestFitText;
  object._isTruncated = bestFitText !== fullText;

  function doesFit(text) {
    object.text = text;
    const b = object.getLocalBounds();
    return b.width <= contentWidth && b.height <= contentHeight;
  }
};

const getContentSize = (object, margin) => {
  const { contentWidth, contentHeight } = getLayoutContext(object);
  return {
    contentWidth: contentWidth - (margin.left + margin.right),
    contentHeight: contentHeight - (margin.top + margin.bottom),
  };
};
