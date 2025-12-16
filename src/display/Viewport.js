import { Viewport } from 'pixi-viewport';
import { groupSchema } from './data-schema/element-schema';
import { Base } from './mixins/Base';
import { Childrenable } from './mixins/Childrenable';
import { mixins } from './mixins/utils';

const ComposedViewport = mixins(Viewport, Base, Childrenable);

export default class BaseViewport extends ComposedViewport {
  constructor(options) {
    super({ type: 'canvas', ...options });
    Object.assign(this.context, { viewport: this });
  }

  apply(changes, options) {
    super.apply(changes, groupSchema, options);
  }
}
