import { createHash } from 'node:crypto';

const formats = ['png', 'jpeg', 'webp', 'gif', 'svg', 'avif', 'ttf', 'otf', 'woff', 'woff2'];
export function verifyCodecPayloads(fixture) {
  const actual = fixture.assets?.map((asset) => asset.alias);
  if (JSON.stringify(actual) !== JSON.stringify(formats.map((name) => `codec-${name}`))) throw new Error('Codec format inventory differs');
  if (JSON.stringify(fixture.requiredAssets) !== JSON.stringify(actual)) throw new Error('Every codec must be acquired');
  for (const [index, asset] of fixture.assets.entries()) {
    const name = formats[index], source = asset.descriptor.src;
    const match = /^data:([^;]+);base64,([A-Za-z0-9+/]+=*)$/u.exec(source);
    if (!match) throw new Error(`${name}: expected exact base64 data URI`);
    const bytes = Buffer.from(match[2], 'base64');
    const expected = fixture.provenance?.payloads?.find((row) => row.alias === asset.alias);
    if (!expected || expected.mediaType !== match[1] || expected.encodedBytes !== bytes.length ||
      expected.sha256 !== createHash('sha256').update(bytes).digest('hex')) throw new Error(`${name}: payload provenance mismatch`);
    const magic = {
      png: () => bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a',
      jpeg: () => bytes.subarray(0, 2).toString('hex') === 'ffd8',
      webp: () => bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
      gif: () => /^GIF8[79]a$/u.test(bytes.toString('ascii', 0, 6)),
      svg: () => bytes.toString().startsWith('<svg xmlns="http://www.w3.org/2000/svg"'),
      avif: () => bytes.toString('ascii', 4, 8) === 'ftyp' && bytes.toString('ascii', 8, 12) === 'avif',
      ttf: () => bytes.readUInt32BE(0) === 0x00010000,
      otf: () => bytes.toString('ascii', 0, 4) === 'OTTO',
      woff: () => bytes.toString('ascii', 0, 4) === 'wOFF',
      woff2: () => bytes.toString('ascii', 0, 4) === 'wOF2',
    };
    if (!magic[name]()) throw new Error(`${name}: container signature mismatch`);
    if (asset.kind === 'image' && !fixture.dataset.some((node) => node.source === asset.alias)) throw new Error(`${name}: image missing from visible scene`);
    if (asset.kind === 'font' && !fixture.dataset.some((node) => node.style?.fontFamily === asset.descriptor.data.family && node.text === 'AB 012')) throw new Error(`${name}: font sample missing from visible scene`);
  }
  return { imageFormats: 6, fontFormats: 4 };
}
