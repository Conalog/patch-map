import { inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function comparePngBuffers(mainPng, corePng, regions = []) {
  const main = decodePng(mainPng);
  const core = decodePng(corePng);
  if (main.width !== core.width || main.height !== core.height) {
    return Object.freeze({
      comparable: false,
      mainSize: Object.freeze([main.width, main.height]),
      coreSize: Object.freeze([core.width, core.height]),
      exactMismatchRatio: null,
      meanAbsoluteChannelDelta: null,
      materialPixelDeltaRatio: null,
      masks: Object.freeze({
        main: contentMask(main),
        core: contentMask(core),
      }),
      regions: Object.freeze([]),
    });
  }

  let exactMismatch = 0;
  let channelDelta = 0;
  let materialPixelDelta = 0;
  const pixels = main.width * main.height;
  for (let offset = 0; offset < main.data.length; offset += 4) {
    let pixelDelta = 0;
    let exact = false;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(main.data[offset + channel] - core.data[offset + channel]);
      channelDelta += delta;
      pixelDelta = Math.max(pixelDelta, delta);
      if (delta !== 0) exact = true;
    }
    if (exact) exactMismatch += 1;
    if (pixelDelta >= 32) materialPixelDelta += 1;
  }
  return Object.freeze({
    comparable: true,
    mainSize: Object.freeze([main.width, main.height]),
    coreSize: Object.freeze([core.width, core.height]),
    exactMismatchRatio: exactMismatch / pixels,
    meanAbsoluteChannelDelta: channelDelta / (pixels * 4),
    materialPixelDeltaRatio: materialPixelDelta / pixels,
    masks: Object.freeze({
      main: contentMask(main),
      core: contentMask(core),
    }),
    regions: Object.freeze(
      regions.map((region) => compareRegion(main, core, region)),
    ),
  });
}

function compareRegion(main, core, region) {
  const padding = 3;
  const x0 = clampInteger(Math.floor(region.bounds[0]) - padding, 0, main.width);
  const y0 = clampInteger(Math.floor(region.bounds[1]) - padding, 0, main.height);
  const x1 = clampInteger(
    Math.ceil(region.bounds[0] + region.bounds[2]) + padding,
    x0,
    main.width,
  );
  const y1 = clampInteger(
    Math.ceil(region.bounds[1] + region.bounds[3]) + padding,
    y0,
    main.height,
  );
  let exactMismatch = 0;
  let channelDelta = 0;
  let materialPixelDelta = 0;
  const pixels = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const offset = (y * main.width + x) * 4;
      let exact = false;
      let pixelDelta = 0;
      for (let channel = 0; channel < 4; channel += 1) {
        const delta = Math.abs(main.data[offset + channel] - core.data[offset + channel]);
        channelDelta += delta;
        pixelDelta = Math.max(pixelDelta, delta);
        if (delta !== 0) exact = true;
      }
      if (exact) exactMismatch += 1;
      if (pixelDelta >= 32) materialPixelDelta += 1;
    }
  }
  return Object.freeze({
    key: region.key,
    requestedType: region.requestedType,
    bounds: Object.freeze([x0, y0, x1 - x0, y1 - y0]),
    pixelCount: pixels,
    exactMismatchRatio: pixels === 0 ? 0 : exactMismatch / pixels,
    meanAbsoluteChannelDelta: pixels === 0 ? 0 : channelDelta / (pixels * 4),
    materialPixelDeltaCount: materialPixelDelta,
    materialPixelDeltaRatio: pixels === 0 ? 0 : materialPixelDelta / pixels,
  });
}

function clampInteger(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('unsupported screenshot: missing PNG signature');
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
    throw new Error(
      `unsupported screenshot PNG format: depth=${bitDepth}, color=${colorType}, interlace=${interlace}`,
    );
  }
  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const stride = width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(idat));
  const decoded = Buffer.alloc(width * height * bytesPerPixel);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;
    const rowOffset = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[inputOffset + x];
      const left = x >= bytesPerPixel ? decoded[rowOffset + x - bytesPerPixel] : 0;
      const up = y > 0 ? decoded[rowOffset + x - stride] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel
        ? decoded[rowOffset + x - stride - bytesPerPixel]
        : 0;
      decoded[rowOffset + x] = unfilter(filter, raw, left, up, upLeft);
    }
    inputOffset += stride;
  }
  const output = colorType === 6
    ? decoded
    : rgbToRgba(decoded, width, height);
  return Object.freeze({ width, height, data: output });
}

function unfilter(filter, raw, left, up, upLeft) {
  switch (filter) {
    case 0:
      return raw;
    case 1:
      return (raw + left) & 0xff;
    case 2:
      return (raw + up) & 0xff;
    case 3:
      return (raw + Math.floor((left + up) / 2)) & 0xff;
    case 4:
      return (raw + paeth(left, up, upLeft)) & 0xff;
    default:
      throw new Error(`unsupported PNG filter ${filter}`);
  }
}

function paeth(left, up, upLeft) {
  const prediction = left + up - upLeft;
  const leftDistance = Math.abs(prediction - left);
  const upDistance = Math.abs(prediction - up);
  const diagonalDistance = Math.abs(prediction - upLeft);
  if (leftDistance <= upDistance && leftDistance <= diagonalDistance) return left;
  return upDistance <= diagonalDistance ? up : upLeft;
}

function rgbToRgba(input, width, height) {
  const output = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    output[pixel * 4] = input[pixel * 3];
    output[pixel * 4 + 1] = input[pixel * 3 + 1];
    output[pixel * 4 + 2] = input[pixel * 3 + 2];
    output[pixel * 4 + 3] = 255;
  }
  return output;
}

function contentMask(image) {
  let left = image.width;
  let top = image.height;
  let right = -1;
  let bottom = -1;
  let count = 0;
  let xTotal = 0;
  let yTotal = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      const red = image.data[offset];
      const green = image.data[offset + 1];
      const blue = image.data[offset + 2];
      const alpha = image.data[offset + 3];
      const backgroundDistance = Math.max(
        Math.abs(red - 250),
        Math.abs(green - 250),
        Math.abs(blue - 250),
      );
      if (alpha === 0 || backgroundDistance < 12) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
      count += 1;
      xTotal += x;
      yTotal += y;
    }
  }
  return Object.freeze({
    pixelRatio: count / (image.width * image.height),
    bounds: count === 0
      ? null
      : Object.freeze([left, top, right - left + 1, bottom - top + 1]),
    centroid: count === 0
      ? null
      : Object.freeze([xTotal / count, yTotal / count]),
  });
}
