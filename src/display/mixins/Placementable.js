import { UPDATE_STAGES } from './constants';
import { getLayoutContext } from './utils';

const KEYS = ['placement', 'margin'];

const DIRECTION_MAP = {
  left: { h: 'left', v: 'center' },
  right: { h: 'right', v: 'center' },
  top: { h: 'center', v: 'top' },
  bottom: { h: 'center', v: 'bottom' },
  center: { h: 'center', v: 'center' },
};

export const Placementable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyPlacement(relevantChanges) {
      const { placement, margin } = relevantChanges;
      const { x, y } = this._calcPlacementForSize({
        placement,
        margin,
        width: this.width,
        height: this.height,
      });
      this.position.set(x, y);
    }

    _calcPlacementForSize({ placement, margin, width, height }) {
      const [first, second] = placement.split('-');
      const directions = second
        ? { h: first, v: second }
        : DIRECTION_MAP[first];

      const layoutContext = getLayoutContext(this);
      const x = calcHorizontalPosition(
        layoutContext,
        directions.h,
        margin,
        width,
      );
      const y = calcVerticalPosition(
        layoutContext,
        directions.v,
        margin,
        height,
      );
      return { x, y };
    }
  };
  MixedClass.registerHandler(
    KEYS,
    MixedClass.prototype._applyPlacement,
    UPDATE_STAGES.LAYOUT,
  );
  return MixedClass;
};

const calcHorizontalPosition = (layoutContext, align, margin, width) => {
  const { parentWidth, contentWidth, parentPadding } = layoutContext;
  const marginLeft = margin?.left ?? 0;
  const marginRight = margin?.right ?? 0;
  const componentWidth = Number.isFinite(width) ? width : 0;

  let result = null;
  if (align === 'left') {
    result = parentPadding.left + marginLeft;
  } else if (align === 'right') {
    result = parentWidth - componentWidth - marginRight - parentPadding.right;
  } else if (align === 'center') {
    const marginWidth = componentWidth + marginLeft + marginRight;
    const blockStartPosition = (contentWidth - marginWidth) / 2;
    result = parentPadding.left + blockStartPosition + marginLeft;
  }
  return result;
};

const calcVerticalPosition = (layoutContext, align, margin, height) => {
  const { parentHeight, contentHeight, parentPadding } = layoutContext;
  const marginTop = margin?.top ?? 0;
  const marginBottom = margin?.bottom ?? 0;
  const componentHeight = Number.isFinite(height) ? height : 0;

  let result = null;
  if (align === 'top') {
    result = parentPadding.top + marginTop;
  } else if (align === 'bottom') {
    result =
      parentHeight - componentHeight - marginBottom - parentPadding.bottom;
  } else if (align === 'center') {
    const marginHeight = componentHeight + marginTop + marginBottom;
    const blockStartPosition = (contentHeight - marginHeight) / 2;
    result = parentPadding.top + blockStartPosition + marginTop;
  }
  return result;
};
