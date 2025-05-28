/**
 * Parses a JSONPath string into a sequence of tokens.
 * @param {string} pathStr - The JSONPath string.
 * @returns {Array<Object>} - An array of token objects.
 */

import { TOKEN_TYPES } from './token-constants.js';

export function tokenizePath(pathStr) {
  if (!pathStr || typeof pathStr !== 'string') return [];

  const tokens = [];
  let idx = 0;
  const pathLength = pathStr.length;

  if (pathStr[idx] === '$') {
    tokens.push({ type: TOKEN_TYPES.ROOT });
    idx++;
  } else {
    // 경로가 '$'로 시작하지 않으면 암시적 루트로 간주
    tokens.push({ type: TOKEN_TYPES.IMPLICIT_ROOT });
  }

  while (idx < pathLength) {
    const char = pathStr[idx];

    if (char === '.' && pathStr[idx + 1] === '.') {
      tokens.push({ type: TOKEN_TYPES.RECURSIVE_DESCENT });
      idx += 2;
    } else if (char === '.') {
      idx++; // 점은 무시하고 다음 문자로 이동
    } else if (char === '[') {
      // parseBracketExpr은 '[' 다음 문자부터 시작하여 ']' 다음 문자의 인덱스를 반환.
      const bracket = parseBracketExpr(pathStr, idx + 1, pathLength);
      if (bracket.token) tokens.push(bracket.token);
      idx = bracket.newIndex;
    } else {
      const prop = parseProperty(pathStr, idx, pathLength);
      if (prop.token) tokens.push(prop.token);
      idx = prop.newIndex;
    }
  }
  return tokens;
}

/**
 * 대괄호 '['와 ']' 내부의 내용을 파싱합니다.
 * @param {string} pathStr - 전체 JSONPath 문자열.
 * @param {number} startIndex - '[' 다음 문자의 인덱스.
 * @param {number} pathLength - 전체 문자열의 길이.
 * @returns {{token: Object|null, newIndex: number}} 파싱된 토큰과 다음 파싱 시작 인덱스.
 * @example
 * parseBracketExpr("['key']", 1, 7) // 처리 대상: 'key']
 * parseBracketExpr("[*]", 1, 3)     // 처리 대상: *]
 * parseBracketExpr("[?(expr)]", 1, 9) // 처리 대상: ?(expr)]
 * parseBracketExpr("[0]", 1, 3)      // 처리 대상: 0]
 */
function parseBracketExpr(pathStr, startIndex, pathLength) {
  let idx = startIndex;
  let token = null;

  if (idx >= pathLength) {
    // 대괄호가 열렸지만 내용이 없는 경우 (예: "path[")
    return { token: null, newIndex: idx };
  }

  const char = pathStr[idx];

  if (char === '*') {
    token = { type: TOKEN_TYPES.WILDCARD };
    idx++;
  } else if (char === '?') {
    // parseFilter는 '?' 다음 문자부터 시작.
    const filter = parseFilter(pathStr, idx + 1, pathLength);
    token = { type: TOKEN_TYPES.FILTER, value: filter.value };
    idx = filter.newIndex; // newIndex는 필터 표현식의 끝 다음을 가리킴.
  } else {
    // parseSubscript는 현재 문자부터 시작 (키, 인덱스 또는 따옴표로 시작).
    const subscript = parseSubscript(pathStr, idx, pathLength);
    token = subscript.token;
    idx = subscript.newIndex; // newIndex는 키/인덱스 파싱 후의 위치.
  }

  // 닫는 대괄호 ']' 소비
  if (idx < pathLength && pathStr[idx] === ']') {
    idx++;
  }
  // 닫는 대괄호가 없는 경우, 오류 상황일 수 있지만, 여기서는 파싱을 최대한 진행.
  return { token, newIndex: idx };
}

/**
 * 필터 표현식 (예: ?(expression))을 파싱합니다.
 * @param {string} pathStr - 전체 JSONPath 문자열.
 * @param {number} startIndex - '?' 다음 문자의 인덱스.
 * @param {number} pathLength - 전체 문자열의 길이.
 * @returns {{value: string, newIndex: number}} 필터 표현식 내용과 다음 파싱 시작 인덱스.
 * @example
 * parseFilter("?( @.price < 10 )]", 1, 17) // 처리 대상: ( @.price < 10 )]
 * parseFilter("?(@.isbn)]", 1, 10)        // 처리 대상: (@.isbn)]
 */
