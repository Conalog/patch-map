import { getSizeBatcher } from '../animation/sizeBatchTween';
import { calcSize } from '../mixins/utils';
import { UPDATE_STAGES } from './constants';

const KEYS = ['animation', 'animationDuration', 'source', 'size', 'margin'];

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
          this._applyPlacement({
            placement: this.props.placement,
            margin: this.props.margin,
          });
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
        this._applyPlacement({
          placement: this.props.placement,
          margin: this.props.margin,
        });
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
