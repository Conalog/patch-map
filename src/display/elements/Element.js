import { Container } from 'pixi.js';
import { Base } from '../mixins/Base';
import { Lockedable } from '../mixins/Lockedable';
import { Showable } from '../mixins/Showable';
import { mixins } from '../mixins/utils';

const ComposedElement = mixins(Container, Base, Showable, Lockedable);

export default class Element extends ComposedElement {
  static isSelectable = false;
  static isResizable = false;
  static hitScope = 'self'; // 'self' | 'children'

  constructor(options) {
    super(options);
  }
}
