# Semantic Observation and Geometry Contract

## Purpose

Every automated case and Lab route produces the same implementation-neutral semantic
observation. This prevents a plausible screenshot or a free-text “pass” from replacing
an exact contract. The observation format identifier is
`patch-map-semantic-observation/1`.

## Required Observation Shape

Each case records:

| Field | Required content |
| --- | --- |
| `case` | scenario or consumer ID, fixture ID, dataset-contract revision, seed, action index |
| `provenance` | code commit, packed-package SHA-256, expected-evidence SHA-256, runner version |
| `environment` | browser/version, OS, backend, DPR, viewport, font/asset fixture revisions |
| `revisions` | lifecycle, scene, view, interaction, published revision tuple, and optional renderer-local frame telemetry |
| `scene` | ordered logical nodes with kind, ID, owner ID when component-scoped, parent target, visibility/lock, normalized data hash |
| `geometry` | local/world/visible bounds and world transform for asserted targets |
| `text` | exact source text, normalized lines, visible text, style intent, layout bounds |
| `paint` | normalized RGBA/fill/stroke/texture intent, not platform pixels |
| `interaction` | owner-qualified hit/selected/transform targets, gesture state, view state |
| `events` | ordered family/type/action identity/click count/target/currentTarget/phase/subscription/pointer/positions/propagation flags/revision/publication trace |
| `history` | availability, depth, active action identity, semantic before/after hashes |
| `accessibility` | ordered logical tree with owner-qualified target/parent, role/name/description/state/screen bounds/actions/focus and PixiJS accessibility binding state |
| `outcome` | applied/missing/unchanged logical targets or stable diagnostic envelope |
| `resources` | canvas, listener, observer, ticker, animation, texture lease, pending-work counts |

Unknown observation keys are allowed only under a versioned `extensions` object and do
not participate in pass/fail until promoted by a contract revision.

## Equality Rules

- IDs, kinds, hierarchy/order, text strings/lines, enums, booleans, event order,
  diagnostics, selected logical targets, and history state compare exactly.
- Authored integer world geometry compares exactly after the operation's declared
  integer rounding. Derived finite geometry and transform coefficients compare with
  absolute tolerance `1e-6` world unit and `1e-4` screen pixel unless a fixture declares
  a tighter exact value.
- RGBA intent compares as four normalized 8-bit channels. Texture identity compares by
  approved alias/descriptor hash, never by a private PixiJS object address.
- Timing, generated instance IDs, browser resource IDs, raw pixels, and renderer-local
  native `frameRevision` are volatile only when named in the fixture manifest. The
  represented scene/view/interaction tuple and required publication checkpoint are
  always normative. A verifier rejects undeclared volatile fields.
- Screenshot evidence is diagnostic. It cannot override a failed semantic comparison.

## Coordinate and Transform Convention

- World and local coordinates use +X right and +Y down. Sizes are nonnegative world
  units and local element origin is its untransformed top-left.
- PatchMap composes canonical `x`/`y`, `angle` or `rotation`, and signed
  `scaleX`/`scaleY` through the hierarchy. `scale`, skew, pivot, and their axis aliases
  are outside the semantic input contract and reject before projection.
- `angle` is degrees and `rotation` is radians. A record/update containing both is
  rejected atomically; neither field takes precedence.
- Screen conversion applies the complete world-root pan, zoom, rotation, flip, host CSS
  size, and renderer resolution exactly once. DPR changes backing resolution, not world
  geometry or CSS-pointer coordinates.
- Geometry changes are semantic before return. Bounds, spatial lookup, relations,
  selection overlays, and the next frame must all carry the same revision tuple.

## Layout Equations

For a normalized item of width `W`, height `H`, and padding edges `Pt/Pr/Pb/Pl`, the
content frame is:

```text
contentX = Pl
contentY = Pt
contentWidth  = W - Pl - Pr
contentHeight = H - Pt - Pb
```

Padding is nonnegative. A non-finite or non-positive content result may remain valid
for semantic geometry only when the concrete component still resolves to finite
nonnegative dimensions; otherwise validation rejects the action.
Percentage and `calc()` terms resolve independently against content width or height.
Backgrounds use the full `0,0,W,H` frame, not the content frame.

For normalized grid item width `W`, height `H`, gap `Gx/Gy`, row `r`, and column `c`:

```text
cellX = c * (W + Gx)
cellY = r * (H + Gy)
gridWidth  = maxColumnCount * W + max(0, maxColumnCount - 1) * Gx
gridHeight = rowCount       * H + max(0, rowCount - 1)       * Gy
```

