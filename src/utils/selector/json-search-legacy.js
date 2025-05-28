import { JSONPath } from 'jsonpath-plus';

export function JSONSearch(opts, expr, obj, callback, otherTypeCallback) {
  if (!(this instanceof JSONSearch)) {
    return new JSONSearch(opts, expr, obj, callback, otherTypeCallback);
  }

  this.searchableKeys = Array.isArray(opts.searchableKeys) ? opts.searchableKeys : null;
  return JSONPath.call(this, opts, expr, obj, callback, otherTypeCallback);
}

JSONSearch.prototype = Object.create(JSONPath.prototype);
JSONSearch.prototype.constructor = JSONSearch;
JSONSearch.prototype._walk = function (val, f) {
  if (Array.isArray(val)) {
    const n = val.length;
    for (let i = 0; i < n; i++) {
      f(i);
    }
  } else if (val && typeof val === 'object') {
    if (this.searchableKeys) {
      this.searchableKeys.forEach((m) => {
        if (m in val && val[m].length > 0) {
          f(m);
        }
      });
    } else {
      Object.keys(val).forEach((m) => {
        f(m);
      });
    }
  }
};
