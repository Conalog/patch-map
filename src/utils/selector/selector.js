import { JSONSearch } from './json-search';

export const selector = (json, path) => {
  return JSONSearch({
    path: path ?? '',
    json: json ?? {},
    searchableKeys: ['children'],
    flatten: true,
  });
};
