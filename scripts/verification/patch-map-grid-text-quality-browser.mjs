#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = process.cwd();
const outputPath = path.resolve(process.env.PATCH_MAP_GRID_TEXT_QUALITY_OUTPUT ??
  '.artifacts/performance/grid-text-quality/latest.json');
const zooms = [1, 10];
const pixelRatios = [1, 2];
let server;
let browser;

try {
  server = await createServer({
    root,
    configFile: path.join(root, 'vite.lab.config.ts'),
    logLevel: 'error',
  });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  if (!baseUrl) throw new Error('PatchMap grid text quality server has no URL');
  browser = await chromium.launch({ headless: true });
  const results = [];
  for (const pixelRatio of pixelRatios) {
    for (const zoom of zooms) {
      const page = await browser.newPage({ viewport: { width: 1_800, height: 900 } });
      const errors = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(`console: ${message.text()}`);
      });
      page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
      await page.goto(
        new URL('scripts/verification/patch-map-public-animation-performance.html', baseUrl).href,
        { waitUntil: 'networkidle', timeout: 120_000 },
      );
      await page.waitForFunction(() => window.__PATCH_MAP_PUBLIC_ANIMATION_MODULE__, undefined, {
        timeout: 120_000,
      });
      const result = await page.evaluate(async ({ pixelRatio: dpr, zoom: scale }) => {
        const { PatchMap } = window.__PATCH_MAP_PUBLIC_ANIMATION_MODULE__;
        const width = 1_800;
        const height = 900;
        const text = 'INV2\nDC2\nMPPT4\nSTR4\n7';
        const style = {
          fontFamily: 'FiraCode',
          fontWeight: '600',
          fontSize: 'auto',
          autoFont: { min: 8, max: 14 },
          align: 'center',
          wordWrap: true,
          breakWords: false,
          wordWrapWidth: 'auto',
        };
        const data = [{
          type: 'grid',
          id: 'quality-grid',
          attrs: { x: 80, y: 80 },
          cells: [[1, 1]],
          gap: 20,
          item: {
            size: { width: 40, height: 80 },
            components: [{
              type: 'text',
              id: 'value',
              text,
              margin: 4,
              tint: '#ffffff',
              style,
            }],
          },
        }];
        const host = document.querySelector('#patch-map-performance-host');
        Object.assign(host.style, { width: width + 'px', height: height + 'px' });
        const inputBefore = JSON.stringify(data);
        const map = await PatchMap.mount({
          container: host,
          width,
          height,
          pixelRatio: dpr,
          backend: 'webgl',
          antialias: false,
          resizeMode: 'manual',
          fit: false,
          background: '#000000',
          data,
        });
        const snapshotBefore = JSON.stringify(map.data.snapshot());
        const historyBefore = JSON.stringify(map.history.state);
        const semanticHashBefore = map.debug.snapshot().semanticHash;
        const overlay = map.update({
          id: 'quality-grid.0.1',
          text: {
            componentId: 'value',
            text,
            style,
            changes: { show: true, margin: 4, tint: '#ffffff' },
          },
        });
        if (scale !== 1) map.viewport.zoomBy(scale, [0, 0]);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const capture = await map.capture.png();
        const image = new Image();
        image.src = capture.dataUrl;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const viewport = map.viewport.snapshot();
        const screen = (x, y) => [x * viewport.scale * dpr, y * viewport.scale * dpr];
        const box = (x) => {
          const [minX, minY] = screen(x + 4, 84);
          const [maxX, maxY] = screen(x + 36, 156);
          return { minX, minY, maxX, maxY };
        };
        const authoredBox = box(80);
        const overlayBox = box(140);
        const analyze = (expected) => {
          let pixelCount = 0;
          const measured = {
            minX: Number.POSITIVE_INFINITY,
            minY: Number.POSITIVE_INFINITY,
            maxX: Number.NEGATIVE_INFINITY,
            maxY: Number.NEGATIVE_INFINITY,
          };
          for (let offset = 0; offset < pixels.length; offset += 4) {
            const alpha = pixels[offset + 3];
            const light = Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
            if (alpha > 96 && light > 96) {
              const index = offset / 4;
              const x = index % canvas.width;
              const y = Math.floor(index / canvas.width);
              if (
                x >= expected.minX - 8 * dpr && x <= expected.maxX + 8 * dpr &&
                y >= expected.minY - 8 * dpr && y <= expected.maxY + 8 * dpr
              ) {
                pixelCount += 1;
                measured.minX = Math.min(measured.minX, x);
                measured.minY = Math.min(measured.minY, y);
                measured.maxX = Math.max(measured.maxX, x);
                measured.maxY = Math.max(measured.maxY, y);
              }
            }
          }
          const bounds = pixelCount === 0 ? null : measured;
          const intrusion = bounds === null ? null : {
            left: Math.max(0, expected.minX - bounds.minX),
            top: Math.max(0, expected.minY - bounds.minY),
            right: Math.max(0, bounds.maxX + 1 - expected.maxX),
            bottom: Math.max(0, bounds.maxY + 1 - expected.maxY),
          };
          let gradientSquared = 0;
          let luminance = 0;
          const minX = Math.max(1, Math.floor(expected.minX));
          const maxX = Math.min(canvas.width - 2, Math.ceil(expected.maxX));
          const minY = Math.max(1, Math.floor(expected.minY));
          const maxY = Math.min(canvas.height - 2, Math.ceil(expected.maxY));
          const lightAt = (x, y) => {
            const offset = (y * canvas.width + x) * 4;
            return (pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3;
          };
          for (let y = minY; y <= maxY; y += 1) {
            for (let x = minX; x <= maxX; x += 1) {
              const light = lightAt(x, y);
              const dx = lightAt(x + 1, y) - lightAt(x - 1, y);
              const dy = lightAt(x, y + 1) - lightAt(x, y - 1);
              luminance += light;
              gradientSquared += dx * dx + dy * dy;
            }
          }
          return {
            expected,
            bounds,
            intrusion,
            pixelCount,
            acutance: luminance === 0 ? 0 : gradientSquared / luminance,
          };
        };
        const debug = map.debug.snapshot();
        const allWhiteBounds = {
          minX: Number.POSITIVE_INFINITY,
          minY: Number.POSITIVE_INFINITY,
          maxX: Number.NEGATIVE_INFINITY,
          maxY: Number.NEGATIVE_INFINITY,
        };
        for (let offset = 0; offset < pixels.length; offset += 4) {
          const light = Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
          if (pixels[offset + 3] > 96 && light > 96) {
            const index = offset / 4;
            const x = index % canvas.width;
            const y = Math.floor(index / canvas.width);
            allWhiteBounds.minX = Math.min(allWhiteBounds.minX, x);
            allWhiteBounds.minY = Math.min(allWhiteBounds.minY, y);
            allWhiteBounds.maxX = Math.max(allWhiteBounds.maxX, x);
            allWhiteBounds.maxY = Math.max(allWhiteBounds.maxY, y);
          }
        }
        const immutable = {
          input: JSON.stringify(data) === inputBefore,
          snapshot: JSON.stringify(map.data.snapshot()) === snapshotBefore,
          history: JSON.stringify(map.history.state) === historyBefore,
          semanticHash: map.debug.snapshot().semanticHash === semanticHashBefore,
        };
        const authored = analyze(authoredBox);
        const concrete = analyze(overlayBox);
        const destroy = await map.destroy();
        return {
          pixelRatio: dpr,
          zoom: scale,
          overlay,
          authored,
          concrete,
          viewport,
          allWhiteBounds: Number.isFinite(allWhiteBounds.minX) ? allWhiteBounds : null,
          immutable,
          rendering: debug.resources.rendering,
          destroy,
          canvasCountAfterDestroy: host.querySelectorAll('canvas').length,
        };
      }, { pixelRatio, zoom });
      results.push({ ...result, errors });
      await page.close();
    }
  }
  const failures = [];
  for (const result of results) {
    if (result.overlay.status !== 'committed') failures.push(`${result.pixelRatio}/${result.zoom}: overlay`);
    if (Object.values(result.immutable).some((value) => value !== true)) {
      failures.push(`${result.pixelRatio}/${result.zoom}: immutable`);
    }
    if (!result.destroy || result.canvasCountAfterDestroy !== 0) {
      failures.push(`${result.pixelRatio}/${result.zoom}: destroy`);
    }
    if (result.errors.length > 0) failures.push(...result.errors);
    for (const [route, observation] of [
      ['authored', result.authored],
      ['concrete', result.concrete],
    ]) {
      if (observation.bounds === null || observation.pixelCount === 0) {
        failures.push(`${result.pixelRatio}/${result.zoom}: ${route} pixels missing`);
        continue;
      }
      if (Object.values(observation.intrusion).some((value) => value > 0)) {
        failures.push(`${result.pixelRatio}/${result.zoom}: ${route} margin intrusion`);
      }
      if (result.zoom === 10 && observation.acutance < 20) {
        failures.push(`${result.pixelRatio}/${result.zoom}: ${route} zoom acutance`);
      }
    }
  }
  const output = {
    schemaVersion: 1,
    identity: process.env.PATCH_MAP_GRID_TEXT_QUALITY_IDENTITY ?? 'working-tree',
    environment: { browser: 'playwright chromium', backend: 'webgl', viewport: [1_800, 900] },
    protocol: { pixelRatios, zooms, cell: [40, 80], margin: 4, contentBox: [32, 72] },
    results,
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    failures,
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (failures.length > 0) process.exitCode = 1;
} finally {
  await browser?.close().catch(() => undefined);
  await server?.close().catch(() => undefined);
}
