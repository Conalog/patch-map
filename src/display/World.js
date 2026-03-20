import { Container } from 'pixi.js';
import { canvasSchema } from './data-schema/element-schema';
import { Base } from './mixins/Base';
import { Childrenable } from './mixins/Childrenable';
import { mixins } from './mixins/utils';

const ComposedWorld = mixins(Container, Base, Childrenable);

export default class World extends ComposedWorld {
  constructor(options) {
    super({ type: 'canvas', ...options });
  }

  apply(changes, options) {
    super.apply(changes, canvasSchema, options);
  }
}
