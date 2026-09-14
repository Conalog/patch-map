"""Derive native SFNT from the exact npm WOFF2; no build/runtime Python dependency.

Run: uv run --no-project --with 'fonttools[woff]==4.60.1' python verification/flutter/prepare-font.py
"""
import hashlib
import io
import json
from pathlib import Path
import fontTools
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
source = ROOT / 'src/resources/fonts/FiraCode-VF.woff2'
target = ROOT / 'packages/patch_map/assets/fonts/FiraCode-VF.ttf'
original = TTFont(source, recalcTimestamp=False)
original.flavor = None
buffer = io.BytesIO()
original.save(buffer)
converted = buffer.getvalue()
round_trip = TTFont(io.BytesIO(converted), recalcTimestamp=False)
assert original.getGlyphOrder() == round_trip.getGlyphOrder()
assert original.getBestCmap() == round_trip.getBestCmap()
assert original['hmtx'].metrics == round_trip['hmtx'].metrics
axes = [{'tag': a.axisTag, 'min': a.minValue, 'default': a.defaultValue, 'max': a.maxValue} for a in original['fvar'].axes]
assert axes == [{'tag': a.axisTag, 'min': a.minValue, 'default': a.defaultValue, 'max': a.maxValue} for a in round_trip['fvar'].axes]
target.write_bytes(converted)
provenance = {'source': 'src/resources/fonts/FiraCode-VF.woff2', 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
 'native': 'assets/fonts/FiraCode-VF.ttf', 'nativeSha256': hashlib.sha256(converted).hexdigest(),
 'tool': 'fontTools', 'toolVersion': fontTools.__version__, 'axes': axes,
 'glyphCount': len(round_trip.getGlyphOrder()), 'verified': ['glyph-order', 'cmap', 'horizontal-metrics', 'variable-axes'],
 'license': 'assets/fonts/LICENSE.txt'}
(target.parent / 'provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
print(json.dumps(provenance))
