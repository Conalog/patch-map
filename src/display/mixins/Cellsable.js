import { newElement } from '../elements/creator';
import { UPDATE_STAGES } from './constants';

const KEYS = ['cells'];

export const Cellsable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyCells(relevantChanges) {
      const { cells } = relevantChanges;

      const { gap, item: itemProps } = this.props;

      const requiredItemIds = new Set();
      const childrenMap = new Map(
        this.children.map((child) => [child.id, child]),
      );

      cells.forEach((row, rowIndex) => {
        row.forEach((col, colIndex) => {
          if (!col) return;
          const id = `${this.id}.${rowIndex}.${colIndex}`;
          requiredItemIds.add(id);

          const label = typeof col === 'string' ? col : '';
          const existingItem = childrenMap.get(id);
          if (!existingItem) {
            const attrs = {
              gridIndex: { row: rowIndex, col: colIndex },
              x: colIndex * (itemProps.size.width + gap.x),
              y: rowIndex * (itemProps.size.height + gap.y),
            };
            const item = newElement('item', this.context);
            item.apply({ type: 'item', id, ...itemProps, label, attrs });
            this.addChild(item);
          } else {
            existingItem.apply({ label });
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
      this.context.viewport.emit('object_transformed', this);
    }
  };
  MixedClass.registerHandler(
    KEYS,
    MixedClass.prototype._applyCells,
    UPDATE_STAGES.CHILD_RENDER,
  );
  return MixedClass;
};
