const imageSourceByteLimit = 20 * 1024 * 1024;

/// A backend-resolved creation identity. Alias/theme/registry interpretation
/// belongs to the backend, not this owner. Decoding preserves the source's
/// intrinsic pixels.
final class RasterImageSource {
  RasterImageSource({
    required this.identity,
    this.canonicalUri,
    this.assetKey,
    Map<String, Object?> loaderOptions = const {},
  }) : loaderOptions = _detach(loaderOptions) as Map<String, Object?> {
    if ((canonicalUri == null) == (assetKey == null) ||
        (canonicalUri != null &&
            canonicalUri!.scheme != 'http' &&
            canonicalUri!.scheme != 'https' &&
            canonicalUri!.scheme != 'data') ||
        assetKey == '') {
      throw ArgumentError(
        'Exactly one HTTP(S)/data URI or asset key is required',
      );
    }
  }
  final Object identity;
  final Uri? canonicalUri;
  final String? assetKey;
  final Map<String, Object?> loaderOptions;
  bool get isNetwork =>
      canonicalUri?.scheme == 'http' || canonicalUri?.scheme == 'https';
}

Object? _detach(Object? value) {
  if (value == null || value is String || value is bool || value is num) {
    return value;
  }
  if (value is List) return List<Object?>.unmodifiable(value.map(_detach));
  if (value is Map<String, Object?>) {
    return Map<String, Object?>.unmodifiable(
      value.map((k, v) => MapEntry(k, _detach(v))),
    );
  }
  throw ArgumentError('Image loader options must be JSON values');
}

enum ImageFailureKind {
  transport,
  httpStatus,
  deadline,
  sourceTooLarge,
  invalidSource,
  dimensions,
  decode,
  outputBudget,
  cancelled,
  closed,
}

/// Resource-level failure only. The backend associates leases with its target
/// list and request provenance. Cancellation is distinct from source failure.
final class ImageResourceFailure implements Exception {
  const ImageResourceFailure(
    this.kind,
    this.message, {
    this.transient = false,
    this.cause,
    this.statusCode,
  });
  final ImageFailureKind kind;
  final String message;
  final bool transient;
  final Object? cause;
  final int? statusCode;
  @override
  String toString() => 'ImageResourceFailure(${kind.name}): $message';
}
