import { PROPAGATE_EVENT } from './states/State';

/**
 * Manages the state of the application, including the registration, transition, and management of states.
 */
export default class StateManager {
  #context;
  #stateRegistry = new Map();
  #stateStack = [];
  #modifierState = null;
  #boundEvents = new Set();
  #eventListeners = {};

  /**
   * Initializes the StateManager with a context.
   * @param {object} context - The context in which the StateManager operates.
   */
  constructor(context) {
    this.#context = context;
  }

  /**
   * Gets the current modifier state.
   * @returns {(object | null)} The current modifier state or null if none is active.
   */
  get modifierState() {
    return this.#modifierState;
  }

  get stateRegistry() {
    return this.#stateRegistry;
  }

  /**
   * Registers a state class or singleton instance.
   * @param {string} name - The unique name of the state.
   * @param {(object | Function)} StateClassOrObject - The state class or singleton instance.
   * @param {boolean} [isSingleton=true] - If true, the instance is created once and reused.
   */
  register(name, StateClassOrObject, isSingleton = true) {
    if (this.#stateRegistry.has(name)) {
      console.warn(`State "${name}" is already registered. Overwriting.`);
    }
    this.#stateRegistry.set(name, {
      Class: StateClassOrObject,
      instance:
        isSingleton && typeof StateClassOrObject !== 'function'
          ? StateClassOrObject
          : null,
      isSingleton,
    });

    const events =
      typeof StateClassOrObject === 'function'
        ? StateClassOrObject.handledEvents
        : StateClassOrObject.constructor.handledEvents;
    this._ensureEventListeners(events);
  }

  /**
   * Transitions to a new state, maintaining the modifier state.
   */
  set(name, ...args) {
    this.exitAll();
    this.#stateStack.length = 0;
    this.pushState(name, ...args);
  }

  /**
   * Pushes a new state onto the stack.
   */
  pushState(name, ...args) {
    const currentState = this.getCurrentState();
    currentState?.pause?.();

    const stateDef = this.#stateRegistry.get(name);
    if (!stateDef) {
      console.warn(`State "${name}" is not registered.`);
      return;
    }

    let instance = stateDef.instance;
    if (!instance || !stateDef.isSingleton) {
      const StateClass = stateDef.Class;
      instance = new StateClass();
      if (stateDef.isSingleton) {
        stateDef.instance = instance;
      }
    }

    this.#stateStack.push(instance);
    instance.enter?.(this.#context, ...args);
  }

  /**
   * Pops the top state from the stack and returns to the previous state.
   * @param {*} payload - Payload to pass to the previous state's resume method.
   * @returns {(object | null)} The popped state or null if the stack is empty.
   */
  popState(payload) {
    if (this.#stateStack.length === 0) return null;

    const currentState = this.#stateStack.pop();
    currentState?.exit?.();

    const previousState = this.getCurrentState();
    previousState?.resume?.(payload);
    return currentState;
  }

  exitAll() {
    this.#stateStack.forEach((state) => {
      state?.exit?.();
    });
  }

  /**
   * Gets the current active state.
   * @returns {(object | null)} The current active state or null if none is active.
   */
  getCurrentState() {
    return this.#stateStack.length > 0
      ? this.#stateStack[this.#stateStack.length - 1]
      : null;
  }

  /**
   * Activates a modifier state.
   */
  activateModifier(name, ...args) {
    const stateDef = this.#stateRegistry.get(name);
    if (!stateDef) {
      console.warn(`State "${name}" is not registered.`);
      return;
    }

    const prospectiveClassOrObject = stateDef.Class;
    if (this.modifierState) {
      if (typeof prospectiveClassOrObject === 'function') {
        if (this.#modifierState instanceof prospectiveClassOrObject) {
          return;
        }
      } else {
        if (this.#modifierState === prospectiveClassOrObject) {
          return;
        }
      }
    }

    if (this.#modifierState) {
      this.#modifierState.exit?.();
    }

    let instance;
    if (typeof prospectiveClassOrObject === 'function') {
      instance =
        stateDef.isSingleton && stateDef.instance
          ? stateDef.instance
          : new prospectiveClassOrObject();
      if (stateDef.isSingleton) {
        stateDef.instance = instance;
      }
    } else {
      instance = prospectiveClassOrObject;
    }

    this.#modifierState = instance;
    this.#modifierState.enter?.(this.#context, ...args);
  }

  /**
   * Deactivates the current modifier state.
   */
  deactivateModifier() {
    this.#modifierState?.exit?.();
    this.#modifierState = null;
  }

  /**
   * Ensures event listeners are registered for necessary events.
   * @private
   * @param {Array<string>} eventNames - The names of the events to ensure listeners for.
   */
  _ensureEventListeners(eventNames = []) {
    const viewport = this.#context.viewport;
    const dispatch = (eventName, event) => {
      if (this.#modifierState) {
        this.#modifierState[eventName]?.(event);
        return;
      }

      for (let i = this.#stateStack.length - 1; i >= 0; i--) {
        const state = this.#stateStack[i];
        if (!state || typeof state[eventName] !== 'function') {
          continue;
        }

        const result = state[eventName](event);
        if (result !== PROPAGATE_EVENT) {
          break;
        }
      }
    };

    for (const eventName of eventNames) {
      if (this.#boundEvents.has(eventName)) continue;

      const pixiEventName = eventName.replace('on', '').toLowerCase();
      const listener = (e) => dispatch(eventName, e);
      this.#eventListeners[eventName] = listener;

      if (pixiEventName.startsWith('key')) {
        window.addEventListener(pixiEventName, listener);
      } else {
        viewport.on(pixiEventName, listener);
      }
      this.#boundEvents.add(eventName);
    }
  }

  /**
   * Destroys the StateManager, releasing all resources.
   */
  destroy() {
    for (const eventName of this.#boundEvents) {
      const pixiEventName = eventName.replace('on', '').toLowerCase();
      const listener = this.#eventListeners[eventName];
      if (pixiEventName.startsWith('key')) {
        window.removeEventListener(pixiEventName, listener);
      } else {
        this.#context.viewport.off(pixiEventName, listener);
      }
    }
    this.#stateRegistry.forEach((stateDef) => {
      if (
        stateDef.instance &&
        typeof stateDef.instance.destroy === 'function'
      ) {
        stateDef.instance.destroy();
      }
    });
    this.#stateRegistry.clear();
    this.#stateStack = [];
    this.#modifierState = null;
    this.#boundEvents.clear();
    this.#eventListeners = {};
  }
}
