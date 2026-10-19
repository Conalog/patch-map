import 'dart:convert';
import 'dart:typed_data';

import 'package:conalog_patch_map/src/resources/asset_registry.dart';
import 'package:conalog_patch_map/src/resources/images/image_source.dart';
import 'package:conalog_patch_map/src/resources/images/image_source_store.dart';
import 'package:conalog_patch_map/src/resources/images/image_transport.dart';
import 'package:conalog_patch_map/src/resources/svg/svg_source.dart';
import 'package:flutter_test/flutter_test.dart';

final class _Bytes implements ImageTransfer {
  _Bytes(List<int> bytes) : _bytes = Uint8List.fromList(bytes);
  final Uint8List _bytes;
  @override
  Future<ImageTransferResponse> get response async =>
      ImageTransferResponse.owned(_bytes);
  @override
  Future<void> cancel() async {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'physical byte identity includes all loader options with recursive key canonicalization',
    () {
      final registry = AssetRegistry();
      final first = registry.resolve({
        'src': 'https://example.test/images/../photo.png',
        'parser': 'texture',
        'format': 'png',
        'data': {
          'headers': {'x-mode': 'first', 'authorization': 'one'},
          'nested': {
            'b': 2,
            'a': [
              {'z': 3, 'x': 4},
            ],
          },
        },
      });
      final reordered = registry.resolve({
        'data': {
          'nested': {
            'a': [
              {'x': 4, 'z': 3},
            ],
            'b': 2,
          },
          'headers': {'authorization': 'one', 'x-mode': 'first'},
        },
        'format': 'png',
        'parser': 'texture',
        'src': 'https://example.test/photo.png',
      });
      expect(first.identity, reordered.identity);
      expect(first.byteSource.identity, reordered.byteSource.identity);
      expect(first.byteSource, same(first.byteSource));
      expect(
        first.byteSource.canonicalUri,
        Uri.parse('https://example.test/photo.png'),
      );
      final different = registry.resolve({
        'src': first.src,
        'data': {
          'headers': {'authorization': 'two', 'x-mode': 'first'},
          'nested': first.data['nested'],
        },
      });
      expect(different.byteSource.identity, isNot(first.byteSource.identity));
      final arrayOrder = registry.resolve({
        'src': first.src,
        'data': {
          'headers': first.data['headers'],
          'nested': {
            'b': 2,
            'a': [
              {'x': 4, 'z': 3},
              {'new': true},
            ],
          },
        },
      });
      expect(arrayOrder.byteSource.identity, isNot(first.byteSource.identity));
    },
  );

  test(
    'same URL with different headers starts distinct source loads; reordered options reuse the correct bytes',
    () async {
      final registry = AssetRegistry(), seen = <RasterImageSource>[];
      final sources = ImageSourceStore(
        transferFactory: (source) {
          seen.add(source);
          return _Bytes([
            (source.loaderOptions['headers'] as Map)['authorization'] == 'one'
                ? 1
                : 2,
          ]);
        },
      );
      final one = registry.resolve({
        'src': 'https://example.test/photo.png',
        'data': {
          'headers': {'authorization': 'one', 'x-mode': 'mode'},
        },
      });
      final same = registry.resolve({
        'data': {
          'headers': {'x-mode': 'mode', 'authorization': 'one'},
        },
        'src': 'https://example.test/photo.png',
      });
      final two = registry.resolve({
        'src': 'https://example.test/photo.png',
        'data': {
          'headers': {'authorization': 'two', 'x-mode': 'mode'},
        },
      });
      final first = sources.acquireSourceBytes(one.byteSource),
          shared = sources.acquireSourceBytes(same.byteSource),
          other = sources.acquireSourceBytes(two.byteSource);
      expect((await first.ready).bytes, [1]);
      expect((await shared.ready).bytes, [1]);
      expect((await other.ready).bytes, [2]);
      expect(seen.length, 2);
      expect(sources.sourceBytes, 2);
      first.release();
      shared.release();
      other.release();
      sources.close();
      expect(sources.sourceBytes, 0);
    },
  );

  test(
    'parser/format identity stays separate from the actual physical transfer inputs',
    () {
      final registry = AssetRegistry();
      final plain = registry.resolve('https://example.test/photo.png');
      final specified = registry.resolve({
        'src': plain.src,
        'parser': 'texture',
        'format': 'png',
      });
      expect(plain.identity, isNot(specified.identity));
      expect(plain.byteSource.identity, specified.byteSource.identity);
      final options = registry.resolve({
        'src': plain.src,
        'data': {'resolution': 2},
      });
      expect(options.byteSource.identity, isNot(plain.byteSource.identity));
      expect(options.byteSource.loaderOptions, {'resolution': 2});
    },
  );

