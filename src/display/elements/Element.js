import { Container } from 'pixi.js';
import { Base } from '../Base';

export default class Element extends Base(Container) {
  constructor(options) {
    super(Object.assign(options, { eventMode: 'static' }));
  }
}
