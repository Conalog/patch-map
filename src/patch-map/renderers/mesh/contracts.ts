import type { Matrix } from 'pixi.js';

export interface AggregateViewportBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface AggregateViewportCull {
  readonly matrix: Matrix;
  readonly width: number;
  readonly height: number;
  readonly padding: number;
}
