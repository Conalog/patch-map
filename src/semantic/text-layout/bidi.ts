import {
  patchMapIsHardBreak,
  patchMapIsLtrStrong,
  patchMapIsRtlStrong,
} from '../unicode-text-data';
import type {
  PatchMapBidiLine,
  PatchMapBidiRun,
  PatchMapTextDirection,
} from './contracts';
import { freeze, maximum } from './shared';

type PatchMapBidiClusterType = PatchMapTextDirection | 'number' | null;
type PatchMapResolvedBidiClusterType = Exclude<PatchMapBidiClusterType, null>;

export function resolveBidiLines(
  lines: readonly (readonly string[])[],
): readonly PatchMapBidiLine[] {
  return Object.freeze(
    lines.map((line, lineIndex) => {
      const resolved = resolveBidi(line);
      return Object.freeze({
        lineIndex,
        source: line.join(''),
        baseDirection: resolved.baseDirection,
        logicalRuns: resolved.logicalRuns,
        visualRuns: resolved.visualRuns,
        logicalToVisual: resolved.logicalToVisual,
      });
    }),
  );
}

export function emptyBidiLine(): PatchMapBidiLine {
  return Object.freeze({
    lineIndex: 0,
    source: '',
    baseDirection: 'ltr',
    logicalRuns: Object.freeze([]),
    visualRuns: Object.freeze([]),
    logicalToVisual: Object.freeze([]),
  });
}

function resolveBidi(graphemes: readonly string[]): Readonly<{
  baseDirection: PatchMapTextDirection;
  logicalRuns: readonly PatchMapBidiRun[];
  visualRuns: readonly PatchMapBidiRun[];
  logicalToVisual: readonly number[];
}> {
  const content = graphemes.filter((grapheme) => !patchMapIsHardBreak(grapheme));
  const baseDirection = automaticBaseDirection(content);
  const baseLevel = baseDirection === 'rtl' ? 1 : 0;
  const strongDirections = content.map(clusterBidiType);
  const resolvedDirections = resolveNeutralDirections(strongDirections, baseDirection);
  const levels = resolvedDirections.map((resolved) => {
    if (baseLevel === 0) {
      if (resolved === 'rtl') return 1;
      return resolved === 'number' ? 2 : 0;
    }
    return resolved === 'rtl' ? 1 : 2;
  });
  const logicalRuns: PatchMapBidiRun[] = [];
  let start = 0;
  while (start < content.length) {
    const level = levels[start] ?? baseLevel;
    let end = start + 1;
    while (end < content.length && levels[end] === level) end += 1;
    logicalRuns.push(
      freeze({
        text: content.slice(start, end).join(''),
        level,
        direction: level % 2 === 0 ? 'ltr' : 'rtl',
        logicalStart: start,
        logicalEnd: end,
      }),
    );
    start = end;
  }

  const visualLogicalIndexes = content.map((_, index) => index);
  const maxLevel = maximum(levels);
  const oddLevels = levels.filter((level) => level % 2 === 1);
  const lowestOddLevel = oddLevels.length > 0 ? Math.min(...oddLevels) : Number.POSITIVE_INFINITY;
  for (let level = maxLevel; level >= lowestOddLevel; level -= 1) {
    let cursor = 0;
    while (cursor < visualLogicalIndexes.length) {
      while (cursor < visualLogicalIndexes.length && (levels[visualLogicalIndexes[cursor] ?? -1] ?? 0) < level) {
        cursor += 1;
      }
      const runStart = cursor;
      while (cursor < visualLogicalIndexes.length && (levels[visualLogicalIndexes[cursor] ?? -1] ?? 0) >= level) {
        cursor += 1;
      }
      reverseRange(visualLogicalIndexes, runStart, cursor);
    }
  }
  const logicalToVisual = new Array<number>(content.length).fill(0);
  visualLogicalIndexes.forEach((logicalIndex, visualIndex) => {
    logicalToVisual[logicalIndex] = visualIndex;
  });
  const visualRuns = [...logicalRuns].sort(
    (left, right) =>
      minimumVisualIndex(left, logicalToVisual) - minimumVisualIndex(right, logicalToVisual),
  );
  return Object.freeze({
    baseDirection,
    logicalRuns: Object.freeze(logicalRuns),
    visualRuns: Object.freeze(visualRuns),
    logicalToVisual: Object.freeze(logicalToVisual),
  });
}

function automaticBaseDirection(graphemes: readonly string[]): PatchMapTextDirection {
  for (const grapheme of graphemes) {
    const direction = clusterBidiType(grapheme);
    if (direction === 'ltr' || direction === 'rtl') return direction;
  }
  return 'ltr';
}

function clusterBidiType(grapheme: string): PatchMapBidiClusterType {
  let containsNumber = false;
  for (const symbol of grapheme) {
    const codePoint = symbol.codePointAt(0);
    if (codePoint === undefined) continue;
    if (patchMapIsBidiNumber(codePoint)) {
      containsNumber = true;
      continue;
    }
    if (patchMapIsRtlStrong(codePoint)) return 'rtl';
    if (patchMapIsLtrStrong(codePoint)) return 'ltr';
  }
  return containsNumber ? 'number' : null;
}

function resolveNeutralDirections(
  directions: readonly PatchMapBidiClusterType[],
  fallback: PatchMapTextDirection,
): readonly PatchMapResolvedBidiClusterType[] {
  const firstStrong = directions.find(
    (direction): direction is PatchMapTextDirection => direction === 'ltr' || direction === 'rtl',
  ) ?? fallback;
  const result: PatchMapResolvedBidiClusterType[] = [];
  let previousResolved: PatchMapResolvedBidiClusterType | null = null;
  for (const direction of directions) {
    if (direction !== null) previousResolved = direction;
    result.push(direction ?? previousResolved ?? firstStrong);
  }
  return Object.freeze(result);
}

function patchMapIsBidiNumber(codePoint: number): boolean {
  return (
    (codePoint >= 0x0030 && codePoint <= 0x0039) ||
    (codePoint >= 0x0660 && codePoint <= 0x0669) ||
    (codePoint >= 0x06f0 && codePoint <= 0x06f9)
  );
}

function minimumVisualIndex(run: PatchMapBidiRun, logicalToVisual: readonly number[]): number {
  let result = Number.POSITIVE_INFINITY;
  for (let index = run.logicalStart; index < run.logicalEnd; index += 1) {
    result = Math.min(result, logicalToVisual[index] ?? Number.POSITIVE_INFINITY);
  }
  return result;
}

function reverseRange(values: number[], start: number, end: number): void {
  let left = start;
  let right = end - 1;
  while (left < right) {
    const value = values[left];
    if (value === undefined) break;
    values[left] = values[right] ?? value;
    values[right] = value;
    left += 1;
    right -= 1;
  }
}