  test(
    'builtin aliases and their exact Flutter asset key share physical bytes',
    () {
      final registry = AssetRegistry();
      for (final alias in ['object', 'device', 'loading', 'warning', 'wifi']) {
        final builtin = registry.resolve(alias),
            canonical = registry.resolve(
              'patch-map-builtin://images/$alias.svg',
            );
        final key = 'packages/conalog_patch_map/assets/icons/$alias.svg';
        final asset = registry.resolve(key);
        expect(builtin.svg, isNotNull);
        expect(builtin.identity, canonical.identity);
        expect(builtin.byteSource.assetKey, key);
        expect(builtin.byteSource.canonicalUri, isNull);
        expect(builtin.byteSource.identity, asset.byteSource.identity);
      }
    },
  );

  test(
    'custom alias chain preserves caller parser/format and shallow loader data overrides',
    () {
      final headers = <String, Object?>{'authorization': 'base'};
      final descriptor = <String, Object?>{
        'src': 'assets/photo.png',
        'data': {
          'headers': headers,
          'nested': {'one': 1},
        },
      };
      final symbols = <String, Object?>{
        'photo': descriptor,
        'chain': 'photo',
        'extensionless': 'https://example.test/icon',
      };
      final registry = AssetRegistry(symbols: symbols);
      headers['authorization'] = 'changed';
      descriptor['src'] = 'wrong.png';
      symbols.clear();
      final original = registry.resolve('chain');
      expect(original.src, 'assets/photo.png');
      expect((original.data['headers'] as Map)['authorization'], 'base');
      final overridden = registry.resolve({
        'src': 'chain',
        'parser': 'texture',
        'format': 'png',
        'data': {
          'headers': {'authorization': 'override'},
        },
      });
      expect(overridden.src, 'assets/photo.png');
      expect(overridden.data, {
        'headers': {'authorization': 'override'},
        'nested': {'one': 1},
      });
      final svg = registry.resolve({
        'src': 'extensionless',
        'loadParser': 'svg',
        'data': {'width': 24, 'height': 12},
      });
      expect(svg.svg, isNotNull);
      expect(svg.svg!.width, 24);
      expect(svg.svg!.height, 12);
      expect(
        svg.byteSource.canonicalUri,
        Uri.parse('https://example.test/icon'),
      );
      final direct = registry.resolve({
        'src': 'https://example.test/icon',
        'parser': 'svg',
        'data': {'height': 12, 'width': 24},
      });
      expect(svg.identity, direct.identity);
    },
  );

  test(
    'resolved data and physical loader options are detached and deeply immutable',
    () {
      final source = <String, Object?>{
        'src': 'photo.png',
        'data': {
          'headers': <String, Object?>{'authorization': 'before'},
          'nested': <Object?>[
            <String, Object?>{'key': 'before'},
          ],
        },
      };
      final asset = AssetRegistry().resolve(source);
      ((source['data'] as Map)['headers'] as Map)['authorization'] = 'after';
      (((source['data'] as Map)['nested'] as List).first as Map)['key'] =
          'after';
      expect((asset.data['headers'] as Map)['authorization'], 'before');
      expect(
        ((asset.byteSource.loaderOptions['nested'] as List).first
            as Map)['key'],
        'before',
      );
      expect(() => asset.data['new'] = 1, throwsUnsupportedError);
      expect(
        () => (asset.byteSource.loaderOptions['headers'] as Map)['new'] = 'bad',
        throwsUnsupportedError,
      );
    },
  );

  test(
    'raster data URI, SVG data URI and relative asset keys remain eligible',
    () async {
      final registry = AssetRegistry(), sources = ImageSourceStore();
      final raster = registry.resolve('data:image/png;base64,AQID');
      expect(raster.svg, isNull);
      expect(raster.byteSource.assetKey, isNull);
      final lease = sources.acquireSourceBytes(raster.byteSource);
      expect((await lease.ready).bytes, [1, 2, 3]);
      lease.release();
      sources.close();
      final xml = Uri.dataFromString(
        '<svg width="10" height="10"/>',
        mimeType: 'image/svg+xml',
        encoding: utf8,
      ).toString();
      final svg = registry.resolve(xml);
      expect(svg.svg, isNotNull);
      expect(svg.byteSource.canonicalUri!.scheme, 'data');
      final asset = registry.resolve('assets/icons/../photo.png');
      expect(asset.byteSource.assetKey, 'assets/photo.png');
      expect(asset.byteSource.canonicalUri, isNull);
    },
  );