Ragged rows use the longest row for grid width; missing cells are inactive. An empty
matrix has zero local bounds. A retained hidden cell keeps its logical endpoint and
geometry, but relations using it produce no visible segment until the same cell is
shown again.

Placement resolves a component's own normalized size inside the current content frame:

| Placement | Base position before margin |
| --- | --- |
| `left-top` | left, top |
| `top` | horizontal center, top |
| `right-top` | right, top |
| `left` | left, vertical center |
| `center` | horizontal center, vertical center |
| `right` | right, vertical center |
| `left-bottom` | left, bottom |
| `bottom` | horizontal center, bottom |
| `right-bottom` | right, bottom |

Positive margins move inward from their corresponding edge. Exact numeric fixtures
cover every anchor with asymmetric margins, rotation, and flip before LAY-001/002 can
become verified.

## Bounds Rules

- Local bounds enclose semantic paint and declared overflow in local coordinates;
  world bounds are the axis-aligned enclosure after ancestor transforms; visible
  bounds additionally apply clipping/masking and semantic visibility.
- Authored stroke contributes its public aligned stroke extent. Transparent paint does
  not erase geometric bounds. `show=false`, a hidden ancestor, removed data, or a
  destroyed lifecycle produces no visible bounds or hit target.
- Text `overflow=visible` contributes visible glyph/layout overflow. `hidden` and
  `ellipsis` contribute the clipped content frame. A zero-size non-text node has finite
  zero bounds and no point/box hit unless an explicit host hit region is supplied.
- Relation path bounds include the centered canonical relation width. Point, box, and
  paint hit expand the path in screen space by
  `max(4 CSS px, visible stroke width / 2)` after zoom and DPR.
  `visible stroke width` is the projected CSS-pixel width along the tested path normal
  after relation/world/host CSS transforms; DPR does not multiply the CSS radius.
  Endpoints, self-links, and each segment participate in the expanded path.
  Zero/transparent but interaction-eligible strokes use the 4px floor; hidden relations
  have no hit. Semantic relation geometry remains the authored path.

## Participation Matrix

`yes*` means the host predicate or selected unit can further restrict participation.

| Logical kind/state | Query | Pixels | Point hit | Box/paint | Focus/fit explicit | Relation endpoint | Transform |
| --- | --- | --- | --- | --- | --- | --- | --- |
| visible group | yes | descendants | descendant/ancestor unit | descendant/ancestor unit | descendants | no direct center | no direct transform |
| visible grid | yes | cells | yes* | yes* | whole grid | cell IDs | move/rotate, no resize handles |
| visible item | yes | yes | yes* | yes* | yes | yes | move/rotate, no resize handles |
| visible rect/image | yes | yes | yes* | yes* | yes | yes | move/resize/rotate |
| visible text | yes | yes | yes* | yes* | yes | yes | move/rotate, no resize handles |
| visible relations element/link | yes | yes | tolerance hit | yes* by path intersection | endpoint union/path fallback | no | no |
| visible component | yes | yes | deepest hit when requested | owning/explicit unit | through owner | no | edited through owner/component update |
| hidden component | yes | no render object | no | no | through owner | logical identity retained | no |
| hidden grid cell | yes | no | no | no | explicit request returns hidden geometry | endpoint retained; segment hidden | no |
| other `show=false` or hidden ancestor | yes | no | no | no | explicit request returns hidden/no-bounds result | no visible segment | no |
| `alpha=0` / transparent paint | yes | no visible color | yes if finite semantic hit bounds | yes* | yes | yes | eligibility unchanged |
| locked target/ancestor | yes | yes | hit is observable | excluded from editable selection | yes | yes | no |
| removed/destroyed target | no | no | no | no | missing | no | no |

Default focus/fit contributor rules remain those in VIE-003/004. Querying hidden nodes
does not make them visible or interactive.

## Text Semantic Profile

- The accepted source string is preserved exactly for query/snapshot/export. Layout
  treats CRLF and CR as LF line boundaries and records the normalized line array.
- `whiteSpace`, `wordWrap`, `breakWords`, `wordWrapWidth`, line height, leading, letter
  spacing, alignment, baseline, split, auto-font, and overflow are part of the semantic
  observation. A late font load or force-refresh republishes bounds and relations in one
  new scene revision; it cannot leave stale glyphs.
