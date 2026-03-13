import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dataDocs = readFileSync(resolve(currentDir, 'data.d.ts'), 'utf8');

describe('data.d.ts schema documentation', () => {
  it('should distinguish component text styles from standalone element text styles', () => {
    expect(dataDocs).toContain('style?: LabelTextStyle;');
    expect(dataDocs).toContain('style?: ElementTextStyle;');
    expect(dataDocs).toContain('export interface LabelTextStyle');
    expect(dataDocs).toContain('export interface ElementTextStyle');
  });

  it('should document standalone rect styles with the same helper types as the schemas', () => {
    expect(dataDocs).toContain('stroke?: StrokeStyle;');
    expect(dataDocs).toContain('radius?: number | EachRadius;');
    expect(dataDocs).toContain('export interface StrokeStyle');
    expect(dataDocs).toContain('export interface EachRadius');
  });

  it('should document texture radius with the same per-corner shape as the schema', () => {
    expect(dataDocs).toContain('radius?: number | EachRadius');
  });
});
