import { createHash } from 'node:crypto';

import {
  createSemanticObservation,
  SEMANTIC_OBSERVATION_REVISION,
} from './observe.mjs';

const OPERATORS = new Set([
  'eq',
  'orderedEq',
  'finite',
  'lte',
  'gte',
  'unchanged',
  'zero',
  'contains',
  'sameIdentity',
  'noLeak',
]);
const OBSERVATION_DOMAINS = new Set([
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
const REFERENCE_DOMAINS = new Set([
  'captures',
  'fixtures',
  ...OBSERVATION_DOMAINS,
]);
const VOLATILE_SENTINEL = 'core-v2-declared-volatile/1';

/** Compare one immutable normalized-expected record with one completed actual observation. */
export function compareObservation({ expectedCase, actual, fixtures = {}, captures = {} }) {
  validateExpectedCase(expectedCase);
  const actualRecord = createSemanticObservation({ observation: actual });
  const observed = actualRecord.observation;
  assert(isPlainObject(fixtures), 'fixtures reference root must be a plain object');
  assert(isPlainObject(captures), 'captures reference root must be a plain object');
  const expectedRecordSha256 = canonicalSha256(expectedCase);
  validateActualBinding(expectedCase, expectedRecordSha256, observed);

  const referenceRoot = { ...observed, fixtures, captures };
  const assertions = expectedCase.expected.assertions.map((assertion, index) =>
    evaluateAssertion(assertion, index, referenceRoot),
  );
  const passed = assertions.filter((assertion) => assertion.passed).length;
  const failed = assertions.length - passed;
  const firstFailure = assertions.find((assertion) => !assertion.passed) ?? null;
  const stableActualSha256 = stableDigest(observed, expectedCase.volatileFields);
  const comparisonSha256 = canonicalSha256({
    $schema: 'core-v2-contract-comparison/1',
    caseId: expectedCase.id,
    expectedRecordSha256,
    actualObservationSha256: actualRecord.actualObservationSha256,
    stableActualSha256,
    assertions: assertions.map(({ index, path, operator, passed: assertionPassed, matches, failure }) => ({
      index,
      path,
      operator,
      passed: assertionPassed,
      matches,
      failure: failure === null ? null : {
        code: failure.code,
        path: failure.path,
        observedKind: failure.observedKind,
        expectedKind: failure.expectedKind,
      },
    })),
    passed,
    failed,
  });

  return deepFreeze({
    assertions,
    passed,
    failed,
    firstFailure,
    stableActualSha256,
    comparisonSha256,
  });
}

function validateActualBinding(expectedCase, expectedRecordSha256, actual) {
  assert(actual.case.id === expectedCase.id, `actual case ID must equal ${expectedCase.id}`);
  if (Object.hasOwn(actual.case, 'caseType')) {
    assert(actual.case.caseType === expectedCase.caseType, `actual caseType must equal ${expectedCase.caseType}`);
  }

  for (const field of ['expectedRecordSha256', 'expectedEvidenceSha256', 'expectedEvidenceDigest']) {
    if (!Object.hasOwn(actual.provenance, field)) continue;
    assert(
      actual.provenance[field] === expectedRecordSha256,
      `actual provenance ${field} must bind the exact expected record`,
    );
  }
}

function validateExpectedCase(expectedCase) {
  assert(isPlainObject(expectedCase), 'expectedCase must be a plain object');
  assert(typeof expectedCase.id === 'string' && expectedCase.id.length > 0, 'expectedCase ID');
  assert(
    ['capability', 'consumer-journey'].includes(expectedCase.caseType),
    `${expectedCase.id} caseType`,
  );
  assert(isPlainObject(expectedCase.expected), `${expectedCase.id} expected body`);
  assert(
    expectedCase.expected.semanticObservationRevision === SEMANTIC_OBSERVATION_REVISION,
    `${expectedCase.id} semantic observation revision`,
  );
  assert(expectedCase.expected.implementationNeutral === true, `${expectedCase.id} implementation-neutral expected`);
  assert(
    Array.isArray(expectedCase.expected.assertions) && expectedCase.expected.assertions.length > 0,
    `${expectedCase.id} non-empty assertions`,
  );
  assert(Array.isArray(expectedCase.volatileFields), `${expectedCase.id} volatileFields array`);
  assert(
    new Set(expectedCase.volatileFields).size === expectedCase.volatileFields.length,
    `${expectedCase.id} unique volatileFields`,
  );

  for (const [index, assertion] of expectedCase.expected.assertions.entries()) {
    assert(isPlainObject(assertion), `${expectedCase.id} assertion ${index} object`);
    assert(typeof assertion.path === 'string' && assertion.path.startsWith('/'), `${expectedCase.id} assertion ${index} path`);
    validateAssertionPath(assertion.path, expectedCase.id, index);
    assert(OPERATORS.has(assertion.operator), `${expectedCase.id} assertion ${index} unknown operator ${String(assertion.operator)}`);
    validateExpectedOperand(assertion, expectedCase.id, index);
  }
  for (const [index, field] of expectedCase.volatileFields.entries()) {
    assert(
      typeof field === 'string' && /^(?:[A-Za-z_$][\w$-]*)(?:\.(?:[A-Za-z_$][\w$-]*))*$/.test(field),
      `${expectedCase.id} volatile field ${index}`,
    );
    assert(OBSERVATION_DOMAINS.has(field.split('.')[0]), `${expectedCase.id} volatile field ${index} domain`);
  }
}

function validateExpectedOperand(assertion, caseId, index) {
  const hasValue = Object.hasOwn(assertion, 'value');
  const required = new Set(['eq', 'orderedEq', 'lte', 'gte', 'contains', 'sameIdentity', 'unchanged']);
  assert(!required.has(assertion.operator) || hasValue, `${caseId} assertion ${index} missing operand`);

  if (assertion.operator === 'finite' && hasValue) {
    assert(assertion.value === true, `${caseId} assertion ${index} finite operand`);
  }
  if (assertion.operator === 'orderedEq') {
    assert(
      Array.isArray(assertion.value) || isReference(assertion.value),
      `${caseId} assertion ${index} orderedEq operand`,
    );
  }
  if (assertion.operator === 'zero' && hasValue) {
    assert(assertion.value === 0, `${caseId} assertion ${index} zero operand`);
  }
  if (assertion.operator === 'noLeak' && hasValue) {
    assert(isZeroBudget(assertion.value), `${caseId} assertion ${index} noLeak zero budget`);
  }
  if (['lte', 'gte'].includes(assertion.operator)) {
    assert(typeof assertion.value === 'number' && Number.isFinite(assertion.value), `${caseId} assertion ${index} numeric operand`);
  }
  if (assertion.operator === 'contains') {
    assert(
      typeof assertion.value === 'string' || Array.isArray(assertion.value) ||
        (isPlainObject(assertion.value) && !isReference(assertion.value)),
      `${caseId} assertion ${index} contains operand`,
    );
  }
  if (['sameIdentity', 'unchanged'].includes(assertion.operator)) {
    assert(isReference(assertion.value), `${caseId} assertion ${index} explicit reference operand`);
  }
  validateReferences(assertion.value, `${caseId} assertion ${index}`);
}

function validateAssertionPath(path, caseId, index) {
  const first = parsePath(path)[0];
  assert(
    first?.type === 'property' && OBSERVATION_DOMAINS.has(first.key),
    `${caseId} assertion ${index} observation domain`,
  );
}

function evaluateAssertion(assertion, index, referenceRoot) {
  let observedEntries;
  try {
    observedEntries = resolvePath(referenceRoot, assertion.path, 'observation');
  } catch (error) {
    if (!(error instanceof ResolutionFailure)) throw error;
    return failedAssertion(index, assertion, 0, error.details);
  }

  let operand;
  try {
    operand = Object.hasOwn(assertion, 'value')
      ? materializeReferences(assertion.value, referenceRoot)
      : undefined;
  } catch (error) {
    if (!(error instanceof ResolutionFailure)) throw error;
    return failedAssertion(index, assertion, observedEntries.length, error.details);
  }

  for (const entry of observedEntries) {
    const failure = applyOperator(assertion.operator, entry.value, operand, entry.path);
    if (failure !== null) return failedAssertion(index, assertion, observedEntries.length, failure);
  }

  return {
    index,
    path: assertion.path,
    operator: assertion.operator,
    passed: true,
    matches: observedEntries.length,
    failure: null,
  };
}

function failedAssertion(index, assertion, matches, failure) {
  return {
    index,
    path: assertion.path,
    operator: assertion.operator,
    passed: false,
    matches,
    failure,
  };
}

function applyOperator(operator, observed, operand, path) {
  switch (operator) {
    case 'eq':
    case 'orderedEq':
    case 'unchanged':
    case 'sameIdentity': {
      if (operator === 'orderedEq' && !Array.isArray(observed)) {
        return wrongType(path, observed, 'array');
      }
      if (operator === 'orderedEq' && !Array.isArray(operand)) {
        return wrongExpectedType(path, operand, 'array');
      }
      return deepEqual(observed, operand) ? null : valueMismatch(path, observed, operand);
    }
    case 'finite':
      if (typeof observed !== 'number') return wrongType(path, observed, 'number');
      return Number.isFinite(observed) ? null : valueMismatch(path, observed, 'finite-number');
    case 'lte':
    case 'gte':
      if (typeof observed !== 'number') return wrongType(path, observed, 'number');
      if (typeof operand !== 'number') return wrongExpectedType(path, operand, 'number');
      return operator === 'lte' ? (observed <= operand ? null : valueMismatch(path, observed, operand))
        : (observed >= operand ? null : valueMismatch(path, observed, operand));
    case 'zero':
      if (typeof observed !== 'number') return wrongType(path, observed, 'number');
      return Object.is(observed, 0) || Object.is(observed, -0)
        ? null
        : valueMismatch(path, observed, 0);
    case 'contains':
      if (!sameContainmentKind(observed, operand)) {
        return wrongType(path, observed, kindOf(operand));
      }
      return containsValue(observed, operand) ? null : valueMismatch(path, observed, operand);
    case 'noLeak':
      return noLeakFailure(observed, operand, path);
    default:
      throw new Error(`Core v2 comparison invalid: unreachable operator ${operator}`);
  }
}

function noLeakFailure(observed, budget, path) {
  if (typeof observed !== 'number' && !isPlainObject(observed)) {
    return wrongType(path, observed, 'number|object');
  }
  if (budget === undefined) return zeroTreeFailure(observed, path);
  return budgetFailure(observed, budget, path);
}

function zeroTreeFailure(observed, path) {
  if (typeof observed === 'number') {
    return observed === 0 ? null : leakFailure(path, observed);
  }
  if (!isPlainObject(observed)) return wrongType(path, observed, 'number|object');
  for (const [key, value] of Object.entries(observed)) {
    const failure = zeroTreeFailure(value, `${path}/${escapePointer(key)}`);
    if (failure !== null) return failure;
  }
  return null;
}

function budgetFailure(observed, budget, path) {
  if (budget === 0) {
    if (typeof observed !== 'number') return wrongType(path, observed, 'number');
    return observed === 0 ? null : leakFailure(path, observed);
  }
  if (!isPlainObject(budget)) return wrongExpectedType(path, budget, 'recursive-zero-budget');
  if (!isPlainObject(observed)) return wrongType(path, observed, 'object');
  for (const [key, nestedBudget] of Object.entries(budget)) {
    const nestedPath = `${path}/${escapePointer(key)}`;
    if (!Object.hasOwn(observed, key)) return unresolvedFailure(nestedPath, 'UNRESOLVED_PATH', 'leak budget path does not resolve');
    const failure = budgetFailure(observed[key], nestedBudget, nestedPath);
    if (failure !== null) return failure;
  }
  return null;
}

function materializeReferences(value, root) {
  if (isReference(value)) {
    validateReferenceNamespace(value.$ref);
    const entries = resolvePath(root, value.$ref, 'reference');
    if (entries.length !== 1) {
      throw new ResolutionFailure(unresolvedFailure(value.$ref, 'AMBIGUOUS_REFERENCE', 'reference must resolve exactly once'));
    }
    return entries[0].value;
  }
  if (Array.isArray(value)) return value.map((nested) => materializeReferences(nested, root));
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, materializeReferences(nested, root)]),
  );
}

