import { Sprite, Texture } from 'pixi.js';
import { Base } from '../Base';
import { iconSchema } from '../data-schema/component-schema';

export class Icon extends Base(Sprite) {
  constructor(context) {
    super({ type: 'icon', context, texture: Texture.WHITE });
  }

  update(changes) {
    super.update(changes, iconSchema);
  }
}
