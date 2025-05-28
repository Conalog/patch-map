/**
 * Browser-compatible JSON search utility similar to JSONPath,
 */
import { searchRecursive } from './search-recursive.js';
import { tokenizePath } from './tokenizer.js';

export function JSONSearch(opts) {
  const options = normalizeAndValidateOptions(opts);
  const { json, path } = options;
  const tokens = tokenizePath(path);
  const results = [];

  searchRecursive(json, {
    tokens: tokens,
    path: tokens.length > 0 && tokens[0].type === 'ROOT' ? '$' : '',
    ptr: '',
    results,
    opts: options,
  });

  return Array.from(new Set(results));
}

function normalizeAndValidateOptions(opts) {
  if (typeof opts !== 'object' || opts === null)
    throw new Error('Invalid arguments for JSONSearch. Expected an options object as the first argument.');

  const options = { ...opts };

  if (options.resultType === undefined) options.resultType = 'value';
  if (options.searchableKeys === undefined) options.searchableKeys = null;

  if (!('json' in options) || options.json === undefined)
    throw new Error("The 'json' property in options is missing or undefined.");
  if (options.json === null) throw new Error("The 'json' property in options cannot be null.");

  if (!('path' in options) || typeof options.path !== 'string')
    throw new Error("The 'path' property in options must be a string and present.");

  return options;
}
