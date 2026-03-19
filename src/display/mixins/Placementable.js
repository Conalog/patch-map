import {
  calcPlacementPoint,
  resolvePlacementFrame,
} from '../utils/placement-frame';
import { resolvePlacementOffset } from '../utils/placement-offset';
import { UPDATE_STAGES } from './constants';
import { getLayoutContext } from './utils';

const KEYS = ['placement', 'margin'];

const calcEffectiveSize = (component, width, height) => {
  const bounds = component.getLocalBounds();
  const scaleX = Math.abs(component.scale?.x ?? 1);
  const scaleY = Math.abs(component.scale?.y ?? 1);

  return {
    width: Number.isFinite(width) ? width : bounds.width * scaleX,
    height: Number.isFinite(height) ? height : bounds.height * scaleY,
  };
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
      const layoutContext = getLayoutContext(this);
      const layoutFrame = resolvePlacementFrame(this, placement, margin);
      const effectiveSize = calcEffectiveSize(this, width, height);
      const point = calcPlacementPoint(
        layoutContext,
        layoutFrame,
        effectiveSize,
      );
      const { offsetX, offsetY } = resolvePlacementOffset(
        this,
        effectiveSize.width,
        layoutContext,
      );
      return { x: point.x - offsetX, y: point.y - offsetY };
    }
  };

  MixedClass.registerHandler(
    KEYS,
    MixedClass.prototype._applyPlacement,
    UPDATE_STAGES.LAYOUT,
  );

  return MixedClass;
};
