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
 * @param {import('zod').ZodTypeAny} schema
 * @param {(s: import('zod').ZodTypeAny) => import('zod').ZodTypeAny} fn
 * @returns {import('zod').ZodTypeAny}
 */
export function mapOnSchema(schema, fn) {
  // Cache results to handle recursive schemas safely.
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
    const result = mapOnSchema(s, fn);
    results.set(s, result);
    return result;
  }

  function mapInner() {
    if (schema instanceof z.ZodObject) {
      /** @type {Record<string, import('zod').ZodTypeAny>} */
      const newShape = {};
      for (const [key, value] of Object.entries(schema.shape)) {
        newShape[key] = mapElement(value);
      }
      return new z.ZodObject({
        ...schema._def,
        shape: () => newShape,
      });
    }

    if (schema instanceof z.ZodArray) {
      return new z.ZodArray({
        ...schema._def,
        type: mapElement(schema._def.type),
      });
    }
    if (schema instanceof z.ZodMap) {
      return new z.ZodMap({
        ...schema._def,
        keyType: mapElement(schema._def.keyType),
        valueType: mapElement(schema._def.valueType),
      });
    }
    if (schema instanceof z.ZodSet) {
      return new z.ZodSet({
        ...schema._def,
        valueType: mapElement(schema._def.valueType),
      });
    }
    if (schema instanceof z.ZodOptional) {
      return new z.ZodOptional({
        ...schema._def,
        innerType: mapElement(schema._def.innerType),
      });
    }
    if (schema instanceof z.ZodNullable) {
      return new z.ZodNullable({
        ...schema._def,
        innerType: mapElement(schema._def.innerType),
      });
    }
    if (schema instanceof z.ZodDefault) {
      return new z.ZodDefault({
        ...schema._def,
        innerType: mapElement(schema._def.innerType),
      });
    }
    if (schema instanceof z.ZodReadonly) {
      return new z.ZodReadonly({
        ...schema._def,
        innerType: mapElement(schema._def.innerType),
      });
    }
    if (schema instanceof z.ZodLazy) {
      return new z.ZodLazy({
        ...schema._def,
        // NB: This leaks `fn` into the schema, but it is necessary for recursion support.
        getter: () => mapElement(schema._def.getter()),
      });
    }
    if (schema instanceof z.ZodBranded) {
      return new z.ZodBranded({
        ...schema._def,
        type: mapElement(schema._def.type),
      });
    }
    if (schema instanceof z.ZodEffects) {
      return new z.ZodEffects({
        ...schema._def,
        schema: mapElement(schema._def.schema),
      });
    }
    if (schema instanceof z.ZodFunction) {
      return new z.ZodFunction({
        ...schema._def,
        args: schema._def.args.map(mapElement),
        returns: mapElement(schema._def.returns),
      });
    }
    if (schema instanceof z.ZodPromise) {
      return new z.ZodPromise({
        ...schema._def,
        type: mapElement(schema._def.type),
      });
    }
    if (schema instanceof z.ZodCatch) {
      return new z.ZodCatch({
        ...schema._def,
        innerType: mapElement(schema._def.innerType),
      });
    }
    if (schema instanceof z.ZodTuple) {
      return new z.ZodTuple({
        ...schema._def,
        items: schema._def.items.map(mapElement),
        rest: schema._def.rest && mapElement(schema._def.rest),
      });
    }
    if (schema instanceof z.ZodDiscriminatedUnion) {
      const optionsMap = new Map(
        Array.from(schema.optionsMap.entries()).map(([k, v]) => [
          k,
          mapElement(v),
        ]),
      );
      return new z.ZodDiscriminatedUnion({
        ...schema._def,
        options: Array.from(optionsMap.values()),
        optionsMap,
      });
    }
    if (schema instanceof z.ZodUnion) {
      return new z.ZodUnion({
        ...schema._def,
        options: schema._def.options.map(mapElement),
      });
    }
    if (schema instanceof z.ZodIntersection) {
      return new z.ZodIntersection({
        ...schema._def,
        left: mapElement(schema._def.left),
        right: mapElement(schema._def.right),
      });
    }
    if (schema instanceof z.ZodRecord) {
      return new z.ZodRecord({
        ...schema._def,
        keyType: mapElement(schema._def.keyType),
        valueType: mapElement(schema._def.valueType),
      });
    }

    // Primitive / already‑handled types pass through untouched.
    return schema;
  }

  return fn(mapInner());
}

const partialSchemaCache = new WeakMap();

/**
 * Deeply converts every object property in a Zod schema to optional.
 * @template {import('zod').ZodTypeAny} T
 * @param {T} schema
 * @returns {T}
 */
export function deepPartial(schema) {
  if (partialSchemaCache.has(schema)) {
    return partialSchemaCache.get(schema);
  }

  /* @ts-ignore -- runtime cast only for developer hint */
  const partialSchema = mapOnSchema(schema, (s) =>
    s instanceof z.ZodObject ? s.partial() : s,
  );
  partialSchemaCache.set(schema, partialSchema);
  return partialSchema;
}

/**
 * Makes all object schemas strict (unknown keys fail), except those explicitly
 * marked with `.passthrough()`.
 *
 * @template {import('zod').ZodTypeAny} T
 * @param {T} schema
 * @returns {T}
 */
export function deepStrict(schema) {
  /* @ts-ignore -- runtime cast only for developer hint */
  return mapOnSchema(schema, (s) =>
    s instanceof z.ZodObject && s._def.unknownKeys !== 'passthrough'
      ? s.strict()
      : s,
  );
}

/**
 * Makes all object schemas strict (unknown keys fail), regardless of
 * `.passthrough()`.
 *
 * @template {import('zod').ZodTypeAny} T
 * @param {T} schema
 * @returns {T}
 */
export function deepStrictAll(schema) {
  /* @ts-ignore -- runtime cast only for developer hint */
  return mapOnSchema(schema, (s) =>
    s instanceof z.ZodObject ? s.strict() : s,
  );
}
