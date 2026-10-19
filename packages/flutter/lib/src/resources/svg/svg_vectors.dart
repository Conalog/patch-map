import 'dart:async';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/widgets.dart' show BuildContext;
import 'package:flutter_svg/flutter_svg.dart' as svg;
import 'package:vector_graphics/vector_graphics.dart' as vg;
import 'package:vector_graphics_compiler/vector_graphics_compiler.dart'
    as compiler;
import 'package:xml/xml_events.dart' as xml_events;

import 'svg_source.dart';

/// Owned parser result; consumers never rely on dependency-private constructors.
final class SvgPicture {
  const SvgPicture(this.picture, this.size);
  final ui.Picture picture;
  final ui.Size size;
}

typedef SvgTextLoader = Future<String> Function(String canonicalSrc);
typedef SvgPictureLoader =
    Future<SvgPicture> Function(String xml, ui.Color tint);
typedef SvgRetirement = void Function(void Function() dispose);

/// One prepared source/tint result. Its picture is borrowed by leases; only the
/// store disposes it after their final safe release. Source dimensions preserve
/// data.width/height; picture coordinates remain [intrinsicSize].
final class SvgVector {
  SvgVector._(this.source, this.tint, this.picture, this.intrinsicSize)
    : size = ui.Size(
        source.width ?? intrinsicSize.width,
        source.height ?? intrinsicSize.height,
      );
  final SvgSourceSpec source;
  final ui.Color tint;
  final ui.Picture picture;
  final ui.Size intrinsicSize, size;

  /// Independent destination axes preserve the existing nonuniform size
  /// contract. No per-item saveLayer or flat silhouette color filter is used.
  void paint(ui.Canvas canvas, ui.Rect destination) {
    if (!destination.isFinite ||
        destination.width < 0 ||
        destination.height < 0) {
      throw ArgumentError.value(destination, 'destination');
    }
    if (destination.isEmpty) return;
    canvas.save();
    try {
      canvas.translate(destination.left, destination.top);
      canvas.scale(
        destination.width / intrinsicSize.width,
        destination.height / intrinsicSize.height,
      );
      canvas.drawPicture(picture);
    } finally {
      canvas.restore();
    }
  }
}

/// A caller-owned reference, including while source or parsing work is pending.
/// Releasing is logical cancellation, not a claim that that work has stopped.
/// Keep a live lease until the frame owner says the borrowed picture is safe.
final class SvgVectorLease {
  SvgVectorLease._(this._store, this._entry);
  final SvgVectorStore _store;
  final _VectorEntry _entry;
  bool _released = false;
  bool get isReleased => _released;
  int get sharedReferenceCount => _entry.references;
  late final Future<SvgVector> ready = _entry.result.future.then((vector) {
    if (_released) {
      throw StateError('SVG lease was released before preparation completed');
    }
    return vector;
  });

  SvgVectorLease retain() {
    if (_released) throw StateError('Cannot retain a released SVG lease');
    return _store._retain(_entry);
  }

  bool release() {
    if (_released) return false;
    _released = true;
    _store._release(_entry);
    return true;
  }
}

/// Shared source and vector ownership, bounded by actual references and pending
/// work. No unused cache, raster work, timer, frame scheduling or global state.
final class SvgVectorStore {
  SvgVectorStore({
    required this.sourceLoader,
    SvgPictureLoader? pictureLoader,
    this.retire,
    this.beforeParse,
  }) : _pictureLoader = pictureLoader ?? loadSvgPicture;
  final SvgTextLoader sourceLoader;
  final SvgPictureLoader _pictureLoader;
  final SvgRetirement? retire;
  final Future<void> Function()? beforeParse;
  final _vectors = <(String, int), _VectorEntry>{};
  final _sources = <String, _SourceEntry>{};
  var _closed = false, _pending = 0, _references = 0;
  bool get isClosed => _closed;
  int get entryCount => _vectors.length;
  int get sourceCount => _sources.length;
  int get pendingCount => _pending;
  int get referenceCount => _references;

