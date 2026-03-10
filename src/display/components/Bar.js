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

const HANDLER_KEYS = ['source', 'size', 'attrs'];

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
  static keepsBasePivotDuringCompensation = true;

  constructor(store) {
    super({ type: 'bar', store, texture: Texture.WHITE });
  }

  apply(changes, options) {
    super.apply(changes, barSchema, options);
  }
}

Bar.registerHandler(
  HANDLER_KEYS,
  Bar.prototype._applyWorldTransform,
  UPDATE_STAGES.WORLD_TRANSFORM,
);
Bar.registerHandler(HANDLER_KEYS, Bar.prototype._applyPlacement);
