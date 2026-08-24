# Package font assets

PatchMap ships the five Fira Code 6.2 WOFF2 faces used by PATCH MAP v0.10.
They are package resources: `PatchMap.mount()` settles them before creating
text render objects, and `destroy()` releases the instance leases. Consumers
do not need to register the default font themselves.

All five faces are eager mount requirements. This is intentional: synchronous
`data.replace()` and live `fontWeight` updates may select a different weight
after mount, and deferring that face would let Pixi cache a fallback raster
before an asynchronous font load completes. The module-wide asset runtime
deduplicates the five physical resources and browser FontFace entries across
concurrent instances; each instance owns only one lease per face. Destroying
the final lease unloads the five resources.

The WOFF2 payload is isolated from the root PatchMap entry in one async package
chunk. The first mount awaits that chunk before font acquisition; subsequent
mounts reuse the JavaScript module cache. This keeps roughly 700KB of base64
source out of the root entry while avoiding a consumer-specific binary URL or
`optimizeDeps` setting.

| CSS weight | Face | Bytes | SHA-256 |
| ---: | --- | ---: | --- |
| 300 | `FiraCode-Light.woff2` | 102,924 | `e3aa3db06cfb19dfc0b0f1f38355add3e8d1ef45d3af39ce95d9ca7d96114e6c` |
| 400 | `FiraCode-Regular.woff2` | 103,240 | `a6ce59520b90e15d7062ffef214f94c8add5a4085c0bbb1683602ef227a4d1fe` |
| 500 | `FiraCode-Medium.woff2` | 102,384 | `0e04bafb989ea46e840a581e49557b229662a00021493a5744c595d0882adf28` |
| 600 | `FiraCode-SemiBold.woff2` | 106,992 | `d16779aa6dfc7c4effe686ece5bdf4b1356a7352167e37fa256f596a9d428f11` |
| 700 | `FiraCode-Bold.woff2` | 107,788 | `d778c19803c672d294663e9283c7b752cc125ab266f0ddb8e53b039da92caf67` |

The sources are the unmodified WOFF2 files from the
[official Fira Code 6.2 release](https://github.com/tonsky/FiraCode/releases/tag/6.2).
Their license is packaged in
[`FIRA-CODE-LICENSE.txt`](./FIRA-CODE-LICENSE.txt).

PATCH MAP v0.10's `FiraCode` and `Fira Code` spellings are mapped internally
to the quote-stable browser family `FiraCode`; caller JSON remains detached and unchanged. Numeric 300,
400, 500, 600, and 700 select distinct physical files. `normal` maps to 400,
`bold` and `bolder` to 700, and `lighter` to 300. Values without a shipped
face (100, 200, 800, and 900) retain CSS font matching, which deterministically
chooses the nearest available package face; PatchMap does not relabel Regular
bytes as those weights.

Fira Code does not contain Korean glyphs. Pixi Text therefore asks the browser
font fallback stack to draw CJK at the authored weight, while Latin letters,
digits, punctuation, and operators in the same text use the exact Fira Code
face. The semantic line height and placement frame remain parser-owned; the
renderer does not apply a coordinate compensation for font metrics.
