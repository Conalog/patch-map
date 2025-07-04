import { gridSchema } from '../data-schema/element-schema';
import { Cellsable } from '../mixins/Cellsable';
import { Itemable } from '../mixins/Itemable';
import Element from './Element';

const ComposedGrid = Itemable(Cellsable(Element));

export class Grid extends ComposedGrid {
  constructor(context) {
    super({ type: 'grid', context });
  }

  update(changes) {
    super.update(changes, gridSchema);
  }
}
