import { NineSliceSprite, Texture } from 'pixi.js';
import { barSchema } from '../data-schema/component-schema';
import { Animationable } from '../mixins/Animationable';
import { AnimationSizeable } from '../mixins/Animationsizeable';
import { Base } from '../mixins/Base';
import { Placementable } from '../mixins/Placementable';
import { Showable } from '../mixins/Showable';
import { Sourceable } from '../mixins/Sourceable';
import { Tintable } from '../mixins/Tintable';
import { mixins } from '../mixins/utils';

const EXTRA_KEYS = {
  PLACEMENT: ['source', 'size'],
};

const ComposedBar = mixins(
  NineSliceSprite,
  Base,
  Showable,
  Sourceable,
  Tintable,
  Animationable,
  AnimationSizeable,
  Placementable,
);

export class Bar extends ComposedBar {
  constructor(store) {
    super({ type: 'bar', store, texture: Texture.WHITE });

    this.constructor.registerHandler(
      EXTRA_KEYS.PLACEMENT,
      this._applyPlacement,
    );
  }

  apply(changes, options) {
    super.apply(changes, barSchema, options);
  }
}
