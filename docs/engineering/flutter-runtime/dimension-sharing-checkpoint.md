# Deferred dimension-string sharing

Decision: **deferred**, approved October 28, 2026. Keep the existing package
implementation; neither candidate is adopted:

- Sharing successful dimension-string syntax validation across requests.
- Sharing parsed `Dimension` coefficients across requests.

The physical-device diagnosis separated baseline, validation-only, parse-only
and combined candidates on SM-S936N with Flutter 3.47.6 profile mode. It used
10,000-panel mixed updates during drag and pinch. CPU samples decreased in the
targeted functions, but end-to-end response and CPU improvements were not
established. Repeating the identical baseline APK also produced substantially
different response times. Sharing itself was not established as the cause of
the observed slowdown.

Existing validation/preparation, GC and later synchronous requests delaying an
earlier frame submission contributed to the measured delays. Their individual
causal contributions remain unresolved. This decision does not change input
validation, update atomicity, geometry resolution or submission completion.
It also does not defer other reuse already implemented in the package.

Source identities, separate candidate profiles, baseline repeat and restoration
evidence are retained under
`.artifacts/performance/flutter/dimension-split3476-device-20261028/`
(`REPORT.ko.md`, `phase-analysis.json`, `preservation.json`). No additional
optimization or package change was made as part of the diagnosis.
