import { gridSchema } from '../data-schema/element-schema';
import Element from './Element';

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
  }
}
