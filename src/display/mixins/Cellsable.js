import { newElement } from '../elements/creator';
import { UPDATE_STAGES } from './constants';

const KEYS = ['cells'];

export const Cellsable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyCells(relevantChanges) {
      const { cells } = relevantChanges;

      const { gap, item: itemProps } = this.props;
      const currentItemIds = new Set(this.children.map((child) => child.id));
      const requiredItemIds = new Set();

      cells.forEach((row, rowIndex) => {
        row.forEach((col, colIndex) => {
          const id = `${this.id}.${rowIndex}.${colIndex}`;
          if (col === 1) {
            requiredItemIds.add(id);
            if (!currentItemIds.has(id)) {
              const item = newElement('item', this.context);
              item.update({
                id,
                ...itemProps,
                attrs: {
                  x: colIndex * (itemProps.size.width + gap.x),
                  y: rowIndex * (itemProps.size.height + gap.y),
                },
              });
              this.addChild(item);
            }
          }
        });
      });

      const currentItems = [...this.children];
      currentItems.forEach((item) => {
        if (!requiredItemIds.has(item.id)) {
          this.removeChild(item);
          item.destroy({ children: true });
        }
      });
    }
  };
  MixedClass.registerHandler(
    KEYS,
    MixedClass.prototype._applyCells,
    UPDATE_STAGES.CHILD_RENDER,
  );
  return MixedClass;
};
