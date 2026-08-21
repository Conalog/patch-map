import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { deepPartial } from './zod-deep-strict-partial';

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
  });

  it('degrades discriminated unions so their discriminator can be omitted', () => {
    const schema = z.discriminatedUnion('type', [
      z
        .object({
          type: z.literal('image'),
          size: z.object({ width: z.number(), height: z.number() }),
        })
        .strict(),
      z
        .object({
          type: z.literal('text'),
          style: z.object({ fontSize: z.number() }),
        })
        .strict(),
    ]);

    expect(deepPartial(schema).parse({ size: { width: 40 } })).toEqual({
      size: { width: 40 },
    });
  });
});
