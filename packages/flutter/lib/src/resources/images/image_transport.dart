import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'image_source.dart';

/// A transferred stream has one reader. cancel must initiate actual transport
/// abortion and settle only after its owned transport has stopped. The store
/// also waits for response and stream settlement before returning its slot.
abstract interface class ImageTransfer {
  Future<ImageTransferResponse> get response;
  Future<void> cancel();
}

final class ImageTransferResponse {
  const ImageTransferResponse({required this.bytes, this.contentLength})
    : ownedBytes = null;
  ImageTransferResponse.owned(Uint8List value)
    : bytes = const Stream.empty(),
      contentLength = value.length,
      ownedBytes = value;
  final Stream<List<int>> bytes;

  /// Optional transferred buffer, avoiding a second Dart allocation for asset
  /// APIs. Its entire backing buffer is charged, even if value is a view.
  final Uint8List? ownedBytes;

  /// Exact decompressed stream length, or null when not reliably known.
  final int? contentLength;
}

typedef ImageTransferFactory = ImageTransfer Function(RasterImageSource source);
typedef ImageAssetLoader =
    Future<Uint8List> Function(String key, Map<String, Object?> options);

/// Each HTTP operation owns its client, so force-close never aborts a different
/// consumer's connection. Arbitrary loader options are forwarded to the asset
/// port; HTTP understands only a string-valued `headers` map.
ImageTransferFactory imageTransferFactory({ImageAssetLoader? assetLoader}) =>
    (source) {
      if (source.assetKey != null) {
        if (assetLoader == null) {
          throw const ImageResourceFailure(
            ImageFailureKind.invalidSource,
            'No asset loader was configured',
          );
        }
        return _AssetTransfer(source, assetLoader);
      }
      if (source.canonicalUri!.scheme == 'data') {
        return _DataTransfer(source.canonicalUri!);
      }
      return _HttpTransfer(source);
    };

final class _AssetTransfer implements ImageTransfer {
  _AssetTransfer(RasterImageSource source, ImageAssetLoader loader) {
    response = Future.sync(() => loader(source.assetKey!, source.loaderOptions))
        .then((value) {
          if (_cancelled) {
            throw const ImageResourceFailure(
              ImageFailureKind.cancelled,
              'Asset load cancelled',
            );
          }
          return ImageTransferResponse.owned(value);
        });
  }
  bool _cancelled = false;
  @override
  late final Future<ImageTransferResponse> response;
  @override
  Future<void> cancel() async {
    _cancelled = true;
    // Asset APIs are uncancellable. Retain the attempt until the load settles.
    try {
      await response;
    } catch (_) {
      /* response error is consumed by the owner */
    }
  }
}

final class _HttpTransfer implements ImageTransfer {
  _HttpTransfer(RasterImageSource source) {
    _client.autoUncompress = true;
    response = _open(source);
  }
  final HttpClient _client = HttpClient();
  bool _cancelled = false;
  @override
  late final Future<ImageTransferResponse> response;
  Future<ImageTransferResponse> _open(RasterImageSource source) async {
    try {
      final request = await _client.getUrl(source.canonicalUri!);
      if (_cancelled) {
        request.abort();
        throw const ImageResourceFailure(
          ImageFailureKind.cancelled,
          'HTTP request cancelled',
        );
      }
      final headers = source.loaderOptions['headers'];
      if (headers != null) {
        if (headers is! Map ||
            headers.entries.any(
              (e) => e.key is! String || e.value is! String,
            )) {
          request.abort();
          throw const ImageResourceFailure(
            ImageFailureKind.invalidSource,
            'HTTP headers must contain strings',
          );
        }
        for (final entry in headers.entries) {
          request.headers.set(entry.key as String, entry.value!);
        }
      }
      final response = await request.close();
      if (response.statusCode < 200 || response.statusCode >= 300) {
        final code = response.statusCode;
        throw ImageResourceFailure(
          ImageFailureKind.httpStatus,
          'HTTP $code',
          statusCode: code,
          transient: code == 408 || code == 429 || code >= 500,
        );
      }
      // contentLength describes encoded bytes for auto-uncompressed responses.
      final compressed =
          response.compressionState ==
          HttpClientResponseCompressionState.decompressed;
      return ImageTransferResponse(
        bytes: response,
        contentLength: compressed || response.contentLength < 0
            ? null
            : response.contentLength,
      );
    } catch (_) {
      _client.close(force: true);
      rethrow;
    }
  }

