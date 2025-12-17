import gsap from 'gsap';
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
        this.context.animationContext.add(() => {
          this.killTweens();
          const tween = gsap.to(this, {
            pixi: {
              width: newSize.width,
              height: newSize.height,
            },
            duration: animationDuration / 1000,
            ease: 'power2.inOut',
            onUpdate: () => {
              if (this.destroyed) {
                this.killTweens();
                return;
              }
              this._applyPlacement({
                placement: this.props.placement,
                margin: this.props.margin,
              });
            },
          });
          this.tweens.push(tween);
        });
      } else {
        this.setSize(newSize.width, newSize.height);
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
