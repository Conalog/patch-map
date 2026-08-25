import type { SlotRange } from '../dense/contracts';

const EMPTY_SLOT_RANGES: readonly SlotRange[] = Object.freeze([]);

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

/**
 * Core hot-path variant that sorts a caller-owned scratch array in place.
 * This avoids cloning and constructing a Set for every animation frame.
 */
export function contiguousSlotRangesInPlace(
  slots: number[],
): readonly SlotRange[] {
  if (slots.length === 0) return EMPTY_SLOT_RANGES;
  slots.sort(compareNumbers);
  const ranges: SlotRange[] = [];
  let start = slots[0] ?? 0;
  let end = start + 1;
  for (let index = 1; index < slots.length; index += 1) {
    const slot = slots[index] ?? end;
    if (slot < end) continue;
    if (slot === end) {
      end = slot + 1;
      continue;
    }
    ranges.push(Object.freeze({ start, end }));
    start = slot;
    end = slot + 1;
  }
  ranges.push(Object.freeze({ start, end }));
  return Object.freeze(ranges);
}

function compareNumbers(left: number, right: number): number {
  return left - right;
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
