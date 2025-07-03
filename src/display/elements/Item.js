import { itemSchema } from '../data-schema/element-schema';
import { Componentsable } from '../mixins/Componentsable';
import Element from './Element';

const ComposedItem = Componentsable(Element);

export class Item extends ComposedItem {
  constructor(context) {
    super({ type: 'item', context });
  }

  update(changes) {
    super.update(changes, itemSchema);
  }
}
