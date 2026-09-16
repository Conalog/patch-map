part of 'controller.dart';

class PatchMapAssetsApi {
  PatchMapAssetsApi._(this._c);
  final PatchMapController _c;
  PatchMapResult register(Object registrations) {
    _c._assertLive();
    final port = _c.assetPort;
    if (port == null)
      throw const PatchMapException(
        'ASSET_FAILURE',
        'No asset backend configured',
      );
    final list = registrations is List ? registrations : [registrations];
    return port.register(list.map(_cloneMap).toList());
  }

  JsonMap status([String? alias]) =>
      _c.assetPort?.status(alias) ?? {'session': null, 'runtime': null};
}

class PatchMapDebugApi {
  PatchMapDebugApi._(this._c);
  final PatchMapController _c;
  JsonMap publication() => {
    'frameRevision': _c._frameRevision,
    'publishedTuple':
        _c._published?.toJson() ?? {'scene': 0, 'view': 0, 'interaction': 0},
  };
  JsonMap snapshot() {
    final surface = _c._surface;
    final host = surface is PatchMapSurfaceProbePort
        ? (surface as PatchMapSurfaceProbePort).debugResources
        : <String, dynamic>{};
    final subscriptions =
        _c._listeners.length +
        _c.selection._listeners.length +
        _c.selection._pointerListeners.length +
        _c.history._listeners.length +
        _c.viewport._listeners.length +
        _c.pointer._hover.length +
        _c.pointer._tooltip.length;
    return {
      'lifecycle': _c.destroyed
          ? 'destroyed'
          : surface == null
          ? 'initializing'
          : _c.dataset.roots.isEmpty
          ? 'ready-empty'
          : 'scene-ready',
      'instanceId': _c.instanceId,
      'revisions': _c.revisionStamp,
      'publishedTuple':
          _c._published?.toJson() ?? {'scene': 0, 'view': 0, 'interaction': 0},
      'frameRevision': _c._frameRevision,
      'datasetRef': _c._datasetRef,
      'semanticHash': _c.dataset.semanticHash,
      'rootIds': _c.dataset.roots.map((v) => v['id']).toList(),
      'historyDepth': _c.history.state['undoDepth'],
      'pendingWork':
          (_c._dirty && _c._surfaceVisible ? 1 : 0) + (_c._capturing ? 1 : 0),
      'zoomLimits': _c.viewport.zoomLimits,
      'viewport': _c.viewport.state,
      'selectionIds': _c.selection.ids,
      'presentation': {
        'revision': _c.presentation._revision,
        'layerCount': _c.presentation._layers.length,
      },
      'interaction': {
        'mode': (host['interaction'] as Map?)?['mode'] ?? 'select',
        'staleGestureCount':
            (host['interaction'] as Map?)?['staleGestureCount'] ??
            _c.transform._staleCount,
      },
      'facilities': [
        'renderer',
        'viewport',
        'world',
        'state',
        'history',
        'resize',
        'assets',
      ],
      'resources': {
        'canvasCount': host['canvasCount'],
        'canvas': host['canvas'],
        'renderer': host['renderer'],
        'rendering':
            host['rendering'] ??
            {'commandCount': null, 'visiblePrimitiveCount': null},
        'subscriptions': {
          'active':
              subscriptions +
              ((host['subscriptions'] as Map?)?['active'] as int? ?? 0),
          'duplicates': 0,
        },
        'assets': _c.assets.status()['session'],
      },
      if (_c._lastCallbackFailure != null)
        'lastCallbackFailure': _c._lastCallbackFailure,
    };
  }
}

class PatchMapCaptureApi {
  PatchMapCaptureApi._(this._c);
  final PatchMapController _c;
  Future<PatchMapCaptureResult> png() {
    final result = Completer<PatchMapCaptureResult>();
    _c._captureQueue = _c._captureQueue.then((_) async {
      try {
        _c._assertLive();
        await _c.ready;
        _c._assertLive();
        final surface = _c._surface;
        if (surface == null)
          throw const PatchMapException('NOT_READY', 'No attached surface');
        _c._captureClockMs = _c._clockMs;
        _c._capturing = true;
        final snapshot = _c.renderSnapshot;
        await _c.assetPort?.ready(snapshot);
        if (_c.destroyed ||
            snapshot.revisions != _c.revisions ||
            !identical(surface, _c._surface))
          throw const PatchMapException(
            'EXTRACTION_FAILURE',
            'Capture scene became stale',
          );
        await _c._awaitFrame(snapshot.revisions);
        if (_c.destroyed ||
            snapshot.revisions != _c.revisions ||
            !identical(surface, _c._surface))
          throw const PatchMapException(
            'EXTRACTION_FAILURE',
            'Capture scene became stale',
          );
        final captured = await surface.capture(snapshot);
        if (_c.destroyed || snapshot.revisions != _c.revisions)
          throw const PatchMapException(
            'EXTRACTION_FAILURE',
            'Capture publication changed',
          );
        result.complete(captured);
      } catch (error, stack) {
        result.completeError(error, stack);
      } finally {
        final pausedAt = _c._clockMs;
        _c._capturing = false;
        _c._syncAnimationClock();
        _c._clockMs = math.max(_c._clockMs, _c._captureClockMs);
        final pausedMs = _c._clockMs - pausedAt;
        if (!_c.destroyed && pausedMs > 0) {
          if (_c._barTweens.isNotEmpty) {
            _c._barTweens = _c._barTweens.map(
              (key, tween) => MapEntry(
                key,
                _BarTween(
                  tween.from,
                  tween.to,
                  tween.start + pausedMs,
                  tween.duration,
                ),
              ),
            );
            _c._barColumns = _BarColumns(_c._barTweens);
          }
          final rotation = _c.rotation._animation;
          if (rotation != null) {
            rotation.start = rotation.start! + pausedMs;
            if (rotation.hiddenAt != null)
              rotation.hiddenAt = rotation.hiddenAt! + pausedMs;
          }
        }
        if (!_c.destroyed &&
            (_c._barTweens.isNotEmpty || _c.rotation._animation != null)) {
          _c._dirty = false;
          _c._schedule();
        }
        final resize = _c._deferredResize;
        _c._deferredResize = null;
        if (resize != null && !_c.destroyed)
          _c.viewport.resize(resize[0], resize[1], resize[2]);
      }
    });
    return result.future;
  }
}
