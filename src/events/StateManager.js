import { WildcardEventEmitter } from '../utils/event/WildcardEventEmitter';
import { PROPAGATE_EVENT } from './states/State';

/**
 * Manages the state of the application, including the registration, transition, and management of states.
 * This class implements a stack-based state machine, allowing for nested states and complex interaction flows.
 *
 * @extends WildcardEventEmitter
 * @fires StateManager#state:pushed
 * @fires StateManager#state:popped
 * @fires StateManager#state:set
 * @fires StateManager#state:reset
 * @fires StateManager#state:destroyed
 * @fires StateManager#modifier:activated
 * @fires StateManager#modifier:deactivated
 */
export default class StateManager extends WildcardEventEmitter {
  /** @private */
  #store;
  /** @private */
  #stateRegistry = new Map();
  /** @private */
  #stateStack = [];
  /** @private */
  #modifierState = null;
  /** @private */
  #boundEvents = new Set();
  /** @private */
  #eventListeners = {};

  /**
   * Initializes the StateManager with a store.
   * @param {object} store - The store in which the StateManager operates, typically containing the viewport and other global instances.
   */
  constructor(store) {
    super();
    this.#store = store;
  }

  /**
   * Gets the current modifier state. A modifier state is a temporary, high-priority state
   * (e.g., holding a key for panning) that overrides the main state stack without altering it.
   * @returns {import('./states/State').default | null} The current modifier state or null if none is active.
   */
  get modifierState() {
    return this.#modifierState;
  }

  /**
   * Gets the registry of all known state definitions.
   * @returns {Map<string, object>} A map where keys are state names and values are their definitions.
   */
  get stateRegistry() {
    return this.#stateRegistry;
  }

  /**
   * Registers a state class or a singleton instance with a unique name.
   * Also ensures that the necessary event listeners for the state are bound.
   * @param {string} name - The unique name of the state.
   * @param {typeof import('./states/State').default | import('./states/State').default} StateClassOrObject - The state class or singleton instance.
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
   * Transitions to a new state by clearing the entire state stack and pushing the new state.
   * @param {string} name - The name of the state to transition to.
   * @param {...*} args - Additional arguments to pass to the state's `enter` method.
   */
  setState(name, ...args) {
    this.resetState();
    const newState = this.pushState(name, ...args);

    if (newState) {
      this.emit('state:set', { state: newState, target: this });
    }
  }

  /**
   * Clears the entire state stack, calling `exit` on all active states.
   */
  resetState() {
    this.exitAll();
    this.#stateStack.length = 0;

    this.emit('state:reset', { target: this });
  }

  /**
   * Pushes a new state onto the stack, pausing the previous state.
   * @param {string} name - The name of the state to push.
   * @param {...*} args - Additional arguments to pass to the new state's `enter` method.
   * @returns {import('./states/State').default | undefined} The new state instance that was pushed, or undefined if not found.
   */
  pushState(name, ...args) {
    const pausedState = this.getCurrentState();
    pausedState?.pause?.();

    const stateDef = this.#stateRegistry.get(name);
    if (!stateDef) {
      console.warn(`State "${name}" is not registered.`);
      return;
    }

    let instance = stateDef.instance;
    if (!instance || !stateDef.isSingleton) {
      const StateClass = stateDef.Class;
      instance = new StateClass(name);
      if (stateDef.isSingleton) {
        stateDef.instance = instance;
      }
    }

    this.#stateStack.push(instance);
    instance.enter?.(this.#store, ...args);

    this.emit('state:pushed', {
      pushedState: instance,
      pausedState,
      target: this,
    });
    return instance;
  }

  /**
   * Pops the top state from the stack, exiting it and resuming the state below it.
   * @param {*} [payload] - Optional payload to pass to the previous state's `resume` method.
   * @returns {import('./states/State').default | null} The popped state or null if the stack is empty.
   */
  popState(payload) {
    if (this.#stateStack.length === 0) return null;

    const poppedState = this.#stateStack.pop();
    poppedState?.exit?.();

    const resumedState = this.getCurrentState();
    resumedState?.resume?.(payload);

    this.emit('state:popped', { poppedState, resumedState, target: this });
    return poppedState;
  }

  /**
   * Calls the `exit` method on all states currently in the stack.
   * Used for a hard reset of the state machine.
   * @private
   */
  exitAll() {
    this.#stateStack.forEach((state) => {
      state?.exit?.();
    });
  }

  /**
   * Gets the current active state from the top of the stack.
   * @returns {import('./states/State').default | null} The current active state or null if the stack is empty.
   */
  getCurrentState() {
    return this.#stateStack.length > 0
      ? this.#stateStack[this.#stateStack.length - 1]
      : null;
  }

  /**
   * Activates a temporary, high-priority modifier state.
   * This state intercepts all events without affecting the main state stack.
   * If the same modifier state is already active, this method does nothing.
   * @param {string} name - The name of the modifier state to activate.
   * @param {...*} args - Additional arguments to pass to the modifier state's `enter` method.
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
    this.#modifierState.enter?.(this.#store, ...args);

    this.emit('modifier:activated', {
      modifierState: this.#modifierState,
      target: this,
    });
  }

  /**
   * Deactivates the current modifier state, restoring event handling to the main state stack.
   */
  deactivateModifier() {
    const deactivatedModifier = this.#modifierState;
    if (deactivatedModifier) {
      deactivatedModifier.exit?.();
      this.#modifierState = null;
      this.emit('modifier:deactivated', {
        modifierState: deactivatedModifier,
        target: this,
      });
    }
  }

  /**
   * Ensures event listeners for the given event names are attached to the viewport or window.
   * It creates a single dispatcher for each event type that directs the event to the
   * appropriate state(s) (modifier or stack).
   * @private
   * @param {string[]} [eventNames=[]] - The names of the events to ensure listeners for (e.g., 'onpointerdown').
   */
  _ensureEventListeners(eventNames = []) {
    const viewport = this.#store.viewport;
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
   * Destroys the StateManager, cleaning up all event listeners,
   * destroying state instances, and clearing all internal references.
   */
  destroy() {
    for (const eventName of this.#boundEvents) {
      const pixiEventName = eventName.replace('on', '').toLowerCase();
      const listener = this.#eventListeners[eventName];
      if (pixiEventName.startsWith('key')) {
        window.removeEventListener(pixiEventName, listener);
      } else {
        this.#store.viewport.off(pixiEventName, listener);
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

    this.emit('state:destroyed', { target: this });
    this.removeAllListeners();
  }
}
