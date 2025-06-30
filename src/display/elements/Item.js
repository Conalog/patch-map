import { itemSchema } from '../data-schema/element-schema';
import Element from './Element';

export class Item extends Element {
  constructor(viewport) {
    super({
      type: 'item',
      viewport,
      pipelines: ['show', 'position', 'components'],
    });
  }

  update(changes, options) {
    super.update(changes, itemSchema, options);
  }
}
