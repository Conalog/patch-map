import { EventEmitter } from 'pixi.js';

/**
 * Extends PIXI.EventEmitter to add support for namespace-based wildcard events.
 * It enriches the wildcard event payload with structured data, including the
 * original namespace and event type.
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
   * If the event name has a namespace (e.g., 'namespace:event'), this method
   * will first emit the specific event. Then, it will emit a corresponding
   * wildcard event ('namespace:*') with a structured payload that includes
   * the `namespace` and `type` of the original event.
   *
   * @override
   * @param {string} eventName - The name of the event to emit.
   * @param {...*} args - The arguments to pass to the listeners.
   * @returns {boolean} `true` if the event had listeners, else `false`.
   */
  emit(eventName, ...args) {
    const specificResult = super.emit(eventName, ...args);

    const separatorIndex = eventName.indexOf(':');
    if (separatorIndex > 0) {
      const namespace = eventName.substring(0, separatorIndex);
      const type = eventName.substring(separatorIndex + 1);
      const wildcardEvent = `${namespace}:*`;

      const originalPayload = args[0];
      let wildcardArgs = args;

      if (
        originalPayload &&
        typeof originalPayload === 'object' &&
        !Array.isArray(originalPayload)
      ) {
        const wildcardPayload = { ...originalPayload, namespace, type };
        wildcardArgs = [wildcardPayload, ...args.slice(1)];
      }

      const wildcardResult = super.emit(wildcardEvent, ...wildcardArgs);
      return specificResult || wildcardResult;
    }

    return specificResult;
  }
}
