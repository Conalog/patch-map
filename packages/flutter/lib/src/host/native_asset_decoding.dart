part of 'native_assets.dart';

/// Source admission and native codecs, separate from binding ownership.
extension _NativeAssetDecoding on NativeAssetSession {
  Future<(String, Uint8List)> _admit(
    Object source, {
    required bool packageOwned,
  }) async {
    try {
      return await _readAdmitted(source, packageOwned: packageOwned);
    } on PatchMapException {
      rethrow;
    } catch (error) {
      throw PatchMapException(
        'ASSET_LOAD_FAILED',
        'Asset loading failed: $error',
      );
    }
  }

  Future<(String, Uint8List)> _readAdmitted(
    Object source, {
    required bool packageOwned,
  }) async {
    String location;
    if (source is String) {
      location = source;
    } else if (source is Map && source['src'] is String) {
      location = source['src'] as String;
    } else {
      throw const PatchMapException('INVALID_INPUT', 'Invalid image source');
    }
    String mime;
    Uint8List bytes;
    if (packageOwned && location.startsWith('patch-map-builtin://images/')) {
      mime = 'image/svg+xml';
      final filename = Uri.parse(location).pathSegments.last;
      final data = await rootBundle.load(
        'packages/patch_map/assets/icons/$filename',
      );
      bytes = data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes);
    } else if (packageOwned && location == _fontSource) {
      mime = 'font/woff2';
      final data = await rootBundle.load(
        'packages/patch_map/assets/fonts/FiraCode-VF.woff2',
      );
      bytes = data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes);
    } else if (location.startsWith('data:')) {
      final data = UriData.parse(location);
      mime = data.mimeType.toLowerCase();
      bytes = data.contentAsBytes();
    } else {
      final uri = Uri.parse(location);
      if ((uri.scheme != 'http' && uri.scheme != 'https') ||
          uri.userInfo.isNotEmpty) {
        throw const PatchMapException(
          'ASSET_POLICY_REJECTED',
          'Only HTTP(S) and data sources are admitted',
        );
      }
      final client = HttpClient();
      try {
        final request = await client.getUrl(uri);
        request.followRedirects = false;
        final response = await request.close();
        if (response.statusCode < 200 || response.statusCode >= 300) {
          throw const PatchMapException(
            'ASSET_LOAD_FAILED',
            'HTTP request failed or redirected',
          );
        }
        mime = response.headers.contentType?.mimeType.toLowerCase() ?? '';
        if (response.contentLength > maxBytes)
          throw const PatchMapException(
            'ASSET_POLICY_REJECTED',
            'Encoded size exceeds policy',
          );
        final buffer = BytesBuilder(copy: false);
        await for (final chunk in response) {
          if (buffer.length + chunk.length > maxBytes)
            throw const PatchMapException(
              'ASSET_POLICY_REJECTED',
              'Encoded size exceeds policy',
            );
          buffer.add(chunk);
        }
        bytes = buffer.takeBytes();
      } finally {
        client.close(force: true);
      }
    }
    return (mime, bytes);
  }

  String _validateInput(String inputMime, Uint8List bytes, JsonMap source) {
    final mime = inputMime.split(';').first.trim().toLowerCase();
    final parser = (source['parser'] ?? source['loadParser']) as String?;
    assertPatchMapAssetResponseAllowed(
      {
        'maxEncodedBytes': maxBytes,
        'maxDecodedWidth': maxWidth,
        'maxDecodedHeight': maxHeight,
      },
      {
        'mediaType': inputMime,
        'encodedBytes': bytes.length,
        if (mime == 'image/svg+xml') 'svgText': utf8.decode(bytes),
      },
    );
    if (parser != null &&
        (parser.toLowerCase().contains('svg') != (mime == 'image/svg+xml')))
      throw const PatchMapException(
        'ASSET_POLICY_REJECTED',
        'SVG parser/MIME disagreement',
      );
    return mime;
  }

  Future<NativeAsset> _decode(
    String mime,
    Uint8List bytes,
    Object source,
  ) async {
    try {
      return await _decodeBytes(mime, bytes, source);
    } on PatchMapException {
      rethrow;
    } catch (error) {
      throw PatchMapException(
        'ASSET_DECODE_FAILED',
        'Native decoding failed: $error',
      );
    }
  }

  Future<NativeAsset> _decodeBytes(
    String mime,
    Uint8List bytes,
    Object source,
  ) async {
    if (mime == 'image/svg+xml') {
      final picture = await vector_graphics.vg.loadPicture(
        SvgStringLoader(utf8.decode(bytes)),
        null,
      );
      final data = source is Map ? source['data'] as Map? : null;
      final width = (data?['width'] as num?)?.toDouble() ?? picture.size.width;
      final height =
          (data?['height'] as num?)?.toDouble() ?? picture.size.height;
      final resolution = (data?['resolution'] as num?)?.toDouble() ?? 1;
      if (width * resolution > maxWidth ||
          height * resolution > maxHeight ||
          width <= 0 ||
          height <= 0 ||
          resolution <= 0) {
        picture.picture.dispose();
        throw const PatchMapException(
          'ASSET_POLICY_REJECTED',
          'SVG dimensions exceed policy',
        );
      }
      var decoded = picture.picture;
      if (width != picture.size.width || height != picture.size.height) {
        final recorder = ui.PictureRecorder();
        ui.Canvas(recorder)
          ..scale(width / picture.size.width, height / picture.size.height)
          ..drawPicture(decoded);
        decoded = recorder.endRecording();
        picture.picture.dispose();
      }
      return NativeAsset(picture: decoded, width: width, height: height);
    }
    if (mime == 'image/avif') {
      final frames = await decodeAvif(bytes);
      if (frames.isEmpty)
        throw const PatchMapException('ASSET_DECODE_FAILED', 'Empty AVIF');
      final image = frames.first.image;
      for (final frame in frames.skip(1)) {
        frame.image.dispose();
      }
      return NativeAsset(
        image: image,
        width: image.width.toDouble(),
        height: image.height.toDouble(),
      );
    }
    if (mime.startsWith('font/') || mime == 'application/font-woff') {
      final (result, sfnt) = decodeFontIfWoff(bytes);
      if (result != WoffDecodeResult.ok && result != WoffDecodeResult.notWoff ||
          sfnt == null ||
          !_validSfnt(sfnt))
        throw const PatchMapException(
          'ASSET_DECODE_FAILED',
          'Font decoding failed',
        );
      final family = source is Map
          ? ((source['data'] as Map?)?['family'] as String? ??
                'PatchMapHostFont')
          : 'PatchMapHostFont';
      await (FontLoader(
        family,
      )..addFont(Future.value(ByteData.sublistView(sfnt)))).load();
      return NativeAsset(width: 1, height: 1, isFont: true);
    }
    final buffer = await ui.ImmutableBuffer.fromUint8List(bytes);
    ui.ImageDescriptor? descriptor;
    try {
      descriptor = await ui.ImageDescriptor.encoded(buffer);
      if (descriptor.width > maxWidth || descriptor.height > maxHeight)
        throw const PatchMapException(
          'ASSET_POLICY_REJECTED',
          'Decoded dimensions exceed policy',
        );
      final codec = await descriptor.instantiateCodec();
      try {
        final frame = await codec.getNextFrame();
        return NativeAsset(
          image: frame.image,
          width: frame.image.width.toDouble(),
          height: frame.image.height.toDouble(),
        );
      } finally {
        codec.dispose();
      }
    } finally {
      descriptor?.dispose();
      buffer.dispose();
    }
  }
}

// FontLoader can silently ignore malformed bytes, so validate the complete SFNT
// directory before publishing readiness. Collections are outside this binding.
bool _validSfnt(Uint8List bytes) {
  if (bytes.length < 12) return false;
  final data = ByteData.sublistView(bytes), signature = data.getUint32(0);
  if (signature != 0x00010000 &&
      signature != 0x4f54544f &&
      signature != 0x74727565)
    return false;
  final count = data.getUint16(4);
  if (count == 0 || 12 + count * 16 > bytes.length) return false;
  final tags = <int>{};
  for (var i = 0; i < count; i++) {
    final at = 12 + i * 16,
        tag = data.getUint32(at),
        offset = data.getUint32(at + 8),
        length = data.getUint32(at + 12);
    if (!tags.add(tag) ||
        offset < 12 + count * 16 ||
        offset + length > bytes.length)
      return false;
  }
  return tags.contains(0x636d6170) &&
      tags.contains(0x68656164) &&
      tags.contains(0x6d617870);
}
