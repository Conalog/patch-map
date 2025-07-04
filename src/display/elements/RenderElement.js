import { RenderContainer } from 'pixi.js';
import { Base } from '../mixins/Base';
import { Showable } from '../mixins/Showable';

const ComposedRenderElement = Showable(Base(RenderContainer));

export default class RenderElement extends ComposedRenderElement {
  constructor(options) {
    super(Object.assign(options, { eventMode: 'static' }));
  }
}
