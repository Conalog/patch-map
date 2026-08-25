# Canonical Dataset Fixtures

These self-contained fixtures freeze the accepted data language without exposing an
implementation. They are the starting corpus for PatchMap schema tests.

The all-kinds case is bound to a test-only host asset policy that permits its exact
local/data SVG media, encoded bytes, parser, and decoded dimensions while denying script,
event-handler, and external-resource SVG variants. Dataset validity never bypasses the
host asset-security decision.

## Valid All-Kinds Fixture

```json
[
  {
    "type": "group",
    "id": "area-1",
    "children": [
      {
        "type": "item",
        "id": "device-1",
        "label": "Device 1",
        "size": { "width": 120, "height": 100 },
        "padding": { "x": 8, "y": 6, "top": -2 },
        "contentOrientation": "upright",
        "components": [
          {
            "type": "background",
            "id": "device-1.background",
            "source": {
              "type": "rect",
              "fill": "primary.default",
              "borderWidth": 1,
              "borderColor": "black",
              "radius": { "topLeft": 6, "topRight": 6, "bottomRight": 2, "bottomLeft": 2 }
            }
          },
          {
            "type": "bar",
            "id": "device-1.bar",
            "source": { "type": "rect", "fill": "white" },
            "size": { "width": "calc(100% - 20px)", "height": 12 },
            "placement": "bottom",
            "margin": { "bottom": -4 },
            "tint": "primary.accent",
            "animation": true,
            "animationDuration": 200
          },
          {
            "type": "icon",
            "id": "device-1.icon",
            "source": "warning",
            "size": 20,
            "placement": "left-top",
            "tint": "#ef4444"
          },
          {
            "type": "text",
            "id": "device-1.text",
            "text": "Power 72%",
            "placement": "center",
            "split": 0,
            "style": {
              "fontFamily": "FiraCode",
              "fontWeight": 400,
              "fontSize": "auto",
              "autoFont": { "min": 8, "max": 24 },
              "wordWrapWidth": "auto",
              "overflow": "ellipsis",
              "fill": "black"
            }
          }
        ],
        "attrs": {
          "x": 40,
          "y": 30,
          "angle": 15,
          "alpha": 1,
          "zIndex": 2,
          "display": "inverter",
          "metadata": { "parent": null }
        }
      }
    ],
    "attrs": { "x": 100, "y": 50 }
  },
  {
    "type": "grid",
    "id": "grid-1",
    "cells": [[1, "Panel B", 0]],
    "inactiveCellStrategy": "hide",
    "gap": { "x": 8, "y": 10 },
    "item": {
      "size": 48,
      "padding": 4,
      "contentOrientation": "follow-item",
      "components": []
    },
    "attrs": { "x": 300, "y": 40 }
  },
  {
    "type": "relations",
    "id": "links-1",
    "links": [{ "source": "device-1", "target": "grid-1.0.1" }],
    "style": { "color": "primary.dark", "width": 2, "alpha": 0.8 }
  },
  {
    "type": "image",
    "id": "image-1",
    "source": { "src": "data:image/svg+xml,%3Csvg%3E%3C/svg%3E", "data": { "resolution": 2 }, "format": "svg", "parser": "svg" },
    "size": { "width": 80, "height": 40 },
    "attrs": { "x": -20, "y": 200 }
  },
  {
    "type": "text",
    "id": "label-1",
    "text": "Line 1\nLine 2",
    "style": { "fontSize": 18, "lineHeight": 24, "letterSpacing": 1, "wordWrap": true, "fill": "#1a1a1a" },
    "size": { "width": 180, "height": 60 },
    "attrs": { "x": 100, "y": 220, "rotation": 0.25 }
  },
  {
    "type": "rect",
    "id": "zone-1",
    "size": { "width": 240, "height": 120 },
    "fill": "#0c73bf80",
    "stroke": { "color": "primary.dark", "width": 3 },
    "radius": 10,
    "attrs": { "x": 20, "y": 320, "zIndex": -1 }
  }
]
```

## Required Normalized Outcomes

| Input | Normalized observable outcome |
| --- | --- |
| omitted `show` / `locked` | visible and unlocked |
| omitted optional ID | unique logical ID for the current scene only; caller input unchanged |
| same component ID in two different items | both accepted and addressed as owner/item plus component ID |
| grid cell `1` at row 0/column 0 | structural ID `grid-1.0.0`, no string label |
| grid string at row 0/column 1 | structural ID `grid-1.0.1`, label `Panel B` |
| `size: 48` | `{width: 48, height: 48}` |
| scalar/axis/edge spacing | four edges, with explicit edge overriding axis and negative values retained |
| component `calc(100% - 20px)` | content-box percentage result minus 20 world units |
| background/padding | background fills the full item, while percentage content components use the padded content box |
| relation | line connects exact centers of current endpoint world bounds in relation-local coordinates |
| omitted text/component defaults | values in `dataset.md#observable-defaults` |
| `primary.default` / `primary.dark` / `primary.accent` | `#0C73BFFF` / `#083967FF` / `#EF4444FF` |
| unknown `attrs.display` / `attrs.metadata` | preserved through update/query/export; no visual effect unless host maps it |

## Invalid Fixture Matrix

Each row is an independent fixture. Strict load/update rejects it before publication
and reports the failing path and reason.

