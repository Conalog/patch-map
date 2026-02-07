import { BitmapText } from 'pixi.js';
import { textSchema } from '../data-schema/component-schema';
import { Base } from '../mixins/Base';
import { Placementable } from '../mixins/Placementable';
import { Showable } from '../mixins/Showable';
import { Textable } from '../mixins/Textable';
import { Textstyleable } from '../mixins/Textstyleable';
import { Tintable } from '../mixins/Tintable';
import { mixins } from '../mixins/utils';
import { WorldTransformable } from '../mixins/WorldTransformable';

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
  WorldTransformable,
  Placementable,
);

export class Text extends ComposedText {
  static useViewLayout = false;
  static useViewPlacement = true;
  static worldRotationOptions = { mode: 'readable' };
  static worldTransformKeys = ['text', 'style', 'split'];

  constructor(store) {
    super({ type: 'text', store, text: '' });
    this.useViewLayout = false;
    this.useViewPlacement = true;

    this.constructor.registerHandler(
      EXTRA_KEYS.PLACEMENT,
      this._applyPlacement,
    );

    this._boundOnObjectTransformed = this._onObjectTransformed.bind(this);
    this.store?.viewport?.on(
      'object_transformed',
      this._boundOnObjectTransformed,
    );
    this._applyWorldTransform();
  }

  apply(changes, options) {
    super.apply(changes, textSchema, options);
  }

  _onObjectTransformed(changedObject) {
    if (changedObject !== this.store?.world) return;
    this._applyWorldTransform();
    this._applyPlacement({
      placement: this.props.placement,
      margin: this.props.margin,
    });
  }

  destroy(options) {
    if (this.store?.viewport && this._boundOnObjectTransformed) {
      this.store.viewport.off(
        'object_transformed',
        this._boundOnObjectTransformed,
      );
    }
    super.destroy(options);
  }
}
