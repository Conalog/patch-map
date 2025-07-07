import { Container } from 'pixi.js';
import { Base, Showable } from '../mixins';
import { mixins } from '../mixins/utils';

const ComposedElement = mixins(Container, Base, Showable);

export default class Element extends ComposedElement {
  constructor(options) {
    super(Object.assign(options, { eventMode: 'static' }));
  }
}