function validateReferences(value, label) {
  if (Array.isArray(value)) {
    value.forEach((nested) => validateReferences(nested, label));
    return;
  }
  if (!isPlainObject(value)) return;
  if (Object.hasOwn(value, '$ref')) {
    assert(isReference(value), `${label} reference union`);
    validateReferenceNamespace(value.$ref);
    return;
  }
  for (const nested of Object.values(value)) validateReferences(nested, label);
}

function validateReferenceNamespace(path) {
  const tokens = parsePath(path);
  const first = tokens[0];
  assert(first?.type === 'property' && REFERENCE_DOMAINS.has(first.key), `reference namespace ${path}`);
  assert(!tokens.some((token) => token.type === 'wildcard'), `reference cannot contain wildcard ${path}`);
}

function resolvePath(root, path, label) {
  const tokens = parsePath(path);
  let entries = [{ value: root, path: '' }];
  let sawWildcard = false;

  for (const token of tokens) {
    const next = [];
    for (const entry of entries) {
      if (token.type === 'wildcard') {
        sawWildcard = true;
        if (!Array.isArray(entry.value)) {
          throw new ResolutionFailure(unresolvedFailure(entry.path || '/', 'WRONG_PATH_CONTAINER', `${label} wildcard requires an array`));
        }
        if (entry.value.length === 0) {
          throw new ResolutionFailure(unresolvedFailure(`${entry.path}/*`, 'EMPTY_WILDCARD', `${label} wildcard resolved no values`));
        }
        entry.value.forEach((value, index) => next.push({ value, path: `${entry.path}/${index}` }));
        continue;
      }

      const resolved = readToken(entry.value, token);
      if (!resolved.found) {
        const unresolvedPath = `${entry.path}/${escapePointer(tokenLabel(token))}`;
        throw new ResolutionFailure(unresolvedFailure(unresolvedPath, 'UNRESOLVED_PATH', `${label} path does not resolve`));
      }
      next.push({ value: resolved.value, path: `${entry.path}/${escapePointer(tokenLabel(token))}` });
    }
    entries = next;
  }

  if (entries.length === 0) {
    const code = sawWildcard ? 'EMPTY_WILDCARD' : 'UNRESOLVED_PATH';
    throw new ResolutionFailure(unresolvedFailure(path, code, `${label} path resolved no values`));
  }
  return entries;
}

