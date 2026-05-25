import { getColor } from '../../utils/get';
import { UPDATE_STAGES } from './constants';

const KEYS = ['style'];

export const Relationstyleable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyRelationstyle(relevantChanges, options) {
      const { style } = relevantChanges;
      const path =
        this.path ?? this.children?.find((child) => child?.type === 'path');
      if (!path) return;

      if ('color' in style) {
        style.color = getColor(this.store.theme, style.color);
      }

      const newStrokeStyle =
        options.mergeStrategy === 'replace'
          ? style
          : { ...path.strokeStyle, ...style };
      path.setStrokeStyle(newStrokeStyle);
      this._renderDirty = true;
    }
  };
  MixedClass.registerHandler(
    KEYS,
    MixedClass.prototype._applyRelationstyle,
    UPDATE_STAGES.VISUAL,
  );
  return MixedClass;
};
