import { describe, expect, it } from 'vitest';
import { mapDataSchema } from './schema';

describe('mapDataSchema (modified tests for required fields)', () => {
  // --------------------------------------------------------------------------
  // 1) 정상 케이스 테스트
  // --------------------------------------------------------------------------
  it('should validate a minimal valid single item object (type=item) with size', () => {
    // 이제 size가 required이므로 반드시 포함해야 함
    const data = [
      {
        id: 'unique-item-1',
        type: 'item',
        layout: [], // layoutSchema는 배열
        size: { width: 100, height: 50 },
      },
    ];
    const result = mapDataSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      // 기본값으로 세팅된 transform 속성 확인
      // position은 default(0,0), rotation은 default(0)
      expect(result.data[0].position.x).toBe(0);
      expect(result.data[0].position.y).toBe(0);
      expect(result.data[0].rotation).toBe(0);

      // size가 정상적으로 들어왔는지
      expect(result.data[0].size.width).toBe(100);
      expect(result.data[0].size.height).toBe(50);
    }
  });

  it('should validate a valid grid object (type=grid) with cells and size', () => {
    const data = [
      {
        id: 'grid-1',
        type: 'grid',
        cells: [
          [0, 1, 0],
          [1, 0, 1],
        ],
        layout: [
          {
            type: 'background',
            texture: 'bg.png',
            width: 100,
            height: 100,
          },
        ],
        size: {
          width: 200,
          height: 200,
        },
        position: {
          x: 50,
          y: 50,
        },
      },
    ];
    const result = mapDataSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should validate a valid relation-group object (type=relation-group)', () => {
    // relation이 required이므로, links 내부 요소도 제대로 있어야 함
    const data = [
      {
        id: 'relation-group-1',
        type: 'relation-group',
        links: [
          { source: 'itemA', target: 'itemB' },
          { source: 'itemC', target: 'itemD' },
        ],
      },
    ];
    const result = mapDataSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should pass if links in relation-group is empty or has missing fields', () => {
    const data = [
      {
        id: 'relation-group-bad-links',
        type: 'relation-group',
        links: [],
      },
    ];
    const result = mapDataSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 2) 에러 케이스 테스트
  // --------------------------------------------------------------------------
  describe('Error cases (required fields and stricter checks)', () => {
    it('should fail if size is missing (now required) in item', () => {
      const data = [
        {
          id: 'item-1',
          type: 'item',
          layout: [],
          // size 필드가 없음
        },
      ];
      const result = mapDataSchema.safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        // size is required
        const sizeError = result.error.issues.find((issue) =>
          issue.path.includes('size'),
        );
        expect(sizeError).toBeDefined();
      }
    });

    it('should fail if links contain invalid fields', () => {
      const data = [
        {
          id: 'relation-group-bad-links',
          type: 'relation-group',
          links: [{ sourec: 'typo' }],
        },
      ];
      const result = mapDataSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should fail if relation object is missing required fields', () => {
      const data = [
        {
          id: 'relation-group-bad-link',
          type: 'relation-group',
          links: [
            // source, target 모두 반드시 있어야 함
            { source: 'itemA' }, // target 누락
          ],
        },
      ];
      const result = mapDataSchema.safeParse(data);
      expect(result.success).toBe(false);

      if (!result.success) {
        // relation의 target 누락 관련 에러를 체크
        const targetError = result.error.issues.find((issue) =>
          issue.path.includes('links'),
        );
        expect(targetError).toBeDefined();
      }
    });

    it('should fail if id is duplicated', () => {
      const data = [
        {
          id: 'dupId',
          type: 'item',
          layout: [],
          size: { width: 100, height: 100 },
        },
        {
          id: 'dupId',
          type: 'grid',
          cells: [[0]],
          layout: [],
          size: { width: 50, height: 50 },
        },
      ];
      const result = mapDataSchema.safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toMatch(/Duplicate id/);
      }
    });

    it('should fail if cells in grid are not 0 or 1', () => {
      const data = [
        {
          id: 'grid-bad-cells',
          type: 'grid',
          cells: [
            [2, 0], // 2는 허용되지 않음
          ],
          layout: [],
          size: { width: 100, height: 100 },
        },
      ];
      const result = mapDataSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should fail if size has negative width or height', () => {
      const data = [
        {
          id: 'item-2',
          type: 'item',
          layout: [],
          size: { width: -100, height: 100 }, // width가 음수
        },
      ];
      const result = mapDataSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should fail if rotation is not a number', () => {
      const data = [
        {
          id: 'item-3',
          type: 'item',
          layout: [],
          rotation: 'not-a-number', // 숫자가 아님
          size: { width: 10, height: 10 },
        },
      ];
      const result = mapDataSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should fail if position is not an object', () => {
      const data = [
        {
          id: 'item-4',
          type: 'item',
          layout: [],
          position: 'invalid-position', // 객체가 아님
          size: { width: 10, height: 10 },
        },
      ];
      const result = mapDataSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 3) type=group 케이스
  // --------------------------------------------------------------------------
  describe('Group object (type=group)', () => {
    it('should pass when group has valid nested items', () => {
      // group 내부에 grid와 item을 예시로 넣어봄
      const data = [
        {
          id: 'group-1',
          type: 'group',
          name: 'Sample Group',
          metadata: {
            customKey: 'customValue',
          },
          items: [
            {
              id: 'nested-grid-1',
              type: 'grid',
              cells: [
                [0, 1],
                [1, 0],
              ],
              layout: [],
              // transform 필드
              position: { x: 10, y: 20 },
              size: { width: 100, height: 50 },
              rotation: 45,
            },
            {
              id: 'nested-item-1',
              type: 'item',
              layout: [],
              // transform 필드
              position: { x: 5, y: 5 },
              size: { width: 50, height: 50 },
            },
          ],
        },
      ];

      const result = mapDataSchema.safeParse(data);
      expect(result.success).toBe(true);

      if (result.success) {
        // 그룹 객체에 대한 필드 확인
        const group = result.data[0];
        expect(group.id).toBe('group-1');
        expect(group.type).toBe('group');
        expect(group.name).toBe('Sample Group');

        // items 배열 확인
        expect(Array.isArray(group.items)).toBe(true);
        expect(group.items).toHaveLength(2);

        // 첫 번째는 grid
        expect(group.items[0].type).toBe('grid');
        // 두 번째는 item
        expect(group.items[1].type).toBe('item');
      }
    });

    it('should fail if group items have duplicate id', () => {
      // group 내부에 중복 id를 가진 아이템
      const data = [
        {
          id: 'duplicate-item',
          type: 'group',
          items: [
            {
              id: '123',
              type: 'item',
              layout: [],
              position: { x: 0, y: 0 },
              size: { width: 10, height: 10 },
            },
            {
              id: 'duplicate-item',
              type: 'grid',
              cells: [[0]],
              layout: [],
              position: { x: 10, y: 10 },
              size: { width: 20, height: 20 },
            },
          ],
        },
      ];

      const result = mapDataSchema.safeParse(data);
      expect(result.success).toBe(false);

      if (!result.success) {
        // 중복 id 관련 에러 메시지를 확인
        const duplicateError = result.error.issues.find((issue) =>
          issue.message.includes('Duplicate id: duplicate-item'),
        );
        expect(duplicateError).toBeDefined();
      }
    });

    it('should fail if items is missing or not an array', () => {
      // items 필드 자체가 없는 경우
      const data = [
        {
          id: 'group-without-items',
          type: 'group',
          // items 누락
        },
      ];

      const result = mapDataSchema.safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        const missingItemsError = result.error.issues.find((issue) =>
          issue.path.includes('items'),
        );
        expect(missingItemsError).toBeDefined();
      }
    });
  });

  // --------------------------------------------------------------------------
  // 4) 기타 / 엣지 케이스
  // --------------------------------------------------------------------------
  describe('Edge cases', () => {
    it('should pass an empty array (if no items are required)', () => {
      // 스키마상 array().min(1)이 아니므로 빈 배열도 "성공"으로 본다.
      const data = [];
      const result = mapDataSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should fail if the root data is not an array', () => {
      const data = {
        id: 'wrong-root',
        type: 'item',
        layout: [],
        size: { width: 10, height: 10 },
      };
      const result = mapDataSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });
});
