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

      const [first, second] = placement.split('-');
      const directions = second
        ? { h: first, v: second }
        : DIRECTION_MAP[first];

      const x = getHorizontalPosition(this, directions.h, margin);
      const y = getVerticalPosition(this, directions.v, margin);
      this.position.set(x, y);
    }
  };
  MixedClass.registerHandler(
    KEYS,
    MixedClass.prototype._applyPlacement,
    UPDATE_STAGES.LAYOUT,
  );
  return MixedClass;
};

const getHorizontalPosition = (component, align, margin) => {
  const { parentWidth, contentWidth, parentPadding } =
    getLayoutContext(component);

  let result = null;
  if (align === 'left') {
    result = parentPadding.left + margin.left;
  } else if (align === 'right') {
    result = parentWidth - component.width - margin.right - parentPadding.right;
  } else if (align === 'center') {
    const marginWidth = component.width + margin.left + margin.right;
    const blockStartPosition = (contentWidth - marginWidth) / 2;
    result = parentPadding.left + blockStartPosition + margin.left;
  }
  return result;
};

const getVerticalPosition = (component, align, margin) => {
  const { parentHeight, contentHeight, parentPadding } =
    getLayoutContext(component);

  let result = null;
  if (align === 'top') {
    result = parentPadding.top + margin.top;
  } else if (align === 'bottom') {
    result =
      parentHeight - component.height - margin.bottom - parentPadding.bottom;
  } else if (align === 'center') {
    const marginHeight = component.height + margin.top + margin.bottom;
    const blockStartPosition = (contentHeight - marginHeight) / 2;
    result = parentPadding.top + blockStartPosition + margin.top;
  }
  return result;
};
