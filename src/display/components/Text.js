import { BitmapText } from 'pixi.js';
import { textSchema } from '../data-schema/component-schema';
import { Base } from '../mixins/Base';
import { UPDATE_STAGES } from '../mixins/constants';
import { Placementable } from '../mixins/Placementable';
import { Showable } from '../mixins/Showable';
import { Textable } from '../mixins/Textable';
import { TextLayoutable } from '../mixins/TextLayoutable';
import { Textstyleable } from '../mixins/Textstyleable';
import { Tintable } from '../mixins/Tintable';
import { mixins } from '../mixins/utils';
import { WorldTransformable } from '../mixins/WorldTransformable';

const HANDLER_KEYS = ['text', 'style', 'split', 'attrs'];

const ComposedText = mixins(
  BitmapText,
  Base,
  Showable,
  Textable,
  Textstyleable,
  TextLayoutable,
  Tintable,
  WorldTransformable,
  Placementable,
);

export class Text extends ComposedText {
  static avoidsVisualOffsetWhenOverflowing = true;
  static keepsBasePivotDuringCompensation = true;

  constructor(store) {
    super({ type: 'text', store, text: '' });
  }

  apply(changes, options) {
    super.apply(changes, textSchema, options);
  }
}

Text.registerHandler(
  HANDLER_KEYS,
  Text.prototype._applyWorldTransform,
  UPDATE_STAGES.WORLD_TRANSFORM,
);
Text.registerHandler(HANDLER_KEYS, Text.prototype._applyPlacement);
