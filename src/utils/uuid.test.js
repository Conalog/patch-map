import { describe, expect, it } from 'vitest';
import { uid } from './uuid';

describe('uuid', () => {
  describe('createUUID', () => {
    it('should create a UUID string of length 15', () => {
      const uuid = uid();
      expect(uuid).toHaveLength(15);
    });

    it('should create a UUID string containing only alphanumeric characters', () => {
      const uuid = uid();
      expect(uuid).toMatch(/^[a-zA-Z0-9]+$/);
    });

    it('should create different UUIDs on multiple calls', () => {
      const uuid1 = uid();
      const uuid2 = uid();
      expect(uuid1).not.toEqual(uuid2);
    });

    it('should create a new UUID every time it is called.', () => {
      const size = 100000;
      const uuids = new Set();
      for (let i = 0; i < size; i++) {
        uuids.add(uid());
      }
      expect(uuids.size).toBe(size);
    });
  });
});
