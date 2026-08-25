export function createActionRegistry(actionDefinitions, handlerEntries = []) {
  const definitions = indexDefinitions(actionDefinitions);
  const handlers = indexHandlers(handlerEntries, definitions);

  return Object.freeze({
    handlerIds: Object.freeze([...handlers.keys()].sort()),
    assertCoverage(cases) {
      return assertExactHandlerCoverage(actionDefinitions, cases, handlers);
    },
    resolve(action) {
      const definition = resolveDefinition(action, definitions);
      const handler = handlers.get(definition.handlerId);
      assert(typeof handler === 'function', `missing handler ${definition.handlerId}`);
      return handler;
    },
  });
}

export function assertExactHandlerCoverage(actionDefinitions, cases, handlerEntries) {
  const definitions = indexDefinitions(actionDefinitions);
  const handlers = indexHandlers(handlerEntries, definitions);
  const required = requiredHandlers(cases, definitions);
  const missing = required.filter((handlerId) => !handlers.has(handlerId));
  assert(missing.length === 0, `missing selected handlers: ${missing.join(', ')}`);

  return Object.freeze({
    requiredCount: required.length,
    registeredCount: handlers.size,
    handlerIds: Object.freeze(required),
  });
}

export function requiredHandlerIds(actionDefinitions, cases) {
  return Object.freeze(requiredHandlers(cases, indexDefinitions(actionDefinitions)));
}

function indexDefinitions(actionDefinitions) {
  assert(Array.isArray(actionDefinitions) && actionDefinitions.length > 0, 'action definitions must be a non-empty array');
  const definitions = new Map();
  const handlerIds = new Set();
  for (const definition of actionDefinitions) {
    assert(definition && typeof definition === 'object' && !Array.isArray(definition), 'action definition must be an object');
    assert(typeof definition.type === 'string' && definition.type.length > 0, 'action definition type');
    assert(definition.handlerId === `contract/${definition.type}`, `${definition.type} exact handler ID`);
    assert(!definitions.has(definition.type), `duplicate action type ${definition.type}`);
    assert(!handlerIds.has(definition.handlerId), `duplicate handler ID ${definition.handlerId}`);
    definitions.set(definition.type, definition);
    handlerIds.add(definition.handlerId);
  }
  return definitions;
}

function indexHandlers(handlerEntries, definitions) {
  const entries = handlerEntries instanceof Map
    ? [...handlerEntries.entries()]
    : handlerEntries;
  assert(Array.isArray(entries), 'handlers must be a Map or entry array');

  const knownHandlerIds = new Set([...definitions.values()].map((definition) => definition.handlerId));
  const handlers = new Map();
  for (const entry of entries) {
    assert(Array.isArray(entry) && entry.length === 2, 'handler entry must be [handlerId, function]');
    const [handlerId, handler] = entry;
    assert(typeof handlerId === 'string' && knownHandlerIds.has(handlerId), `unknown handler ID ${String(handlerId)}`);
    assert(typeof handler === 'function', `${handlerId} handler must be a function`);
    assert(!handlers.has(handlerId), `duplicate handler registration ${handlerId}`);
    handlers.set(handlerId, handler);
  }
  return handlers;
}

function requiredHandlers(cases, definitions) {
  assert(Array.isArray(cases) && cases.length > 0, 'selected cases must be a non-empty array');
  const required = new Set();
  for (const record of cases) {
    const actionTrace = record?.fixture?.actionTrace ?? record?.actionTrace;
    assert(Array.isArray(actionTrace) && actionTrace.length > 0, `${String(record?.id)} action trace`);
    for (const action of actionTrace) {
      const definition = resolveDefinition(action, definitions);
      required.add(definition.handlerId);
    }
  }
  return [...required].sort();
}

function resolveDefinition(action, definitions) {
  assert(action && typeof action === 'object' && !Array.isArray(action), 'action must be an object');
  assert(typeof action.type === 'string', 'action type');
  const definition = definitions.get(action.type);
  assert(definition !== undefined, `unknown action type ${action.type}`);
  return definition;
}

function assert(condition, message) {
  if (!condition) throw new Error(`PatchMap action registry invalid: ${message}`);
}
