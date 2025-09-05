import { Container } from 'pixi.js';
import { Base } from '../mixins/Base';
import { Showable } from '../mixins/Showable';
import { mixins } from '../mixins/utils';

const ComposedElement = mixins(Container, Base, Showable);

export default class Element extends ComposedElement {
  static isSelectable = false;
  static hitScope = 'self'; // 'self' | 'children'

  constructor(options) {
    super(Object.assign(options, { eventMode: 'static' }));
  }
}
