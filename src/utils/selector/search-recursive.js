import { evaluateFilter } from './filter-evaluator.js';
import { TOKEN_TYPES } from './token-constants.js';

/**
 * Recursively searches a JSON structure based on tokens.
 * @param {any} node - Current JSON node.
 * @param {Object} ctx - Search context.
 * @param {Array<Object>} ctx.tokens - Tokens to process.
 * @param {string} ctx.path - Current JSONPath string.
 * @param {string} ctx.ptr - Current JSON Pointer string.
 * @param {Array<any>} ctx.results - Array to store results.
 * @param {Object} ctx.opts - Search options.
 * @param {string} ctx.opts.resultType - Result type ('value', 'path', 'pointer').
 * @param {Array<string>|null} ctx.opts.searchableKeys - Keys to search in objects.
 * @param {Function|null} ctx.opts.callback - Callback for each result.
 */
export const searchRecursive = (node, ctx) => {
  if (ctx.tokens.length === 0) {
    processFoundResult(node, ctx);
    return;
  }

  const [token, ...nextTokens] = ctx.tokens;
  const nextCtx = { ...ctx, tokens: nextTokens };

  if (token.type === TOKEN_TYPES.ROOT || token.type === TOKEN_TYPES.IMPLICIT_ROOT) {
    searchRecursive(node, nextCtx);
    return;
  }

  if (token.type === TOKEN_TYPES.RECURSIVE_DESCENT) {
    // Apply nextTokens to current node, then all original tokens (from ctx.tokens for '..') to children.
    searchRecursive(node, nextCtx);
    traverseChildren(node, ctx, ctx.tokens);
    return;
  }

  if (node === null || node === undefined) return; // Stop if node is null or undefined

  const handler = tokenHandlers[token.type];
  if (handler) handler(node, token, nextTokens, ctx);
  // If no handler is found, token is effectively skipped.
};

// Processes a found result.
const processFoundResult = (node, ctx) => {
  const result = getResultByOpt(node, ctx);

  // Push to results if ctx.results is a valid array.
  if (ctx?.results && Array.isArray(ctx.results)) {
    ctx.results.push(result);
  }

  // Safely check and invoke the callback.
  if (typeof ctx?.opts?.callback === 'function') {
    ctx.opts.callback(result, node, ctx.path, ctx.ptr);
  }
};

// Determines result value based on opts.resultType.
const getResultByOpt = (node, ctx) => {
  // Default to 'value' if ctx.opts.resultType is invalid.
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

// Traverses children, applying searchRecursive with `tokensForNextCall`.
const traverseChildren = (node, currentCtx, tokensForNextCall) => {
  if (Array.isArray(node)) {
    node.forEach((item, i) => {
      searchRecursive(item, {
        ...currentCtx,
        path: `${currentCtx.path}[${i}]`,
        ptr: `${currentCtx.ptr}/${i}`,
        tokens: tokensForNextCall,
      });
    });
  } else if (isObject(node)) {
    const keys = currentCtx.opts.searchableKeys || Object.keys(node);
    keys.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(node, key)) {
        searchRecursive(node[key], {
          ...currentCtx,
          path: `${currentCtx.path}.${key}`, // Use dot notation for object properties.
          ptr: `${currentCtx.ptr}/${escapePtrToken(key)}`,
          tokens: tokensForNextCall,
        });
      }
    });
  }
};

const tokenHandlers = {
  KEY: (node, token, nextTokens, ctx) => {
    if (isObject(node) && Object.prototype.hasOwnProperty.call(node, token.value)) {
      searchRecursive(node[token.value], {
        ...ctx,
        path: `${ctx.path}.${token.value}`,
        ptr: `${ctx.ptr}/${escapePtrToken(token.value)}`,
        tokens: nextTokens,
      });
    } else if (Array.isArray(node)) {
      node.forEach((item, i) => {
        if (isObject(item) && Object.prototype.hasOwnProperty.call(item, token.value)) {
          searchRecursive(item[token.value], {
            ...ctx,
            path: `${ctx.path}[${i}].${token.value}`,
            ptr: `${ctx.ptr}/${i}/${escapePtrToken(token.value)}`,
            tokens: nextTokens,
          });
        }
      });
    }
  },
  INDEX: (node, token, nextTokens, ctx) => {
    if (Array.isArray(node) && token.value < node.length && token.value >= 0) {
      searchRecursive(node[token.value], {
        ...ctx,
        path: `${ctx.path}[${token.value}]`,
        ptr: `${ctx.ptr}/${token.value}`,
        tokens: nextTokens,
      });
    }
  },
  WILDCARD: (node, _token, nextTokens, ctx) => {
    traverseChildren(node, ctx, nextTokens);
  },
  FILTER: (node, token, nextTokens, ctx) => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => {
        if (evaluateFilter(item, token.value)) {
          searchRecursive(item, {
            ...ctx,
            path: `${ctx.path}[${i}]`,
            ptr: `${ctx.ptr}/${i}`,
            tokens: nextTokens,
          });
        }
      });
    } else if (isObject(node)) {
      if (evaluateFilter(node, token.value)) {
        // Filter on object: path/ptr unchanged, use nextTokens.
        searchRecursive(node, { ...ctx, tokens: nextTokens });
      }
    }
  },
};

// Checks if a value is a plain object.
const isObject = (val) => val !== null && typeof val === 'object' && !Array.isArray(val);

// Escapes keys for JSON Pointer.
const escapePtrToken = (token) => String(token).replace(/~/g, '~0').replace(/\//g, '~1');
