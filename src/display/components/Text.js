import { BitmapText } from 'pixi.js';
import { Base } from '../Base';
import { textSchema } from '../data-schema/component-schema';

export class Text extends Base(BitmapText) {
  constructor(context) {
    super({ type: 'text', context, text: '' });
  }

  update(changes) {
    super.update(changes, textSchema);
  }
}
