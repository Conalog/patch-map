import { newElement } from '../elements/creator';
import { UPDATE_STAGES } from './constants';

const KEYS = ['cells', 'inactiveCellStrategy'];

export const Cellsable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyCells(relevantChanges, options = {}) {
      const cells = relevantChanges.cells ?? this.props.cells;
      const { gap, item: itemProps, inactiveCellStrategy } = this.props;

      const requiredItemIds = new Set();
      const childrenMap = new Map(
        this.children.map((child) => [child.id, child]),
      );
      this._cellsApplyCreatedAllGridItems =
        options.mergeStrategy === 'replace' && childrenMap.size === 0;

      cells.forEach((row, rowIndex) => {
        row.forEach((col, colIndex) => {
          const isInactive = !col;
          if (isInactive && inactiveCellStrategy !== 'hide') return;

          const id = `${this.id}.${rowIndex}.${colIndex}`;
          const label = String(col);
          requiredItemIds.add(id);

          const existingItem = childrenMap.get(id);
          if (!existingItem) {
            const attrs = {
              gridIndex: { row: rowIndex, col: colIndex },
              x: colIndex * (itemProps.size.width + gap.x),
              y: rowIndex * (itemProps.size.height + gap.y),
            };
            const item = newElement('item', this.store);
            this.addChild(item);
            const itemChanges = {
              type: 'item',
              id,
              ...itemProps,
              label,
              attrs,
              show: !isInactive,
            };
            applyInitialCellItem(item, itemChanges, options);
          } else {
            const itemChanges = { label, show: !isInactive };
            existingItem.apply(itemChanges, {
              ...options,
              changes: itemChanges,
            });
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
      this.store.viewport.emit('object_transformed', this);
    }
  };
  MixedClass.registerHandler(
    KEYS,
    MixedClass.prototype._applyCells,
    UPDATE_STAGES.CHILD_RENDER,
  );
  return MixedClass;
};

const canUseInitialFastPath = (options) =>
  options.mergeStrategy === 'replace' &&
  options.validateSchema === false &&
  options.normalize === false;

const applyInitialCellItem = (item, itemChanges, options) => {
  const applyOptions = {
    ...options,
    changes: itemChanges,
  };
  if (canUseInitialFastPath(options)) {
    item._applyInitialTrusted(itemChanges, applyOptions);
    return;
  }

  item.apply(itemChanges, applyOptions);
};
