import { UPDATE_STAGES } from './constants';
import { calcSize } from './utils';

const KEYS = ['source', 'size', 'margin'];

export const ComponentSizeable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyComponentSize(relevantChanges) {
      const { source, size, margin } = relevantChanges;
      const newSize = calcSize(this, { source, size, margin });
      this.setSize(newSize.width, newSize.height);
      this.position.set(-newSize.borderWidth / 2);
    }

    _onTextureApplied(texture) {
      super._onTextureApplied?.(texture);

      if (this.destroyed || this.props?.size === undefined) return;

      this._applyComponentSize({
        source: this.props.source,
        size: this.props.size,
        margin: this.props.margin,
      });

      if (typeof this._applyPlacement === 'function') {
        this._applyPlacement({
          placement: this.props.placement,
          margin: this.props.margin,
        });
      }
    }
  };
  MixedClass.registerHandler(
    KEYS,
    MixedClass.prototype._applyComponentSize,
    UPDATE_STAGES.SIZE,
  );
  return MixedClass;
};
