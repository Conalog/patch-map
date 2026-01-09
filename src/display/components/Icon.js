import { Sprite, Texture } from 'pixi.js';
import { iconSchema } from '../data-schema/component-schema';
import { Base } from '../mixins/Base';
import { ComponentSizeable } from '../mixins/Componentsizeable';
import { Placementable } from '../mixins/Placementable';
import { Showable } from '../mixins/Showable';
import { Sourceable } from '../mixins/Sourceable';
import { Tintable } from '../mixins/Tintable';
import { mixins } from '../mixins/utils';
import { applyWorldFlip } from '../utils/world-flip';
import { applyWorldRotation } from '../utils/world-rotation';

const EXTRA_KEYS = {
  PLACEMENT: ['source', 'size'],
};

const ComposedIcon = mixins(
  Sprite,
  Base,
  Showable,
  Sourceable,
  Tintable,
  ComponentSizeable,
  Placementable,
);

export class Icon extends ComposedIcon {
  constructor(context) {
    super({ type: 'icon', context, texture: Texture.WHITE });

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
    super.apply(changes, iconSchema, options);
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
