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
  const len = pathStr.length;

  if (pathStr[idx] === '$') {
    tokens.push({ type: TOKEN_TYPES.ROOT });
    idx++;
  } else {
    // If path doesn't start with '$', treat as implicit root
    tokens.push({ type: TOKEN_TYPES.IMPLICIT_ROOT });
  }

  while (idx < len) {
    const char = pathStr[idx];

    if (char === '.' && pathStr[idx + 1] === '.') {
      tokens.push({ type: TOKEN_TYPES.RECURSIVE_DESCENT });
      idx += 2;
    } else if (char === '.') {
      idx++; // Skip dots and move to next character
    } else if (char === '[') {
      // parseBracketExpr starts from the character after '[' and returns the index of the character after ']'
      const bracket = parseBracketExpr(pathStr, idx + 1, len);
      if (bracket.token) tokens.push(bracket.token);
      idx = bracket.newIndex;
    } else {
      const prop = parseProperty(pathStr, idx, len);
      if (prop.token) tokens.push(prop.token);
      idx = prop.newIndex;
    }
  }
  return tokens;
}

/**
 * Parse bracket contents
 * @param {string} pathStr - Full JSONPath string
 * @param {number} startIndex - Index of character after '['
 * @param {number} len - Length of the full string
 * @returns {{token: Object|null, newIndex: number}} Parsed token and next parsing start index
 * @example
 * parseBracketExpr("['key']", 1, 7) // Target: 'key']
 * parseBracketExpr("[*]", 1, 3)     // Target: *]
 * parseBracketExpr("[?(expr)]", 1, 9) // Target: ?(expr)]
 * parseBracketExpr("[0]", 1, 3)      // Target: 0]
 */
function parseBracketExpr(pathStr, startIndex, len) {
  let idx = startIndex;
  let token = null;

  if (idx >= len) {
    // Bracket opened but no content (e.g., "path[")
    return { token: null, newIndex: idx };
  }

  const char = pathStr[idx];

  if (char === '*') {
    token = { type: TOKEN_TYPES.WILDCARD };
    idx++;
  } else if (char === '?') {
    // parseFilter starts from the character after '?'
    const filter = parseFilter(pathStr, idx + 1, len);
    token = { type: TOKEN_TYPES.FILTER, value: filter.value };
    idx = filter.newIndex; // newIndex points to after the end of the filter expression
  } else {
    // parseSubscript starts from current character (key, index, or quote)
    const subscript = parseSubscript(pathStr, idx, len);
    token = subscript.token;
    idx = subscript.newIndex; // newIndex is the position after key/index parsing
  }

  // Consume closing bracket ']'
  if (idx < len && pathStr[idx] === ']') {
    idx++;
  }
  // If no closing bracket, it may be an error situation, but here we proceed with parsing as much as possible
  return { token, newIndex: idx };
}

/**
 * Parse filter expression
 * @param {string} pathStr - Full JSONPath string
 * @param {number} startIndex - Index of character after '?'
 * @param {number} len - Length of the full string
 * @returns {{value: string, newIndex: number}} Filter expression content and next parsing start index
 * @example
 * parseFilter("?( @.price < 10 )]", 1, 17) // Target: ( @.price < 10 )]
 * parseFilter("?(@.isbn)]", 1, 10)        // Target: (@.isbn)]
 */
function parseFilter(pathStr, startIndex, len) {
  let idx = startIndex;
  let filterExpr = '';

  // Handle case where '(' is consumed first in '?(expr)'
  let startIdx = idx;
  if (pathStr[idx] === '(') {
    startIdx = idx + 1; // Actual expression content starts after '('
    idx++; // Consume '('
  }

  let parenDepth = 1; // Start with virtual parenthesis wrapping the filter expression or consumed '('
  let scanIdx = startIdx;

  while (scanIdx < len) {
    const char = pathStr[scanIdx];
    if (char === '(') {
      parenDepth++;
    } else if (char === ')') {
      parenDepth--;
    }

    // First break condition: found matching parentheses and next is ']' or current is ')'
    if (parenDepth === 0 && (pathStr[scanIdx + 1] === ']' || char === ')')) {
      filterExpr = pathStr.substring(startIdx, char === ')' ? scanIdx : scanIdx + 1);
      idx = scanIdx + 1; // Move to after the end of expression
      break;
    }

    // Second break condition: expression without parentheses ends with ']'
    if (char === ']' && parenDepth === 1 && (scanIdx === startIdx || pathStr[scanIdx - 1] !== ')')) {
      filterExpr = pathStr.substring(startIdx, scanIdx); // Up to before ']'
      idx = scanIdx; // currentIndex points to ']' (handled in parseBracketExpr)
      break;
    }
    scanIdx++;
  }

  // If loop ended without break (reached len)
  if (scanIdx === len && !filterExpr) {
    filterExpr = pathStr.substring(startIdx, scanIdx);
    idx = scanIdx;
  }

  // Maintain original logic for `if (filterExpr.endsWith(')'))`
  if (filterExpr.endsWith(')')) {
    filterExpr = filterExpr.slice(0, -1);
  }

  return { value: filterExpr.trim(), newIndex: idx };
}

/**
 * Parse index or key
 * @param {string} pathStr - Full JSONPath string
 * @param {number} startIndex - Start index of actual content inside brackets
 * @param {number} len - Length of the full string
 * @returns {{token: Object, newIndex: number}} Parsed token and next parsing start index
 * @example
 * parseSubscript("'name']", 0, 7)  // Target: 'name']
 * parseSubscript("2]", 0, 2)       // Target: 2]
 * parseSubscript("\"complex key\"]", 0, 14) // Target: "complex key"]
 */
function parseSubscript(pathStr, startIndex, len) {
  let idx = startIndex;
  let value = '';
  const quoteChar = pathStr[idx] === "'" || pathStr[idx] === '"' ? pathStr[idx++] : null;

  while (idx < len && pathStr[idx] !== ']') {
    if (quoteChar && pathStr[idx] === quoteChar) break; // If wrapped in quotes, end when meeting closing quote
    value += pathStr[idx++];
  }

  if (quoteChar && pathStr[idx] === quoteChar) {
    idx++; // Consume closing quote
  }

  let token;
  if (/^\d+$/.test(value) && !quoteChar) {
    token = { type: TOKEN_TYPES.INDEX, value: Number.parseInt(value, 10) };
  } else {
    token = { type: TOKEN_TYPES.KEY, value: value };
  }
  // newIndex is just before meeting ']' or after closing quote. parseBracketExpr handles ']'
  return { token, newIndex: idx };
}

/**
 * Parse property key
 * @param {string} pathStr - Full JSONPath string
 * @param {number} startIndex - Start index of general key
 * @param {number} len - Length of the full string
 * @returns {{token: Object|null, newIndex: number}} Parsed token and next parsing start index
 * @example
 * parseProperty("key.next", 0, 8)  // Target: key
 * parseProperty("key[0]", 0, 6)    // Target: key
 */
function parseProperty(pathStr, startIndex, len) {
  let idx = startIndex;
  let name = '';
  while (idx < len && pathStr[idx] !== '.' && pathStr[idx] !== '[') {
    name += pathStr[idx++];
  }
  const token = name ? { type: TOKEN_TYPES.KEY, value: name } : null;
  return { token, newIndex: idx };
}
