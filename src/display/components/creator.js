/**
 * @fileoverview Component creation factory.
 *
 * To solve a circular dependency issue, this module does not import specific component classes directly.
 * Instead, it uses a registration pattern where classes are registered via `registerComponent` and instantiated via `newComponent`.
 *
 * The registration of component classes is handled explicitly in `registry.js` at the application's entry point.
 */

const creator = {};

export const registerComponent = (type, componentClass) => {
  creator[type] = componentClass;
};

export const newComponent = (type, context) => {
  if (!creator[type]) {
    throw new Error(`Component type "${type}" has not been registered.`);
  }
  return new creator[type](context);
};
