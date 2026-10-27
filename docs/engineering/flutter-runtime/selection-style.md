# Selection decoration

`PatchMapView.selectionStyle` accepts immutable `PatchMapSelectionStyle` values.
This adds configurable paint to F14; editing handles and object manipulation
remain outside the first release. Data schema and value-submission rules do not
change. Public usage is documented in the [package README](../../../packages/flutter/README.md).

## Contract

- Defaults preserve the existing centered #2f80ed, fixed 2 logical-pixel stroke.
  All mode draws individual oriented envelopes and, for multiple drawable
  targets, their world-axis union. Group-only keeps a singleton's oriented frame;
  element-only omits the union. Hidden mode suppresses paint, not selection/hits.
- Color, width, display mode, stroke alignment and scale policy can change on
  rebuild. No controller reattachment, data replacement, geometry preparation,
  selection event or camera change results. Widget configuration survives draw;
  accepted draw still clears selected IDs. Inactive configuration displays on resume.
- Fixed width ignores camera scale. Viewport width is
  `min(strokeWidth, max(minStrokeWidth, strokeWidth * cameraScale))` in logical
  pixels, then converted to world units with the existing 0.001 scale floor.
  Defaults are width 2 and minimum 1. Finite positive widths and minimum <= base
  are required in both modes. Color channels must be finite, alpha within 0–1.
- Center alignment retains the previous Canvas stroke. Inside/outside alignment
  fills a band within/beyond the same selection envelope. Collapsed inside bands
  fill the envelope without spilling outside. Reflections/shear preserve winding
  and perpendicular width. These options do not alter authored borders or bounds.
- Invalid initial configuration throws before attachment. Invalid rebuilds
  report through Flutter's error mechanism and retain the last valid style,
  without interrupting other widget lifecycle/configuration work.

## Ownership and verification

`api/selection_style.dart` owns immutable values; widget composition validates
before attachment and sends accepted changes to the existing SelectionOverlay.
The overlay retains one style, Paint and Path, with no selection copy or new
listener, timer, resource cache or scheduler. Equal styles do not invalidate.
The existing frame owner handles changed paint and ordinary value submissions.
`geometry/selection_geometry.dart` owns envelope and parallel-offset calculation.

Only selected IDs are resolved. Hidden/transparent paint skips them entirely.
Element-only avoids aggregate computation. Center uses its existing stroke path;
noncenter bands share a single winding-filled draw, without per-object layers,
clips or alpha overdraw. Reusable Path contents are cleared after each paint.

Focused witnesses:

- `test/rendering/selection_overlay_test.dart`: unchanged default pixels,
  rotated/reflected/uniform-camera stroke, selection envelopes and sparse lookup.
- `test/rendering/selection_style_test.dart`: modes, color/width, viewport floor,
  aligned bands, collapsed interiors, shear/reflection, overlapping alpha and
  invalid configuration retaining the prior style.
- `test/widget/selection_paint_test.dart`: public live changes, pending value
  submission, retained selection/camera, inactivity, replacement and recovery.
- `verification/flutter/installed-consumer.dart`: exported configuration compiles
  and rebuilds in the extracted package while retaining selection/camera/values.

These are host correctness witnesses, not Android/iOS frame-rate qualification.

October 27 checkpoint: 27 focused tests, Flutter3.47.6 analysis and the extracted
consumer passed (`.artifacts/flutter/installed-consumer-WojHIM/report.json`).
A bounded same-process host/JIT default-paint comparison used 40 warmup frames
and six alternating paired rounds: 10,000 selected items recorded at median
4.141ms before / 4.190ms after, with paired deltas -0.242 to +0.158ms.
This is Canvas command recording/disposal, excluding raster and input admission;
it does not qualify native frame performance. Raw samples, identity and scope:
`.artifacts/performance/flutter/selection-style-host-20261027/`.
