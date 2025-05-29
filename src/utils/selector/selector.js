import { JSONSearch } from './json-search';

/**
 * Simplified wrapper for JSONSearch with sensible defaults
 * @param {any} json - The JSON data to search
 * @param {string} path - The JSONPath expression
 * @param {Object} [options={}] - Additional search options
 * @returns {any[]} Array of search results
 */
export const selector = (json, path, options = {}) => {
  return JSONSearch({
    searchableKeys: ['children'],
    flatten: true,
    ...options,
    path: path ?? '',
    json: json ?? {},
  });
};
