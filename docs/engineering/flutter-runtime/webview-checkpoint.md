# Common-input legacy WebView checkpoint


A separate host compared the unchanged native library with the consumer audit's
`patch-map 0.10.0` / PixiJS 8.14.3 renderer on API34 arm64, WebView 113 and
SwiftShader. Both used 10,000 aligned panels plus 100 SVGs, 20,000 mixed input
records, FiraCode 500 and a 384×452 logical viewport at DPR 3.75. Actual changes
were 0/1/100%, in overview and zoom with 400ms pan. All 84 requests completed
(two warmups and five measured requests per condition/renderer), and twelve
final 20,000-record checks passed. Native 0% measured requests were unchanged.
Source, APK, fixture, process identities and excluded pilot failures are archived.

Native API response and observed process CPU were lower in all six paired
conditions. The 100% medians illustrate the measured limits:

| View | API response ms, native / WebView | Observed CPU ms, native / WebView | CPU rate %, native / WebView | Final PSS MiB, native / WebView |
| --- | --- | --- | --- | --- |
| Overview | 503 / 978 | 2010 / 5760 | 79 / 161 | 1089 / 658 |
| Zoom and pan | 392 / 967 | 930 / 5490 | 38 / 165 | 380 / 732 |

API endpoints differ: Flutter drawing submission versus the callback after Pixi
render returns. CPU windows include response plus a two-second tail and HTTP
delivery, and differ in elapsed duration; WebView's existing continuous ticker
remains active. Its host and verified isolated renderer are summed. CPU rate 100%
means one core. These are not pure update costs, matched fixed-duration costs,
GPU completion or presentation timings. Both adapters' conversion costs are
included; WebView uses trusted update flags, while native validates input.

Final values and bar patterns match, but text positions/baselines and rounded
edges differ. This is not pixel parity. Overview native PSS is higher; zoom PSS
is lower. PSS is a final sample, not peak, GPU memory or a leak test. No frame
smoothness, first-presentation, deployed consumer-host, physical-device or iOS
performance equivalence follows. In particular the real WebView host's LOD,
change selection, slicing and bridge are not reproduced. Independent review
found no new runtime correction justified by this limited comparison.

The full protocol, raw data, checks, screenshots and limitations are under
`.artifacts/performance/flutter/native-webview-parity-emulator-20261019/`
(`PLAN.ko.md`, `REPORT.ko.md`, `summary.json`, `validation.json`). Runtime source
was not changed to imitate the historical benchmark or to fit this comparison.
