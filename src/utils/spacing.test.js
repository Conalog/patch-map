import { describe, expect, it } from 'vitest';
import { normalizeBoxSpacing } from './spacing';

class SpacingPayload {
  constructor() {
    this.x = 7;
  }
}

describe('normalizeBoxSpacing', () => {
  it('leaves non-plain objects unchanged', () => {
    const payload = new SpacingPayload();

    expect(normalizeBoxSpacing(payload)).toBe(payload);
  });
});
