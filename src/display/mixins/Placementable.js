import { UPDATE_STAGES } from './constants';
import { getLayoutContext, mapViewDirection } from './utils';

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
      let layoutDirections = directions;
      const layoutMargin = {
        top: margin?.top ?? 0,
        right: margin?.right ?? 0,
        bottom: margin?.bottom ?? 0,
        left: margin?.left ?? 0,
      };

      const useViewPlacement = Boolean(this.store?.view);

      if (useViewPlacement) {
        const h =
          directions.h && directions.h !== 'center'
            ? mapViewDirection(this.store.view, directions.h)
            : 'center';
        const v =
          directions.v && directions.v !== 'center'
            ? mapViewDirection(this.store.view, directions.v)
            : 'center';

        if (h !== directions.h) {
          layoutMargin.left = margin?.right ?? 0;
          layoutMargin.right = margin?.left ?? 0;
        }
        if (v !== directions.v) {
          layoutMargin.top = margin?.bottom ?? 0;
          layoutMargin.bottom = margin?.top ?? 0;
        }
        layoutDirections = { h, v };
      }

      const bounds = this.getLocalBounds();
      const scaleX = Math.abs(this.scale?.x ?? 1);
      const scaleY = Math.abs(this.scale?.y ?? 1);
      const effectiveWidth = Number.isFinite(width)
        ? width
        : bounds.width * scaleX;
      const effectiveHeight = Number.isFinite(height)
        ? height
        : bounds.height * scaleY;

      const x = calcHorizontalPosition(
        layoutContext,
        layoutDirections.h,
        layoutMargin,
        effectiveWidth,
      );
      const y = calcVerticalPosition(
        layoutContext,
        layoutDirections.v,
        layoutMargin,
        effectiveHeight,
      );

      const { offsetX, offsetY } = calcVisualOffset(this);
      return { x: x - offsetX, y: y - offsetY };
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

const calcVisualOffset = (component) => {
  const bounds = component.getLocalBounds();
  const pivot = component.pivot || { x: 0, y: 0 };
  const scale = component.scale || { x: 1, y: 1 };
  const angle = (component.angle || 0) * (Math.PI / 180);

  const corners = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x, y: bounds.y + bounds.height },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
  ];

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  let visualLeftMin = Number.POSITIVE_INFINITY;
  let visualTopMin = Number.POSITIVE_INFINITY;

  for (const corner of corners) {
    const lx = (corner.x - pivot.x) * scale.x;
    const ly = (corner.y - pivot.y) * scale.y;

    const rotatedX = lx * cos - ly * sin;
    const rotatedY = lx * sin + ly * cos;

    if (rotatedX < visualLeftMin) visualLeftMin = rotatedX;
    if (rotatedY < visualTopMin) visualTopMin = rotatedY;
  }

  return {
    offsetX: Number.isFinite(visualLeftMin) ? visualLeftMin : 0,
    offsetY: Number.isFinite(visualTopMin) ? visualTopMin : 0,
  };
};