  SvgVectorLease acquire(
    SvgSourceSpec spec, {
    ui.Color tint = const ui.Color(0xffffffff),
  }) {
    if (_closed) throw StateError('SVG vector store is closed');
    final unsupported = spec.unsupportedDataFields;
    if (unsupported.isNotEmpty) {
      throw SvgSourceException(
        'unsupported-data',
        spec.canonicalSrc,
        'Unsupported SVG loader fields: ${unsupported.join(', ')}',
      );
    }
    final key = (spec.identity, tint.toARGB32());
    var entry = _vectors[key];
    if (entry == null) {
      final source = _sources.putIfAbsent(spec.canonicalSrc, _SourceEntry.new);
      source.references++;
      entry = _VectorEntry(key, spec, tint, source);
      _vectors[key] = entry;
      _pending++;
      // The result also has an internal error observer: a cancelled caller may
      // never await it, but failures must still finish ownership cleanup.
      entry.result.future.ignore();
      final lease = _retain(entry);
      if (!source.started) {
        source.started = true;
        _loadSource(source, spec.canonicalSrc).ignore();
      }
      _prepare(entry).ignore();
      return lease;
    }
    return _retain(entry);
  }

  SvgVectorLease _retain(_VectorEntry entry) {
    if (_closed) throw StateError('SVG vector store is closed');
    if (entry.settled && entry.vector == null) {
      throw StateError('Cannot retain a failed SVG preparation');
    }
    entry.references++;
    _references++;
    return SvgVectorLease._(this, entry);
  }

  Future<void> _loadSource(_SourceEntry source, String src) async {
    try {
      source.result.complete(await sourceLoader(src));
    } catch (error, stack) {
      source.result.completeError(error, stack);
    }
  }

  void _release(_VectorEntry entry) {
    entry.references--;
    _references--;
    if (entry.references == 0 && entry.settled) _remove(entry);
  }

  Future<void> _prepare(_VectorEntry entry) async {
    SvgPicture? temporary;
    try {
      final xml = await entry.source.result.future;
      await beforeParse?.call();
      if (_closed || entry.references == 0) {
        throw StateError('SVG preparation no longer has a live owner');
      }
      temporary = await _pictureLoader(xml, entry.tint);
      if (!temporary.size.isFinite ||
          temporary.size.width <= 0 ||
          temporary.size.height <= 0) {
        throw SvgSourceException(
          'invalid-dimensions',
          entry.spec.canonicalSrc,
          'SVG viewport must be finite and positive',
        );
      }
      if (_closed || entry.references == 0) {
        throw StateError(
          'SVG preparation completed after cancellation or close',
        );
      }
      entry.vector = SvgVector._(
        entry.spec,
        entry.tint,
        temporary.picture,
        temporary.size,
      );
      temporary = null;
      entry.result.complete(entry.vector!);
    } catch (error, stack) {
      entry.result.completeError(error, stack);
    } finally {
      temporary?.picture.dispose();
      entry.settled = true;
      _pending--;
      if (entry.references == 0 || entry.vector == null) _remove(entry);
    }
  }

  void _remove(_VectorEntry entry) {
    if (!identical(_vectors[entry.key], entry)) return;
    _vectors.remove(entry.key);
    if (--entry.source.references == 0) {
      _sources.remove(entry.spec.canonicalSrc);
    }
    final picture = entry.vector?.picture;
    if (picture == null) return;
    var disposed = false;
    void dispose() {
      if (disposed) return;
      disposed = true;
      picture.dispose();
    }

    final retirement = retire;
    if (retirement == null) {
      dispose();
      return;
    }
    try {
      retirement(dispose);
    } catch (_) {
      dispose();
      rethrow;
    }
  }

  /// Stop new references. Pending work retains ownership until settlement and
  /// cannot attach a late picture. Already-ready leases remain valid until the
  /// caller releases them at its safe-retirement boundary.
  void close() {
    _closed = true;
  }
}

final class _SourceEntry {
  _SourceEntry() {
    result.future.ignore();
  }
  final result = Completer<String>();
  var references = 0, started = false;
}

