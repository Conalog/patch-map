import { groupSchema } from '../data-schema/element-schema';
import { Childrenable } from '../mixins/Childrenable';
import Element from './Element';

const ComposedGroup = Childrenable(Element);

export class Group extends ComposedGroup {
  constructor(context) {
    super({ type: 'group', context, isRenderGroup: true });
  }

  update(changes) {
    super.update(changes, groupSchema);
  }
}
