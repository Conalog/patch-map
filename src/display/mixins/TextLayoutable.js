import { DEFAULT_AUTO_FONT_RANGE, UPDATE_STAGES } from './constants';
import { getLayoutContext, splitText } from './utils';

const KEYS = ['text', 'split', 'style', 'margin', 'size'];

export const TextLayoutable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyTextLayout(relevantChanges) {
      const { style, margin } = relevantChanges;
      const visual = this.bitmapText || this;

      // 1. Recover original text if previously truncated
      if (this._isTruncated) {
        visual.text =
          this._fullText ||
          splitText(this.props.text || '', this.props.split || 0);
        this._isTruncated = false;
      }

      const bounds = this._getLayoutBounds(visual, margin);

      // 2. Word Wrap: Auto
      if (style?.wordWrapWidth === 'auto') {
        visual.style.wordWrapWidth = bounds.width;
      }

      // 3. Font Size: Auto
      if (style?.fontSize === 'auto') {
        const range = style.autoFont ?? DEFAULT_AUTO_FONT_RANGE;
        this._setAutoFontSize(visual, bounds, range);
      }

      // 4. Overflow Handling
      if (style?.overflow && style.overflow !== 'visible') {
        this._applyOverflow(visual, bounds, style.overflow);
      }
    }

    _getLayoutBounds(visual, margin) {
      const { contentWidth, contentHeight } = getLayoutContext(visual);
      return {
        width: Math.max(0, contentWidth - (margin.left + margin.right)),
        height: Math.max(0, contentHeight - (margin.top + margin.bottom)),
      };
    }

    _setAutoFontSize(visual, bounds, range) {
      let { min, max } = range;
      let bestSize = range.min;

      while (min <= max) {
        const mid = Math.floor((min + max) / 2);
        visual.style.fontSize = mid;
        const metrics = visual.getLocalBounds();

        if (metrics.width <= bounds.width && metrics.height <= bounds.height) {
          bestSize = mid;
          min = mid + 1;
        } else {
          max = mid - 1;
        }
      }
      visual.style.fontSize = bestSize;
    }

    _applyOverflow(visual, bounds, overflowType) {
      const metrics = visual.getLocalBounds();
      if (metrics.width <= bounds.width && metrics.height <= bounds.height) {
        return;
      }

      const fullText = visual.text;
      const suffix = overflowType === 'ellipsis' ? '…' : '';
      let low = 0;
      let high = fullText.length;
      let bestText = '';

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const candidate =
          fullText.slice(0, mid) + (mid < fullText.length ? suffix : '');

        visual.text = candidate;
        const b = visual.getLocalBounds();

        if (b.width <= bounds.width && b.height <= bounds.height) {
          bestText = candidate;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      visual.text = bestText;
      this._isTruncated = bestText !== fullText;
    }
  };

  MixedClass.registerHandler(
    KEYS,
    MixedClass.prototype._applyTextLayout,
    UPDATE_STAGES.LAYOUT,
  );

  return MixedClass;
};
