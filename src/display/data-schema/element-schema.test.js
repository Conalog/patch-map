import { describe, expect, it, test } from 'vitest';
import { gridSchema, mapDataSchema } from './element-schema';

// --- Test Suite for valid data structures ---
describe('Success Cases', () => {
  it('should validate a minimal `item` and apply default values', () => {
    const data = [
      {
        type: 'item',
        id: 'item-1',
        size: { width: 100, height: 50 },
        components: [],
      },
    ];
    const result = mapDataSchema.safeParse(data);
    expect(result.success, 'Validation should pass').toBe(true);

    if (result.success) {
      const parsed = result.data[0];
      expect(parsed.position).toEqual({ x: 0, y: 0 });
      expect(parsed.show).toBe(true);
    }
  });

  it('should validate a `grid` with a complete itemTemplate', () => {
    const data = [
      {
        type: 'grid',
        cells: [[1]],
        itemTemplate: {
          size: { width: 50, height: 50 },
          components: [{ type: 'background', texture: { type: 'rect' } }],
        },
      },
    ];
    const result = mapDataSchema.safeParse(data);
    expect(result.success, 'Grid validation should pass').toBe(true);
  });

  it('should validate a `group` with nested children and optional size', () => {
    const data = [
      {
        type: 'group',
        id: 'group-1',
        position: { x: 10, y: 10 },
        size: { width: 200, height: 200 },
        children: [
          {
            type: 'item',
            id: 'nested-item',
            size: { width: 20, height: 20 },
            components: [],
          },
        ],
      },
    ];
    const result = mapDataSchema.safeParse(data);
    expect(result.success, 'Group validation should pass').toBe(true);
  });

  it('should validate `relations` with custom styles and apply defaults', () => {
    const data = [
      {
        type: 'relations',
        links: [{ source: 'a', target: 'b' }],
        style: { width: 5, color: '0xff0000' },
      },
    ];
    const result = mapDataSchema.safeParse(data);
    expect(result.success, 'Relations validation should pass').toBe(true);

    if (result.success) {
      const parsed = result.data[0];
      expect(parsed.style.width).toBe(5);
      expect(parsed.style.color).toBe('0xff0000');
    }
  });

  it('should allow passthrough of unknown properties', () => {
    const data = [
      {
        type: 'item',
        id: 'item-1',
        size: { width: 10, height: 10 },
        components: [],
        // `passthrough` allows adding properties not defined in the schema
        customData: { value: 123 },
        anotherProp: 'hello',
      },
    ];
    const result = mapDataSchema.safeParse(data);
    expect(result.success, 'Passthrough properties should be allowed').toBe(
      true,
    );
    if (result.success) {
      expect(result.data[0].customData).toEqual({ value: 123 });
      expect(result.data[0].anotherProp).toEqual('hello');
    }
  });

  it('should generate a default ID if one is not provided', () => {
    const data = [
      { type: 'item', size: { width: 1, height: 1 }, components: [] },
    ];
    const result = mapDataSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0].id).toBeDefined();
      expect(typeof result.data[0].id).toBe('string');
    }
  });
});

// --- Test Suite for invalid data structures ---
describe('Failure Cases', () => {
  test.each([
    {
      name: 'missing required `size` in `item`',
      data: [{ type: 'item', id: 'item-1', components: [] }],
      expectedPath: [0, 'size'],
    },
    {
      name: 'missing required `components` in `item`',
      data: [{ type: 'item', id: 'item-1', size: { width: 1, height: 1 } }],
      expectedPath: [0, 'components'],
    },
    {
      name: 'missing `itemTemplate` in `grid`',
      data: [{ type: 'grid', id: 'grid-1', cells: [[1]] }],
      expectedPath: [0, 'itemTemplate'],
    },
    {
      name: 'missing `children` in `group`',
      data: [{ type: 'group', id: 'group-1' }],
      expectedPath: [0, 'children'],
    },
    {
      name: 'negative `width` in `size`',
      data: [
        {
          type: 'item',
          id: 'item-1',
          components: [],
          size: { width: -10, height: 10 },
        },
      ],
      expectedPath: [0, 'size', 'width'],
    },
    {
      name: 'invalid `cells` value in `grid`',
      data: [
        {
          type: 'grid',
          cells: [[2]],
          itemTemplate: { size: { w: 1, h: 1 }, components: [] },
        },
      ],
      expectedPath: [0, 'cells', 0, 0],
    },
  ])('should fail for $name', ({ name, data, expectedPath }) => {
    const result = mapDataSchema.safeParse(data);
    expect(result.success, `Should fail for: ${name}`).toBe(false);
    if (!result.success) {
      const errorPaths = result.error.issues.map((issue) =>
        issue.path.join('.'),
      );
      expect(errorPaths).toContain(expectedPath.join('.'));
    }
  });
});

