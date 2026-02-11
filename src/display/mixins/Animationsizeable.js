import { getSizeBatcher } from '../animation/sizeBatchTween';
import { calcSize } from '../mixins/utils';
import { UPDATE_STAGES } from './constants';

const KEYS = ['animation', 'animationDuration', 'source', 'size', 'margin'];

export const AnimationSizeable = (superClass) => {
  const MixedClass = class extends superClass {
    _reapplyPlacementAfterSize() {
      if (typeof this._applyWorldTransform === 'function') {
        this._applyWorldTransform();
      }
      this._applyPlacement({
        placement: this.props.placement,
        margin: this.props.margin,
      });
    }

    _onSizeAnimationDone = () => {
      this._sizeAnimJob = null;
    };

    _onSizeAnimationUpdate = () => {
      this._reapplyPlacementAfterSize();
    };

    _applyAnimationSize(relevantChanges) {
      const { animation, animationDuration, source, size, margin } =
        relevantChanges;
      const newSize = calcSize(this, { source, size, margin });
      const useExternalPosition =
        typeof this._applyWorldTransform === 'function' &&
        typeof this._applyPlacement === 'function';

      if (animation) {
        const batcher = getSizeBatcher(this.store);
        if (!batcher || !this._calcPlacementForSize) {
          this.setSize(newSize.width, newSize.height);
          this._reapplyPlacementAfterSize();
          return;
        }

        if (this._sizeAnimJob) {
          batcher.cancel(this._sizeAnimJob);
          this._sizeAnimJob = null;
        }

        const fromPosition = useExternalPosition
          ? { x: 0, y: 0 }
          : this._calcPlacementForSize({
              placement: this.props.placement,
              margin: this.props.margin,
              width: this.width,
              height: this.height,
            });
        const toPosition = useExternalPosition
          ? { x: 0, y: 0 }
          : this._calcPlacementForSize({
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
          positionMode: useExternalPosition ? 'external' : 'internal',
          onUpdate: useExternalPosition
            ? this._onSizeAnimationUpdate
            : undefined,
          onDone: this._onSizeAnimationDone,
        });
      } else {
        const batcher = getSizeBatcher(this.store);
        if (this._sizeAnimJob && batcher) {
          batcher.cancel(this._sizeAnimJob, { applyToEnd: true });
          this._sizeAnimJob = null;
        }
        this.setSize(newSize.width, newSize.height);
        this._reapplyPlacementAfterSize();
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
