import { RenderContainer } from 'pixi.js';
import { Base } from '../mixins/Base';
import { Showable } from '../mixins/Showable';
import { mixins } from '../mixins/utils';

const ComposedRenderElement = mixins(RenderContainer, Base, Showable);

export default class RenderElement extends ComposedRenderElement {
  constructor(options) {
    super(Object.assign(options, { eventMode: 'static' }));
  }
}
