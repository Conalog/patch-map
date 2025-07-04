import { itemSchema } from '../data-schema/element-schema';
import { Componentsable } from '../mixins/Componentsable';
import { ItemSizeable } from '../mixins/Itemsizeable';
import Element from './Element';

const ComposedItem = ItemSizeable(Componentsable(Element));

export class Item extends ComposedItem {
  constructor(context) {
    super({ type: 'item', context });
  }

  update(changes) {
    super.update(changes, itemSchema);
  }
}
