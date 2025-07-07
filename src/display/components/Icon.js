import { Sprite, Texture } from 'pixi.js';
import { iconSchema } from '../data-schema/component-schema';
import {
  Base,
  ComponentSizeable,
  Placementable,
  Showable,
  Sourceable,
  Tintable,
} from '../mixins';
import { mixins } from '../mixins/utils';

const EXTRA_KEYS = {
  PLACEMENT: ['size'],
};

const ComposedIcon = mixins(
  Sprite,
  Base,
  Showable,
  Sourceable,
  Tintable,
  ComponentSizeable,
  Placementable,
);

export class Icon extends ComposedIcon {
  constructor(context) {
    super({ type: 'icon', context, texture: Texture.WHITE });

    this.constructor.registerHandler(
      EXTRA_KEYS.PLACEMENT,
      this._applyPlacement,
    );
  }

  update(changes, options) {
    super.update(changes, iconSchema, options);
  }
}
