import { NineSliceSprite, Texture } from 'pixi.js';
import { backgroundSchema } from '../data-schema/component-schema';
import { Base } from '../mixins/Base';
import { ComponentSizeable } from '../mixins/Componentsizeable';
import { Showable } from '../mixins/Showable';
import { Sourceable } from '../mixins/Sourceable';
import { Tintable } from '../mixins/Tintable';

const ComposedBackground = ComponentSizeable(
  Tintable(Sourceable(Showable(Base(NineSliceSprite)))),
);

export class Background extends ComposedBackground {
  constructor(context) {
    super({ type: 'background', context, texture: Texture.WHITE });
  }

  update(changes) {
    super.update(changes, backgroundSchema);
  }
}
