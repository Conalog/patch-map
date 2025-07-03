import { NineSliceSprite, Texture } from 'pixi.js';
import { Base } from '../Base';
import { backgroundSchema } from '../data-schema/component-schema';

export class Background extends Base(NineSliceSprite) {
  constructor(context) {
    super({ type: 'background', context, texture: Texture.WHITE });
  }

  update(changes) {
    super.update(changes, backgroundSchema);
  }
}
