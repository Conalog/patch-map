import { getSizeBatcher } from '../animation/sizeBatchTween';
import { calcSize } from '../mixins/utils';
import { hasUprightContentOrientation } from '../utils/content-orientation';
import { isUpsideDownScreenAngle } from '../utils/screen-direction';
import { UPDATE_STAGES } from './constants';

const KEYS = ['animation', 'animationDuration', 'source', 'size', 'margin'];

const reapplyLayoutAfterSizeChange = (target) => {
  if (typeof target._onWorldTransformChanged === 'function') {
    target._onWorldTransformChanged();
    return;
  }

  target._applyPlacement?.({
    placement: target.props?.placement,
    margin: target.props?.margin,
  });
};

const needsCompensatedLayoutAfterSizeChange = (target) => {
  if (!target?.props?.placement) return false;
  if (typeof target._onWorldTransformChanged !== 'function') return false;

  if (hasUprightContentOrientation(target)) {
    return true;
  }

  const view = target?.store?.view;
  if (view?.flipX || view?.flipY) {
    return true;
  }

  return isUpsideDownScreenAngle(view?.angle);
};

const applyAnimatedSizeState = (target, state) => {
  target.setSize(state.w, state.h);
  if (needsCompensatedLayoutAfterSizeChange(target)) {
    reapplyLayoutAfterSizeChange(target);
    return;
  }

  target.position.set(state.x, state.y);
};

export const AnimationSizeable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyAnimationSize(relevantChanges) {
      const { animation, animationDuration, source, size, margin } =
        relevantChanges;
      const newSize = calcSize(this, { source, size, margin });

      if (animation) {
        const batcher = getSizeBatcher(this.store);
        if (!batcher || !this._calcPlacementForSize) {
          this.setSize(newSize.width, newSize.height);
          reapplyLayoutAfterSizeChange(this);
          return;
        }

        if (this._sizeAnimJob) {
          batcher.cancel(this._sizeAnimJob);
          this._sizeAnimJob = null;
        }

        const fromPosition = this._calcPlacementForSize({
          placement: this.props.placement,
          margin: this.props.margin,
          width: this.width,
          height: this.height,
        });
        const toPosition = this._calcPlacementForSize({
          placement: this.props.placement,
          margin: this.props.margin,
          width: newSize.width,
          height: newSize.height,
        });

        this._sizeAnimJob = batcher.enqueue({
          target: this,
          applyState: applyAnimatedSizeState,
          from: {
            w: this.width,
            h: this.height,
            x: fromPosition.x,
            y: fromPosition.y,
          },
          to: {
            w: newSize.width,
            h: newSize.height,
            x: toPosition.x,
            y: toPosition.y,
          },
          durationMs: animationDuration,
          ease: 'power2.inOut',
        });
      } else {
        const batcher = getSizeBatcher(this.store);
        if (this._sizeAnimJob && batcher) {
          batcher.cancel(this._sizeAnimJob, { applyToEnd: true });
          this._sizeAnimJob = null;
        }
        this.setSize(newSize.width, newSize.height);
        reapplyLayoutAfterSizeChange(this);
      }
    }
  };
  MixedClass.registerHandler(
    KEYS,
    MixedClass.prototype._applyAnimationSize,
    UPDATE_STAGES.SIZE,
  );
  return MixedClass;
};
