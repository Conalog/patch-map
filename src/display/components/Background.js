import { NineSliceSprite, Texture } from 'pixi.js';
import { backgroundSchema } from '../data-schema/component-schema';
import { Base } from '../mixins/Base';
import { ComponentSizeable } from '../mixins/Componentsizeable';
import { Showable } from '../mixins/Showable';
import { Sourceable } from '../mixins/Sourceable';
import { Tintable } from '../mixins/Tintable';
import { mixins } from '../mixins/utils';

const ComposedBackground = mixins(
  NineSliceSprite,
  Base,
  Showable,
  Sourceable,
  Tintable,
  ComponentSizeable,
);

export class Background extends ComposedBackground {
  static respectsPadding = false;

  constructor(context) {
    super({ type: 'background', context, texture: Texture.WHITE });
  }

  update(changes, options) {
    super.update(changes, backgroundSchema, options);
  }
}
