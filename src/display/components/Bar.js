import { NineSliceSprite, Texture } from 'pixi.js';
import { barSchema } from '../data-schema/component-schema';
import { Animationable } from '../mixins/Animationable';
import { AnimationSizeable } from '../mixins/Animationsizeable';
import { Base } from '../mixins/Base';
import { Placementable } from '../mixins/Placementable';
import { Showable } from '../mixins/Showable';
import { Sourceable } from '../mixins/Sourceable';
import { Tintable } from '../mixins/Tintable';

const EXTRA_KEYS = {
  PLACEMENT: ['size'],
};

const ComposedBar = Placementable(
  AnimationSizeable(
    Animationable(Tintable(Sourceable(Showable(Base(NineSliceSprite))))),
  ),
);

export class Bar extends ComposedBar {
  constructor(context) {
    super({ type: 'bar', context, texture: Texture.WHITE });

    this.constructor.registerHandler(
      EXTRA_KEYS.PLACEMENT,
      this._applyPlacement,
    );
  }

  update(changes) {
    super.update(changes, barSchema);
  }
}
