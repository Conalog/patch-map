import { DEFAULT_AUTO_FONT_RANGE, UPDATE_STAGES } from './constants';
import { assertFiniteNumber, getLayoutContext, splitText } from './utils';

const KEYS = ['text', 'split', 'style', 'margin', 'size'];

const normalizeMargin = (margin = {}) => ({
  top: margin?.top ?? 0,
  right: margin?.right ?? 0,
  bottom: margin?.bottom ?? 0,
  left: margin?.left ?? 0,
});

const getDisplayLabel = (displayObject) => {
  const type = displayObject?.type ?? 'unknown';
  const id = displayObject?.id ?? 'unknown';
  return `type=${type}, id=${id}`;
};

const ensureFinite = (value, label, displayObject) => {
  try {
    return assertFiniteNumber(value, label);
  } catch {
    throw new RangeError(
      `Non-finite text layout value (${label}=${value}, ${getDisplayLabel(displayObject)})`,
    );
  }
};

export const TextLayoutable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyTextLayout(relevantChanges) {
      const { style } = relevantChanges;
      const margin = normalizeMargin(relevantChanges.margin);
      const visual = this.bitmapText || this;

      this._restoreTextBeforeLayout(visual);

      const bounds = this._getLayoutBounds(visual, margin);

      if (style?.wordWrapWidth === 'auto') {
        visual.style.wordWrapWidth = bounds.width;
      }

      if (style?.fontSize === 'auto') {
        const range = style.autoFont ?? DEFAULT_AUTO_FONT_RANGE;
        this._setAutoFontSize(visual, bounds, range);
      }

      if (style?.overflow && style.overflow !== 'visible') {
        this._applyOverflow(visual, bounds, style.overflow);
      }
    }

    _restoreTextBeforeLayout(visual) {
      if (!this._isTruncated) return;

      visual.text =
        this._fullText ||
        splitText(this.props.text || '', this.props.split || 0);
      this._isTruncated = false;
    }

    _getLayoutBounds(visual, margin) {
      const { contentWidth, contentHeight } = getLayoutContext(visual);

      const safeContentWidth = ensureFinite(contentWidth, 'contentWidth', this);
      const safeContentHeight = ensureFinite(
        contentHeight,
        'contentHeight',
        this,
      );
      const marginLeft = ensureFinite(margin.left, 'margin.left', this);
      const marginRight = ensureFinite(margin.right, 'margin.right', this);
      const marginTop = ensureFinite(margin.top, 'margin.top', this);
      const marginBottom = ensureFinite(margin.bottom, 'margin.bottom', this);

      const width = Math.max(0, safeContentWidth - (marginLeft + marginRight));
      const height = Math.max(
        0,
        safeContentHeight - (marginTop + marginBottom),
      );

      return {
        width: ensureFinite(width, 'layout.width', this),
        height: ensureFinite(height, 'layout.height', this),
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
