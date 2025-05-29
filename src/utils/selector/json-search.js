/**
 * Browser-compatible JSON search utility similar to JSONPath.
 *
 * @param {Object} opts - The search options
 * @param {any} opts.json - The JSON data to search
 * @param {string} opts.path - The JSONPath expression
 * @param {('value'|'path'|'pointer')} [opts.resultType='value'] - Type of results to return
 * @param {string[]|null} [opts.searchableKeys=null] - Keys to limit search scope
 * @param {boolean} [opts.flatten=true] - Whether to flatten array results
 * @returns {any[]} Array of search results
 */
import { searchRecursive } from './search-recursive.js';
import { tokenizePath } from './tokenizer.js';

// Constants for better maintainability
const DEFAULT_RESULT_TYPE = 'value';

export function JSONSearch(opts) {
  const options = validateOpts(opts);
  const { json, path } = options;
  const tokens = tokenizePath(path);
  const results = [];

  searchRecursive(json, {
    tokens,
    path: tokens.length > 0 && tokens[0].type === 'ROOT' ? '$' : '',
    ptr: '',
    results,
    opts: options,
  });

  // Keep the original simple deduplication logic to maintain test compatibility
  return Array.from(new Set(results));
}

/**
 * Validates and normalizes the options object for JSONSearch
 * @param {Object} opts - The options object to validate
 * @returns {Object} The normalized options object
 * @throws {Error} When validation fails
 */
function validateOpts(opts) {
  if (typeof opts !== 'object' || opts === null) {
    throw new Error('Invalid arguments for JSONSearch. Expected an options object as the first argument.');
  }

  // Create a shallow copy to avoid mutating the original
  const options = { ...opts };

  // Set default values
  if (options.resultType === undefined) options.resultType = DEFAULT_RESULT_TYPE;
  if (options.searchableKeys === undefined) options.searchableKeys = null;

  // Validate required properties
  if (!('json' in options) || options.json === undefined)
    throw new Error("The 'json' property in options is missing or undefined.");
  if (options.json === null) throw new Error("The 'json' property in options cannot be null.");

  if (!('path' in options) || typeof options.path !== 'string')
    throw new Error("The 'path' property in options must be a string and present.");

  // Validate resultType
  const validResultTypes = ['value', 'path', 'pointer'];
  if (!validResultTypes.includes(options.resultType))
    throw new Error(`Invalid resultType '${options.resultType}'. Must be one of: ${validResultTypes.join(', ')}`);

  // Validate searchableKeys
  if (options.searchableKeys !== null && !Array.isArray(options.searchableKeys))
    throw new Error("The 'searchableKeys' property must be an array or null.");

  return options;
}
