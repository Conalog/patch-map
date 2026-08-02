import type { SlotRange } from '../dense/contracts';

/** Convert arbitrary dense slots into stable, non-overlapping upload ranges. */
export function contiguousSlotRanges(
  slots: readonly number[],
): readonly SlotRange[] {
  const ordered = [...new Set(slots)].sort((left, right) => left - right);
  const ranges: SlotRange[] = [];
  for (const slot of ordered) {
    const previous = ranges.at(-1);
    if (previous?.end === slot) {
      ranges[ranges.length - 1] = Object.freeze({
        start: previous.start,
        end: slot + 1,
      });
    } else {
      ranges.push(Object.freeze({ start: slot, end: slot + 1 }));
    }
  }
  return Object.freeze(ranges);
}

/** Merge already-ranged upload work without expanding ranges back to slots. */
export function mergeSlotRanges(
  left: readonly SlotRange[],
  right: readonly SlotRange[],
): readonly SlotRange[] {
  const ordered = [...left, ...right]
    .filter(({ start, end }) => end > start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const ranges: SlotRange[] = [];
  for (const range of ordered) {
    const previous = ranges.at(-1);
    if (previous !== undefined && range.start <= previous.end) {
      if (range.end > previous.end) {
        ranges[ranges.length - 1] = Object.freeze({
          start: previous.start,
          end: range.end,
        });
      }
    } else {
      ranges.push(Object.freeze({ start: range.start, end: range.end }));
    }
  }
  return Object.freeze(ranges);
}
