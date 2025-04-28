import { describe, expect, test } from 'vitest';
import { deepMerge } from './deepmerge';

describe('deepMerge - arrayMerge by id → name → type', () => {
  test.each([
    ['123', '456', '456'],
    [123, 456, 456],
    [
      {
        show: true,
        components: [
          {
            id: 1,
            data: [10, 20],
            style: { color: 'blue' },
          },
        ],
      },
      {
        show: false,
        components: [
          {
            id: 1,
            data: [30, 40],
            style: { fontSize: 14 },
          },
        ],
      },
      {
        show: false,
        components: [
          {
            id: 1,
            data: [30, 40],
            style: {
              color: 'blue',
              fontSize: 14,
            },
          },
        ],
      },
    ],
    [
      {
        components: [
          { label: 'legend', visible: true, style: { color: 'red' } },
        ],
      },
      {
        components: [{ label: 'legend', style: { fontSize: 12 } }],
      },
      {
        components: [
          {
            label: 'legend',
            visible: true,
            style: {
              color: 'red',
              fontSize: 12,
            },
          },
        ],
      },
    ],
    [
      {
        components: [{ type: 'bar', width: 100 }],
      },
      {
        components: [{ type: 'bar', height: 200 }],
      },
      {
        components: [{ type: 'bar', width: 100, height: 200 }],
      },
    ],
    [
      {
        components: [{ id: 1, value: 10 }],
      },
      {
        components: [
          { id: 2, value: 20 },
          { label: 'title' },
          { type: 'pie', data: [1] },
        ],
      },
      {
        components: [
          { id: 1, value: 10 },
          { id: 2, value: 20 },
          { label: 'title' },
          { type: 'pie', data: [1] },
        ],
      },
    ],
    [
      {
        show: true,
        components: [
          { id: 100, type: 'bar', data: [1], style: { color: 'blue' } },
          { label: 'legend', visible: false },
        ],
      },
      {
        show: false,
        components: [
          { id: 100, style: { fontSize: 14 }, data: [2, 3] },
          { type: 'bar', data: [5] },
          { label: 'legend', visible: true },
          { extraProp: true },
        ],
      },
      {
        show: false,
        components: [
          {
            id: 100,
            type: 'bar',
            data: [2, 3],
            style: {
              color: 'blue',
              fontSize: 14,
            },
          },
          { label: 'legend', visible: true },
          { type: 'bar', data: [5] },
          { extraProp: true },
        ],
      },
    ],
    [
      {
        components: [
          { type: 'text', text: '1' },
          { type: 'text', text: '2' },
          { type: 'text', text: '3' },
          { type: 'text', text: '4' },
        ],
      },
      {
        components: [
          { type: 'text', text: '5' },
          { type: 'text', text: '6' },
          { type: 'text', text: '7' },
        ],
      },
      {
        components: [
          { type: 'text', text: '5' },
          { type: 'text', text: '6' },
          { type: 'text', text: '7' },
          { type: 'text', text: '4' },
        ],
      },
    ],
  ])('Case %#', (left, right, expected) => {
    const result = deepMerge(left, right);
    expect(result).toEqual(expected);
  });
});
