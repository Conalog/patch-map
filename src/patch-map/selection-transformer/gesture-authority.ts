import {
  PATCH_MAP_SELECTION_TRANSFORMER_REVISION,
  type PatchMapTransformerGestureProbe,
  type PatchMapTransformerHandle,
  type PatchMapTransformerInputFamily,
} from './contracts';

interface ActiveTransformerGesture {
  readonly pointerId: number;
  readonly handle: PatchMapTransformerHandle;
}

interface MutableGestureDeliveries {
  selection: number;
  pan: number;
  hover: number;
  contextMenu: number;
  transform: number;
}

/**
 * One root transformer gesture record. It does not own entity listeners,
 * timers, tickers, or renderer objects; it only arbitrates input families.
 */
export class PatchMapTransformerGestureAuthority {
  private active: ActiveTransformerGesture | null = null;
  private readonly deliveries: MutableGestureDeliveries = {
    selection: 0,
    pan: 0,
    hover: 0,
    contextMenu: 0,
    transform: 0,
  };
  private staleCompletionCount = 0;
  private destroyed = false;

  public begin(pointerId: number, handle: PatchMapTransformerHandle): void {
    this.assertAlive('begin');
    validatePointerId(pointerId);
    validateHandle(handle);
    if (this.active !== null) throw new Error('PatchMap transformer already owns a gesture');
    this.active = Object.freeze({ pointerId, handle });
  }

  public owns(pointerId: number): boolean {
    return !this.destroyed && this.active?.pointerId === pointerId;
  }

  public route(
    pointerId: number,
    family: PatchMapTransformerInputFamily,
  ): Readonly<{ readonly owner: 'transformer' | 'canvas'; readonly deliveryCount: 0 | 1 }> {
    validatePointerId(pointerId);
    if (!['selection', 'pan', 'hover', 'context-menu', 'transform'].includes(family)) {
      throw new TypeError('transformer input family is unsupported');
    }
    if (!this.owns(pointerId)) {
      return Object.freeze({ owner: 'canvas', deliveryCount: 1 });
    }
    if (family === 'transform') {
      this.deliveries.transform += 1;
      return Object.freeze({ owner: 'transformer', deliveryCount: 1 });
    }
    return Object.freeze({ owner: 'transformer', deliveryCount: 0 });
  }

  public complete(pointerId: number): boolean {
    validatePointerId(pointerId);
    if (!this.owns(pointerId)) {
      this.staleCompletionCount += 1;
      return false;
    }
    this.active = null;
    return true;
  }

  public cancel(pointerId: number): boolean {
    return this.complete(pointerId);
  }

  public interrupt(): boolean {
    if (this.active === null) return false;
    this.active = null;
    return true;
  }

  public probe(): PatchMapTransformerGestureProbe {
    return Object.freeze({
      schemaRevision: PATCH_MAP_SELECTION_TRANSFORMER_REVISION,
      activeGestureCount: this.active === null ? 0 : 1,
      pointerCaptureCount: this.active === null ? 0 : 1,
      activePointerId: this.active?.pointerId ?? null,
      activeHandle: this.active?.handle ?? null,
      selectionDeliveryCount: this.deliveries.selection,
      panDeliveryCount: this.deliveries.pan,
      hoverDeliveryCount: this.deliveries.hover,
      contextMenuDeliveryCount: this.deliveries.contextMenu,
      transformDeliveryCount: this.deliveries.transform,
      staleCompletionCount: this.staleCompletionCount,
      destroyed: this.destroyed,
    });
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.active = null;
    this.destroyed = true;
  }

  private assertAlive(operation: string): void {
    if (this.destroyed) {
      throw new Error(`PatchMap transformer gesture authority is destroyed (${operation})`);
    }
  }
}

function validatePointerId(pointerId: number): void {
  if (!Number.isSafeInteger(pointerId) || pointerId < 0) {
    throw new RangeError('transformer pointerId must be a non-negative safe integer');
  }
}

function validateHandle(handle: PatchMapTransformerHandle): void {
  if (!['nw', 'ne', 'sw', 'se', 'n', 'e', 's', 'w', 'frame', 'rotate'].includes(handle)) {
    throw new TypeError('transformer handle is unsupported');
  }
}
