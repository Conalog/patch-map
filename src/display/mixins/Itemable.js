import { UPDATE_STAGES } from './constants';

const KEYS = ['cells', 'item', 'gap'];

export const Itemable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyItem(relevantChanges) {
      const { cells, item, gap } = relevantChanges;

      const childrenLength = this.children.length;
      const colSize = cells[0].length;
      for (let index = 0; index < childrenLength; index++) {
        const rowIndex = Math.floor(index / colSize);
        const colIndex = index % colSize;

        const child = this.children[index];
        child.update({
          ...item,
          attrs: {
            x: colIndex * (item.size.width + gap.x),
            y: rowIndex * (item.size.height + gap.y),
          },
        });
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
