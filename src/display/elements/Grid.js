import { gridSchema } from '../data-schema/element-schema';
import { Cellsable } from '../mixins/Cellsable';
import { Itemable } from '../mixins/Itemable';
import { mixins } from '../mixins/utils';
import Element from './Element';

const ComposedGrid = mixins(Element, Cellsable, Itemable);

export class Grid extends ComposedGrid {
  constructor(store) {
    super({ type: 'grid', store });
  }

  apply(changes, options) {
    super.apply(changes, gridSchema, options);
  }
}
