import { imageSchema } from '../data-schema/element-schema';
import { Imagesable } from '../mixins/Imagesable';
import { mixins } from '../mixins/utils';
import Element from './Element';

const ComposedImage = mixins(Element, Imagesable);

export class Image extends ComposedImage {
  static isSelectable = true;
  static hitScope = 'children';

  constructor(context) {
    super({ type: 'image', context });
  }

  apply(changes, options) {
    super.apply(changes, imageSchema, options);
  }
}
