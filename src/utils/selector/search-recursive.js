import { evaluateFilter } from './filter-evaluator.js';
import { TOKEN_TYPES } from './token-constants.js';

/**
 * Recursively searches a JSON structure based on tokens.
 * @param {any} node - Current JSON node
 * @param {Object} ctx - Search context
 * @param {Array<Object>} ctx.tokens - Tokens to process
 * @param {string} ctx.path - Current JSONPath string
 * @param {string} ctx.ptr - Current JSON Pointer string
 * @param {Array<any>} ctx.results - Array to store results
 * @param {Object} ctx.opts - Search options
 * @param {string} ctx.opts.resultType - Result type ('value', 'path', 'pointer')
 * @param {Array<string>|null} ctx.opts.searchableKeys - Keys to search in objects
 * @param {Function|null} ctx.opts.callback - Callback for each result
 */
export const searchRecursive = (node, ctx) => {
  if (ctx.tokens.length === 0) {
    processResult(node, ctx);
    return;
  }

  const [token, ...next] = ctx.tokens;
  const nextCtx = { ...ctx, tokens: next };

  if (token.type === TOKEN_TYPES.ROOT || token.type === TOKEN_TYPES.IMPLICIT_ROOT) {
    searchRecursive(node, nextCtx);
    return;
  }

  if (token.type === TOKEN_TYPES.RECURSIVE_DESCENT) {
    // Apply next to current node, then all original tokens (from ctx.tokens for '..') to children
    searchRecursive(node, nextCtx);
    traverseChildren(node, ctx, ctx.tokens);
    return;
  }

  if (node === null || node === undefined) return;

  const handler = tokenHandlers[token.type];
  if (handler) handler(node, token, next, ctx);
};

// Processes a found result
const processResult = (node, ctx) => {
  const result = getResult(node, ctx);

  // Push to results if ctx.results is a valid array
  if (ctx?.results && Array.isArray(ctx.results)) {
    ctx.results.push(result);
  }

  // Safely check and invoke the callback
  if (typeof ctx?.opts?.callback === 'function') {
    ctx.opts.callback(result, node, ctx.path, ctx.ptr);
  }
};

// Determines result value based on opts.resultType
const getResult = (node, ctx) => {
  // Default to 'value' if ctx.opts.resultType is invalid
  if (typeof ctx?.opts?.resultType !== 'string') {
    return node; // Default to 'value'
  }
  switch (ctx.opts.resultType) {
    case 'path':
      return ctx.path;
    case 'pointer':
      return ctx.ptr;
    default: // 'value' or unspecified
      return node;
  }
};

// Traverses children, applying searchRecursive with `next`
const traverseChildren = (node, ctx, next) => {
  if (Array.isArray(node)) {
    node.forEach((item, i) => {
      searchRecursive(item, {
        ...ctx,
        path: `${ctx.path}[${i}]`,
        ptr: `${ctx.ptr}/${i}`,
        tokens: next,
      });
    });
  } else if (isObject(node)) {
    const keys = ctx.opts.searchableKeys || Object.keys(node);
    keys.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(node, key)) {
        searchRecursive(node[key], {
          ...ctx,
          path: `${ctx.path}.${key}`, // Use dot notation for object properties
          ptr: `${ctx.ptr}/${escapePtr(key)}`,
          tokens: next,
        });
      }
    });
  }
};

const tokenHandlers = {
  KEY: (node, token, next, ctx) => {
    if (isObject(node) && Object.prototype.hasOwnProperty.call(node, token.value)) {
      searchRecursive(node[token.value], {
        ...ctx,
        path: `${ctx.path}.${token.value}`,
        ptr: `${ctx.ptr}/${escapePtr(token.value)}`,
        tokens: next,
      });
    } else if (Array.isArray(node)) {
      node.forEach((item, i) => {
        if (isObject(item) && Object.prototype.hasOwnProperty.call(item, token.value)) {
          searchRecursive(item[token.value], {
            ...ctx,
            path: `${ctx.path}[${i}].${token.value}`,
            ptr: `${ctx.ptr}/${i}/${escapePtr(token.value)}`,
            tokens: next,
          });
        }
      });
    }
  },
  INDEX: (node, token, next, ctx) => {
    if (Array.isArray(node) && token.value < node.length && token.value >= 0) {
      searchRecursive(node[token.value], {
        ...ctx,
        path: `${ctx.path}[${token.value}]`,
        ptr: `${ctx.ptr}/${token.value}`,
        tokens: next,
      });
    }
  },
  WILDCARD: (node, _token, next, ctx) => {
    traverseChildren(node, ctx, next);
  },
  FILTER: (node, token, next, ctx) => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => {
        if (evaluateFilter(item, token.value)) {
          searchRecursive(item, {
            ...ctx,
            path: `${ctx.path}[${i}]`,
            ptr: `${ctx.ptr}/${i}`,
            tokens: next,
          });
        }
      });
    } else if (isObject(node)) {
      if (evaluateFilter(node, token.value)) {
        // Filter on object: path/ptr unchanged, use next
        searchRecursive(node, { ...ctx, tokens: next });
      }
    }
  },
};

// Checks if a value is a plain object
const isObject = (val) => val !== null && typeof val === 'object' && !Array.isArray(val);

// Escapes keys for JSON Pointer
const escapePtr = (token) => String(token).replace(/~/g, '~0').replace(/\//g, '~1');
