/**
 * A unique symbol used by event handlers within a state to indicate
 * that the event should be propagated to the next state in the state stack.
 * This allows for creating event bubbling-like behavior through different active states.
 */
export const PROPAGATE_EVENT = Symbol('propagate_event');

/**
 * Represents an abstract base class for all states in a state machine.
 * It defines the lifecycle methods (`enter`, `exit`, `pause`, `resume`)
 * and provides a mechanism for handling events and managing resources.
 *
 * Each concrete state class should extend this class and implement its own logic
 * for the lifecycle methods and event handlers.
 */
export default class State {
  /**
   * An array of strings defining which events this state class handles (e.g., 'onpointerdown').
   * The StateManager uses this static property to attach the necessary event listeners
   * when a state of this type becomes active.
   * @static
   * @type {string[]}
   */
  static handledEvents = [];

  /**
   * An AbortController instance to manage the lifecycle of asynchronous operations
   * and event listeners within this state. A new controller is created upon entering the state.
   * Its signal can be used to cancel any pending operations when the state exits.
   * @type {AbortController}
   */
  abortController = new AbortController();

  constructor(name) {
    /**
     * A reference to the shared context object provided by the StateManager.
     * This context typically contains references to global objects like the viewport,
     * the application instance, etc. It is null until `enter()` is called.
     * @type {object | null}
     */
    this.context = null;
    this.key = name;
  }

  /**
   * Called by the StateManager when this state becomes the active state.
   * This method should be used for setup logic, like initializing variables or
   * adding temporary scene elements.
   * A new AbortController is created here for the state's lifecycle.
   *
   * @param {object} context - The shared application context from the StateManager.
   */
  enter(context, ...args) {
    this.context = context;
    this.args = args;
    this.abortController = new AbortController();
  }

  /**
   * Called by the StateManager when this state is being deactivated or removed.
   * This method should be used for cleanup logic, such as removing event listeners
   * or stopping asynchronous tasks. It automatically calls `abort()` on the
   * `abortController`.
   */
  exit() {
    this.abortController.abort();
  }

  /**
   * Called by the StateManager when another state is pushed on top of this one in the stack.
   * This state is not exited but becomes inactive. Use this for temporarily
   * hiding UI elements or pausing animations.
   */
  pause() {}

  /**
   * Called by the StateManager when this state becomes active again after the state
   * on top of it has been popped. Use this to resume activities that were
   * paused in the `pause()` method.
   */
  resume() {}

  /**
   * Cleans up the state completely. It's an alias for `exit()` and ensures
   * that all resources are released when the state is no longer needed.
   */
  destroy() {
    this.exit();
  }
}
