import { projectPlacementExecution } from './fold-layout-order/placement.mjs';
import { projectStackingExecution } from './fold-layout-order/stacking.mjs';
import {
  assert,
  assertExactKeys,
  isPlainObject,
  validateJsonValue,
} from './fold-layout-order/values.mjs';
import { deepFreeze } from './value-atoms.mjs';

export const LAYOUT_ORDER_FOLD_REVISION = 'patch-map-layout-order-fold/1';

const CONTRACT_REVISIONS = Object.freeze({
  observation: 'patch-map-semantic-observation/1',
  execution: 'patch-map-contract-case-execution/1',
  delta: 'patch-map-semantic-observation-delta/1',
  productCleanup: 'patch-map-layout-order-cleanup/1',
});
const DOMAIN_NAMES = Object.freeze([
  'case',
  'provenance',
  'environment',
  'revisions',
  'scene',
  'geometry',
  'text',
  'paint',
  'interaction',
  'events',
  'history',
  'accessibility',
  'outcome',
  'resources',
]);

/** Fold shared LAY-002/LAY-003 public Engine evidence into fourteen domains. */
export function foldLayoutOrderExecution(options) {
  const input = validateOptions(options);
  if (input.casePlan.id === 'LAY-002') {
    return finalizeFold(projectPlacementExecution(input, CONTRACT_REVISIONS));
  }
  if (input.casePlan.id === 'LAY-003') {
    return finalizeFold(projectStackingExecution(input, CONTRACT_REVISIONS));
  }
  throw new Error(`PatchMap layout-order fold invalid: unsupported case ${String(input.casePlan.id)}`);
}

function finalizeFold(projected) {
  assert(
    DOMAIN_NAMES.every((domain) => isPlainObject(projected.actual[domain])),
    'actual must contain all fourteen object domains',
  );
  validateJsonValue(projected.actual, 'actual', new WeakSet());
  return deepFreeze(projected);
}

function validateOptions(options) {
  assert(isPlainObject(options), 'options must be a plain object');
  assertExactKeys(options, ['casePlan', 'environment', 'execution', 'provenance'], 'options');
  assert(isPlainObject(options.casePlan), 'casePlan');
  assert(isPlainObject(options.execution), 'execution');
  assert(isPlainObject(options.provenance), 'provenance');
  assert(isPlainObject(options.environment), 'environment');
  validateJsonValue(options.provenance, 'provenance', new WeakSet());
  validateJsonValue(options.environment, 'environment', new WeakSet());
  return options;
}
