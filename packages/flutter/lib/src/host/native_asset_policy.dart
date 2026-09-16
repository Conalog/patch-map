part of 'native_assets.dart';

const _assetMediaTypes = <String>{
  'image/svg+xml',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
  'image/gif',
  'font/woff',
  'font/woff2',
  'font/ttf',
  'font/otf',
  'application/font-woff',
};
final _unsafeAssetSvg = RegExp(
  r'''<\s*(?:script|foreignObject)\b|\bon[a-z]+\s*=|\b(?:href|xlink:href|src)\s*=\s*["']\s*(?:https?:|//)|\burl\(\s*["']?\s*(?:https?:|//)''',
  caseSensitive: false,
);

/// Evaluates fetched/decoded metadata without loading, caching or uploading.
/// JSON fields correspond to PatchMapAssetResponseMetadata in the shared API.
JsonMap evaluatePatchMapAssetResponsePolicy(JsonMap policy, JsonMap metadata) {
  final normalized = normalizePatchMapAssetPolicy(policy);
  final mime = _nonempty(
    metadata['mediaType'],
    'asset media type',
  ).split(';').first.trim().toLowerCase();
  if (!RegExp(r'^[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+$').hasMatch(mime)) {
    throw const PatchMapAssetError('INVALID_VALUE', 'INVALID_INPUT', false);
  }
  JsonMap rejected(String stage) => Map.unmodifiable({
    'accepted': false,
    'code': 'ASSET_POLICY_REJECTED',
    'stage': stage,
  });
  if (!_assetMediaTypes.contains(mime)) return rejected('media-type');
  final encoded = metadata['encodedBytes'];
  if (encoded is! num ||
      !encoded.isFinite ||
      encoded < 0 ||
      encoded > 9007199254740991 ||
      encoded != encoded.roundToDouble() ||
      encoded > (normalized['maxEncodedBytes'] as int))
    return rejected('encoded-bytes');
  if (metadata.containsKey('decodedWidth') ||
      metadata.containsKey('decodedHeight')) {
    final width = metadata['decodedWidth'], height = metadata['decodedHeight'];
    if (width is! num ||
        height is! num ||
        !width.isFinite ||
        !height.isFinite ||
        width <= 0 ||
        height <= 0 ||
        width > (normalized['maxDecodedWidth'] as int) ||
        height > (normalized['maxDecodedHeight'] as int))
      return rejected('decoded-size');
  }
  if (mime == 'image/svg+xml' && metadata.containsKey('svgText')) {
    final text = metadata['svgText'];
    if (text is! String || _unsafeAssetSvg.hasMatch(text))
      return rejected('svg-content');
  }
  return const {'accepted': true, 'code': null, 'stage': 'accepted'};
}

void assertPatchMapAssetResponseAllowed(JsonMap policy, JsonMap metadata) {
  if (evaluatePatchMapAssetResponsePolicy(policy, metadata)['accepted'] !=
      true) {
    throw const PatchMapAssetError(
      'ASSET_POLICY_REJECTED',
      'ASSET_FAILURE',
      false,
    );
  }
}
