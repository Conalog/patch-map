import 'package:conalog_patch_map/src/frame/resource_retirement.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'one safe submission drains native resources released by a publication',
    () {
      final queue = ResourceRetirement(), disposed = <String>[];
      queue.enqueue(() {
        disposed.add('publication');
        queue.enqueue(() => disposed.add('image'));
      });
      queue.flush();
      expect(disposed, ['publication', 'image']);
      expect(queue.pendingCount, 0);
      queue.close();
      queue.enqueue(() => disposed.add('late'));
      expect(disposed.last, 'late');
    },
  );
}