function parseFilter(pathStr, startIndex, pathLength) {
  let idx = startIndex;
  let filterExpr = '';

  // '?(expr)'에서 '('를 먼저 소비하는 경우를 처리
  let exprStartIdx = idx;
  if (pathStr[idx] === '(') {
    exprStartIdx = idx + 1; // 실제 표현식 내용은 '(' 다음부터
    idx++; // '(' 소비
  }

  let parenDepth = 1; // '('를 소비했거나, 필터 표현식 자체를 감싸는 가상 괄호로 시작
  let scanIdx = exprStartIdx;

  while (scanIdx < pathLength) {
    const char = pathStr[scanIdx];
    if (char === '(') {
      parenDepth++;
    } else if (char === ')') {
      parenDepth--;
    }

    // 원본 코드의 첫 번째 break 조건: 짝 맞는 괄호 찾고, 그 다음이 ']' 이거나, 현재가 ')'
    if (parenDepth === 0 && (pathStr[scanIdx + 1] === ']' || char === ')')) {
      filterExpr = pathStr.substring(exprStartIdx, char === ')' ? scanIdx : scanIdx + 1);
      idx = scanIdx + 1; // 표현식의 끝 다음으로 이동
      break;
    }

    // 원본 코드의 두 번째 break 조건: 괄호 없는 표현식이 ']'로 끝남
    if (char === ']' && parenDepth === 1 && (scanIdx === exprStartIdx || pathStr[scanIdx - 1] !== ')')) {
      filterExpr = pathStr.substring(exprStartIdx, scanIdx); // ']' 앞까지
      idx = scanIdx; // currentIndex는 ']'를 가리킴 (parseBracketExpr에서 처리)
      break;
    }
    scanIdx++;
  }

  // 루프가 break 없이 끝난 경우 (pathLength 도달)
  if (scanIdx === pathLength && !filterExpr) {
    filterExpr = pathStr.substring(exprStartIdx, scanIdx);
    idx = scanIdx;
  }

  // 원본 코드의 `if (filterExpr.endsWith(')'))` 로직 유지
  if (filterExpr.endsWith(')')) {
    filterExpr = filterExpr.slice(0, -1);
  }

  return { value: filterExpr.trim(), newIndex: idx };
}

/**
 * 대괄호 내부의 인덱스 또는 키(subscript)를 파싱합니다.
 * @param {string} pathStr - 전체 JSONPath 문자열.
 * @param {number} startIndex - 대괄호 안의 실제 내용 시작 인덱스.
 * @param {number} pathLength - 전체 문자열의 길이.
 * @returns {{token: Object, newIndex: number}} 파싱된 토큰과 다음 파싱 시작 인덱스.
 * @example
 * parseSubscript("'name']", 0, 7)  // 처리 대상: 'name']
 * parseSubscript("2]", 0, 2)       // 처리 대상: 2]
 * parseSubscript("\"complex key\"]", 0, 14) // 처리 대상: "complex key"]
 */
function parseSubscript(pathStr, startIndex, pathLength) {
  let idx = startIndex;
  let subscriptValue = '';
  const quoteChar = pathStr[idx] === "'" || pathStr[idx] === '"' ? pathStr[idx++] : null;

  while (idx < pathLength && pathStr[idx] !== ']') {
    if (quoteChar && pathStr[idx] === quoteChar) break; // 따옴표로 감싸인 경우, 닫는 따옴표 만나면 종료
    subscriptValue += pathStr[idx++];
  }

  if (quoteChar && pathStr[idx] === quoteChar) {
    idx++; // 닫는 따옴표 소비
  }

  let token;
  if (/^\d+$/.test(subscriptValue) && !quoteChar) {
    token = { type: TOKEN_TYPES.INDEX, value: Number.parseInt(subscriptValue, 10) };
  } else {
    token = { type: TOKEN_TYPES.KEY, value: subscriptValue };
  }
  // newIndex는 ']'를 만나기 직전이거나, 닫는 따옴표 다음. parseBracketExpr에서 ']'를 처리.
  return { token, newIndex: idx };
}

/**
 * 일반적인 속성 키 (점 또는 대괄호로 구분되지 않는)를 파싱합니다.
 * @param {string} pathStr - 전체 JSONPath 문자열.
 * @param {number} startIndex - 일반 키의 시작 인덱스.
 * @param {number} pathLength - 전체 문자열의 길이.
 * @returns {{token: Object|null, newIndex: number}} 파싱된 토큰과 다음 파싱 시작 인덱스.
 * @example
 * parseProperty("key.next", 0, 8)  // 처리 대상: key
 * parseProperty("key[0]", 0, 6)    // 처리 대상: key
 */
function parseProperty(pathStr, startIndex, pathLength) {
  let idx = startIndex;
  let propName = '';
  while (idx < pathLength && pathStr[idx] !== '.' && pathStr[idx] !== '[') {
    propName += pathStr[idx++];
  }
  const token = propName ? { type: TOKEN_TYPES.KEY, value: propName } : null;
  return { token, newIndex: idx };
}