// --- Test Suite for edge cases and constraints ---
describe('Edge Cases and Constraints', () => {
  it('should fail if an ID is duplicated, even in nested structures', () => {
    const data = [
      {
        type: 'item',
        id: 'duplicate-id',
        size: { width: 1, height: 1 },
        components: [],
      },
      {
        type: 'group',
        id: 'group-1',
        children: [
          {
            type: 'item',
            id: 'duplicate-id',
            size: { width: 1, height: 1 },
            components: [],
          },
        ],
      },
    ];
    const result = mapDataSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      const customError = result.error.issues.find((i) => i.code === 'custom');
      expect(customError).toBeDefined();
      expect(customError.message).toContain('Duplicate id: duplicate-id');
    }
  });

  it('should pass validation for an empty array', () => {
    const data = [];
    const result = mapDataSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should fail if the root data is not an array', () => {
    const data = {
      type: 'item',
      id: 'item-1',
      size: { width: 1, height: 1 },
      components: [],
    };
    const result = mapDataSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

describe('`gap` Validation', () => {
  describe('Success Cases and Normalization', () => {
    const gapSchema = gridSchema.pick({ type: true, gap: true });

    test.each([
      {
        name: 'a single number (shorthand)',
        input: { type: 'grid', gap: 10 },
        expected: { x: 10, y: 10 },
      },
      {
        name: 'a full object with x and y',
        input: { type: 'grid', gap: { x: 20, y: 15 } },
        expected: { x: 20, y: 15 },
      },
      {
        name: 'a partial object with only x',
        input: { type: 'grid', gap: { x: 5 } },
        expected: { x: 5, y: 0 }, // y should default to 0
      },
      {
        name: 'a partial object with only y',
        input: { type: 'grid', gap: { y: 8 } },
        expected: { x: 0, y: 8 }, // x should default to 0
      },
      {
        name: 'undefined (should apply all defaults)',
        input: { type: 'grid' },
        expected: { x: 0, y: 0 },
      },
      {
        name: 'an empty object',
        input: { type: 'grid', gap: {} },
        expected: { x: 0, y: 0 },
      },
      {
        name: 'zero as a number',
        input: { type: 'grid', gap: 0 },
        expected: { x: 0, y: 0 },
      },
    ])(
      'should correctly parse and default when `gap` is $name',
      ({ name, input, expected }) => {
        const result = gapSchema.safeParse(input);
        expect(result.success, `Validation failed for case: ${name}`).toBe(
          true,
        );
        if (result.success) {
          expect(result.data.gap).toEqual(expected);
        }
      },
    );
  });

  describe('Failure Cases', () => {
    const gapSchema = gridSchema.pick({ type: true, gap: true });

    test.each([
      {
        name: 'a negative number',
        input: { type: 'grid', gap: -10 },
        expectedPath: ['gap', 'x'], // The preprocessor turns it into {x: -10, y: -10}
      },
      {
        name: 'an object with a negative x value',
        input: { type: 'grid', gap: { x: -5, y: 10 } },
        expectedPath: ['gap', 'x'],
      },
      {
        name: 'an object with a non-numeric value',
        input: { type: 'grid', gap: { x: 10, y: 'invalid' } },
        expectedPath: ['gap', 'y'],
      },
      {
        name: 'a string value',
        input: { type: 'grid', gap: '10' },
        expectedPath: ['gap'], // Fails the object check after preprocessing
      },
      {
        name: 'null',
        input: { type: 'grid', gap: null },
        expectedPath: ['gap'],
      },
      {
        name: 'an array',
        input: { type: 'grid', gap: [10, 10] },
        expectedPath: ['gap'],
      },
    ])('should fail when `gap` is $name', ({ name, input, expectedPath }) => {
      const result = gapSchema.safeParse(input);
      expect(result.success, `Should fail for case: ${name}`).toBe(false);
      if (!result.success) {
        const errorPaths = result.error.issues.map((issue) =>
          issue.path.join('.'),
        );
        expect(errorPaths).toContain(expectedPath.join('.'));
      }
    });
  });
});
