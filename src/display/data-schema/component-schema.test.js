import { describe, expect, it } from 'vitest';
import { componentArraySchema, componentSchema } from './component-schema';

describe('componentArraySchema', () => {
  // --------------------------------------------------------------------------
  // 1) 전체 레이아웃 배열 구조 테스트
  // --------------------------------------------------------------------------
  it('should validate a valid component array with multiple items', () => {
    const validComponent = [
      {
        type: 'background',
        texture: 'background.png',
      },
      {
        type: 'bar',
        texture: 'bar.png',
        percentWidth: 0.5,
        percentHeight: 1,
        show: false,
      },
      {
        type: 'icon',
        asset: 'icon.png',
        size: 32,
        zIndex: 10,
      },
      {
        type: 'text',
        placement: 'top',
        content: 'Hello World',
      },
    ];

    const result = componentArraySchema.safeParse(validComponent);
    expect(result.success).toBe(true);
    expect(result.success && result.data).toBeDefined();
  });

  it('should fail if an invalid type is present in the component', () => {
    const invalidComponent = {
      // 여기에 존재하지 않는 type
      type: 'wrongType',
      texture: 'wrong.png',
    };

    const result = componentSchema.safeParse(invalidComponent);
    expect(result.success).toBe(false);
  });

  // --------------------------------------------------------------------------
  // 2) background 타입 테스트
  // --------------------------------------------------------------------------
  describe('background type', () => {
    it('should pass with valid background data', () => {
      const data = [
        {
          type: 'background',
          texture: 'bg.png',
        },
      ];
      const result = componentArraySchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should fail if texture is missing', () => {
      const data = [
        {
          type: 'background',
        },
      ];
      const result = componentArraySchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 3) bar 타입 테스트
  // --------------------------------------------------------------------------
  describe('bar type', () => {
    it('should pass with valid bar data (checking defaults too)', () => {
      const data = [
        {
          type: 'bar',
          texture: 'bar.png',
        },
      ];
      const result = componentArraySchema.safeParse(data);
      expect(result.success).toBe(true);

      // percentWidth, percentHeight는 기본값이 1로 설정됨
      if (result.success) {
        expect(result.data[0].percentWidth).toBe(1);
        expect(result.data[0].percentHeight).toBe(1);
        // show, zIndex 등 defaultConfig 값도 확인
        expect(result.data[0].show).toBe(true);
      }
    });

    it('should fail if percentWidth is larger than 1', () => {
      const data = [
        {
          type: 'bar',
          texture: 'bar.png',
          percentWidth: 1.1,
        },
      ];
      const result = componentArraySchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should fail if placement is not in the enum list', () => {
      const data = [
        {
          type: 'bar',
          texture: 'bar.png',
          placement: 'unknown-placement',
        },
      ];
      const result = componentArraySchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 4) icon 타입 테스트
  // --------------------------------------------------------------------------
  describe('icon type', () => {
    it('should pass with valid icon data (checking defaults)', () => {
      const data = [
        {
          type: 'icon',
          asset: 'icon.png',
          size: 64,
        },
      ];
      const result = componentArraySchema.safeParse(data);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data[0].show).toBe(true);
      }
    });

    it('should fail if size is negative', () => {
      const data = [
        {
          type: 'icon',
          asset: 'icon.png',
          size: -1,
        },
      ];
      const result = componentArraySchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should fail if texture is missing in icon', () => {
      const data = [
        {
          type: 'icon',
          size: 32,
        },
      ];
      const result = componentArraySchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 5) text 타입 테스트
  // --------------------------------------------------------------------------
  describe('text type', () => {
    it('should pass with minimal text data (checking defaults)', () => {
      const data = [
        {
          type: 'text',
        },
      ];
      const result = componentArraySchema.safeParse(data);
      expect(result.success).toBe(true);

      if (result.success) {
        // content 디폴트값 확인
        expect(result.data[0].content).toBe('');
        // placement 디폴트값 확인
        expect(result.data[0].placement).toBe('center');
      }
    });

    it('should pass with a custom style object', () => {
      const data = [
        {
          type: 'text',
          content: 'Hello!',
          style: {
            fontWeight: 'bold',
            customProp: 123,
          },
        },
      ];
      const result = componentArraySchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should fail if placement is invalid in text', () => {
      const data = [
        {
          type: 'text',
          placement: 'invalid-placement',
        },
      ];
      const result = componentArraySchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 6) 기타 에러 케이스 / 엣지 케이스
  // --------------------------------------------------------------------------
  describe('edge cases', () => {
    it('should fail if array is empty (though empty array is actually valid syntax-wise, might be logic error)', () => {
      // 스키마상 빈 배열도 통과하지만,
      // "레이아웃은 최소 1개 이상의 요소가 있어야 한다"라는
      // 요구사항이 있는 경우를 가정해볼 수 있음.
      // 만약 최소 1개 이상이 필요하면 .min(1)을 사용하세요.
      const data = [];
      // 현재 스키마는 빈 배열도 가능하므로 success가 true가 됩니다.
      // 정말로 실패를 원한다면 아래 주석 처럼 변경해주세요:
      // export const componentArraySchema = z
      //   .discriminatedUnion('type', [background, bar, icon, text])
      //   .array().min(1);
      const result = componentArraySchema.safeParse(data);
      // 여기서는 빈 배열도 "성공" 케이스임
      expect(result.success).toBe(true);
    });

    it('should fail if the input is not an array at all', () => {
      const data = {
        type: 'background',
        texture: 'bg.png',
      };
      const result = componentArraySchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should fail if non-object is included in the array', () => {
      const data = [
        {
          type: 'background',
          texture: 'bg.png',
        },
        1234, // 비객체
      ];
      const result = componentArraySchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });
});