function parsePath(path) {
  assert(typeof path === 'string' && path.startsWith('/') && path.length > 1, `canonical JSON pointer ${String(path)}`);
  const segments = path.slice(1).split('/').map(decodePointer);
  const tokens = [];
  for (const segment of segments) tokens.push(...parseSegment(segment, path));
  return tokens;
}

function parseSegment(segment, path) {
  if (segment === '*') return [{ type: 'wildcard' }];
  const bracket = segment.indexOf('[');
  if (bracket === -1) return [{ type: 'property', key: segment }];

  const result = [];
  const base = segment.slice(0, bracket);
  if (base.length > 0) result.push({ type: 'property', key: base });
  let cursor = bracket;
  while (cursor < segment.length) {
    const match = segment.slice(cursor).match(/^\[(\*|0|[1-9]\d*)\]/);
    assert(match !== null, `canonical bracket path ${path}`);
    result.push(match[1] === '*' ? { type: 'wildcard' } : { type: 'index', index: Number(match[1]) });
    cursor += match[0].length;
  }
  assert(result.length > 0, `non-empty path segment ${path}`);
  return result;
}

function readToken(value, token) {
  if (token.type === 'index') {
    return Array.isArray(value) && token.index < value.length
      ? { found: true, value: value[token.index] }
      : { found: false };
  }
  if (Array.isArray(value) && /^(?:0|[1-9]\d*)$/.test(token.key)) {
    const index = Number(token.key);
    return index < value.length ? { found: true, value: value[index] } : { found: false };
  }
  return isPlainObject(value) && Object.hasOwn(value, token.key)
    ? { found: true, value: value[token.key] }
    : { found: false };
}

