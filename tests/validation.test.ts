import { describe, expect, it } from 'vitest';

import type {
  Placement,
  RelationLink,
  TextComponentData,
  TextStyleInput,
} from '../src/contracts';
import {
  validateMapData,
  ZodValidationError,
} from '../src/model/validation';

const publicError = (value: unknown): { name: string; message: string } => {
  try {
    validateMapData(value);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return { name: error.name, message: error.message };
  }
  throw new Error('Expected validation to fail.');
};

const relationInput = (link: unknown): unknown[] => [
  { type: 'rect', id: 'rel-a', size: { width: 40, height: 24 } },
  { type: 'rect', id: 'rel-b', size: { width: 40, height: 24 } },
  { type: 'relations', id: 'relations', links: [link] },
];

describe('priority public validation contracts', () => {
  it.each([
    [{}, 'object'],
    [42, 'number'],
  ])('preserves the API-101 root-array error for %j', (input, type) => {
    expect(publicError(input)).toEqual({
      name: 'ZodValidationError',
      message: `Validation error: Expected array, received ${type}`,
    });
  });

  it('accepts source-target relation links and empty link arrays', () => {
    const link: RelationLink = {
      source: 'rel-a',
      target: 'rel-b',
    };

    expect(() => validateMapData([
      ...relationInput(link),
      { type: 'relations', id: 'empty-links', links: [] },
    ])).not.toThrow();
  });

  it.each([
    ['from-to', { from: 'rel-a', to: 'rel-b' }],
    ['sourceId-targetId', { sourceId: 'rel-a', targetId: 'rel-b' }],
    ['start-end', { start: 'rel-a', end: 'rel-b' }],
  ])('rejects the REL-101 %s alias with both exact required issues', (_name, link) => {
    expect(publicError(relationInput(link))).toEqual({
      name: 'ZodValidationError',
      message:
        'Validation error: Required at "[2].links[0].source"; Required at "[2].links[0].target"',
    });
  });

  it('rejects the REL-101 tuple with its exact object-shape error', () => {
    expect(publicError(relationInput(['rel-a', 'rel-b']))).toEqual({
      name: 'ZodValidationError',
      message: 'Validation error: Expected object, received array at "[2].links[0]"',
    });
  });

  it('accepts the TXT-101 style and placement input types', () => {
    const style: TextStyleInput = {
      autoFont: { min: 1, max: 100 },
      overflow: 'visible',
      wordWrap: true,
      wordWrapWidth: 64,
    };
    const placement: Placement = 'right-bottom';
    const component: TextComponentData = {
      type: 'text',
      text: 'valid',
      style,
      placement,
    };

    expect(() => validateMapData([
      { type: 'item', size: 80, components: [component] },
    ])).not.toThrow();
  });

  it('rejects TXT-101 top-level overflow with its exact strict-object error', () => {
    expect(publicError([
      {
        type: 'item',
        size: 80,
        components: [{ type: 'text', text: 'invalid', overflow: 'invalid-overflow' }],
      },
    ])).toEqual({
      name: 'ZodValidationError',
      message:
        'Validation error: Unrecognized key(s) in object: \'overflow\' at "[0].components[0]"',
    });
  });

  it('rejects TXT-101 invalid placement with its exact enum error', () => {
    expect(publicError([
      {
        type: 'item',
        size: 80,
        components: [{ type: 'text', text: 'invalid', placement: 'invalid-placement' }],
      },
    ])).toEqual({
      name: 'ZodValidationError',
      message:
        "Validation error: Invalid enum value. Expected 'left' | 'left-top' | 'left-bottom' | 'top' | 'right' | 'right-top' | 'right-bottom' | 'bottom' | 'center', received 'invalid-placement' at \"[0].components[0].placement\"",
    });
  });

  it('rejects TXT-101 boolean autoFont with its exact object error', () => {
    expect(publicError([
      {
        type: 'item',
        size: 80,
        components: [{ type: 'text', text: 'invalid', style: { autoFont: true } }],
      },
    ])).toEqual({
      name: 'ZodValidationError',
      message:
        'Validation error: Expected object, received boolean at "[0].components[0].style.autoFont"',
    });
  });

  it('exports the public validation error class', () => {
    expect(new ZodValidationError('probe')).toMatchObject({
      name: 'ZodValidationError',
      message: 'probe',
    });
  });

  it.each([
    [
      [{ type: 'rect', id: 'missing-size' }],
      'Validation error: Required at "[0].size"',
    ],
    [
      [{ type: 'image', id: 'missing-source' }],
      'Validation error: Required at "[0].source"',
    ],
    [
      [{ type: 'item', id: 'missing-bar-fields', size: 40, components: [{ type: 'bar' }] }],
      'Validation error: Required at "[0].components[0].source"; Required at "[0].components[0].size"',
    ],
  ])('preserves SCH-101 required-field errors for %j', (input, message) => {
    expect(publicError(input)).toEqual({ name: 'ZodValidationError', message });
  });

  it('rejects SCH-101 unknown top-level element keys with the exact index location', () => {
    expect(publicError([
      { type: 'rect', id: 'unknown-field', size: 20, oracleUnknown: true },
    ])).toEqual({
      name: 'ZodValidationError',
      message:
        "Validation error: Unrecognized key(s) in object: 'oracleUnknown' at index 0",
    });
  });

  it('rejects sibling duplicate IDs before materialization with the UPX-101 path', () => {
    expect(publicError([
      {
        type: 'group',
        id: 'duplicate-probe',
        children: [
          { type: 'rect', id: 'duplicate', size: 16 },
          { type: 'rect', id: 'duplicate', size: 18 },
        ],
      },
    ])).toEqual({
      name: 'ZodValidationError',
      message: 'Validation error: Duplicate id: duplicate at 0.children.1',
    });
  });
});
