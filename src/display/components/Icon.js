import { Sprite, Texture } from 'pixi.js';
import { iconSchema } from '../data-schema/component-schema';
import { Base } from '../mixins/Base';
import { ComponentSizeable } from '../mixins/Componentsizeable';
import { Placementable } from '../mixins/Placementable';
import { Showable } from '../mixins/Showable';
import { Sourceable } from '../mixins/Sourceable';
import { Tintable } from '../mixins/Tintable';

const EXTRA_KEYS = {
  PLACEMENT: ['size'],
};

const ComposedIcon = Placementable(
  ComponentSizeable(Tintable(Sourceable(Showable(Base(Sprite))))),
);

export class Icon extends ComposedIcon {
  constructor(context) {
    super({ type: 'icon', context, texture: Texture.WHITE });

    this.constructor.registerHandler(
      EXTRA_KEYS.PLACEMENT,
      this._applyPlacement,
    );
  }

  update(changes) {
    super.update(changes, iconSchema);
  }
}