  test(
    'malformed descriptors and non-JSON loader values are expected FormatException',
    () {
      final registry = AssetRegistry();
      final invalid = <Object>[
        '',
        '   ',
        42,
        true,
        <Object?>[],
        <String, Object?>{},
        {'src': 3},
        {'src': ' '},
        {'src': 'photo.png', 'extra': true},
        {1: 'photo.png'},
        {'src': 'photo.png', 'data': null},
        {'src': 'photo.png', 'data': []},
        {
          'src': 'photo.png',
          'data': {1: 'bad'},
        },
        {'src': 'photo.png', 'parser': 1},
        {'src': 'photo.png', 'loadParser': null},
        {'src': 'photo.png', 'format': ''},
        {
          'src': 'photo.png',
          'data': {'number': double.nan},
        },
        {
          'src': 'photo.png',
          'data': {'object': Object()},
        },
        {
          'src': 'https://example.test/photo.png',
          'data': {
            'headers': {'authorization': 3},
          },
        },
        {
          'src': 'https://example.test/photo.png',
          'data': {'headers': []},
        },
      ];
      for (final value in invalid) {
        expect(
          () => registry.resolve(value),
          throwsFormatException,
          reason: '$value',
        );
      }
      final cyclic = <String, Object?>{};
      cyclic['self'] = cyclic;
      expect(
        () => registry.resolve({'src': 'photo.png', 'data': cyclic}),
        throwsFormatException,
      );
      expect(() => AssetRegistry(symbols: {'bad': 42}), throwsFormatException);
      expect(
        () => AssetRegistry(
          symbols: {
            'bad': {'src': 'photo.png', 'data': cyclic},
          },
        ),
        throwsFormatException,
      );
    },
  );

  test(
    'asset loader options stay opaque JSON while HTTP header values follow the native transport contract',
    () {
      final registry = AssetRegistry();
      final asset = registry.resolve({
        'src': 'assets/photo.png',
        'data': {
          'headers': {'custom': 3},
          'custom': [2, 1],
        },
      });
      expect(asset.byteSource.loaderOptions, {
        'headers': {'custom': 3},
        'custom': [2, 1],
      });
      final reorderedArray = registry.resolve({
        'src': 'assets/photo.png',
        'data': {
          'headers': {'custom': 3},
          'custom': [1, 2],
        },
      });
      expect(
        asset.byteSource.identity,
        isNot(reorderedArray.byteSource.identity),
      );
    },
  );

  test(
    'unsupported schemes are diagnosed during resolve before RasterImageSource can throw ArgumentError',
    () {
      final registry = AssetRegistry();
      for (final src in [
        'ftp://example.test/photo.png',
        'file:///photo.png',
        'blob:opaque',
        'https:photo.png',
        '//example.test/photo.png',
      ]) {
        expect(() => registry.resolve(src), throwsFormatException, reason: src);
      }
      for (final src in [
        'ftp://example.test/image.svg',
        'file:///image.svg',
        'https:image.svg',
      ]) {
        expect(
          () => registry.resolve(src),
          throwsA(isA<SvgSourceException>()),
          reason: src,
        );
      }
      expect(
        () => const ResolvedAsset(
          'custom://photo.png',
          'id',
          {},
          null,
        ).byteSource,
        throwsFormatException,
      );
      expect(
        () => registry.resolve('patch-map-builtin://images/missing.svg'),
        throwsA(isA<SvgSourceException>()),
      );
    },
  );

  test(
    'unknown aliases, alias cycles and unsupported SVG data remain explicit expected failures',
    () {
      expect(() => AssetRegistry().resolve('inverter'), throwsFormatException);
      expect(
        () => AssetRegistry(symbols: {'a': 'b', 'b': 'a'}).resolve('a'),
        throwsFormatException,
      );
      expect(
        () => AssetRegistry().resolve({
          'src': 'object',
          'data': {
            'replace': {'white': 'red'},
          },
        }),
        throwsA(
          isA<SvgSourceException>().having(
            (error) => error.code,
            'code',
            'unsupported-data',
          ),
        ),
      );
      expect(
        () => AssetRegistry().resolve({
          'src': 'object',
          'data': {'width': -1},
        }),
        throwsA(isA<SvgSourceException>()),
      );
      expect(
        () =>
            AssetRegistry().resolve('https://example.test/icon.svg#selection'),
        throwsA(isA<SvgSourceException>()),
      );
    },
  );
}
