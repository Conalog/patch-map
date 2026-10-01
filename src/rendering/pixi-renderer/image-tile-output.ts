import { Matrix, Rectangle, RenderTexture, Texture, type Container, type WebGLRenderer } from 'pixi.js';
import { PatchMapRendererRuntimeError } from '../contracts/options';

const TILE_SIZE = 2048;

/** Image-only raster resources. Logical scene preparation remains with the renderer. */
export class PatchMapPixiImageTileOutput {
  public readonly canvas = document.createElement('canvas');
  private context: CanvasRenderingContext2D | null = null;
  private work: RenderTexture | null = null;
  private readView: Texture | null = null;
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
    const view = this.readView ??= new Texture({ source: work.source, frame: new Rectangle() });
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
        // Resolve MSAA before reading the shared texture; extract.pixels does not resolve it.
        this.renderer.renderTarget.finishRenderPass();
        view.frame.width = Math.min(work.width, width - x);
        view.frame.height = Math.min(work.height, height - y);
        view.updateUvs();
        const { pixels, width: tileWidth, height: tileHeight } = this.renderer.extract.pixels(view);
        this.assertAvailable();
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
        // Pixi readPixels allocates an ArrayBuffer-backed array.
        const image = new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, tileWidth, tileHeight);
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
    this.readView?.destroy(false);
    this.readView = null;
    this.work?.destroy(true);
    this.work = null;
  }

  private assertAvailable(): void {
    if (this.renderer.gl.isContextLost()) {
      throw new PatchMapRendererRuntimeError('RENDERER_LOST', 'WebGL2 context lost during image tile rendering');
    }
  }
}
