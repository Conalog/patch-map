import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { uid } from '../../utils/uuid';
import {
  Grid,
  Group,
  Item,
  Relations,
  mapDataSchema,
} from './element-schema.js';

// Mock component-schema as its details are not relevant for these element tests.
vi.mock('./component-schema', () => ({
  componentArraySchema: z.array(z.any()).default([]),
}));

// Mock the uid generator for predictable test outcomes.
vi.mock('../../utils/uuid', () => ({
  uid: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(uid).mockClear();
});

describe('Element Schemas', () => {
  describe('Group Schema', () => {
    it('should parse a valid group with nested elements', () => {
      const groupData = {
        type: 'group',
        id: 'group-1',
        children: [{ type: 'item', id: 'item-1', width: 100, height: 100 }],
      };
      const parsed = Group.parse(groupData);
      expect(parsed.children).toHaveLength(1);
      expect(parsed.children[0].type).toBe('item');
    });

    it('should parse a group with empty children', () => {
      const groupData = { type: 'group', id: 'group-1', children: [] };
      expect(() => Group.parse(groupData)).not.toThrow();
    });

    it('should fail if children contains an invalid element', () => {
      const invalidGroupData = {
        type: 'group',
        id: 'group-1',
        children: [{ type: 'invalid-type' }],
      };
      expect(() => Group.parse(invalidGroupData)).toThrow();
    });

    it('should fail if an unknown property is provided', () => {
      const groupData = {
        type: 'group',
        id: 'group-1',
        children: [],
        extra: 'property',
      };
      expect(() => Group.parse(groupData)).toThrow();
    });
  });

  describe('Grid Schema', () => {
    const baseGrid = {
      type: 'grid',
      id: 'grid-1',
      cells: [[1]],
      item: { width: 50, height: 50 },
    };

    it('should parse a valid grid and preprocess gap', () => {
      const parsed = Grid.parse(baseGrid);
      expect(parsed.gap).toEqual({ x: 0, y: 0 });
      expect(parsed.item).toEqual({ width: 50, height: 50, components: [] });
    });

    it('should fail if cells contains invalid values', () => {
      const gridData = { ...baseGrid, cells: [[1, 2]] };
      expect(() => Grid.parse(gridData)).toThrow();
    });

    it('should fail if item is missing required size', () => {
      const gridData = { ...baseGrid, item: { components: [] } };
      expect(() => Grid.parse(gridData)).toThrow();
    });

    it('should fail if required properties are missing', () => {
      expect(() => Grid.parse({ type: 'grid', id: 'g1' })).toThrow(); // missing cells, item
    });

    it('should fail if an unknown property is provided', () => {
      const gridData = { ...baseGrid, unknown: 'property' };
      expect(() => Grid.parse(gridData)).toThrow();
    });
  });

  describe('Item Schema', () => {
    it('should parse a valid item with required properties', () => {
      const itemData = { type: 'item', id: 'item-1', width: 100, height: 200 };
      const parsed = Item.parse(itemData);
      expect(parsed.width).toBe(100);
      expect(parsed.height).toBe(200);
      expect(parsed.components).toEqual([]); // default value
    });

    it('should fail if required size properties are missing', () => {
      const itemData = { type: 'item', id: 'item-1' };
      expect(() => Item.parse(itemData)).toThrow();
    });

    it('should fail if an unknown property is provided', () => {
      const itemData = {
        type: 'item',
        id: 'item-1',
        width: 100,
        height: 100,
        x: 50, // This is an unknown property
      };
      expect(() => Item.parse(itemData)).toThrow();
    });
  });

  describe('Relations Schema', () => {
    it('should parse valid relations and apply default style', () => {
      const relationsData = {
        type: 'relations',
        id: 'rel-1',
        links: [{ source: 'a', target: 'b' }],
      };
      const parsed = Relations.parse(relationsData);
      expect(parsed.links).toHaveLength(1);
      expect(parsed.style).toEqual({ color: 'black' });
    });

    it('should accept an overridden style', () => {
      const relationsData = {
        type: 'relations',
        id: 'rel-1',
        links: [],
        style: { color: 'blue', lineWidth: 2 },
      };
      const parsed = Relations.parse(relationsData);
      expect(parsed.style).toEqual({ color: 'blue', lineWidth: 2 });
    });

    it('should fail for an invalid links property', () => {
      const relationsData = {
        type: 'relations',
        id: 'rel-1',
        links: [{ source: 'a' }], // missing target
      };
      expect(() => Relations.parse(relationsData)).toThrow();
    });

    it('should fail if an unknown property is provided', () => {
      const relationsData = {
        type: 'relations',
        id: 'rel-1',
        links: [],
        extra: 'data',
      };
      expect(() => Relations.parse(relationsData)).toThrow();
    });
  });

  describe('mapDataSchema (Full Integration)', () => {
    it('should parse a valid array of mixed elements with unique IDs', () => {
      const data = [
        { type: 'item', id: 'item-1', width: 10, height: 10 },
        {
          type: 'group',
          id: 'group-1',
          children: [{ type: 'item', id: 'item-2', width: 10, height: 10 }],
        },
      ];
      expect(() => mapDataSchema.parse(data)).not.toThrow();
    });

    it('should apply default IDs and pass validation if they are unique', () => {
      vi.mocked(uid)
        .mockReturnValueOnce('mock-id-0')
        .mockReturnValueOnce('mock-id-1');
      const data = [
        { type: 'item', width: 10, height: 10 },
        { type: 'item', width: 10, height: 10 },
      ];
      const parsed = mapDataSchema.parse(data);
      expect(parsed[0].id).toBe('mock-id-0');
      expect(parsed[1].id).toBe('mock-id-1');
    });

    it('should fail if an element has an unknown type', () => {
      const data = [{ type: 'rectangle', id: 'rect-1' }];
      const result = mapDataSchema.safeParse(data);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].code).toBe('invalid_union_discriminator');
    });

    // --- ID uniqueness validation using superRefine ---
    describe('ID uniqueness validation', () => {
      const getFirstError = (data) => {
        const result = mapDataSchema.safeParse(data);
        return result.success ? null : result.error.issues[0].message;
      };

      it('should fail for duplicate IDs at the root level', () => {
        const data = [
          { type: 'item', id: 'dup-id', width: 10, height: 10 },
          { type: 'item', id: 'dup-id', width: 10, height: 10 },
        ];
        expect(getFirstError(data)).toBe('Duplicate id: dup-id at 1');
      });

      it('should fail for duplicate ID between root and a nested group', () => {
        const data = [
          { type: 'item', id: 'cross-level-dup', width: 10, height: 10 },
          {
            type: 'group',
            id: 'group-1',
            children: [
              { type: 'item', id: 'cross-level-dup', width: 10, height: 10 },
            ],
          },
        ];
        expect(getFirstError(data)).toBe(
          'Duplicate id: cross-level-dup at 1.children.0',
        );
      });

      it('should fail for duplicate ID in deeply nested groups', () => {
        const data = [
          {
            type: 'group',
            id: 'g1',
            children: [
              {
                type: 'group',
                id: 'g2',
                children: [
                  { type: 'item', id: 'deep-dup', width: 1, height: 1 },
                ],
              },
              { type: 'item', id: 'deep-dup', width: 1, height: 1 },
            ],
          },
        ];
        expect(getFirstError(data)).toBe(
          'Duplicate id: deep-dup at 0.children.1',
        );
      });

      it('should fail when a default ID clashes with a provided ID', () => {
        vi.mocked(uid).mockReturnValueOnce('mock-id-0');
        const data = [
          { type: 'item', id: 'mock-id-0', width: 10, height: 10 },
          { type: 'item', width: 10, height: 10 }, // This will get default id 'mock-id-0'
        ];
        expect(getFirstError(data)).toBe('Duplicate id: mock-id-0 at 1');
      });
    });
  });
});