| Case | Invalid fragment | Outcome |
| --- | --- | --- |
| discriminator | `{ "type": "unknown" }` | unsupported element/component kind |
| unknown element key | valid item plus `"extra": true` | strict element key rejection; put host data in `attrs` |
| unknown component key | valid component plus `"extra": true` | strict component key rejection; documented text/rectangle stroke fields and `attrs` values remain allowed |
| required field | item without `size`, grid without `cells/item`, relation without `links`, image without `source`, rect without `size` | missing required path |
| duplicate element ID | same ID at root or nested under a group | duplicate authored element ID rejection |
| duplicate component ID in one item | same component ID repeated under one owner | owner-local duplicate rejection; same ID under another item remains valid |
| fixed size | `-1`, `{ "width": 1 }`, non-finite value | nonnegative complete finite size required |
| component percent | `"-2%"`, `"10px"`, unknown unit object | negative percentage, plain `px` scalar string, and unknown unit rejected; valid `%`, unit object, and `calc()` remain accepted |
| component calc | `"calc(100%-20px)"`, empty expression, trailing operator, unitless term | strict grammar rejection |
| placement | unknown value, including `none` | one of the nine named anchors is required |
| gap | negative scalar or axis | nonnegative gap required |
| margin/padding | negative scalar, axis, or edge | nonnegative spacing required |
| radius | negative scalar/corner | nonnegative radius required |
| asset descriptor | missing `src`, caller `alias`, unknown descriptor key | strict descriptor rejection |
| text split | non-integer or negative integer | nonnegative integer required |
| conflicting rotation | both `attrs.angle` and `attrs.rotation` | atomic rejection |
| reserved transform attrs | `attrs.scale`, `skew`, `pivot`, `skewX/Y`, or `pivotX/Y` | exact-path rejection; these names are not inert host metadata |
| negative duration/border | negative `animationDuration` or `borderWidth` | nonnegative value required |
| auto font | nonpositive `min`/`max` | positive range required |
| relation endpoint | unresolved ID | scene remains valid; only that segment is omitted, so this is not a draw-wide validation error |

## Fixture Expansion

The implementation test corpus expands this base using table-driven variants for every
placement, content orientation, overflow, shorthand, color family, asset source, grid
transition, relation edge, and 100/500/1,000/2,000/5,000 seeded workload. Random bar
and text fixtures always record seed and action index.

The color matrix covers every PixiJS v8 public `ColorSource` branch: CSS/hexa/number,
normalized number array/`Float32Array`, byte typed arrays, RGB(A), HSL(A), HSV(A), Pixi
`Color`, and theme key, plus invalid/non-finite cases. Each accepted case asserts caller
immutability, exact normalized 8-bit channels, lowercase `#rrggbbaa` export, and
export→load equality. The matrix never treats a plain JSON number array as byte RGBA.

A separate sanitized production-shaped fixture records immutable SHA-256 plus exact
top-level, materialized element, component, text, relation, and asset counts. Its
manifest carries the host asset policy used by the case. Its digest and normalized
counts are analysis-owner contract-approved; performance samples against it remain
execution evidence.

The mutation corpus separately freezes owner-local component addressing, atomic group/
ungroup (including empty group, relations, locked/cross-parent rejection, and undo/redo),
hidden component rematerialization, hidden-cell relation restoration, self/duplicate
relations, redraw selection input, and every gesture terminal reason.

## Corpus Completeness Gate

The single specimen above is illustrative, not a claim that the dataset contract is
fully executable. Before a data/layout row becomes `automated-verified`, a
contract-revisioned manifest must contain:

- one accepted minimal/defaulted and one fully authored record for every element and
  component discriminator;
- one accepted/rejected case for every union branch, enum, shorthand, extension point,
  unknown-key rule, cross-field rule, `null`/absence rule, and non-finite/boundary value;
- numeric local/world/screen transforms and bounds for nested position, signed
  `scaleX`/`scaleY`, angle/rotation, negative spacing, all nine placements, grid/ragged matrix,
  stroke, text overflow, world rotation/flip, and DPR conversion;
- exact normalized text observations for the corpus in `semantic-observation.md`;
- load→edit→export→load expected output for every kind, generated/authored identity,
  metadata, default, and runtime-only/non-serializable value;
- immutable fixture and expected SHA-256, contract/observation revisions, review status,
  and explicit volatile/tolerance declarations.

Before automated verification, every one of the 173 scenario/journey cases must
reference a manifest fixture and expected observation. Missing or review-pending
expected evidence prevents promotion beyond `spec-ready`; an implementation-generated
expected file cannot approve itself.

`evidence/decision-evidence-manifest.v1.json` closes all 36 retained owner decisions.
`evidence/catalog-evidence-manifest.v1.json` additionally binds all 135 capability
scenarios and 38 consumer journeys to 173 reviewed fixture/action/normalized-expected
records. The manifest derives concrete input profiles and typed action/assertion data
from `evidence/catalog-fixture-profiles.v1.json` and
`evidence/catalog-typed-cases.v1.json`, then accepts approval only from the separately
written `evidence/catalog-review-registry.v1.json`. This satisfies the
pre-implementation contract corpus gate only; automated execution and implementation
evidence remain `not-run` and `unassessed`.
