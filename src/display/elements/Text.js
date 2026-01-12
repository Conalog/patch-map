import { BitmapText } from 'pixi.js';
import { textSchema } from '../data-schema/element-schema';
import { ElementTextLayoutable } from '../mixins/ElementTextLayoutable';
import { Textable } from '../mixins/Textable';
import { Textstyleable } from '../mixins/Textstyleable';
import { mixins } from '../mixins/utils';
import Element from './Element';

const ComposedText = mixins(
  Element,
  Textable,
  Textstyleable,
  ElementTextLayoutable,
);

/**
 * Text element that renders BitmapText.
 * It's an independent element in the element tree.
 */
export class Text extends ComposedText {
  static isSelectable = true;
  static hitScope = 'children';

  constructor(store) {
    super({ type: 'text', store });

    // Initialize internal BitmapText
    this.bitmapText = new BitmapText({ text: '', style: {} });
    this.addChild(this.bitmapText);
  }

  apply(changes, options) {
    super.apply(changes, textSchema, options);
  }
}
