import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  Grid,
  Group,
  Item,
  Relations,
  mapDataSchema,
} from './element-schema.js';

// We still mock component-schema as its details are not relevant for this test.
vi.mock('./component-schema', () => ({
  componentArraySchema: z.array(z.any()).default([]),
}));

// --- Global Setup ---

// Mocking a unique ID generator for predictable test outcomes.
let idCounter = 0;
const uid = vi.fn(() => `mock-id-${idCounter++}`);
global.uid = uid;

beforeEach(() => {
  // Reset counter before each test to ensure test isolation
  idCounter = 0;
  uid.mockClear();
});

// --- Test Suites ---

describe('Element Schema Tests (with real dependencies)', () => {
  // A minimal valid item for use in other tests
  const validItem = {
    type: 'item',
    id: 'item-1',
    width: 100,
    height: 100,
  };

  describe('Group Schema', () => {
    it('should parse a valid group with no children', () => {
      const groupData = { type: 'group', id: 'group-1', children: [] };
      expect(() => Group.parse(groupData)).not.toThrow();
    });

    it('should parse a valid group with nested elements (lazy schema)', () => {
      const groupData = {
        type: 'group',
        id: 'group-1',
        children: [validItem],
      };
      const parsed = Group.parse(groupData);
      expect(parsed.children).toHaveLength(1);
      expect(parsed.children[0].type).toBe('item');
    });

    it('should fail if children contains an invalid element', () => {
      const invalidGroupData = {
        type: 'group',
        id: 'group-1',
        children: [{ type: 'invalid-type' }], // an object that doesn't match any element type
      };
      expect(() => Group.parse(invalidGroupData)).toThrow();
    });
  });

  describe('Grid Schema', () => {
    // This test data is valid for the real Gap schema from base-schema
    const baseGrid = {
      type: 'grid',
      id: 'grid-1',
      itemTemplate: { width: 50, height: 50, components: [] },
      gap: 5, // Using a number, which the real Gap schema preprocesses
    };

    it.each([
      {
        case: 'a standard 2x2 grid',
        cells: [
          [1, 0],
          [0, 1],
        ],
      },
      { case: 'an empty grid', cells: [] },
      { case: 'a grid with an empty row', cells: [[]] },
      { case: 'a ragged grid', cells: [[1], [0, 1]] },
    ])('should parse a valid grid for $case', ({ cells }) => {
      const gridData = { ...baseGrid, cells };
      const parsed = Grid.parse(gridData);
      // Check if the real Gap schema's preprocess worked
      expect(parsed.gap).toEqual({ x: 5, y: 5 });
    });

    it.each([
      { case: 'cells containing a non-array', cells: [1, [0, 1]] },
      {
        case: 'cells containing invalid numbers',
        cells: [
          [1, 2],
          [0, 1],
        ],
      },
      { case: 'cells being not an array', cells: {} },
    ])(
      'should throw an error for invalid cells property for $case',
      ({ cells }) => {
        const gridData = { ...baseGrid, cells };
        expect(() => Grid.parse(gridData)).toThrow();
      },
    );

    it('should fail if itemTemplate is missing required size', () => {
      const gridData = { ...baseGrid, itemTemplate: { components: [] } };
      expect(() => Grid.parse(gridData)).toThrow(); // width/height are required in Size schema
    });
  });

  describe('Item Schema', () => {
    it('should parse a full valid item', () => {
      const itemData = {
        type: 'item',
        id: 'item-1',
        x: 10,
        y: 20,
        width: 100,
        height: 200,
        components: [{ type: 'text', content: 'hello' }],
      };
      expect(() => Item.parse(itemData)).not.toThrow();
    });

    it('should fail if required properties from merged schemas are missing', () => {
      // Item merges with Size, which requires width and height
      const itemData = { type: 'item', id: 'item-1' };
      expect(() => Item.parse(itemData)).toThrow();
    });
  });

  describe('Relations Schema', () => {
    // The `style` property is required. Pass an empty object to trigger its preprocess.
    const baseRelations = { type: 'relations', id: 'rel-1', style: {} };

    it.each([
      { case: 'a valid links array', links: [{ source: 'a', target: 'b' }] },
      { case: 'an empty links array', links: [] },
    ])('should parse valid relations for $case', ({ links }) => {
      const relationsData = { ...baseRelations, links };
      const parsed = Relations.parse(relationsData);
      expect(parsed.links).toEqual(links);
      // Check if the real RelationsStyle schema's preprocess worked
      expect(parsed.style).toEqual({ color: 'black' });
    });

    it.each([
      { case: 'links not being an array', links: {} },
      {
        case: 'links array with invalid object (missing source)',
        links: [{ target: 'b' }],
      },
      {
        case: 'links array with invalid object (source is not a string)',
        links: [{ source: 123, target: 'b' }],
      },
    ])(
      'should throw an error for invalid links property for $case',
      ({ links }) => {
        const relationsData = { ...baseRelations, links };
        expect(() => Relations.parse(relationsData)).toThrow();
      },
    );
  });

  describe('mapDataSchema (Integration and ID Uniqueness)', () => {
    it('should parse a valid array of different elements with unique IDs', () => {
      const data = [
        { type: 'item', id: 'item-10', width: 10, height: 10 },
        { type: 'group', id: 'group-20', children: [] },
      ];
      expect(() => mapDataSchema.parse(data)).not.toThrow();
    });

    it('should parse correctly with default IDs applied', () => {
      const data = [
        { type: 'item', width: 10, height: 10 }, // no id
        { type: 'item', width: 10, height: 10 }, // no id
      ];
      // uid() will be called, returning mock-id-0, mock-id-1, etc.
      const parsed = mapDataSchema.parse(data);
      expect(parsed[0].id).toBe('mock-id-0');
      expect(parsed[1].id).toBe('mock-id-1');
      expect(uid).toHaveBeenCalledTimes(2);
    });

    // --- Extreme Edge Cases for ID Uniqueness ---
    describe('ID uniqueness validation (superRefine)', () => {
      const getFirstError = (data) => {
        const result = mapDataSchema.safeParse(data);
        if (result.success) return null;
        return result.error.issues[0].message;
      };

      it.each([
        {
          case: 'duplicate IDs at the root level',
          data: [
            { type: 'item', id: 'dup-id', width: 10, height: 10 },
            { type: 'item', id: 'dup-id', width: 10, height: 10 },
          ],
          expectedError: 'Duplicate id: dup-id at 1',
        },
        {
          case: 'duplicate ID inside a nested group',
          data: [
            {
              type: 'group',
              id: 'group-1',
              children: [
                { type: 'item', id: 'nested-dup', width: 10, height: 10 },
                { type: 'item', id: 'nested-dup', width: 10, height: 10 },
              ],
            },
          ],
          expectedError: 'Duplicate id: nested-dup at 0.children.1',
        },
        {
          case: 'ID at root is duplicated in a nested group',
          data: [
            { type: 'item', id: 'cross-level-dup', width: 10, height: 10 },
            {
              type: 'group',
              id: 'group-1',
              children: [
                { type: 'item', id: 'cross-level-dup', width: 10, height: 10 },
              ],
            },
          ],
          expectedError: 'Duplicate id: cross-level-dup at 1.children.0',
        },
        {
          case: 'ID in a nested group is duplicated at the root',
          data: [
            {
              type: 'group',
              id: 'group-1',
              children: [
                { type: 'item', id: 'cross-level-dup', width: 10, height: 10 },
              ],
            },
            { type: 'item', id: 'cross-level-dup', width: 10, height: 10 },
          ],
          expectedError: 'Duplicate id: cross-level-dup at 1',
        },
        {
          case: 'duplicate IDs in deeply nested groups',
          data: [
            {
              type: 'group',
              id: 'group-1',
              children: [
                {
                  type: 'group',
                  id: 'group-2',
                  children: [
                    { type: 'item', id: 'deep-dup', width: 10, height: 10 },
                  ],
                },
                {
                  type: 'group',
                  id: 'group-3',
                  children: [
                    { type: 'item', id: 'deep-dup', width: 10, height: 10 },
                  ],
                },
              ],
            },
          ],
          expectedError: 'Duplicate id: deep-dup at 0.children.1.children.0',
        },
        {
          case: 'duplicate with default IDs',
          data: [
            { type: 'item', id: 'mock-id-0', width: 10, height: 10 },
            { type: 'item', width: 10, height: 10 }, // This will get default id 'mock-id-0'
          ],
          expectedError: 'Duplicate id: mock-id-0 at 1',
        },
      ])('should fail with error: $case', ({ data, expectedError }) => {
        const message = getFirstError(data);
        expect(message).toBe(expectedError);
      });
    });

    // --- Discriminated Union Edge Cases ---
    describe('Discriminated Union validation', () => {
      it('should fail if an element has an unknown type', () => {
        const data = [{ type: 'rectangle', id: 'rect-1' }];
        expect(() => mapDataSchema.parse(data)).toThrow();
      });

      it('should fail if an element has a correct type but incorrect properties', () => {
        // 'grid' type requires a 'cells' property
        const data = [
          { type: 'grid', id: 'grid-1', itemTemplate: { width: 1, height: 1 } },
        ];
        const result = mapDataSchema.safeParse(data);
        expect(result.success).toBe(false);
        expect(result.error.issues[0].message).toBe('Required'); // Zod's error for missing property
        expect(result.error.issues[0].path).toEqual([0, 'cells']);
      });
    });
  });
});
