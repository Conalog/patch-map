import { groupSchema } from '../data-schema/element-schema';
import Element from './Element';

export class Group extends Element {
  constructor(context) {
    super({ type: 'group', context, isRenderGroup: true });
  }

  update(changes) {
    super.update(changes, groupSchema);
  }
}
