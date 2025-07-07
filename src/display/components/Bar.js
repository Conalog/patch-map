import { NineSliceSprite, Texture } from 'pixi.js';
import { barSchema } from '../data-schema/component-schema';
import {
  AnimationSizeable,
  Animationable,
  Base,
  Placementable,
  Showable,
  Sourceable,
  Tintable,
} from '../mixins';
import { mixins } from '../mixins/utils';

const EXTRA_KEYS = {
  PLACEMENT: ['size'],
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
  constructor(context) {
    super({ type: 'bar', context, texture: Texture.WHITE });

    this.constructor.registerHandler(
      EXTRA_KEYS.PLACEMENT,
      this._applyPlacement,
    );
  }

  update(changes, options) {
    super.update(changes, barSchema, options);
  }
}
