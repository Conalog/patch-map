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
import { assertFiniteDisplaySize, mixins } from '../mixins/utils';
import { WorldTransformable } from '../mixins/WorldTransformable';

const EXTRA_KEYS = {
  PLACEMENT: ['text', 'style', 'split'],
};
const WORLD_TRANSFORM_KEYS = ['text', 'style', 'split'];

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
  constructor(store) {
    super({ type: 'text', store, text: '' });
  }

  apply(changes, options) {
    super.apply(changes, textSchema, options);
    this._assertFiniteMetrics('Text.apply');
  }

  _onWorldTransformChanged() {
    super._onWorldTransformChanged();
    this._assertFiniteMetrics('Text.world_transformed');
  }

  _assertFiniteMetrics(context) {
    assertFiniteDisplaySize(this, context);
  }
}

Text.registerHandler(
  WORLD_TRANSFORM_KEYS,
  Text.prototype._applyWorldTransform,
  UPDATE_STAGES.WORLD_TRANSFORM,
);
Text.registerHandler(EXTRA_KEYS.PLACEMENT, Text.prototype._applyPlacement);
