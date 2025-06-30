import { groupSchema } from '../data-schema/element-schema';
import Element from './Element';

export class Group extends Element {
  constructor(viewport) {
    super({
      type: 'group',
      pipelines: ['show', 'position'],
      viewport,
      isRenderGroup: true,
    });
  }

  update(changes, options) {
    super.update(changes, groupSchema, options);
  }
}
