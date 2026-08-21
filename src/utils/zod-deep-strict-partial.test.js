import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  deepPartial,
  deepStrict,
  deepStrictAll,
} from './zod-deep-strict-partial';

describe('Zod schema traversal', () => {
  it('makes nested and recursive object properties optional without applying defaults', () => {
    let nodeSchema;
    nodeSchema = z.object({
      name: z.string(),
      count: z.number().default(1),
      children: z.array(z.lazy(() => nodeSchema)),
    });

    expect(
      deepPartial(nodeSchema).parse({ children: [{ children: [] }] }),
    ).toEqual({ children: [{ children: [] }] });
  });

  it('traverses objects inside transforms', () => {
    const schema = z.object({
      nested: z
        .object({ value: z.string() })
        .transform((value) => ({ ...value, transformed: true })),
    });

    expect(deepPartial(schema).parse({ nested: {} })).toEqual({
      nested: { transformed: true },
    });
  });

  it('traverses objects inside prefault wrappers', () => {
    const schema = z.object({
      nested: z.object({ value: z.string() }).prefault({}),
    });

    expect(deepPartial(schema).parse({ nested: {} })).toEqual({ nested: {} });
    expect(deepPartial(schema).parse({})).toEqual({});
    expect(
      deepStrict(schema).safeParse({
        nested: { value: 'ok', extra: true },
      }).success,
    ).toBe(false);
  });

  it('preserves passthrough objects unless strict mode is forced', () => {
    const schema = z.object({
      nested: z.object({ value: z.string() }).passthrough(),
    });

    expect(
      deepStrict(schema).safeParse({ nested: { value: 'ok', extra: true } })
        .success,
    ).toBe(true);
    expect(
      deepStrictAll(schema).safeParse({
        nested: { value: 'ok', extra: true },
      }).success,
    ).toBe(false);
  });
});
