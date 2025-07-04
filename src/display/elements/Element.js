import { Container } from 'pixi.js';
import { Base } from '../mixins/Base';
import { Showable } from '../mixins/Showable';

const ComposedElement = Showable(Base(Container));

export default class Element extends ComposedElement {
  constructor(options) {
    super(Object.assign(options, { eventMode: 'static' }));
  }
}
