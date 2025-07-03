import { selector } from '../../utils/selector/selector';
import { Item } from '../elements';
import { UPDATE_STAGES } from './constants';

const KEYS = ['cells'];

export const Cellsable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyCells(relevantChanges) {
      const { cells } = relevantChanges;

      for (let rowIndex = 0; rowIndex < cells.length; rowIndex++) {
        const row = cells[rowIndex];
        for (let colIndex = 0; colIndex < row.length; colIndex++) {
          const col = row[colIndex];

          let item = selector(
            this.context.viewport,
            '$.children[?(@.id==="${this.id}.${rowIndex}.${colIndex}")]',
          )[0];
          if (col === 0 && item) {
            this.removeChild(item);
          } else if (col === 1 && !item) {
            item = new Item(this.context);
            const itemProps = this.props.item;
            item.update({
              id: `${this.id}.${rowIndex}.${colIndex}`,
              components: itemProps.components,
              size: itemProps.size,
              attrs: {
                x: colIndex * (itemProps.size.width + this.props.gap.x),
                y: rowIndex * (itemProps.size.height + this.props.gap.y),
              },
            });
            this.addChild(item);
          }
        }
      }
    }
  };
  MixedClass.registerHandler(
    KEYS,
    MixedClass.prototype._applyCells,
    UPDATE_STAGES.CHILD_RENDER,
  );
  return MixedClass;
};
