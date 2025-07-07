import { gridSchema } from '../data-schema/element-schema';
import { Cellsable, Itemable } from '../mixins';
import { mixins } from '../mixins/utils';
import Element from './Element';

const ComposedGrid = mixins(Element, Cellsable, Itemable);

export class Grid extends ComposedGrid {
  constructor(context) {
    super({ type: 'grid', context });
  }

  update(changes) {
    super.update(changes, gridSchema);
  }
}
