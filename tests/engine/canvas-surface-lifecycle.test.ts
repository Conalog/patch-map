import { describe, expect, it } from 'vitest';

import { PatchMapCanvasSurfaceLifecycle } from '../../src/rendering/pixi-renderer/canvas-surface-lifecycle';

describe('PatchMapCanvasSurfaceLifecycle', () => {
  it('keeps a package-created canvas detached until one publication and removes it on destroy', () => {
    const target = new FakeParent();
    const canvas = new FakeCanvas();
    const lifecycle = PatchMapCanvasSurfaceLifecycle.ownCreatedCanvas(
      canvas as unknown as HTMLCanvasElement,
      target as unknown as HTMLElement,
    );

    lifecycle.applyRuntimeIdentity();
    expect(canvas.parentNode).toBeNull();
    expect(canvas.style.getPropertyValue('touch-action')).toBe('none');
    expect(canvas.dataset.patchMapProduct).toBe('patch-map');

    expect(lifecycle.publish()).toBe(true);
    expect(lifecycle.publish()).toBe(false);
    expect(target.children).toEqual([canvas]);
    expect(target.appendCount).toBe(1);

    expect(lifecycle.destroy()).toBe(true);
    expect(lifecycle.destroy()).toBe(false);
    expect(canvas.parentNode).toBeNull();
    expect(target.children).toEqual([]);
  });

  it('stages an attached caller canvas without moving it and restores exact inline ownership', () => {
    const originalParent = new FakeParent();
    const foreignTarget = new FakeParent();
    const canvas = new FakeCanvas();
    canvas.style.setProperty('visibility', 'visible', 'important');
    canvas.style.setProperty('touch-action', 'pan-x');
    canvas.style.setProperty('border', '3px solid red');
    const originalInlineStyle = canvas.style.cssText;
    canvas.dataset.patchMapProduct = 'caller-marker';
    originalParent.appendChild(canvas);

    const lifecycle = PatchMapCanvasSurfaceLifecycle.stageCallerCanvas(
      canvas as unknown as HTMLCanvasElement,
      foreignTarget as unknown as HTMLElement,
    );
    expect(canvas.parentNode).toBe(originalParent);
    expect(canvas.style.getPropertyValue('visibility')).toBe('hidden');
    expect(canvas.style.getPropertyPriority('visibility')).toBe('important');

    lifecycle.applyRuntimeIdentity();
    canvas.style.setProperty('width', '180px');
    expect(lifecycle.publish()).toBe(true);
    expect(canvas.parentNode).toBe(originalParent);
    expect(foreignTarget.children).toEqual([]);
    expect(canvas.style.getPropertyValue('visibility')).toBe('visible');
    expect(canvas.style.getPropertyPriority('visibility')).toBe('important');
    expect(canvas.style.getPropertyValue('border')).toBe('3px solid red');
    expect(canvas.style.getPropertyValue('touch-action')).toBe('none');

    lifecycle.destroy();
    expect(canvas.parentNode).toBe(originalParent);
    expect(canvas.style.getPropertyValue('visibility')).toBe('visible');
    expect(canvas.style.getPropertyPriority('visibility')).toBe('important');
    expect(canvas.style.getPropertyValue('touch-action')).toBe('pan-x');
    expect(canvas.style.getPropertyValue('border')).toBe('3px solid red');
    expect(canvas.dataset.patchMapProduct).toBe('caller-marker');
    expect(canvas.style.cssText).toBe(originalInlineStyle);
  });

  it('restores a detached caller canvas to detached ownership after package installation', () => {
    const target = new FakeParent();
    const canvas = new FakeCanvas();
    const lifecycle = PatchMapCanvasSurfaceLifecycle.stageCallerCanvas(
      canvas as unknown as HTMLCanvasElement,
      target as unknown as HTMLElement,
    );

    expect(canvas.style.getPropertyValue('visibility')).toBe('hidden');
    lifecycle.publish();
    expect(canvas.parentNode).toBe(target);
    expect(canvas.style.getPropertyValue('visibility')).toBe('');

    lifecycle.destroy();
    expect(canvas.parentNode).toBeNull();
    expect(target.children).toEqual([]);
    expect(canvas.style.getPropertyValue('visibility')).toBe('');
  });

  it('restores caller styles without attaching when initialization aborts before publication', () => {
    const originalParent = new FakeParent();
    const target = new FakeParent();
    const canvas = new FakeCanvas();
    canvas.style.setProperty('visibility', 'collapse');
    canvas.style.setProperty('touch-action', 'manipulation', 'important');
    originalParent.appendChild(canvas);
    const lifecycle = PatchMapCanvasSurfaceLifecycle.stageCallerCanvas(
      canvas as unknown as HTMLCanvasElement,
      target as unknown as HTMLElement,
    );

    lifecycle.applyRuntimeIdentity();
    expect(lifecycle.destroy()).toBe(true);
    expect(canvas.parentNode).toBe(originalParent);
    expect(target.children).toEqual([]);
    expect(canvas.style.getPropertyValue('visibility')).toBe('collapse');
    expect(canvas.style.getPropertyValue('touch-action')).toBe('manipulation');
    expect(canvas.style.getPropertyPriority('touch-action')).toBe('important');
    expect(canvas.dataset.patchMapProduct).toBeUndefined();
  });

  it('rolls a published surface back to an unpublished state before abort cleanup', () => {
    const target = new FakeParent();
    const canvas = new FakeCanvas();
    const lifecycle = PatchMapCanvasSurfaceLifecycle.ownCreatedCanvas(
      canvas as unknown as HTMLCanvasElement,
      target as unknown as HTMLElement,
    );

    lifecycle.publish();
    expect(canvas.parentNode).toBe(target);
    expect(lifecycle.rollbackPublication()).toBe(true);
    expect(lifecycle.rollbackPublication()).toBe(false);
    expect(canvas.parentNode).toBeNull();
    expect(lifecycle.published).toBe(false);
  });
});