final class _VectorEntry {
  _VectorEntry(this.key, this.spec, this.tint, this.source);
  final (String, int) key;
  final SvgSourceSpec spec;
  final ui.Color tint;
  final _SourceEntry source;
  final result = Completer<SvgVector>();
  var references = 0, settled = false;
  SvgVector? vector;
}

/// The same compiler/options used by flutter_svg 2.2.4, through its public
/// compiler API. Bypass SvgStringLoader's global cache: its failed-pending
/// entries cannot be removed through public cache APIs in that version.
Future<SvgPicture> loadSvgPicture(String xml, ui.Color tint) async {
  final Uint8List bytes;
  try {
    _validateSvgXml(xml);
    bytes = compiler.encodeSvg(
      xml: xml,
      theme: const svg.SvgTheme().toVgTheme(),
      debugName: 'PatchMap SVG',
      enableClippingOptimizer: false,
      enableMaskingOptimizer: false,
      enableOverdrawOptimizer: false,
      // Unsupported elements must surface as preparation failures rather than
      // silently publish a picture missing part of the authored artwork.
      warningsAsErrors: true,
    );
  } catch (error, stack) {
    // Keep this boundary around input compilation only. In particular, native
    // codec/Picture preparation and injected loader bugs must keep their errors.
    final inputFailure = _svgCompilerInputFailure(error, stack);
    if (inputFailure == null) rethrow;
    Error.throwWithStackTrace(inputFailure, stack);
  }
  Object? error;
  final picture = await vg.vg.loadPicture(
    _OwnedBytesLoader(
      bytes.buffer.asByteData(bytes.offsetInBytes, bytes.lengthInBytes),
    ),
    null,
    onError: (exception, stack) {
      error ??= exception;
    },
  );
  if (error != null) {
    picture.picture.dispose();
    throw error!;
  }
  if (tint.toARGB32() == 0xffffffff) {
    return SvgPicture(picture.picture, picture.size);
  }
  // Tint the composite, not each path. Per-path alpha changes overlapping
  // artwork and a compiler ColorMapper cannot tint embedded raster pixels.
  final recorder = ui.PictureRecorder();
  final canvas = ui.Canvas(recorder);
  try {
    canvas.saveLayer(
      ui.Offset.zero & picture.size,
      ui.Paint()
        ..colorFilter = ui.ColorFilter.mode(tint, ui.BlendMode.modulate),
    );
    canvas.drawPicture(picture.picture);
    canvas.restore();
    return SvgPicture(recorder.endRecording(), picture.size);
  } finally {
    picture.picture.dispose();
  }
}

// Mirrors the element surface consumed by compiler 1.3.x (including <defs>
// and gradient <stop>). Its unknown-element diagnostic is inside an assert
// closure, so warningsAsErrors alone silently omits artwork in profile/release.
// Use the existing lazy XML event lexer to close that build-mode gap, without
// a second DOM or a parallel SVG geometry/style parser. Comments/CDATA cannot
// be mistaken for authored elements. XML itself validates document/nesting.
void _validateSvgXml(String xml) {
  const supportedElements = {
    'svg',
    'g',
    'a',
    'use',
    'symbol',
    'mask',
    'pattern',
    'radialGradient',
    'linearGradient',
    'clipPath',
    'image',
    'text',
    'tspan',
    'defs',
    'stop',
    'circle',
    'path',
    'rect',
    'polygon',
    'polyline',
    'ellipse',
    'line',
  };
  var root = true;
  for (final event in xml_events.parseEvents(
    xml,
    validateNesting: true,
    validateDocument: true,
  )) {
    if (event is! xml_events.XmlStartElementEvent) continue;
    if (root && event.name != 'svg') {
      throw const SvgSourceException(
        'invalid-svg',
        'PatchMap SVG',
        'SVG document requires an svg root element',
      );
    }
    root = false;
    if (!supportedElements.contains(event.name)) {
      throw SvgSourceException(
        'unsupported-svg',
        'PatchMap SVG',
        'Unsupported SVG element <${event.name}>',
      );
    }
  }
}

