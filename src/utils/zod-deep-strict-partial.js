/*
   This file is based on code from https://gist.github.com/jaens/7e15ae1984bb338c86eb5e452dee3010
   Original code is licensed under Apache License 2.0
   Copyright 2024, Jaen - https://github.com/jaens

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.

   Modifications made by Conalog:
   - Converted TypeScript to JavaScript
*/

import { z } from 'zod';

const RESOLVING = Symbol('mapOnSchema/resolving');

/**
 * Recursively applies `fn` to every nested Zod schema, replacing each schema
 * with the value returned by `fn`. Traversal is bottom‑up, so `fn` is called
 * on children before parents.
 *
 * @param {import('zod').ZodType} schema
 * @param {(s: import('zod').ZodType) => import('zod').ZodType} fn
 * @returns {import('zod').ZodType}
 */
export function mapOnSchema(schema, fn) {
  const results = new Map();

  function mapElement(s) {
    const value = results.get(s);
    if (value === RESOLVING) {
      throw new Error('Recursive schema access detected');
    }
    if (value !== undefined) {
      return value;
    }

    results.set(s, RESOLVING);
    const result = fn(mapInner(s));
    results.set(s, result);
    return result;
  }

  function mapInner(s) {
    const def = s._zod.def;

    if (s instanceof z.ZodObject) {
      /** @type {Record<string, import('zod').ZodType>} */
      const newShape = {};
      for (const [key, value] of Object.entries(s.shape)) {
        newShape[key] = mapElement(value);
      }
      return s.clone({ ...def, shape: newShape });
    }

    if (s instanceof z.ZodArray) {
      return s.clone({ ...def, element: mapElement(def.element) });
    }
    if (s instanceof z.ZodMap) {
      return s.clone({
        ...def,
        keyType: mapElement(def.keyType),
        valueType: mapElement(def.valueType),
      });
    }
    if (s instanceof z.ZodSet) {
      return s.clone({ ...def, valueType: mapElement(def.valueType) });
    }
    if (
      s instanceof z.ZodOptional ||
      s instanceof z.ZodNullable ||
      s instanceof z.ZodDefault ||
      s instanceof z.ZodPrefault ||
      s instanceof z.ZodReadonly ||
      s instanceof z.ZodCatch ||
      s instanceof z.ZodPromise
    ) {
      return s.clone({ ...def, innerType: mapElement(def.innerType) });
    }
    if (s instanceof z.ZodLazy) {
      return s.clone({
        ...def,
        // NB: This leaks `fn` into the schema, but it is necessary for recursion support.
        getter: () => mapElement(def.getter()),
      });
    }
    if (s instanceof z.ZodPipe) {
      return s.clone({
        ...def,
        in: mapElement(def.in),
        out: mapElement(def.out),
      });
    }
    if (s instanceof z.ZodTuple) {
      return s.clone({
        ...def,
        items: def.items.map(mapElement),
        rest: def.rest && mapElement(def.rest),
      });
    }
    // Optional discriminators cannot be indexed by ZodDiscriminatedUnion.
    // A partial update may omit `type`, so degrade it to a regular union just
    // like Zod's proposed deepPartial implementation does.
    if (s instanceof z.ZodDiscriminatedUnion) {
      return z.union(def.options.map(mapElement));
    }
    if (s instanceof z.ZodUnion) {
      return s.clone({ ...def, options: def.options.map(mapElement) });
    }
    if (s instanceof z.ZodIntersection) {
      return s.clone({
        ...def,
        left: mapElement(def.left),
        right: mapElement(def.right),
      });
    }
    if (s instanceof z.ZodRecord) {
      return s.clone({
        ...def,
        keyType: mapElement(def.keyType),
        valueType: mapElement(def.valueType),
      });
    }

    // Primitive / already‑handled types pass through untouched.
    return s;
  }

  return mapElement(schema);
}

const partialSchemaCache = new WeakMap();

const unwrapPatchPropertyDefaults = (schema) => {
  let inner = schema;
  while (inner instanceof z.ZodDefault || inner instanceof z.ZodPrefault) {
    inner = inner._zod.def.innerType;
  }
  return inner;
};

const makeObjectPartial = (schema) => {
  const shape = {};
  for (const [key, value] of Object.entries(schema.shape)) {
    const inner = unwrapPatchPropertyDefaults(value);
    shape[key] = inner instanceof z.ZodOptional ? inner : inner.optional();
  }
  return schema.clone({ ...schema._zod.def, shape });
};

/**
 * Deeply converts every object property in a Zod schema to optional.
 * @template {import('zod').ZodType} T
 * @param {T} schema
 * @returns {T}
 */
export function deepPartial(schema) {
  if (partialSchemaCache.has(schema)) {
    return partialSchemaCache.get(schema);
  }

  /* @ts-expect-error -- runtime cast only for developer hint */
  const partialSchema = mapOnSchema(schema, (s) =>
    s instanceof z.ZodObject ? makeObjectPartial(s) : s,
  );
  partialSchemaCache.set(schema, partialSchema);
  return partialSchema;
}
