import { groupSchema } from '../data-schema/element-schema';
import { Childrenable } from '../mixins';
import { mixins } from '../mixins/utils';
import Element from './Element';

const ComposedGroup = mixins(Element, Childrenable);

export class Group extends ComposedGroup {
  constructor(context) {
    super({ type: 'group', context, isRenderGroup: true });
  }

  update(changes) {
    super.update(changes, groupSchema);
  }
}
