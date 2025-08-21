import { EventEmitter } from 'pixi.js';

/**
 * Extends PIXI.EventEmitter to add support for namespace-based wildcard events.
 * When an event with a namespace (e.g., 'namespace:event') is emitted,
 * it automatically triggers a corresponding wildcard event (e.g., 'namespace:*').
 * This allows for listening to all events within a specific category.
 *
 * @extends PIXI.EventEmitter
 * @example
 * const emitter = new WildcardEventEmitter();
 *
 * // Listen for a specific event
 * emitter.on('history:undone', ({ command }) => {
 * console.log(`Command undone: ${command.id}`);
 * });
 *
 * // Listen for all events in the 'history' namespace
 * emitter.on('history:*', ({ command }) => {
 * console.log('A history event occurred.');
 * });
 *
 * emitter.emit('history:undone', { command: { id: 'cmd-1' } });
 * // CONSOLE LOG: Command undone: cmd-1
 * // CONSOLE LOG: A history event occurred.
 */
export class WildcardEventEmitter extends EventEmitter {
  /**
   * Emits an event to listeners.
   * If the event name contains a colon (`:`), it also emits a wildcard event
   * for the corresponding namespace (e.g., emitting 'state:pushed' will also emit 'state:*').
   * @override
   * @param {string} eventName - The name of the event to emit.
   * @param {...*} args - The arguments to pass to the listeners.
   * @returns {boolean} `true` if the event had listeners (either specific or wildcard), else `false`.
   */
  emit(eventName, ...args) {
    // 1. Emit the original, specific event first.
    const specificResult = super.emit(eventName, ...args);

    // 2. Check for a namespace separator.
    const separatorIndex = eventName.indexOf(':');
    if (separatorIndex > 0) {
      // 3. Construct and emit the wildcard event.
      const namespace = eventName.substring(0, separatorIndex);
      const wildcardEvent = `${namespace}:*`;
      const wildcardResult = super.emit(wildcardEvent, ...args);

      // Return true if either the specific or wildcard listener was found.
      return specificResult || wildcardResult;
    }

    return specificResult;
  }
}
