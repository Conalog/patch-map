import { Sprite, Texture } from 'pixi.js';
import { imageSchema } from '../data-schema/element-schema';
import { ImageSizeable } from '../mixins/ImageSizeable';
import { Sourceable } from '../mixins/Sourceable';
import { mixins } from '../mixins/utils';
import Element from './Element';

const ComposedImage = mixins(Element, Sourceable, ImageSizeable);

export class Image extends ComposedImage {
  static isSelectable = true;
  static isResizable = true;
  static hitScope = 'children';

  constructor(store) {
    super({ type: 'image', store });
    this.sprite = new Sprite(Texture.EMPTY);
    this.addChild(this.sprite);
    this._loadToken = 0;
  }

  apply(changes, options) {
    super.apply(changes, imageSchema, options);
  }
}
