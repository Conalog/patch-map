import { Sprite, Texture } from 'pixi.js';
import { iconSchema } from '../data-schema/component-schema';
import { Base } from '../mixins/Base';
import { ComponentSizeable } from '../mixins/Componentsizeable';
import { Placementable } from '../mixins/Placementable';
import { Showable } from '../mixins/Showable';
import { Sourceable } from '../mixins/Sourceable';
import { Tintable } from '../mixins/Tintable';
import { mixins } from '../mixins/utils';

const EXTRA_KEYS = {
  PLACEMENT: ['source', 'size'],
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
  constructor(store) {
    super({ type: 'icon', store, texture: Texture.WHITE });
  }

  apply(changes, options) {
    super.apply(changes, iconSchema, options);
  }
}

Icon.registerHandler(EXTRA_KEYS.PLACEMENT, Icon.prototype._applyPlacement);
