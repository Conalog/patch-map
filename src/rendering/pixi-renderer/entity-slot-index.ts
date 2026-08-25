import type { SlotRange } from '../../dense/contracts';
import {
  RenderFlags,
  RenderKind,
  type RenderStoreView,
} from '../../dense/renderer-types';

export class PatchMapPixiEntitySlotIndexAuthority {
  private readonly entityIdBySlot = new Map<number, string>();
  public readonly slotByEntityId = new Map<string, number>();
  private readonly textEntityIdBySlot = new Map<number, string>();
  public readonly textVisibilityByEntityId = new Map<string, boolean>();

  public syncTextVisibility(
    store: RenderStoreView,
    ranges: readonly SlotRange[] | undefined,
  ): void {
    const slots = ranges === undefined
      ? Array.from({ length: store.capacity }, (_value, slot) => slot)
      : slotsForRanges(store.capacity, ranges);
    if (ranges === undefined) {
      this.textEntityIdBySlot.clear();
      this.textVisibilityByEntityId.clear();
    }
    for (const slot of slots) {
      const previousEntityId = this.textEntityIdBySlot.get(slot);
      if (previousEntityId !== undefined) {
        this.textEntityIdBySlot.delete(slot);
        this.textVisibilityByEntityId.delete(previousEntityId);
      }
      if (store.alive[slot] !== 1 || store.kind[slot] !== RenderKind.Text) continue;
      const entityId = store.ids[slot];
      if (!entityId) continue;
      this.textEntityIdBySlot.set(slot, entityId);
      this.textVisibilityByEntityId.set(
        entityId,
        ((store.flags[slot] ?? 0) & RenderFlags.Visible) !== 0,
      );
    }
  }

  public syncEntitySlots(
    store: RenderStoreView,
    ranges: readonly SlotRange[] | undefined,
  ): void {
    const slots = ranges === undefined
      ? Array.from({ length: store.capacity }, (_value, slot) => slot)
      : slotsForRanges(store.capacity, ranges);
    if (ranges === undefined) {
      this.entityIdBySlot.clear();
      this.slotByEntityId.clear();
    }
    for (const slot of slots) {
      const previousEntityId = this.entityIdBySlot.get(slot);
      if (previousEntityId !== undefined) {
        this.entityIdBySlot.delete(slot);
        if (this.slotByEntityId.get(previousEntityId) === slot) {
          this.slotByEntityId.delete(previousEntityId);
        }
      }
      if ((store.alive[slot] ?? 0) !== 1) continue;
      const entityId = store.ids[slot];
      if (entityId === undefined) continue;
      this.entityIdBySlot.set(slot, entityId);
      this.slotByEntityId.set(entityId, slot);
    }
  }

  public destroy(): void {
    this.entityIdBySlot.clear();
    this.slotByEntityId.clear();
    this.textEntityIdBySlot.clear();
    this.textVisibilityByEntityId.clear();
  }
}

function slotsForRanges(capacity: number, ranges: readonly SlotRange[]): readonly number[] {
  const slots: number[] = [];
  for (const range of ranges) {
    const start = Math.max(0, Math.min(capacity, range.start));
    const end = Math.max(start, Math.min(capacity, range.end));
    for (let slot = start; slot < end; slot += 1) slots.push(slot);
  }
  return slots;
}
