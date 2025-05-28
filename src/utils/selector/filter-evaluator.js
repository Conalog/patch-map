/**
 * 항목에 대해 간단한 필터 표현식을 평가합니다.
 * 지원 형식: @.key op value (예: @.price < 10, @.name == "Book")
 * @param {any} item - 평가할 항목입니다.
 * @param {string} filterExpr - 필터 표현식 문자열입니다.
 * @returns {boolean} - 항목이 필터와 일치하면 true, 그렇지 않으면 false입니다.
 */
export function evaluateFilter(item, filterExpr) {
  if (!item || typeof filterExpr !== 'string') return false;

  const match = filterExpr.match(/^@\.([\w$-]+)\s*([=!<>]=?)\s*(.+)$/);
  if (!match) return false;

  const [, key, operator, rawValueStr] = match;
  let expected = rawValueStr.trim();
  const actual = item[key];

  if ((expected.startsWith('"') && expected.endsWith('"')) || (expected.startsWith("'") && expected.endsWith("'"))) {
    expected = expected.slice(1, -1);
  } else if (!Number.isNaN(Number.parseFloat(expected)) && Number.isFinite(Number(expected))) {
    expected = Number.parseFloat(expected);
  } else if (expected === 'true') {
    expected = true;
  } else if (expected === 'false') {
    expected = false;
  }

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
