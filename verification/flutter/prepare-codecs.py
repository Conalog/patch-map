"""Generate small, genuine codec payloads from original test artwork and glyphs.

uv run --no-project --with 'Pillow==11.3.0' --with 'fonttools[woff]==4.60.1' python verification/flutter/prepare-codecs.py
No production dependency or downloaded media is used. Generated artwork/font
outlines are original repository test data, licensed under this repository's MIT
license. Embedded payloads are intentionally decoded by the real public backend.
"""
import base64
import hashlib
import io
import json
from pathlib import Path
from PIL import Image
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
FAMILY = 'PatchMapCodecFixture'
PATTERNS = {
    'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    'B': ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
    '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
    '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
}

def draw(pen, character):
    for y, row in enumerate(PATTERNS.get(character, [])):
        for x, pixel in enumerate(row):
            if pixel == '0':
                continue
            left, bottom = x * 100 + 50, (6 - y) * 100 + 100
            pen.moveTo((left, bottom))
            pen.lineTo((left, bottom + 100))
            pen.lineTo((left + 100, bottom + 100))
            pen.lineTo((left + 100, bottom))
            pen.closePath()

def font_bytes(otf=False):
    chars = [' ', 'A', 'B', '0', '1', '2']
    names = ['.notdef'] + ['space' if c == ' ' else 'uni%04X' % ord(c) for c in chars]
    fb = FontBuilder(1000, isTTF=not otf)
    fb.setupGlyphOrder(names)
    fb.setupCharacterMap({ord(c): name for c, name in zip(chars, names[1:])})
    glyphs = {}
    for name, character in zip(names, [''] + chars):
        pen = T2CharStringPen(600, None) if otf else TTGlyphPen(None)
        draw(pen, character)
        glyphs[name] = pen.getCharString() if otf else pen.glyph()
    if otf:
        fb.setupCFF(FAMILY + '-Regular', {'FullName': FAMILY + ' Regular', 'FamilyName': FAMILY, 'Weight': 'Regular'}, glyphs, {})
    else:
        fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics({name: (600, 0) for name in names})
    fb.setupHorizontalHeader(ascent=850, descent=-150)
    fb.setupNameTable({'familyName': FAMILY, 'styleName': 'Regular', 'uniqueFontIdentifier': FAMILY + '-Regular-1', 'fullName': FAMILY + ' Regular', 'psName': FAMILY + '-Regular', 'version': 'Version 1.0', 'copyright': 'Original PatchMap codec test glyphs. MIT license.'})
    fb.setupOS2(sTypoAscender=850, sTypoDescender=-150, usWinAscent=850, usWinDescent=150)
    fb.setupPost()
    fb.setupHead(created=2082844800, modified=2082844800)
    fb.font.recalcTimestamp = False
    out = io.BytesIO()
    fb.save(out)
    return out.getvalue()

