/**
 * Evaluates a simple filter expression against an item
 * Supported format: @.key op value (e.g., @.price < 10, @.name == "Book")
 * @param {any} item - Item to evaluate
 * @param {string} expr - Filter expression string
 * @returns {boolean} True if item matches filter, false otherwise
 */
export function evaluateFilter(item, expr) {
  if (!item || typeof expr !== 'string') return false;

  const match = expr.match(/^@\.([\w$-]+)\s*([=!<>]=?)\s*(.+)$/);
  if (!match) return false;

  const [, key, operator, rawValue] = match;
  let expected = rawValue.trim();
  const actual = item[key];

  // Parse expected value
  expected = parseValue(expected);

  return compareValues(actual, operator, expected);
}

/**
 * Parses a string value to appropriate type
 * @param {string} str - String representation of value
 * @returns {any} Parsed value
 */
function parseValue(str) {
  // String literals (quoted)
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    return str.slice(1, -1);
  }

  // Numbers
  if (!Number.isNaN(Number.parseFloat(str)) && Number.isFinite(Number(str))) {
    return Number.parseFloat(str);
  }

  // Booleans
  if (str === 'true') return true;
  if (str === 'false') return false;

  // Default to string
  return str;
}

/**
 * Compares two values using the given operator
 * @param {any} actual - Actual value from object
 * @param {string} operator - Comparison operator
 * @param {any} expected - Expected value
 * @returns {boolean} Comparison result
 */
function compareValues(actual, operator, expected) {
  switch (operator) {
    case '==':
    case '===':
      return actual === expected;
    case '!=':
    case '!==':
      return actual !== expected;
    case '>':
      return actual > expected;
    case '<':
      return actual < expected;
    case '>=':
      return actual >= expected;
    case '<=':
      return actual <= expected;
    default:
      return false;
  }
}
