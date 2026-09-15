import '../model/dataset.dart';
import '../model/json.dart';

/// Detached, structured public operation outcome.
class PatchMapResult {
  PatchMapResult(Map<String, dynamic> value)
    : _value = Map<String, dynamic>.unmodifiable(value);
  final Map<String, dynamic> _value;
  String get status => _value['status'] as String? ?? '';
  bool get changed => _value['changed'] == true;
  int get appliedCount => _value['appliedCount'] as int? ?? 0;
  Object? get diagnostic => _value['diagnostic'];
  Object? operator [](String key) => _value[key];
  JsonMap toJson() => cloneJson(_value) as JsonMap;
}

class PatchMapTarget {
  const PatchMapTarget(this.id, {this.componentId});
  final String id;
  final String? componentId;
  JsonMap toJson() => {
    'id': id,
    if (componentId != null) 'componentId': componentId,
  };
  String get key => componentId == null ? id : '$id\u0000$componentId';
}

class PatchMapTargetMatch extends PatchMapTarget {
  PatchMapTargetMatch(
    super.id, {
    super.componentId,
    required this.type,
    required JsonMap value,
  }) : _value = value;
  final String type;
  final JsonMap _value;
  String get kind => componentId == null ? 'element' : 'component';
  String? get label => _value['label'] as String?;
  JsonMap get value => cloneJson(_value) as JsonMap;
  @override
  JsonMap toJson() => {
    ...super.toJson(),
    'kind': kind,
    'type': type,
    'label': label,
    'value': value,
  };
}

class PatchMapTargetSet {
  PatchMapTargetSet(
    this.owner,
    this.revision,
    List<PatchMapTargetMatch> matches,
  ) : matches = List.unmodifiable(matches);
  final Object owner;
  final int revision;
  final List<PatchMapTargetMatch> matches;
  int get count => matches.length;
}

class PatchMapCaptureResult {
  const PatchMapCaptureResult({required this.dataUrl, required this.size});
  final String dataUrl;
  final List<double> size;
  String get mime => 'image/png';
  JsonMap toJson() => {'dataUrl': dataUrl, 'mime': mime, 'size': size};
}

class PatchMapException implements Exception {
  const PatchMapException(
    this.code,
    this.message, {
    this.operation = 'argument-validation',
    this.recoverable = true,
    this.diagnostic,
  });
  factory PatchMapException.fromDiagnostic(JsonMap diagnostic) {
    final value = freezeJson(diagnostic) as JsonMap;
    final code = value['code'] as String;
    return PatchMapException(
      code,
      'PatchMap could not complete ${value['operation']}',
      operation: value['operation'] as String,
      recoverable: value['recoverable'] as bool,
      diagnostic: value,
    );
  }
  final String code, message, operation;
  final bool recoverable;
  final JsonMap? diagnostic;
  String get hint {
    if (code == 'DESTROYED')
      return 'Create a new PatchMap instance instead of reusing a destroyed one.';
    if (code == 'NOT_READY')
      return 'Await PatchMap.create and attach a view before calling this method.';
    if (code == 'MISSING_TARGET')
      return 'Check id/componentId, or query the target set again after loading new data.';
    if (code == 'INVALID_INPUT' || code == 'INVALID_VALUE') {
      return diagnostic?['datasetPath'] == null
          ? 'Check the operation arguments and PatchMap input shape.'
          : 'Check the value at ${diagnostic!['datasetPath']}.';
    }
    return recoverable
        ? 'Review diagnostic for the rejected operation; the current scene was left unchanged.'
        : 'Destroy this instance and create a new one. Preserve this diagnostic when reporting the issue.';
  }

  @override
  String toString() => 'PatchMapException($code: $operation): $message. $hint';
}

typedef PatchMapDisposer = void Function();