- Split and ellipsis operate on Unicode grapheme clusters and must not produce an
  unpaired surrogate. CJK wrapping, bidi/RTL ordering, emoji sequences, combining
  marks, fallback-font identity, and missing-glyph outcomes are normative and use the
  declared international corpus. Missing fixture evidence blocks verification, not
  the product decision.
- The evidence manifest pins the Unicode segmentation/line-break/bidi revision,
  base-direction/locale input, bundled fallback-font files and SHA-256, and missing-
  glyph identity. `Intl.Segmenter` or another implementation is acceptable only when
  it produces the pinned grapheme output. Source strings are preserved without Unicode
  normalization; layout may normalize line endings only as declared above.
- Auto-font chooses the largest supported size within the declared inclusive range that
  fits the declared content frame under the same wrap/overflow rules. Ties choose the
  larger size; a range with no fitting size uses `min` and then applies overflow.
- Rasterized glyph pixels are environment-qualified, but normalized lines, chosen font
  size/fallback identity, visible text, baseline intent, and layout bounds are normative.

The fixture corpus must contain ASCII, CRLF, multiline, long unbroken text, spaces,
CJK, RTL/mixed direction, emoji sequences, combining marks, missing glyphs, missing
font, every overflow mode, and auto-font boundary/tie cases.

## Stable Diagnostic Envelope

Every failed operation yields exactly one primary diagnostic through its documented
return/rejection channel and at most one observer notification:

```text
code, category, operation, lifecycleGeneration, revisionStamp,
datasetPath?, targetId?, sanitizedAssetId?, recoverable, retryable,
appliedCount, missingCount, unchangedCount
```

The code-to-category registry is closed for schema version 1:

| Stable `category` | Allowed exact `code` values |
| --- | --- |
| `INVALID_INPUT` | `INVALID_SCHEMA_VERSION`, `INVALID_RECORD_KIND`, `UNKNOWN_FIELD`, `INVALID_VALUE`, `INVALID_PATH`, `INVALID_MUTATION`, `OVERLAPPING_PATH`, `CONFLICTING_FIELDS`, `DUPLICATE_ID`, `NON_SERIALIZABLE_VALUE` |
| `MISSING_TARGET` | `MISSING_TARGET` |
| `STALE_TARGET` | `STALE_TARGET` |
| `NOT_READY` | `NOT_READY` |
| `DESTROYED` | `DESTROYED` |
| `CANCELLED` | `CANCELLED` |
| `SUPERSEDED` | `SUPERSEDED` |
| `CONFLICT` | `CONFLICT` |
| `ASSET_FAILURE` | `ASSET_POLICY_REJECTED`, `ASSET_LOAD_FAILED`, `ASSET_DECODE_FAILED`, `ASSET_UPLOAD_FAILED` |
| `EXTRACTION_FAILURE` | `EXTRACTION_TAINTED`, `EXTRACTION_READBACK_FAILED`, `EXTRACTION_TIMEOUT` |
| `UNSUPPORTED_RUNTIME` | `UNSUPPORTED_RUNTIME` |
| `RENDERER_LOST` | `RENDERER_LOST` |
| `HOST_CALLBACK_FAILURE` | `HOST_CALLBACK_FAILURE` |
| `INTERNAL_FAILURE` | `INTERNAL_FAILURE` |

No implementation may invent a new code under an existing category. A new public
failure requires an observation-schema revision and fixture. Unexpected private causes
collapse to `INTERNAL_FAILURE`; human wording and private causes are non-normative.
Diagnostics follow SEC-003 redaction and never change scene/history state by themselves.

## Fixture/Expected Corpus Gate

Each scenario and consumer journey owns a manifest entry with input fixture, action
trace, normalized expected observation, volatile-field declaration, semantic hash, and
review status. A prose scenario without this pair remains `spec-ready` at most; it
cannot become `automated-verified`. Expected evidence is append/version-only and cannot
be rewritten to match an implementation regression.

`evidence/decision-evidence-manifest.v1.json` freezes all 36 retained owner decisions and
`evidence/catalog-evidence-manifest.v1.json` freezes all 173 capability/journey
records. Contract review is intentionally separate from execution and readiness: an
analysis-owner-approved expected digest freezes semantics only. It does not claim that
a PatchMap runner, Lab, packed host, or release platform has executed the case.
The generated manifest cannot approve its own expected output: approval comes only
from `evidence/catalog-review-registry.v1.json`, whose entries bind the exact typed-case,
fixture-profile, generated fixture, and normalized-expected digests reviewed by the
analysis owner.
