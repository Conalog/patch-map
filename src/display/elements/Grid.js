import { isValidationError } from 'zod-validation-error';
import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { selector } from '../../utils/selector/selector';
import { validate } from '../../utils/validator';
import { deepPartial } from '../../utils/zod-deep-strict-partial';
import { gridSchema } from '../data-schema/element-schema';
import Element from './Element';
import { Item } from './Item';

export class Grid extends Element {
  constructor(viewport) {
    super({
      type: 'grid',
      viewport,
      pipelines: ['show', 'position', 'gridComponents'],
    });
  }

  update(changes, options) {
    super.update(changes, gridSchema, options);
    this.updateItem(changes, options);
  }

  updateItem(opts, options) {
    const changes = validate(opts, deepPartial(gridSchema));
    if (isValidationError(changes)) throw changes;
    const gap = deepMerge(this.gap, changes.gap);
    const cells = deepMerge(this.cells, changes.cells);
    const item = deepMerge(this.item, changes.item);

    for (let rowIndex = 0; rowIndex < cells.length; rowIndex++) {
      const row = cells[rowIndex];
      for (let colIndex = 0; colIndex < row.length; colIndex++) {
        const col = row[colIndex];
        if (!col || col === 0) continue;

        const element =
          selector(
            this,
            `$.children[?(@.id==="${this.id}.${rowIndex}.${colIndex}")]`,
          )[0] ?? new Item(this.viewport);

        element.update(
          {
            id: `${this.id}.${rowIndex}.${colIndex}`,
            components: item.components,
            size: { width: item.size.width, height: item.size.height },
            attrs: {
              x: colIndex * (item.size.width + gap.x),
              y: rowIndex * (item.size.height + gap.y),
            },
          },
          options,
        );
        this.addChild(element);
      }
    }
  }
}
