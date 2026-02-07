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

      const [first, second] = placement.split('-');
      const directions = second
        ? { h: first, v: second }
        : DIRECTION_MAP[first];

      let layoutDirections = directions;
      const layoutMargin = { ...margin };

      const useViewPlacement =
        (this.constructor.useViewPlacement === true ||
          this.useViewPlacement === true) &&
        this.store?.view;
      if (useViewPlacement) {
        const h =
          directions.h && directions.h !== 'center'
            ? mapViewDirection(this.store.view, directions.h)
            : 'center';
        const v =
          directions.v && directions.v !== 'center'
            ? mapViewDirection(this.store.view, directions.v)
            : 'center';

        // 방향이 원래와 달라졌다면 마진도 스왑
        if (h !== directions.h) {
          layoutMargin.left = margin.right;
          layoutMargin.right = margin.left;
        }
        if (v !== directions.v) {
          layoutMargin.top = margin.bottom;
          layoutMargin.bottom = margin.top;
        }
        layoutDirections = { h, v };
      }

      const x = getHorizontalPosition(this, layoutDirections.h, layoutMargin);
      const y = getVerticalPosition(this, layoutDirections.v, layoutMargin);

      const bounds = this.getLocalBounds();
      const pivot = this.pivot || { x: 0, y: 0 };
      const scale = this.scale || { x: 1, y: 1 };
      const angle = (this.angle || 0) * (Math.PI / 180);

      // 로컬 경계의 네 모서리를 구함
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

      // 각 모서리를 피봇 기준으로 변환(Scale + Rotation)하여 부모 좌표계에서의 시각적 최소 지점을 찾음
      for (const corner of corners) {
        const lx = (corner.x - pivot.x) * scale.x;
        const ly = (corner.y - pivot.y) * scale.y;

        const rotatedX = lx * cos - ly * sin;
        const rotatedY = lx * sin + ly * cos;

        if (rotatedX < visualLeftMin) visualLeftMin = rotatedX;
        if (rotatedY < visualTopMin) visualTopMin = rotatedY;
      }

      this.position.set(x - visualLeftMin, y - visualTopMin);
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
  const bounds = component.getLocalBounds();
  const componentWidth = bounds.width * Math.abs(component.scale.x);

  let result = null;
  if (align === 'left') {
    result = parentPadding.left + margin.left;
  } else if (align === 'right') {
    result = parentWidth - componentWidth - margin.right - parentPadding.right;
  } else if (align === 'center') {
    const marginWidth = componentWidth + margin.left + margin.right;
    const blockStartPosition = (contentWidth - marginWidth) / 2;
    result = parentPadding.left + blockStartPosition + margin.left;
  }
  return result;
};

const getVerticalPosition = (component, align, margin) => {
  const { parentHeight, contentHeight, parentPadding } =
    getLayoutContext(component);
  const bounds = component.getLocalBounds();
  const componentHeight = bounds.height * Math.abs(component.scale.y);

  let result = null;
  if (align === 'top') {
    result = parentPadding.top + margin.top;
  } else if (align === 'bottom') {
    result =
      parentHeight - componentHeight - margin.bottom - parentPadding.bottom;
  } else if (align === 'center') {
    const marginHeight = componentHeight + margin.top + margin.bottom;
    const blockStartPosition = (contentHeight - marginHeight) / 2;
    result = parentPadding.top + blockStartPosition + margin.top;
  }
  return result;
};
