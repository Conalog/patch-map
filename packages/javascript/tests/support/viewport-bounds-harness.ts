import { type Container, Matrix } from 'pixi.js';
import { PatchMapScene } from '../../src/core/scene';
import { PatchMap } from '../../src/engine';
import { parsePatchMap } from '../../src/parsing';
import type { ParsePatchMapResult } from '../../src/parsing/contracts';
import { createPatchMapApi } from '../../src/public';
import { PatchMapSurfaceGeometryAuthority } from '../../src/composition/surface-geometry-authority';
import { TransactionSurface } from './engine-update-transaction-surface';

export async function createViewportBoundsHarness(data: unknown, screenFirst = false) {
  const surface = new ParsedViewportSurface({ width: 320, height: 1000, pixelRatio: 1 });
  const engine = new PatchMap({ surfaceFactory: () => Promise.resolve(surface) });
  await engine.initialize({ instanceId: 'logical-bounds', width: 320, height: 1000, zoomLimits: [0.1, 8] });
  engine.loadDataset(data);
  if (screenFirst) surface.geometrySnapshot();
  return { api: createPatchMapApi(engine), engine, surface };
}

class ParsedViewportSurface extends TransactionSurface {
  private readonly scene = new PatchMapScene();
  private parsed: ParsePatchMapResult | null = null;
  private readonly geometry: PatchMapSurfaceGeometryAuthority;
  public constructor(options: ConstructorParameters<typeof TransactionSurface>[0]) {
    super(options);
    const projection = () => this.parsed?.projection ?? null;
    this.geometry = new PatchMapSurfaceGeometryAuthority({
      get visibleProjection() { return projection(); },
      snapshot: () => this.scene.snapshot(),
      selection: () => this.scene.selection(),
    } as ConstructorParameters<typeof PatchMapSurfaceGeometryAuthority>[0]);
  }
  public override load(input: unknown): void {
    super.load(input);
    this.parsed = parsePatchMap(input);
    this.scene.load(this.parsed.document);
    this.geometry.invalidateProjection(this.parsed.projection);
  }
  public override setView(view: Parameters<TransactionSurface['setView']>[0]): void {
    super.setView(view);
    this.geometry.updateRootView(view);
  }
  public geometrySnapshot() { return this.geometry.geometrySnapshot(); }
  public worldGeometrySnapshot() {
    return this.geometry.worldGeometrySnapshot();
  }
  public override destroy(): Promise<boolean> {
    this.geometry.invalidateProjection(null);
    this.parsed = null;
    this.scene.destroy();
    return super.destroy();
  }
}

// main's getObjectWorldCorners: take the container's local bounds, then
// transform all four corners. This oracle uses Pixi rather than the new helper.
export function mainBounds(container: Container): readonly [number, number, number, number] {
  const bounds = container.getLocalBounds();
  // main falls back to child world corners when the container has no area.
  if (!(bounds.width > 0 || bounds.height > 0) && container.children.length > 0) {
    const children = container.children.map((child) => mainBounds(child));
    const left = Math.min(...children.map(([x]) => x));
    const top = Math.min(...children.map(([, y]) => y));
    return [left, top,
      Math.max(...children.map(([x, , width]) => x + width)) - left,
      Math.max(...children.map(([, y, , height]) => y + height)) - top];
  }
  const matrix = container.getGlobalTransform(new Matrix(), false);
  const points = [
    [bounds.x, bounds.y], [bounds.x + bounds.width, bounds.y],
    [bounds.x + bounds.width, bounds.y + bounds.height], [bounds.x, bounds.y + bounds.height],
  ].map(([x, y]) => matrix.apply({ x: x!, y: y! }));
  const left = Math.min(...points.map(({ x }) => x));
  const top = Math.min(...points.map(({ y }) => y));
  return [left, top, Math.max(...points.map(({ x }) => x)) - left, Math.max(...points.map(({ y }) => y)) - top];
}
