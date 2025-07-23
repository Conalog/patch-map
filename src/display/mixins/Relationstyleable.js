import { getColor } from '../../utils/get';
import { selector } from '../../utils/selector/selector';
import { UPDATE_STAGES } from './constants';

const KEYS = ['style'];

export const Relationstyleable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyRelationstyle(relevantChanges, options) {
      const { style } = relevantChanges;
      const path = selector(this, '$.children[?(@.type==="path")]')[0];
      if (!path) return;

      if ('color' in style) {
        style.color = getColor(this.context.theme, style.color);
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
