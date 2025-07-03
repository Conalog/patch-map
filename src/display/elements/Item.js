import { itemSchema } from '../data-schema/element-schema';
import Element from './Element';

export class Item extends Element {
  constructor(context) {
    super({ type: 'item', context });
  }

  update(changes) {
    super.update(changes, itemSchema);
  }
}
