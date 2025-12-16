import { groupSchema } from '../data-schema/element-schema';
import { Childrenable } from '../mixins/Childrenable';
import { mixins } from '../mixins/utils';
import Element from './Element';

const ComposedGroup = mixins(Element, Childrenable);

export class Group extends ComposedGroup {
  constructor(context) {
    super({ type: 'group', context, isRenderGroup: true });
  }

  apply(changes, options) {
    super.apply(changes, groupSchema, options);
  }
}
