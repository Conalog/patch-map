import { convertArray } from '../utils/convert';
import { WildcardEventEmitter } from '../utils/event/WildcardEventEmitter';

export default class SelectionModel extends WildcardEventEmitter {
  #elements = [];

  get elements() {
    return [...this.#elements];
  }

  set(elements) {
    const newElements = elements ? convertArray(elements) : [];
    const oldElements = this.#elements;
    this.#elements = newElements;

    const added = newElements.filter((el) => !oldElements.includes(el));
    const removed = oldElements.filter((el) => !newElements.includes(el));
    this.emit('update', {
      target: this,
      current: this.#elements,
      added,
      removed,
    });
  }

  add(elementsToAdd) {
    const added = convertArray(elementsToAdd).filter(
      (el) => !this.#elements.includes(el),
    );
    if (added.length > 0) {
      this.#elements.push(...added);
      this.emit('update', {
        target: this,
        current: this.#elements,
        added,
        removed: [],
      });
    }
  }

  remove(elementsToRemove) {
    const toRemove = convertArray(elementsToRemove);
    const removed = [];
    const newElements = this.#elements.filter((el) => {
      if (toRemove.includes(el)) {
        removed.push(el);
        return false;
      }
      return true;
    });

    if (removed.length > 0) {
      this.#elements = newElements;
      this.emit('update', {
        target: this,
        current: this.#elements,
        added: [],
        removed,
      });
    }
  }

  destroy() {
    this.removeAllListeners();
  }
}
