import { UPDATE_STAGES } from './constants';

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
  const parentWidth = component.parent.props.size.width;
  let result = null;
  if (align === 'left') {
    result = margin.left;
  } else if (align === 'right') {
    result = parentWidth - component.width - margin.right;
  } else if (align === 'center') {
    result = (parentWidth - component.width) / 2;
  }
  return result;
};

const getVerticalPosition = (component, align, margin) => {
  const parentHeight = component.parent.props.size.height;
  let result = null;
  if (align === 'top') {
    result = margin.top;
  } else if (align === 'bottom') {
    result = parentHeight - component.height - margin.bottom;
  } else if (align === 'center') {
    result = (parentHeight - component.height) / 2;
  }
  return result;
};
