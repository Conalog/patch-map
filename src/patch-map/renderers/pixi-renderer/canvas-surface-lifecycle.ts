interface InlineStyleSnapshot {
  readonly value: string;
  readonly priority: string;
}

/**
 * Owns the DOM-visible boundary of one Pixi canvas. Package-created canvases
 * remain detached until their first successful render. Caller-owned canvases
 * keep their existing parent and are hidden only for the unpublished staging
 * interval, with their exact inline visibility restored at commit or abort.
 */
export class PatchMapCanvasSurfaceLifecycle {
  private readonly originalParent: ParentNode | null;
  private readonly originalInlineStyle: string;
  private readonly originalVisibility: InlineStyleSnapshot;
  private readonly originalProductMarker: string | undefined;
  private attachedByOwner = false;
  private identityApplied = false;
  private publishedValue = false;
  private destroyedValue = false;

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly target: HTMLElement | undefined,
    private readonly callerOwned: boolean,
  ) {
    this.originalParent = canvas.parentNode;
    this.originalInlineStyle = canvas.style.cssText;
    this.originalVisibility = readInlineStyle(canvas, 'visibility');
    this.originalProductMarker = canvas.dataset.patchMapProduct;
    if (callerOwned) {
      canvas.style.setProperty('visibility', 'hidden', 'important');
    }
  }

  public static stageCallerCanvas(
    canvas: HTMLCanvasElement,
    target?: HTMLElement,
  ): PatchMapCanvasSurfaceLifecycle {
    return new PatchMapCanvasSurfaceLifecycle(canvas, target, true);
  }

  public static ownCreatedCanvas(
    canvas: HTMLCanvasElement,
    target?: HTMLElement,
  ): PatchMapCanvasSurfaceLifecycle {
    return new PatchMapCanvasSurfaceLifecycle(canvas, target, false);
  }

  public get published(): boolean {
    return this.publishedValue;
  }

  /** Apply PatchMap-owned active-surface identity without publishing pixels. */
  public applyRuntimeIdentity(): void {
    if (this.destroyedValue || this.identityApplied) return;
    this.canvas.style.setProperty('touch-action', 'none');
    this.canvas.dataset.patchMapProduct = 'patch-map';
    this.identityApplied = true;
  }

  /** Commit the already-rendered canvas to its user-visible DOM state once. */
  public publish(): boolean {
    if (this.destroyedValue || this.publishedValue) return false;
    if (this.canvas.parentNode === null && this.target !== undefined) {
      this.target.appendChild(this.canvas);
      this.attachedByOwner = true;
    }
    if (this.callerOwned) {
      restoreInlineStyle(this.canvas, 'visibility', this.originalVisibility);
    }
    this.publishedValue = true;
    return true;
  }

  /** Roll an in-task publication back before the browser can paint it. */
  public rollbackPublication(): boolean {
    if (this.destroyedValue || !this.publishedValue) return false;
    if (this.callerOwned) {
      this.canvas.style.setProperty('visibility', 'hidden', 'important');
      if (
        this.attachedByOwner &&
        this.originalParent === null &&
        this.canvas.parentNode === this.target
      ) {
        this.canvas.remove();
        this.attachedByOwner = false;
      }
    } else if (this.attachedByOwner && this.canvas.parentNode === this.target) {
      this.canvas.remove();
      this.attachedByOwner = false;
    }
    this.publishedValue = false;
    return true;
  }

  /** Restore caller ownership or remove a package-created surface. */
  public destroy(): boolean {
    if (this.destroyedValue) return false;
    this.destroyedValue = true;
    if (this.callerOwned) {
      if (
        this.attachedByOwner &&
        this.originalParent === null &&
        this.canvas.parentNode === this.target
      ) {
        this.canvas.remove();
      }
      this.canvas.style.cssText = this.originalInlineStyle;
      if (this.identityApplied) {
        if (this.originalProductMarker === undefined) {
          delete this.canvas.dataset.patchMapProduct;
        } else {
          this.canvas.dataset.patchMapProduct = this.originalProductMarker;
        }
      }
    } else {
      this.canvas.remove();
    }
    return true;
  }
}

function readInlineStyle(
  canvas: HTMLCanvasElement,
  property: string,
): InlineStyleSnapshot {
  return Object.freeze({
    value: canvas.style.getPropertyValue(property),
    priority: canvas.style.getPropertyPriority(property),
  });
}

function restoreInlineStyle(
  canvas: HTMLCanvasElement,
  property: string,
  snapshot: InlineStyleSnapshot,
): void {
  if (snapshot.value.length === 0) {
    canvas.style.removeProperty(property);
    return;
  }
  canvas.style.setProperty(property, snapshot.value, snapshot.priority);
}