  @override
  Future<void> cancel() async {
    _cancelled = true;
    _client.close(force: true);
  }
}

final class _DataTransfer implements ImageTransfer {
  _DataTransfer(Uri uri) {
    response = Future.sync(() => ImageTransferResponse.owned(_decodeData(uri)));
  }
  @override
  late final Future<ImageTransferResponse> response;
  @override
  Future<void> cancel() async {
    try {
      await response;
    } catch (_) {
      /* owner consumes failure */
    }
  }
}

// Called only after source admission reserves 20 MiB. Count decoded bytes
// before any output buffer allocation, without contentText/percent-decoded
// intermediate strings. Uri parsing/canonicalization belongs to the backend.
Uint8List _decodeData(Uri uri) {
  const limit = imageSourceByteLimit;
  final text = uri.toString();
  final comma = text.indexOf(',');
  if (comma < 0 || uri.hasFragment || uri.hasAuthority) {
    throw const ImageResourceFailure(
      ImageFailureKind.invalidSource,
      'Malformed data URI',
    );
  }
  final isBase64 = comma >= 7 && text.startsWith(';base64', comma - 7);
  var count = 0, padding = 0;
  for (var i = comma + 1; i < text.length; i++) {
    var byte = text.codeUnitAt(i);
    if (byte == 37) {
      if (i + 2 >= text.length) {
        throw const ImageResourceFailure(
          ImageFailureKind.invalidSource,
          'Incomplete data URI escape',
        );
      }
      byte = _hex(text.codeUnitAt(i + 1)) * 16 + _hex(text.codeUnitAt(i + 2));
      i += 2;
    }
    if (byte > 255) {
      throw const ImageResourceFailure(
        ImageFailureKind.invalidSource,
        'Data URI must encode non-ASCII bytes',
      );
    }
    count++;
    if (isBase64) {
      if (byte == 61) {
        padding++;
      } else if (padding > 0) {
        throw const ImageResourceFailure(
          ImageFailureKind.invalidSource,
          'Invalid base64 padding',
        );
      }
      if ((count * 3) ~/ 4 - padding > limit) {
        throw const ImageResourceFailure(
          ImageFailureKind.sourceTooLarge,
          'Data URI exceeds 20 MiB',
        );
      }
    } else if (count > limit) {
      throw const ImageResourceFailure(
        ImageFailureKind.sourceTooLarge,
        'Data URI exceeds 20 MiB',
      );
    }
  }
  if (isBase64) {
    try {
      final bytes = base64.decoder.convert(text, comma + 1);
      if (bytes.length > limit) {
        throw const ImageResourceFailure(
          ImageFailureKind.sourceTooLarge,
          'Data URI exceeds 20 MiB',
        );
      }
      return bytes;
    } on FormatException catch (error) {
      throw ImageResourceFailure(
        ImageFailureKind.invalidSource,
        'Invalid base64 data URI',
        cause: error,
      );
    }
  }
  final bytes = Uint8List(count);
  var out = 0;
  for (var i = comma + 1; i < text.length; i++) {
    var byte = text.codeUnitAt(i);
    if (byte == 37) {
      byte = _hex(text.codeUnitAt(i + 1)) * 16 + _hex(text.codeUnitAt(i + 2));
      i += 2;
    }
    bytes[out++] = byte;
  }
  return bytes;
}

int _hex(int value) {
  if (value >= 48 && value <= 57) return value - 48;
  if (value >= 65 && value <= 70) return value - 55;
  if (value >= 97 && value <= 102) return value - 87;
  throw const ImageResourceFailure(
    ImageFailureKind.invalidSource,
    'Invalid data URI escape',
  );
}

/// Timer ownership port: one attempt deadline or one retry delay, never a frame
/// timer. The returned callback cancels the scheduled action.
typedef ImageSchedule =
    void Function() Function(Duration delay, void Function() action);
void Function() scheduleImageTimer(Duration delay, void Function() action) {
  final timer = Timer(delay, action);
  return timer.cancel;
}
