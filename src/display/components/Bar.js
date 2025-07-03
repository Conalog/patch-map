import { NineSliceSprite, Texture } from 'pixi.js';
import { Base } from '../Base';
import { barSchema } from '../data-schema/component-schema';

export class Bar extends Base(NineSliceSprite) {
  constructor(context) {
    super({ type: 'bar', context, texture: Texture.WHITE });
  }

  update(changes) {
    super.update(changes, barSchema);
  }
}
