import { clone } from '../value-atoms.mjs';

function domains(values) {
  return {
    revisions: values.revisions ?? {},
    scene: values.scene ?? {},
    geometry: values.geometry ?? {},
    interaction: values.interaction ?? {},
    events: values.events ?? {},
    history: values.history ?? {},
    outcome: values.outcome ?? {},
    resources: values.resources ?? {},
  };
}

function actionProductSnapshot(action, label) {
  const product = recordValue(action.product, `${label} product`);
  return recordValue(product.snapshot, `${label} product snapshot`);
}

function actionProductSemantic(action, label) {
  const product = recordValue(action.product, `${label} product`);
  return recordValue(product.semantic, `${label} product semantic`);
}

function semanticInteractionMode(action, label) {
  const semantic = actionProductSemantic(action, label);
  const interaction = recordValue(
    semantic.interaction,
    `${label} semantic interaction`,
  );
  return stringValue(
    interaction.mode ?? interaction.interactionMode,
    `${label} interaction mode`,
  );
}

function semanticSceneRevision(action, label) {
  const snapshot = actionProductSnapshot(action, label);
  const revisions = recordValue(
    snapshot.revisions,
    `${label} product revisions`,
  );
  return finiteNumber(revisions.sceneRevision, `${label} scene revision`);
}

function pointerActiveCount(action, label) {
  const pointer = recordValue(
    action.pointerGesture,
    `${label} pointer gesture`,
  );
  return nonNegativeInteger(
    pointer.activePointerCount,
    `${label} active pointer count`,
  );
}

function actionActual(execution, index, type) {
  const result = execution.actionResults[index];
  assert(result?.type === type, `action ${index} must be ${type}`);
  return recordValue(result.delta.actual, `action ${index} actual`);
}

function pointerProbe(action) {
  return recordValue(action.pointerGesture, 'pointer gesture probe');
}

function cloneRecord(value, label) {
  return clone(recordValue(value, label));
}

function cloneArray(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  return clone(value);
}

function recordValue(value, label) {
  assert(isRecord(value), `${label} must be a record`);
  return value;
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} must be a string`);
  return value;
}

function booleanValue(value, label) {
  assert(typeof value === 'boolean', `${label} must be a boolean`);
  return value;
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} must be finite`);
  return value;
}

function nonNegativeInteger(value, label) {
  const number = finiteNumber(value, label);
  assert(Number.isInteger(number) && number >= 0, `${label} must be a non-negative integer`);
  return number;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`PatchMap pointer/selection fold invalid: ${message}`);
}

export {
  actionActual,
  actionProductSnapshot,
  assert,
  booleanValue,
  cloneArray,
  cloneRecord,
  domains,
  finiteNumber,
  isRecord,
  nonNegativeInteger,
  pointerActiveCount,
  pointerProbe,
  recordValue,
  semanticInteractionMode,
  semanticSceneRevision,
  stringValue,
};
