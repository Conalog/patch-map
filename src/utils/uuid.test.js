import { describe, expect, it } from 'vitest';
import { createUUID } from './uuid';

describe('uuid', () => {
  describe('createUUID', () => {
    it('should create a UUID string of length 8', () => {
      const uuid = createUUID();
      expect(uuid).toHaveLength(12);
    });

    it('should create a UUID string containing only alphanumeric characters', () => {
      const uuid = createUUID();
      expect(uuid).toMatch(/^[a-zA-Z0-9]+$/);
    });

    it('should create different UUIDs on multiple calls', () => {
      const uuid1 = createUUID();
      const uuid2 = createUUID();
      expect(uuid1).not.toEqual(uuid2);
    });

    it('should create a new UUID every time it is called.', () => {
      const uuids = new Set();
      for (let i = 0; i < 1000; i++) {
        uuids.add(createUUID());
      }
      expect(uuids.size).toBe(1000);
    });
  });
});
