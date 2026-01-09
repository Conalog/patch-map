import { BitmapText } from 'pixi.js';
import { textSchema } from '../data-schema/component-schema';
import { Base } from '../mixins/Base';
import { Placementable } from '../mixins/Placementable';
import { Showable } from '../mixins/Showable';
import { Textable } from '../mixins/Textable';
import { Textstyleable } from '../mixins/Textstyleable';
import { Tintable } from '../mixins/Tintable';
import { mixins } from '../mixins/utils';
import { applyWorldFlip } from '../utils/world-flip';
import { applyWorldRotation } from '../utils/world-rotation';

const EXTRA_KEYS = {
  PLACEMENT: ['text', 'style', 'split'],
};

const ComposedText = mixins(
  BitmapText,
  Base,
  Showable,
  Textable,
  Textstyleable,
  Tintable,
  Placementable,
);

export class Text extends ComposedText {
  constructor(context) {
    super({ type: 'text', context, text: '' });

    this.constructor.registerHandler(
      EXTRA_KEYS.PLACEMENT,
      this._applyPlacement,
    );

    this._boundOnObjectTransformed = this._onObjectTransformed.bind(this);
    this.context?.viewport?.on(
      'object_transformed',
      this._boundOnObjectTransformed,
    );
    this._applyWorldFlip();
    this._applyWorldRotation();
  }

  apply(changes, options) {
    super.apply(changes, textSchema, options);
  }

  _applyWorldFlip() {
    applyWorldFlip(this, this.context?.view);
  }

  _applyWorldRotation() {
    applyWorldRotation(this, this.context?.view);
  }

  _onObjectTransformed(changedObject) {
    if (changedObject !== this.context?.world) return;
    this._applyWorldFlip();
    this._applyWorldRotation();
  }

  destroy(options) {
    if (this.context?.viewport && this._boundOnObjectTransformed) {
      this.context.viewport.off(
        'object_transformed',
        this._boundOnObjectTransformed,
      );
    }
    super.destroy(options);
  }
}