function stableDigest(actual, volatileFields) {
  const masked = cloneJson(actual);
  for (const field of volatileFields) {
    const segments = field.split('.');
    let owner = masked;
    for (const segment of segments.slice(0, -1)) {
      assert(isPlainObject(owner) && Object.hasOwn(owner, segment), `volatile field does not resolve: ${field}`);
      owner = owner[segment];
    }
    const leaf = segments.at(-1);
    assert(isPlainObject(owner) && Object.hasOwn(owner, leaf), `volatile field does not resolve: ${field}`);
    owner[leaf] = VOLATILE_SENTINEL;
  }
  return canonicalSha256(masked);
}

function sameContainmentKind(observed, expected) {
  if (typeof expected === 'string') return typeof observed === 'string';
  if (Array.isArray(expected)) return Array.isArray(observed);
  if (isPlainObject(expected)) return isPlainObject(observed);
  return false;
}

function containsValue(observed, expected) {
  if (typeof expected === 'string') return observed.includes(expected);
  if (Array.isArray(expected)) {
    const used = new Set();
    return expected.every((candidate) => {
      const index = observed.findIndex((value, position) => !used.has(position) && containsNested(value, candidate));
      if (index === -1) return false;
      used.add(index);
      return true;
    });
  }
  return Object.entries(expected).every(([key, value]) =>
    Object.hasOwn(observed, key) && containsNested(observed[key], value),
  );
}