// vector_graphics_compiler 1.3.x uses Error subclasses for several authored
// input diagnostics. Match its specific diagnostics, never every Error or
// StateError. XML's XmlParserException/XmlTagException implement FormatException.
SvgSourceException? _svgCompilerInputFailure(Object error, StackTrace stack) {
  String? code, message;
  if (error is FormatException) {
    code = 'invalid-svg';
    message = error.message;
  } else if (error is UnimplementedError &&
      (error.message?.startsWith('unhandled element <') == true ||
          error.message?.startsWith('Image data format not supported:') ==
              true)) {
    code = 'unsupported-svg';
    message = error.message;
  } else if (error is UnsupportedError &&
      (error.message == 'Unsupported nested <svg> element.' ||
          error.message?.startsWith('Unsupported clipPath child ') == true ||
          error.message?.startsWith('Attribute value for text-decoration=') ==
              true ||
          error.message?.startsWith(
                'Attribute value for text-decoration-style=',
              ) ==
              true)) {
    code = 'unsupported-svg';
    message = error.message;
  } else if (error is ArgumentError &&
      error.name == 'colorString' &&
      (error.message == 'Invalid CSS rgb/rgba color syntax' ||
          error.message == 'Invalid CSS hsl/hsla color syntax')) {
    code = 'invalid-svg';
    message = error.message as String;
  } else if (error is StateError) {
    final value = error.message;
    if (value.startsWith('Unsupported transform: ')) {
      code = 'unsupported-svg';
    } else if (value == 'Invalid SVG data' ||
        value == 'viewBox element must be 4 elements long' ||
        value.startsWith('SVG did not specify dimensions\n') ||
        value.startsWith('Could not parse font-size: ') ||
        value.startsWith('Invalid "font-weight": ') ||
        value.startsWith('illegal or unsupported transform: ') ||
        value ==
            'SVG contains too many nested reference expansions (possible Denial of Service exploit).' ||
        // path_parsing's authored path grammar diagnostics, not its internal
        // "Unknown segment command"/"Invalid command type in path" invariants.
        const {
          'First character of a number must be one of [0-9+-.].',
          'Numeric overflow',
          'There must be at least one digit following the .',
          'Missing exponent',
          'Expected more data',
          'Invalid flag value',
          'Expected to find moveTo command',
          'Expected a path command',
        }.contains(value) ||
        value.startsWith('Invalid exponent ')) {
      code = 'invalid-svg';
    }
    message = value;
  } else if (error is AssertionError) {
    final value = error.toString();
    // The dependency asserts on unresolved gradients/incorrect transform arity
    // in debug mode. Release mode throws at the corresponding operation below.
    if ((value.contains(
              'package:vector_graphics_compiler/src/svg/parser.dart',
            ) &&
            value.contains("'_deferredShaders.isEmpty'")) ||
        (value.contains('package:vector_graphics_compiler/src/paint.dart') &&
            (value.contains("'offsets != null'") ||
                value.contains("'colors != null'"))) ||
        (value.contains(
              'package:vector_graphics_compiler/src/svg/parsers.dart',
            ) &&
            (value.contains("'params.isNotEmpty'") ||
                value.contains("'params.length == 6'") ||
                value.contains("'params.length <= 2'") ||
                value.contains("'params.length <= 3'")))) {
      code = 'invalid-svg';
      message = 'Invalid SVG gradient reference or transform arguments';
    }
  } else if (error is TypeError &&
      error.toString() == 'Null check operator used on a null value' &&
      stack
          .toString()
          .split('\n')
          .first
          .contains('_encodeShader (package:vector_graphics_compiler/')) {
    code = 'invalid-svg';
    message = 'Unresolved SVG gradient properties';
  } else if (error is RangeError &&
      stack.toString().contains(
        '_parseSvgMatrix (package:vector_graphics_compiler/src/svg/parsers.dart:',
      )) {
    code = 'invalid-svg';
    message = 'SVG matrix transform requires six arguments';
  }
  return code == null
      ? null
      : SvgSourceException(code, 'PatchMap SVG', message!);
}

final class _OwnedBytesLoader extends vg.BytesLoader {
  const _OwnedBytesLoader(this.bytes);
  final ByteData bytes;
  @override
  Future<ByteData> loadBytes(BuildContext? context) => Future.value(bytes);
}
