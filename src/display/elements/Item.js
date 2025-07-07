import { itemSchema } from '../data-schema/element-schema';
import { Componentsable } from '../mixins/Componentsable';
import { ItemSizeable } from '../mixins/Itemsizeable';
import { mixins } from '../mixins/utils';
import Element from './Element';

const ComposedItem = mixins(Element, Componentsable, ItemSizeable);

export class Item extends ComposedItem {
  constructor(context) {
    super({ type: 'item', context });
  }

  update(changes) {
    super.update(changes, itemSchema);
  }
}
