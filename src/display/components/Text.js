import { BitmapText } from 'pixi.js';
import { textSchema } from '../data-schema/component-schema';
import { Base } from '../mixins/Base';
import { Placementable } from '../mixins/Placementable';
import { Showable } from '../mixins/Showable';
import { Textable } from '../mixins/Textable';
import { Textstyleable } from '../mixins/Textstyleable';

const EXTRA_KEYS = {
  PLACEMENT: ['text', 'split'],
};

const ComposedText = Placementable(
  Textstyleable(Textable(Showable(Base(BitmapText)))),
);

export class Text extends ComposedText {
  constructor(context) {
    super({
      type: 'text',
      context,
      text: '',
      style: { fontFamily: 'FiraCode regular', fill: 'black' },
    });

    this.constructor.registerHandler(
      EXTRA_KEYS.PLACEMENT,
      this._applyPlacement,
    );
  }

  update(changes, options) {
    super.update(changes, textSchema, options);
  }
}
