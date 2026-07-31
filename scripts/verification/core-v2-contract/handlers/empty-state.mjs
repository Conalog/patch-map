import { clone } from '../value-atoms.mjs';

export const EMPTY_STATE_ACTION_TYPES = Object.freeze([
  'set-host-state',
  'query-target',
]);

const HANDLERS = Object.freeze({
  'set-host-state': setHostStateAction,
  'query-target': queryTargetAction,
});

export function createEmptyStateHandlerEntries() {
  return Object.freeze(EMPTY_STATE_ACTION_TYPES.map((type) => Object.freeze([
    `contract/${type}`,
    HANDLERS[type],
  ])));
}

function setHostStateAction(context, action) {
  const operands = exactOperands(action, ['state']);
  const state = stringValue(operands.state, 'set-host-state.state');
  const before = context.snapshotHostSeam();
  const hostState = {
    state,
    owner: 'host',
    revision: before.revision + 1,
    actionIndex: context.actionIndex,
  };
  const after = {
    ...hostState,
    ownsUi: true,
    resources: clone(before.resources),
  };

  return {
    actual: {
      transition: { from: before.state, to: state },
      ownership: { owner: 'host', ownsUi: true },
      resources: clone(before.resources),
    },
    host: {
      operation: 'set-host-state',
      input: { state },
      returned: after,
    },
    hostState,
  };
}

async function queryTargetAction(context, action) {
  const operands = exactOperands(action, ['target']);
  const target = targetValue(operands.target);
  const engine = context.currentMainEngine();
  assert(engine !== null, 'query-target requires an established main engine');
  requireMethod(engine, 'query');
  const result = await engine.query(clone(target));
  assert(result === null || isRecord(result), 'query-target result must be an object or null');
  const snapshot = snapshotEngine(engine);

  return {
    actual: {
      target: clone(target),
      result: clone(result),
      found: result !== null,
      snapshot,
    },
    host: {
      operation: 'query-target',
      input: clone(target),
      returned: clone(result),
      snapshot,
    },
    captureSource: snapshot,
  };
}

function targetValue(value) {
  const target = recordValue(value, 'query-target.target');
  const keys = Object.keys(target).sort();
  const supported = keys.length === 1 && keys[0] === 'id'
    || keys.length === 2 && keys[0] === 'id' && keys[1] === 'kind';
  assert(supported, 'query-target.target operand keys');
  return {
    id: stringValue(target.id, 'query-target.target.id'),
    ...(target.kind === undefined ? {} : { kind: stringValue(target.kind, 'query-target.target.kind') }),
  };
}

function exactOperands(action, keys) {
  const operands = recordValue(action.operands, `${action.type} operands`);
  const actual = Object.keys(operands).sort();
  const expected = [...keys].sort();
  assert(
    actual.length === expected.length && actual.every((key, index) => key === expected[index]),
    `${action.type} operand keys`,
  );
  return operands;
}

function snapshotEngine(engine) {
  requireMethod(engine, 'snapshot');
  return clone(engine.snapshot());
}

function requireMethod(target, method) {
  assert(isRecord(target) && typeof target[method] === 'function', `engine must expose ${method}()`);
}

function recordValue(value, label) {
  assert(isRecord(value), `${label} must be an object`);
  return value;
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} must be a non-empty string`);
  return value;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Core v2 empty-state handler invalid: ${message}`);
}
