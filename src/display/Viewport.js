import { Viewport } from 'pixi-viewport';
import { canvasSchema } from './data-schema/element-schema';
import { Base } from './mixins/Base';
import { Childrenable } from './mixins/Childrenable';
import { mixins } from './mixins/utils';

const ComposedViewport = mixins(Viewport, Base, Childrenable);

export default class BaseViewport extends ComposedViewport {
  constructor(options) {
    super({ type: 'canvas', ...options });
  }

  apply(changes, options) {
    super.apply(changes, canvasSchema, options);
  }
}
