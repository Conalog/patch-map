import { UPDATE_STAGES } from './constants';

const KEYS = ['item', 'gap'];

export const Itemable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyItem(relevantChanges, options) {
      const { item: itemProps, gap } = relevantChanges;

      const gridIdPrefix = `${this.id}.`;
      for (const child of this.children) {
        if (!child.id.startsWith(gridIdPrefix)) continue;
        const coordsPart = child.id.substring(gridIdPrefix.length);
        const [rowIndex, colIndex] = coordsPart.split('.').map(Number);

        if (!Number.isNaN(rowIndex) && !Number.isNaN(colIndex)) {
          child.apply(
            {
              ...itemProps,
              attrs: {
                x: colIndex * (itemProps.size.width + gap.x),
                y: rowIndex * (itemProps.size.height + gap.y),
              },
            },
            options,
          );
        }
      }
    }
  };
  MixedClass.registerHandler(
    KEYS,
    MixedClass.prototype._applyItem,
    UPDATE_STAGES.VISUAL,
  );
  return MixedClass;
};