class FakeStyle {
  private readonly values = new Map<string, Readonly<{ value: string; priority: string }>>();

  public get cssText(): string {
    return [...this.values].map(([property, entry]) =>
      `${property}: ${entry.value}${entry.priority === '' ? '' : ` !${entry.priority}`};`
    ).join(' ');
  }

  public set cssText(value: string) {
    this.values.clear();
    for (const declaration of value.split(';')) {
      const separator = declaration.indexOf(':');
      if (separator < 0) continue;
      const property = declaration.slice(0, separator).trim();
      const rawValue = declaration.slice(separator + 1).trim();
      if (property.length === 0 || rawValue.length === 0) continue;
      const important = /\s*!important$/u.test(rawValue);
      this.setProperty(
        property,
        rawValue.replace(/\s*!important$/u, ''),
        important ? 'important' : '',
      );
    }
  }

  public getPropertyValue(property: string): string {
    return this.values.get(property)?.value ?? '';
  }

  public getPropertyPriority(property: string): string {
    return this.values.get(property)?.priority ?? '';
  }

  public setProperty(property: string, value: string, priority = ''): void {
    this.values.set(property, Object.freeze({ value, priority }));
  }

  public removeProperty(property: string): string {
    const previous = this.getPropertyValue(property);
    this.values.delete(property);
    return previous;
  }
}

class FakeParent {
  public readonly children: FakeCanvas[] = [];
  public appendCount = 0;

  public appendChild(canvas: FakeCanvas): FakeCanvas {
    canvas.parentNode?.removeChild(canvas);
    this.children.push(canvas);
    canvas.parentNode = this;
    this.appendCount += 1;
    return canvas;
  }

  public removeChild(canvas: FakeCanvas): FakeCanvas {
    const index = this.children.indexOf(canvas);
    if (index >= 0) this.children.splice(index, 1);
    if (canvas.parentNode === this) canvas.parentNode = null;
    return canvas;
  }
}

class FakeCanvas {
  public parentNode: FakeParent | null = null;
  public readonly style = new FakeStyle();
  public readonly dataset: Record<string, string | undefined> = {};

  public remove(): void {
    this.parentNode?.removeChild(this);
  }
}
