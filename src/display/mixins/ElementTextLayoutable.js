import { UPDATE_STAGES } from './constants';

const KEYS = ['size', 'style'];

export const ElementTextLayoutable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyElementTextLayout() {
      const { size, style } = this.props;
      const visual = this.bitmapText || this;

      if (style?.wordWrap && size?.width !== undefined) {
        visual.style.wordWrap = true;
        visual.style.wordWrapWidth = size.width;
      } else {
        visual.style.wordWrap = false;
      }

      // Emit transformation event as text wrapping might change local bounds/alignment
      this.context.viewport.emit('object_transformed', this);
    }
  };

  MixedClass.registerHandler(
    KEYS,
    MixedClass.prototype._applyElementTextLayout,
    UPDATE_STAGES.LAYOUT,
  );

  return MixedClass;
};