function containsNested(observed, expected) {
  if (typeof expected === 'string' && typeof observed === 'string') return observed === expected;
  if (Array.isArray(expected) && Array.isArray(observed)) return containsValue(observed, expected);
  if (isPlainObject(expected) && isPlainObject(observed)) return containsValue(observed, expected);
  return deepEqual(observed, expected);
}

function deepEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((value, index) => deepEqual(value, right[index]));
  }
  if (!isPlainObject(left) || !isPlainObject(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] && deepEqual(left[key], right[key]));
}

function isZeroBudget(value) {
  if (value === 0) return true;
  return isPlainObject(value) && Object.values(value).every(isZeroBudget);
}

function isReference(value) {
  return isPlainObject(value) && Object.keys(value).length === 1 && typeof value.$ref === 'string';
}

function wrongType(path, observed, expectedKind) {
  return {
    code: 'WRONG_OBSERVED_TYPE',
    path,
    message: `expected observed ${expectedKind}, received ${kindOf(observed)}`,
    observedKind: kindOf(observed),
    expectedKind,
  };
}

function wrongExpectedType(path, expected, expectedKind) {
  return {
    code: 'WRONG_EXPECTED_TYPE',
    path,
    message: `expected operand ${expectedKind}, received ${kindOf(expected)}`,
    observedKind: null,
    expectedKind,
  };
}

function valueMismatch(path, observed, expected) {
  return {
    code: 'VALUE_MISMATCH',
    path,
    message: 'observed value does not satisfy the assertion',
    observedKind: kindOf(observed),
    expectedKind: kindOf(expected),
  };
}

function leakFailure(path, observed) {
  return {
    code: 'LEAK_NONZERO',
    path,
    message: 'resource leak budget is nonzero',
    observedKind: kindOf(observed),
    expectedKind: 'zero',
  };
}

function unresolvedFailure(path, code, message) {
  return {
    code,
    path,
    message,
    observedKind: null,
    expectedKind: null,
  };
}

function kindOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value === 'object' ? 'object' : typeof value;
}

function tokenLabel(token) {
  return token.type === 'index' ? String(token.index) : token.key;
}

function decodePointer(value) {
  assert(!/~(?:[^01]|$)/.test(value), `RFC6901 escape ${value}`);
  return value.replaceAll('~1', '/').replaceAll('~0', '~');
}

function escapePointer(value) {
  return String(value).replaceAll('~', '~0').replaceAll('/', '~1');
}

function cloneJson(value) {
  if (Array.isArray(value)) return value.map(cloneJson);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, cloneJson(nested)]));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function canonicalSha256(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

class ResolutionFailure extends Error {
  constructor(details) {
    super(details.message);
    this.name = 'ResolutionFailure';
    this.details = details;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(`Core v2 comparison invalid: ${message}`);
}
