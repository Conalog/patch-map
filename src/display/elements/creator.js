/**
 * @fileoverview Element creation factory.
 *
 * To solve a circular dependency issue, this module does not import specific element classes directly.
 * Instead, it uses a registration pattern where classes are registered via `registerElement` and instantiated via `newElement`.
 *
 * The registration of element classes is handled explicitly in `registry.js` at the application's entry point.
 */

const creator = {};

export const registerElement = (type, elementClass) => {
  creator[type] = elementClass;
};

export const newElement = (type, store) => {
  if (!creator[type]) {
    throw new Error(`Element type "${type}" has not been registered.`);
  }
  return new creator[type](store);
};
