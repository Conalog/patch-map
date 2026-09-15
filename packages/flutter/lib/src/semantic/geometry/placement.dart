import '../../model/json.dart';
import 'primitives.dart';

MapRect resolvePlacement(
  MapRect reference,
  double width,
  double height,
  String placement,
  JsonMap margin,
) {
  if (placement == 'none') return MapRect(0, 0, width, height);
  var x = reference.x + (reference.width - width) / 2,
      y = reference.y + (reference.height - height) / 2;
  if (placement.startsWith('left')) x = reference.x + _number(margin['left']);
  if (placement.startsWith('right'))
    x = reference.x + reference.width - _number(margin['right']) - width;
  if (placement == 'top' || placement.endsWith('-top'))
    y = reference.y + _number(margin['top']);
  if (placement == 'bottom' || placement.endsWith('-bottom'))
    y = reference.y + reference.height - _number(margin['bottom']) - height;
  if (!x.isFinite || !y.isFinite || !width.isFinite || !height.isFinite)
    throw const PatchMapDatasetError(
      'INVALID_VALUE',
      r'$.geometry',
      'non-finite placement',
    );
  return MapRect(x, y, width, height);
}

double _number(Object? value) => value is num ? value.toDouble() : 0;
