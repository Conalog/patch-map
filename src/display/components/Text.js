import { BitmapText } from 'pixi.js';
import { textSchema } from '../data-schema/component-schema';
import { Base } from '../mixins/Base';
import { Placementable } from '../mixins/Placementable';
import { Showable } from '../mixins/Showable';
import { Textable } from '../mixins/Textable';
import { TextLayoutable } from '../mixins/TextLayoutable';
import { Textstyleable } from '../mixins/Textstyleable';
import { Tintable } from '../mixins/Tintable';
import { mixins } from '../mixins/utils';

const EXTRA_KEYS = {
  PLACEMENT: ['text', 'style', 'split'],
};

const ComposedText = mixins(
  BitmapText,
  Base,
  Showable,
  Textable,
  Textstyleable,
  TextLayoutable,
  Tintable,
  Placementable,
);

export class Text extends ComposedText {
  constructor(store) {
    super({ type: 'text', store, text: '' });
  }

  apply(changes, options) {
    super.apply(changes, textSchema, options);
  }
}

Text.registerHandler(EXTRA_KEYS.PLACEMENT, Text.prototype._applyPlacement);
