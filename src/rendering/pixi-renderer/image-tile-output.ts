import { Matrix, RenderTexture, type Container, type WebGLRenderer } from 'pixi.js';
import { PatchMapRendererRuntimeError } from '../contracts/options';

const TILE_SIZE = 2048;

/** Image-only raster resources. Logical scene preparation remains with the renderer. */
export class PatchMapPixiImageTileOutput {
  public readonly canvas = document.createElement('canvas');
  private context: CanvasRenderingContext2D | null = null;
  private work: RenderTexture | null = null;
  private readback: Uint8Array<ArrayBuffer> | null = null;
  private readonly transform = new Matrix();
  private pixelRatio = 1;

  public constructor(private readonly renderer: WebGLRenderer, width: number, height: number, pixelRatio: number) {
    this.resize(width, height, pixelRatio);
  }

  public resize(width: number, height: number, pixelRatio: number): void {
    this.releaseWork();
    this.canvas.width = Math.round(width * pixelRatio);
    this.canvas.height = Math.round(height * pixelRatio);
    this.pixelRatio = pixelRatio;
  }

  public render(stage: Container): void {
    const context = this.context ??= this.canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new PatchMapRendererRuntimeError('UNSUPPORTED_RUNTIME', 'Image output requires a 2D canvas');
    const width = this.canvas.width;
    const height = this.canvas.height;
    const work = this.work ??= RenderTexture.create({
      width: Math.min(width, TILE_SIZE), height: Math.min(height, TILE_SIZE),
      resolution: 1, antialias: true,
    });
    const readback = this.readback ??= new Uint8Array(work.width * work.height * 4);
    const background = this.renderer.background.colorRgba;
    // Offscreen clears bypass Pixi's premultiplied blend path.
    const alpha = background[3];
    const clearColor = [background[0] * alpha, background[1] * alpha, background[2] * alpha, alpha];
    for (let y = 0; y < height; y += work.height) {
      for (let x = 0; x < width; x += work.width) {
        this.assertAvailable();
        this.transform.set(this.pixelRatio, 0, 0, this.pixelRatio, -x, -y);
        this.renderer.render({ container: stage, target: work, clear: true, clearColor, transform: this.transform });
        this.assertAvailable();
        if (x === 0 && y === 0) {
          const gl = this.renderer.gl;
          if (gl.getParameter(gl.SAMPLES) !== 4 || gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            throw new PatchMapRendererRuntimeError('UNSUPPORTED_RUNTIME', 'Image output requires a complete AA4 render target');
          }
        }
        // Pixi's renderEnd resolves the AA target before render() returns.
        const tileWidth = Math.min(work.width, width - x);
        const tileHeight = Math.min(work.height, height - y);
        this.readPixels(work, tileWidth, tileHeight, readback);
        // Edge tiles use an exact-length view of the same backing buffer.
        const pixels = new Uint8ClampedArray(readback.buffer, 0, tileWidth * tileHeight * 4);
        // WebGL readback is premultiplied; ImageData uses straight alpha.
        if (alpha < 1) {
          for (let offset = 0; offset < pixels.length; offset += 4) {
            const alpha = pixels[offset + 3]!;
            if (alpha === 0 || alpha === 255) continue;
            const factor = 255 / alpha;
            pixels[offset] = Math.round(pixels[offset]! * factor);
            pixels[offset + 1] = Math.round(pixels[offset + 1]! * factor);
            pixels[offset + 2] = Math.round(pixels[offset + 2]! * factor);
          }
        }
        const image = new ImageData(pixels, tileWidth, tileHeight);
        context.putImageData(image, x, y);
      }
    }
  }

  public destroy(): void {
    this.releaseWork();
    this.canvas.width = 0;
    this.canvas.height = 0;
    this.context = null;
    this.canvas.remove();
  }

  private releaseWork(): void {
    this.readback = null;
    this.work?.destroy(true);
    this.work = null;
  }

  private readPixels(work: RenderTexture, width: number, height: number, pixels: Uint8Array<ArrayBuffer>): void {
    const target = this.renderer.renderTarget.getRenderTarget(work);
    const gpuTarget = this.renderer.renderTarget.getGpuRenderTarget(target);
    const gl = this.renderer.gl;
    // Select only the resolved read framebuffer; preserve Pixi's draw target.
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, gpuTarget.resolveTargetFramebuffer);
    try {
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const error = gl.getError();
      this.assertAvailable();
      // A failed read may leave previous tile bytes in the reusable buffer.
      if (error !== gl.NO_ERROR) throw new Error(`Image tile readback failed (WebGL error ${error})`);
    } finally {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, gpuTarget.framebuffer);
    }
  }

  private assertAvailable(): void {
    if (this.renderer.gl.isContextLost()) {
      throw new PatchMapRendererRuntimeError('RENDERER_LOST', 'WebGL2 context lost during image tile rendering');
    }
  }
}
