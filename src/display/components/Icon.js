import { Sprite, Texture } from 'pixi.js';
import { iconSchema } from '../data-schema/component-schema';
import { Base } from '../mixins/Base';
import { ComponentSizeable } from '../mixins/Componentsizeable';
import { Placementable } from '../mixins/Placementable';
import { Showable } from '../mixins/Showable';
import { Sourceable } from '../mixins/Sourceable';
import { Tintable } from '../mixins/Tintable';
import { mixins } from '../mixins/utils';
import { WorldTransformable } from '../mixins/WorldTransformable';

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
  WorldTransformable,
  Placementable,
);

export class Icon extends ComposedIcon {
  static useViewLayout = false;
  static useViewPlacement = true;
  static worldRotationOptions = { mode: 'readable' };
  static worldTransformKeys = ['source', 'size'];

  constructor(store) {
    super({ type: 'icon', store, texture: Texture.WHITE });
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
    super.apply(changes, iconSchema, options);
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
