import { NineSliceSprite, Texture } from 'pixi.js';
import { backgroundSchema } from '../data-schema/component-schema';
import {
  Base,
  ComponentSizeable,
  Showable,
  Sourceable,
  Tintable,
} from '../mixins';
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
  constructor(context) {
    super({ type: 'background', context, texture: Texture.WHITE });
  }

  update(changes, options) {
    super.update(changes, backgroundSchema, options);
  }
}
