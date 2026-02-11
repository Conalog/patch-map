import { NineSliceSprite, Texture } from 'pixi.js';
import { barSchema } from '../data-schema/component-schema';
import { Animationable } from '../mixins/Animationable';
import { AnimationSizeable } from '../mixins/Animationsizeable';
import { Base } from '../mixins/Base';
import { UPDATE_STAGES } from '../mixins/constants';
import { Placementable } from '../mixins/Placementable';
import { Showable } from '../mixins/Showable';
import { Sourceable } from '../mixins/Sourceable';
import { Tintable } from '../mixins/Tintable';
import { mixins } from '../mixins/utils';
import { WorldTransformable } from '../mixins/WorldTransformable';

const EXTRA_KEYS = {
  PLACEMENT: ['source', 'size'],
};
const WORLD_TRANSFORM_KEYS = ['source', 'size'];

const ComposedBar = mixins(
  NineSliceSprite,
  Base,
  Showable,
  Sourceable,
  Tintable,
  Animationable,
  AnimationSizeable,
  WorldTransformable,
  Placementable,
);

export class Bar extends ComposedBar {
  constructor(store) {
    super({ type: 'bar', store, texture: Texture.WHITE });
  }

  apply(changes, options) {
    super.apply(changes, barSchema, options);
  }
}

Bar.registerHandler(
  WORLD_TRANSFORM_KEYS,
  Bar.prototype._applyWorldTransform,
  UPDATE_STAGES.WORLD_TRANSFORM,
);
Bar.registerHandler(EXTRA_KEYS.PLACEMENT, Bar.prototype._applyPlacement);
