import { gridSchema } from '../data-schema/element-schema';
import Element from './Element';

export class Grid extends Element {
  constructor(context) {
    super({ type: 'grid', context });
  }

  update(changes) {
    super.update(changes, gridSchema);
  }
}