image = Image.new('RGB', (16, 16))
colors = [(224, 48, 48), (48, 176, 80), (48, 96, 224), (240, 192, 32)]
for y in range(16):
    for x in range(16):
        image.putpixel((x, y), colors[(y // 8) * 2 + x // 8])
payloads = {}
for name, options in [('png', {}), ('jpeg', {'quality': 100, 'subsampling': 0}), ('webp', {'lossless': True}), ('gif', {}), ('avif', {'quality': 100, 'subsampling': '4:4:4', 'speed': 6, 'max_threads': 1})]:
    out = io.BytesIO()
    image.save(out, format=name.upper(), **options)
    payload = out.getvalue()
    with Image.open(io.BytesIO(payload)) as decoded:
        decoded.load()
        assert decoded.size == (16, 16)
    payloads[name] = (f'image/{name}', payload)
svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path fill="#e03030" d="M0 0h8v8H0z"/><path fill="#30b050" d="M8 0h8v8H8z"/><path fill="#3060e0" d="M0 8h8v8H0z"/><path fill="#f0c020" d="M8 8h8v8H8z"/></svg>'
payloads['svg'] = ('image/svg+xml', svg.encode())
ttf = font_bytes()
payloads['ttf'] = ('font/ttf', ttf)
payloads['otf'] = ('font/otf', font_bytes(otf=True))
for flavor in ['woff', 'woff2']:
    font = TTFont(io.BytesIO(ttf), recalcTimestamp=False)
    font.flavor = flavor
    out = io.BytesIO()
    font.save(out)
    payloads[flavor] = ('font/' + flavor, out.getvalue())
for name in ['ttf', 'otf', 'woff', 'woff2']:
    font = TTFont(io.BytesIO(payloads[name][1]), recalcTimestamp=False)
    assert set(font.getBestCmap()) == {ord(c) for c in ' AB012'}

assets, dataset, provenance = [], [], []
image_order = ['png', 'jpeg', 'webp', 'gif', 'svg', 'avif']
font_order = ['ttf', 'otf', 'woff', 'woff2']
for index, name in enumerate(image_order + font_order):
    mime, payload = payloads[name]
    alias = 'codec-' + name
    family = 'PatchMapCodec' + name.upper()
    descriptor = {'src': f'data:{mime};base64,' + base64.b64encode(payload).decode()}
    if name == 'svg':
        descriptor['parser'] = 'svg'
    if name in font_order:
        descriptor.update({'parser': 'web-font', 'data': {'family': family, 'weights': ['400']}})
    assets.append({'alias': alias, 'kind': 'image' if name in image_order else 'font', 'descriptor': descriptor, **({'fontWeight': 400} if name in font_order else {})})
    provenance.append({'alias': alias, 'mediaType': mime, 'encodedBytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest(), 'source': 'verification/flutter/prepare-codecs.py', 'license': 'MIT', **({'width': 16, 'height': 16} if name in image_order else {'family': family, 'codepoints': [32, 48, 49, 50, 65, 66], 'sfntOutline': 'CFF' if name == 'otf' else 'TrueType'})})
    if name in image_order:
        x, y = 24 + index % 3 * 152, 28 + index // 3 * 144
        dataset.append({'id': alias, 'type': 'image', 'source': alias, 'size': 96, 'attrs': {'x': x, 'y': y}})
        dataset.append({'id': alias + '-label', 'type': 'text', 'text': name.upper(), 'attrs': {'x': x, 'y': y + 102}, 'style': {'fontSize': 14, 'fill': '#0f172a'}})
    else:
        y = 330 + (index - len(image_order)) * 50
        dataset.append({'id': alias + '-label', 'type': 'text', 'text': name.upper(), 'attrs': {'x': 24, 'y': y}, 'style': {'fontSize': 14, 'fill': '#0f172a'}})
        dataset.append({'id': alias + '-sample', 'type': 'text', 'text': 'AB 012', 'attrs': {'x': 152, 'y': y}, 'style': {'fontFamily': family, 'fontWeight': 400, 'fontSize': 28, 'fill': '#0f172a'}})
fixture = {'schemaRevision': 'patch-map-conformance/1', 'id': 'codecs', 'description': 'Real native/web image and font container decoding. Register assets, acquire requiredAssets through the public runtime session, then render; release all acquisitions on teardown.', 'surface': {'width': 480, 'height': 550, 'pixelRatio': 1, 'background': '#f8fafc'}, 'assets': assets, 'requiredAssets': [a['alias'] for a in assets], 'provenance': {'generator': 'verification/flutter/prepare-codecs.py', 'tools': {'Pillow': '11.3.0', 'fontTools': '4.60.1'}, 'artwork': 'Original 16x16 four-color quadrants and 5x7 block glyphs, MIT repository test data; no external media or font outlines.', 'payloads': provenance}, 'dataset': dataset, 'commands': [], 'expected': {'rootIds': [entry['id'] for entry in dataset], 'elementTypes': ['image', 'text'], 'componentTypes': [], 'decodedImages': {('codec-' + name): {'width': 16, 'height': 16} for name in image_order}, 'loadedFonts': ['codec-' + name for name in font_order], 'fontSample': 'AB 012'}}
output = ROOT / 'conformance/fixtures/codecs.json'
output.write_text(json.dumps(fixture, indent=2, ensure_ascii=False) + '\n')
print(output, output.stat().st_size)
for row in provenance:
    print(row['alias'], row['encodedBytes'], row['sha256'])
